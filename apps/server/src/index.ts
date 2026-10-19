import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { games, gameNames } from './games/index.js';
import type { ClientRoom, GameAction, GameId, Player, Room } from './types.js';
import { durableRooms, loadRooms, saveRooms, storageStatus } from './room-store.js';
import { shouldEvictRoom } from './room-lifecycle.js';

const PORT = Number(process.env.PORT ?? 3001);
const origins = (process.env.CLIENT_ORIGIN ?? process.env.RENDER_EXTERNAL_URL)?.split(',').map((origin) => origin.trim()).filter(Boolean);
const corsOrigin = origins?.length ? origins : true;
const app = express();
app.use(cors({ origin: corsOrigin }));
app.get('/health', (_req, res) => res.json({ ok: true, name: '小赌怡情', rooms: rooms.size, durableRooms: durableRooms && storageStatus.healthy, storage: storageStatus, version: process.env.RENDER_GIT_COMMIT ?? process.env.APP_REVISION ?? 'local' }));
app.get('/games', (_req, res) => res.json(gameNames));
const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/out');
app.use(express.static(publicDir));
app.get('/{*path}', (_req, res) => res.sendFile(resolve(publicDir, 'index.html')));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: corsOrigin }, maxHttpBufferSize: 64 * 1024,
  allowRequest: (request, done) => done(null, !origins?.length || !request.headers.origin || origins.includes(request.headers.origin)),
});
const rooms = new Map<string, Room>();
const roomTimers = new Map<string, NodeJS.Timeout>();
const disconnectTimers = new Map<string, NodeJS.Timeout>();
const TURN_MS = 30_000;
const LIARS_CHALLENGE_PAUSE_MS = 6_000;
const LIARS_REVEAL_PAUSE_MS = 1_800;
let snapshotTimer: NodeJS.Timeout | undefined;
let saving = false;
let dirty = false;
function snapshot() {
  if (!durableRooms) return;
  dirty = true;
  if (snapshotTimer || saving) return;
  snapshotTimer = setTimeout(() => { snapshotTimer = undefined; void flushSnapshot(); }, 250);
}
async function flushSnapshot() {
  if (saving || !dirty) return;
  saving = true; dirty = false;
  try { await saveRooms(structuredClone([...rooms.values()])); }
  catch (error) { dirty = true; console.error('房间持久化失败', error); }
  finally {
    saving = false;
    if (dirty && !snapshotTimer) snapshotTimer = setTimeout(() => { snapshotTimer = undefined; void flushSnapshot(); }, storageStatus.healthy ? 250 : 5000);
  }
}

function liarsBotDelay(room: Room): number {
  const game = room.game;
  if (room.gameId !== 'liarsbar' || !game || !room.players[game.turn]?.bot) return 0;
  if (game.phase === 'challenge') return LIARS_CHALLENGE_PAUSE_MS;
  return game.phase === 'playing' && 'lastReveal' in game && game.lastReveal ? LIARS_REVEAL_PAUSE_MS : 0;
}

function roomCode(): string {
  let code = '';
  do code = String(randomInt(100000, 1000000)); while (rooms.has(code));
  return code;
}

function cleanName(value: unknown): string {
  const name = String(value ?? '').trim().slice(0, 12);
  if (!name) throw new Error('请输入昵称');
  return name;
}

function playerFrom(payload: Record<string, unknown>): Player {
  const id = String(payload.playerId ?? '').slice(0, 80);
  if (!id) throw new Error('玩家身份无效');
  const reconnectSecret = String(payload.reconnectSecret ?? '').slice(0, 128);
  if (reconnectSecret.length < 24) throw new Error('身份凭据已失效，请刷新页面');
  const requestedAvatar = Number(payload.avatar ?? 0);
  const avatar = Number.isInteger(requestedAvatar) ? ((requestedAvatar % 8) + 8) % 8 : 0;
  return { id, name: cleanName(payload.name), avatar, connected: true, reconnectSecret };
}

function availableSeat(room: Room): number {
  const used = new Set(room.players.map((player) => player.seat));
  for (let seat = 0; seat < room.targetPlayers; seat += 1) if (!used.has(seat)) return seat;
  return room.players.length;
}

function clientRoom(room: Room, playerId: string): ClientRoom {
  const { blockedPlayerIds: _blocked, ...publicRoom } = room;
  return { ...publicRoom, players: room.players.map(({ reconnectSecret: _secret, ...player }) => player), game: room.game ? games[room.gameId].view(room.game, playerId) : null };
}

