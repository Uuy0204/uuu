// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';

let service: ChildProcess;
let origin: string;
const sockets: Socket[] = [];
const identity = () => ({ playerId: randomUUID(), reconnectSecret: randomUUID(), name: '回归测试', avatar: 0 });
async function connect() {
  const socket = io(origin, { transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  await new Promise<void>((ok, fail) => { socket.once('connect', ok); socket.once('connect_error', fail); });
  return socket;
}
const send = (socket: Socket, event: string, payload: unknown = {}) => socket.timeout(3000).emitWithAck(event, payload);

beforeAll(async () => {
  const probe = createServer();
  await new Promise<void>((ok) => probe.listen(0, '127.0.0.1', ok));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((ok) => probe.close(() => ok()));
  origin = `http://127.0.0.1:${port}`;
  const server = resolve(process.cwd(), '../server');
  service = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: server, env: { ...process.env, PORT: String(port), UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((ok, fail) => {
    const timeout = setTimeout(() => fail(new Error('房间服务未启动')), 10_000);
    service.once('error', fail);
    service.stdout!.on('data', (chunk) => { if (String(chunk).includes('服务已启动')) { clearTimeout(timeout); ok(); } });
    service.stderr!.on('data', (chunk) => { if (String(chunk).includes('服务已启动')) { clearTimeout(timeout); ok(); } });
  });
}, 15_000);
afterEach(() => { sockets.splice(0).forEach((socket) => socket.disconnect()); });
afterAll(() => { service?.kill(); });

describe('真实房间事件回归', () => {
  it('房主管理、机器人唯一座位和移出后禁止重入', async () => {
    const host = await connect(); const guest = await connect(); const me = identity(); const friend = identity();
    const result = await send(host, 'room:create', { ...me, gameId: 'doudizhu4', targetPlayers: 4, matchRounds: 3 });
    const code = result.room.code;
    expect(result.room.players[0].reconnectSecret).toBeUndefined();
    await send(guest, 'room:join', { ...friend, code });
    expect((await send(guest, 'room:configure', { matchRounds: 5 })).ok).toBe(false);
    expect((await send(host, 'room:configure', { matchRounds: 5, variant: 'team' })).ok).toBe(true);
    await send(host, 'room:addBot');
    let room = (await send(host, 'room:join', { ...me, code })).room;
    const firstBot = room.players.find((p: { bot?: boolean }) => p.bot);
    expect((await send(host, 'room:removePlayer', { playerId: firstBot.id })).ok).toBe(true);
    await send(host, 'room:addBot');
    room = (await send(host, 'room:join', { ...me, code })).room;
    expect(new Set(room.players.map((p: { id: string }) => p.id)).size).toBe(room.players.length);
    expect(room.options).toMatchObject({ matchRounds: 5, variant: 'team' });
    const removed = new Promise((ok) => guest.once('room:removed', ok));
    await send(host, 'room:removePlayer', { playerId: friend.playerId });
    expect(await removed).toMatchObject({ message: expect.stringContaining('移出') });
    expect((await send(guest, 'room:join', { ...friend, code })).ok).toBe(false);
  });
  it('刷新回座保留回合期限且聊天不会重发整桌牌', async () => {
    const host = await connect(); const me = identity();
    const created = await send(host, 'room:create', { ...me, gameId: 'liarsbar', targetPlayers: 2, matchRounds: 1 });
    await send(host, 'room:addBot'); await send(host, 'room:start');
    const room = (await send(host, 'room:join', { ...me, code: created.room.code })).room;
    const deadline = room.game.turnDeadline;
    const again = await connect();
    const joinedUpdate = new Promise((ok) => again.once('room:update', ok));
    const joined = await send(again, 'room:join', { ...me, code: room.code });
    await joinedUpdate;
    expect(joined.room.game.turnDeadline).toBe(deadline);
    const updates: unknown[] = []; again.on('room:update', (value) => updates.push(value));
    const messages = new Promise<{ messages: { text: string }[] }>((ok) => again.once('room:messages', ok));
    await send(host, 'chat:send', { text: ' 你好 ' });
    expect((await messages).messages.at(-1)?.text).toBe('你好');
    expect(updates).toHaveLength(0);
    expect((await send(again, 'game:action', { type: 'play', cardIds: 'invalid' })).ok).toBe(false);
    expect((await fetch(`${origin}/health`)).status).toBe(200);
  });
  it('一轮结束后原房间可保留座位重新开局', async () => {
    const host = await connect(); const guest = await connect(); const me = identity();
    const room = (await send(host, 'room:create', { ...me, gameId: 'liarsbar', targetPlayers: 2, matchRounds: 1, bulletCount: 6 })).room;
    await send(guest, 'room:join', { ...identity(), code: room.code });
    await send(host, 'room:start');
    const playing = (await send(host, 'room:join', { ...me, code: room.code })).room;
    await send(host, 'game:action', { type: 'play', cardIds: [playing.game.hand[0].id] });
    await send(guest, 'game:action', { type: 'challenge' });
    expect((await send(host, 'room:resetMatch')).ok).toBe(true);
    const reset = (await send(host, 'room:join', { ...me, code: room.code })).room;
    expect(reset).toMatchObject({ code: room.code, status: 'lobby', round: 0, matchScores: {} });
    expect(reset.players).toHaveLength(2);
  });
});