function emitRoom(room: Room) {
  room.updatedAt = Date.now();
  snapshot();
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.roomCode === room.code) socket.emit('room:update', clientRoom(room, socket.data.playerId));
  }
}

function clearRoomTimer(code: string) {
  const timer = roomTimers.get(code);
  if (timer) clearTimeout(timer);
  roomTimers.delete(code);
}

function armTurnTimer(room: Room) {
  clearRoomTimer(room.code);
  if (!room.game || room.status !== 'playing' || room.game.phase === 'finished' || !room.players.some((p) => p.connected && !p.bot)) return;
  const duration = liarsBotDelay(room) || TURN_MS;
  const deadline = Date.now() + duration;
  room.game.turnDeadline = deadline;
  room.game.turnDuration = duration;
  roomTimers.set(room.code, setTimeout(() => {
    const current = rooms.get(room.code);
    if (!current?.game || current.status !== 'playing' || current.game.turnDeadline !== deadline) return;
    const player = current.players[current.game.turn];
    if (!player) return;
    const gameModule = games[current.gameId];
    const action = gameModule.botAction(current.game, current.players, player.id);
    if (action) {
      try {
        gameModule.action(current.game, current.players, player.id, action);
        runBots(current);
      } catch (error) {
        console.error('自动行动失败', current.code, error);
        current.game.message = '自动行动暂未完成，请当前玩家手动操作';
      }
      armTurnTimer(current); emitRoom(current);
    }
  }, duration));
}

function fail(ack: ((value: unknown) => void) | undefined, error: unknown) {
  const message = error instanceof Error ? error.message : '操作失败';
  ack?.({ ok: false, error: message });
}

function joinSocket(socket: Socket, room: Room, playerId: string) {
  socket.data.roomCode = room.code;
  socket.data.playerId = playerId;
  void socket.join(room.code);
}

function leaveCurrentRoom(socket: Socket, handOff = false) {
  const room = rooms.get(socket.data.roomCode);
  const player = room?.players.find((candidate) => candidate.id === socket.data.playerId);
  if (!room || !player) return;
  // An old socket can disconnect after the same player has already rejoined.
  const anotherSocket = [...io.sockets.sockets.values()].some((other) => other.id !== socket.id && other.connected && other.data.roomCode === room.code && other.data.playerId === player.id);
  if (anotherSocket) { void socket.leave(room.code); delete socket.data.roomCode; delete socket.data.playerId; return; }
  if (room.status === 'lobby') {
    if (!handOff) { player.connected = false; emitRoom(room); }
    else {
      room.players = room.players.filter((candidate) => candidate.id !== player.id);
      if (room.hostId === player.id) room.hostId = room.players.find((candidate) => !candidate.bot)?.id ?? '';
      if (!room.players.length || !room.hostId) { rooms.delete(room.code); snapshot(); } else emitRoom(room);
    }
  } else {
    player.connected = false;
    if (handOff) {
      player.bot = true;
      player.name = `${player.name.replace(/（托管）$/, '')}（托管）`;
      if (room.hostId === player.id) {
        room.hostId = room.players.find((candidate) => candidate.id !== player.id && candidate.connected && !candidate.bot)?.id ?? player.id;
      }
      runBots(room);
      armTurnTimer(room);
    }
    emitRoom(room);
  }
  void socket.leave(room.code);
  delete socket.data.roomCode;
  delete socket.data.playerId;
}

function runBots(room: Room) {
  if (!room.game || room.status !== 'playing') return;
  if (!room.players.some((player) => player.connected && !player.bot)) return;
  const gameModule = games[room.gameId];
  for (let guard = 0; guard < 300 && room.game.phase !== 'finished'; guard += 1) {
    const player = room.players[room.game.turn];
    if (!player?.bot) break;
    // Give the other human players time to challenge a bot's claim and see the reveal.
    if (liarsBotDelay(room)) break;
    const action = gameModule.botAction(room.game, room.players, player.id);
    if (!action) break;
    gameModule.action(room.game, room.players, player.id, action);
  }
  if (room.game.phase === 'finished') {
    room.status = 'finished';
    if (room.scoredRound !== room.round) {
      for (const player of room.players) room.matchScores[player.id] = Number(((room.matchScores[player.id] ?? 0) + (room.game.scores?.[player.id] ?? 0)).toFixed(2));
      room.scoredRound = room.round;
    }
  }
}

io.on('connection', (socket) => {
  // Per-connection buckets bound accidental double taps and automated floods.
  const windows = new Map<string, { at: number; count: number }>();
  const limited = (key: string, limit: number, milliseconds = 1000) => {
    const previous = windows.get(key);
    const value = previous && Date.now() - previous.at < milliseconds ? previous : { at: Date.now(), count: 0 };
    value.count += 1; windows.set(key, value);
    if (value.count > limit) throw new Error('操作太快，请稍后再试');
  };
  socket.on('room:create', (payload: Record<string, unknown>, ack?: (value: unknown) => void) => {
    try {
      limited('create', 4, 60_000);
      if (rooms.size >= 500) throw new Error('当前房间较多，请稍后再创建');
      const player = playerFrom(payload);
      const gameId = String(payload.gameId) as GameId;
      if (!games[gameId]) throw new Error('请选择有效玩法');
      if (gameId === 'fishing') throw new Error('小猫钓鱼现仅支持线下玩法');
      const gameModule = games[gameId];
      const requestedPlayers = Number(payload.targetPlayers ?? gameModule.minPlayers);
      const targetPlayers = Number.isInteger(requestedPlayers)
        ? Math.min(gameModule.maxPlayers, Math.max(gameModule.minPlayers, requestedPlayers))
        : gameModule.minPlayers;
      const requestedSeat = Number(payload.hostSeat ?? 0);
      player.seat = Number.isInteger(requestedSeat) ? Math.min(targetPlayers - 1, Math.max(0, requestedSeat)) : 0;
      const options: Record<string, string | number | boolean> = {};
      const matchRounds = Number(payload.matchRounds ?? 3);
      if (!Number.isInteger(matchRounds) || matchRounds < 1 || matchRounds > 20) throw new Error('请设置 1 至 20 局');
      options.matchRounds = matchRounds;
      if (gameId === 'doudizhu4') options.variant = payload.variant === 'team' ? 'team' : 'solo';
      if (gameId === 'liarsbar') {
        const bulletCount = Number(payload.bulletCount ?? 1);
        if (!Number.isInteger(bulletCount) || bulletCount < 1 || bulletCount > 6) throw new Error('子弹数请选择 1 至 6 发');
        options.bulletCount = bulletCount;
      }
      const room: Room = {
        code: roomCode(), hostId: player.id, gameId, players: [player], status: 'lobby', game: null,
        round: 0, matchScores: {}, scoredRound: 0, targetPlayers, options, createdAt: Date.now(),
        messages: [],
      };
      leaveCurrentRoom(socket, true);
      rooms.set(room.code, room);
      joinSocket(socket, room, player.id);
      ack?.({ ok: true, room: clientRoom(room, player.id) });
      emitRoom(room);
    } catch (error) { fail(ack, error); }
  });

  socket.on('room:join', (payload: Record<string, unknown>, ack?: (value: unknown) => void) => {
    try {
      limited('join', 15, 10_000);
      const code = String(payload.code ?? '').trim();
      const room = rooms.get(code);
      if (!room) throw new Error('没有找到这个房间');
      const incoming = playerFrom(payload);
      if (room.blockedPlayerIds?.includes(incoming.id)) throw new Error('你已被移出这个房间，请联系房主');
      if (socket.data.roomCode && (socket.data.roomCode !== code || socket.data.playerId !== incoming.id)) leaveCurrentRoom(socket, true);
      const existing = room.players.find((p) => p.id === incoming.id);
      if (existing) {
        if (existing.reconnectSecret !== incoming.reconnectSecret) throw new Error('该座位属于另一位玩家');
        const disconnectKey = `${room.code}:${incoming.id}`;
        const timer = disconnectTimers.get(disconnectKey);
        if (timer) clearTimeout(timer);
        disconnectTimers.delete(disconnectKey);
        Object.assign(existing, incoming, { connected: true, bot: false, name: incoming.name.replace(/（托管）$/, '') });
        if (!room.players.some((p) => p.id === room.hostId && p.connected && !p.bot)) room.hostId = incoming.id;
      }
      else {
        if (room.status !== 'lobby') throw new Error('牌局已经开始');
        if (room.players.length >= room.targetPlayers) throw new Error('房间已满');
        incoming.seat = availableSeat(room);
        room.players.push(incoming);
      }
      joinSocket(socket, room, incoming.id);
      runBots(room);
      if (!roomTimers.has(room.code)) armTurnTimer(room);
      ack?.({ ok: true, room: clientRoom(room, incoming.id) });
      emitRoom(room);
    } catch (error) { fail(ack, error); }
  });

  socket.on('room:addBot', (_payload: unknown, ack?: (value: unknown) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room || room.hostId !== socket.data.playerId) throw new Error('只有房主可以添加机器人');
      if (room.status !== 'lobby' || room.players.length >= room.targetPlayers) throw new Error('不能再添加玩家');
      const seat = availableSeat(room);
      room.players.push({ id: `bot-${room.code}-${randomInt(100000, 1000000)}`, name: `牌友${seat + 1}`, avatar: (seat + 1) % 8, connected: true, bot: true, seat });
      ack?.({ ok: true }); emitRoom(room);
    } catch (error) { fail(ack, error); }
  });

  socket.on('room:removePlayer', (payload: { playerId?: string }, ack?: (value: unknown) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room || room.hostId !== socket.data.playerId) throw new Error('只有房主可以移除玩家');
      if (room.status !== 'lobby') throw new Error('牌局开始后不能移除玩家');
      const player = room.players.find((p) => p.id === payload.playerId);
      if (!player || player.id === room.hostId) throw new Error('不能移除这个座位');
      room.players = room.players.filter((p) => p.id !== player.id);
      if (!player.bot) room.blockedPlayerIds = [...(room.blockedPlayerIds ?? []), player.id];
      for (const peer of io.sockets.sockets.values()) if (peer.data.roomCode === room.code && peer.data.playerId === player.id) {
        peer.emit('room:removed', { message: '房主已将你移出房间' });
        void peer.leave(room.code); delete peer.data.roomCode; delete peer.data.playerId;
      }
      ack?.({ ok: true }); emitRoom(room);
    } catch (error) { fail(ack, error); }
  });

  socket.on('room:configure', (payload: Record<string, unknown>, ack?: (value: unknown) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room || room.hostId !== socket.data.playerId) throw new Error('只有房主可以修改设置');
      if (room.status !== 'lobby') throw new Error('请在等待开局时修改设置');
      const count = Number(payload.targetPlayers ?? room.targetPlayers);
      const rounds = Number(payload.matchRounds ?? room.options.matchRounds);
      if (!Number.isInteger(count) || count < games[room.gameId].minPlayers || count > games[room.gameId].maxPlayers || count < room.players.length) throw new Error('人数不能小于已入座人数或超出玩法范围');
      if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) throw new Error('请设置1至20局');
      if (room.gameId === 'liarsbar') {
        const bullets = Number(payload.bulletCount ?? room.options.bulletCount);
        if (!Number.isInteger(bullets) || bullets < 1 || bullets > 6) throw new Error('子弹数请选择1至6发');
        room.options.bulletCount = bullets;
      }
      room.targetPlayers = count; room.options.matchRounds = rounds;
      if (room.players.some((p) => (p.seat ?? 0) >= count)) room.players.sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0)).forEach((p, index) => { p.seat = index; });
      if (room.gameId === 'doudizhu4') room.options.variant = payload.variant === 'team' ? 'team' : 'solo';
      ack?.({ ok: true }); emitRoom(room);
    } catch (error) { fail(ack, error); }
  });

  socket.on('room:resetMatch', (_payload: unknown, ack?: (value: unknown) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room || room.hostId !== socket.data.playerId) throw new Error('只有房主可以再开一轮');
      if (room.status !== 'finished') throw new Error('请先完成当前牌局');
      room.game = null; room.status = 'lobby'; room.round = 0; room.scoredRound = 0; room.matchScores = {};
      delete room.options.startingStacks;
      clearRoomTimer(room.code); ack?.({ ok: true }); emitRoom(room);
    } catch (error) { fail(ack, error); }
  });

  socket.on('room:start', (_payload: unknown, ack?: (value: unknown) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room || room.hostId !== socket.data.playerId) throw new Error('只有房主可以开始');
      if (room.status === 'playing') throw new Error('当前牌局还未结束');
      if (room.round >= Number(room.options.matchRounds ?? 3)) throw new Error('本轮设定的局数已完成');
      const gameModule = games[room.gameId];
      if (room.players.length < room.targetPlayers) throw new Error(`还差 ${room.targetPlayers - room.players.length} 位玩家`);
      room.players.sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
      if (room.gameId === 'poker') {
        if (room.game && 'stacks' in room.game) {
          const stacks = room.game.stacks as Record<string, number>;
          if (Object.values(stacks).filter((stack) => stack > 0).length < 2) throw new Error('只剩一人有筹码，本轮已结束');
          room.options.startingStacks = JSON.stringify(stacks);
        }
        room.options.dealer = room.game && 'dealer' in room.game ? (Number(room.game.dealer) + 1) % room.players.length : 0;
      }
      room.game = gameModule.create(room.players, room.options);
      room.round += 1;
      room.status = 'playing';
      runBots(room); armTurnTimer(room); ack?.({ ok: true }); emitRoom(room);
    } catch (error) { fail(ack, error); }
  });

  socket.on('room:leave', (_payload: unknown, ack?: (value: unknown) => void) => {
    leaveCurrentRoom(socket, true);
    ack?.({ ok: true });
  });

  socket.on('game:action', (action: GameAction, ack?: (value: unknown) => void) => {
    try {
      limited('action', 10);
      if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new Error('无效操作');
      if (action.type === 'double' && typeof action.value !== 'boolean') throw new Error('请选择加倍或不加倍');
      if (action.type === 'play' && (!Array.isArray(action.cardIds) || action.cardIds.length > 108 || action.cardIds.some((id) => typeof id !== 'string'))) throw new Error('无效选牌');
      const room = rooms.get(socket.data.roomCode);
      if (!room?.game || room.status !== 'playing') throw new Error('牌局尚未开始');
      games[room.gameId].action(room.game, room.players, socket.data.playerId, action);
      runBots(room); armTurnTimer(room); ack?.({ ok: true }); emitRoom(room);
    } catch (error) { fail(ack, error); }
  });

  socket.on('chat:send', (payload: Record<string, unknown>, ack?: (value: unknown) => void) => {
    try {
      limited('chat', 5, 5000);
      const room = rooms.get(socket.data.roomCode);
      const player = room?.players.find((candidate) => candidate.id === socket.data.playerId);
      if (!room || !player) throw new Error('请先加入房间');
      const text = String(payload.text ?? '').trim().slice(0, 120);
      if (!text) throw new Error('消息不能为空');
      room.messages.push({ id: `${Date.now()}-${randomInt(1000, 10000)}`, playerId: player.id, name: player.name.replace(/（托管）$/, ''), text, at: Date.now() });
      room.messages = room.messages.slice(-50);
      room.updatedAt = Date.now(); snapshot();
      ack?.({ ok: true }); io.to(room.code).emit('room:messages', { code: room.code, messages: room.messages });
    } catch (error) { fail(ack, error); }
  });

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;
    leaveCurrentRoom(socket, false);
    const key = `${roomCode}:${playerId}`;
    const previous = disconnectTimers.get(key);
    if (previous) clearTimeout(previous);
    disconnectTimers.set(key, setTimeout(() => {
      const room = rooms.get(roomCode);
      const player = room?.players.find((candidate) => candidate.id === playerId);
      disconnectTimers.delete(key);
      if (!room || !player || player.connected) return;
      if (room.status === 'lobby') {
        room.players = room.players.filter((candidate) => candidate.id !== playerId);
        if (room.hostId === playerId) room.hostId = room.players.find((candidate) => candidate.connected && !candidate.bot)?.id ?? '';
        if (!room.players.length || !room.hostId) { rooms.delete(roomCode); snapshot(); } else emitRoom(room);
        return;
      }
      if (room.status !== 'playing') return;
      player.bot = true;
      player.name = `${player.name.replace(/（托管）$/, '')}（托管）`;
      if (room.hostId === player.id) room.hostId = room.players.find((candidate) => candidate.connected && !candidate.bot)?.id ?? player.id;
      runBots(room);
      armTurnTimer(room);
      emitRoom(room);
    }, 8_000));
  });
});

setInterval(() => {
  for (const [code, room] of rooms) {
    // Never evict an active table solely because it was created 12 hours ago.
    if (!shouldEvictRoom(room)) continue;
    clearRoomTimer(code); rooms.delete(code); snapshot();
  }
}, 60 * 60 * 1000).unref();

// Do not accept new rooms before the durable snapshot has been loaded. If
// configured storage is down, fail closed instead of overwriting saved games.
for (const room of await loadRooms()) {
  if (!room?.code || !room.players || (room.status === 'lobby' && !room.players.length)) continue;
  room.players.forEach((player) => {
    if (!player.bot && room.status === 'playing') { player.bot = true; player.name = `${player.name.replace(/（托管）$/, '')}（托管）`; }
    if (!player.id.startsWith('bot-')) player.connected = false;
  });
  rooms.set(room.code, room);
}
httpServer.listen(PORT, () => console.warn(`小赌怡情服务已启动：http://localhost:${PORT}`));
