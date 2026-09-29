import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { games, gameNames } from './games/index.js';
import type { ClientRoom, GameAction, GameId, Player, Room } from './types.js';

const PORT = Number(process.env.PORT ?? 3001);
const origins = process.env.CLIENT_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);
const corsOrigin = origins?.length ? origins : true;
const app = express();
app.use(cors({ origin: corsOrigin }));
app.get('/health', (_req, res) => res.json({ ok: true, name: '小赌怡情', rooms: rooms.size }));
app.get('/games', (_req, res) => res.json(gameNames));
const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/out');
app.use(express.static(publicDir));
app.get('/{*path}', (_req, res) => res.sendFile(resolve(publicDir, 'index.html')));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: corsOrigin } });
const rooms = new Map<string, Room>();
const roomTimers = new Map<string, NodeJS.Timeout>();
const disconnectTimers = new Map<string, NodeJS.Timeout>();
const TURN_MS = 30_000;

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
  const requestedAvatar = Number(payload.avatar ?? 0);
  const avatar = Number.isInteger(requestedAvatar) ? ((requestedAvatar % 8) + 8) % 8 : 0;
  return { id, name: cleanName(payload.name), avatar, connected: true };
}

function availableSeat(room: Room): number {
  const used = new Set(room.players.map((player) => player.seat));
  for (let seat = 0; seat < room.targetPlayers; seat += 1) if (!used.has(seat)) return seat;
  return room.players.length;
}

function clientRoom(room: Room, playerId: string): ClientRoom {
  return { ...room, game: room.game ? games[room.gameId].view(room.game, playerId) : null };
}

function emitRoom(room: Room) {
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
  if (!room.game || room.status !== 'playing' || room.game.phase === 'finished') return;
  const deadline = Date.now() + TURN_MS;
  room.game.turnDeadline = deadline;
  roomTimers.set(room.code, setTimeout(() => {
    const current = rooms.get(room.code);
    if (!current?.game || current.status !== 'playing' || current.game.turnDeadline !== deadline) return;
    const player = current.players[current.game.turn];
    if (!player) return;
    const gameModule = games[current.gameId];
    const action = gameModule.botAction(current.game, current.players, player.id);
    if (action) {
      gameModule.action(current.game, current.players, player.id, action);
      runBots(current);
      emitRoom(current);
      armTurnTimer(current);
    }
  }, TURN_MS));
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
  if (room.status === 'lobby') {
    room.players = room.players.filter((candidate) => candidate.id !== player.id);
    if (room.hostId === player.id) room.hostId = room.players.find((candidate) => !candidate.bot)?.id ?? '';
    if (!room.players.length || !room.hostId) rooms.delete(room.code); else emitRoom(room);
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
  socket.on('room:create', (payload: Record<string, unknown>, ack?: (value: unknown) => void) => {
    try {
      leaveCurrentRoom(socket, true);
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
      rooms.set(room.code, room);
      joinSocket(socket, room, player.id);
      ack?.({ ok: true, room: clientRoom(room, player.id) });
      emitRoom(room);
    } catch (error) { fail(ack, error); }
  });

  socket.on('room:join', (payload: Record<string, unknown>, ack?: (value: unknown) => void) => {
    try {
      const code = String(payload.code ?? '').trim();
      const room = rooms.get(code);
      if (!room) throw new Error('没有找到这个房间');
      const incoming = playerFrom(payload);
      if (socket.data.roomCode && socket.data.roomCode !== code) leaveCurrentRoom(socket, true);
      const existing = room.players.find((p) => p.id === incoming.id);
      if (existing) {
        const disconnectKey = `${room.code}:${incoming.id}`;
        const timer = disconnectTimers.get(disconnectKey);
        if (timer) clearTimeout(timer);
        disconnectTimers.delete(disconnectKey);
        Object.assign(existing, incoming, { connected: true, bot: false, name: incoming.name.replace(/（托管）$/, '') });
      }
      else {
        if (room.status !== 'lobby') throw new Error('牌局已经开始');
        if (room.players.length >= room.targetPlayers) throw new Error('房间已满');
        incoming.seat = availableSeat(room);
        room.players.push(incoming);
      }
      joinSocket(socket, room, incoming.id);
      runBots(room);
      armTurnTimer(room);
      ack?.({ ok: true, room: clientRoom(room, incoming.id) });
      emitRoom(room);
    } catch (error) { fail(ack, error); }
  });

  socket.on('room:addBot', (_payload: unknown, ack?: (value: unknown) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room || room.hostId !== socket.data.playerId) throw new Error('只有房主可以添加机器人');
      if (room.status !== 'lobby' || room.players.length >= room.targetPlayers) throw new Error('不能再添加玩家');
      const number = room.players.filter((p) => p.bot).length + 1;
      room.players.push({ id: `bot-${room.code}-${number}`, name: `牌友${number}`, avatar: number % 8, connected: true, bot: true, seat: availableSeat(room) });
      ack?.({ ok: true }); emitRoom(room);
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
      if (room.gameId === 'poker') room.options.dealer = room.round % room.players.length;
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
      const room = rooms.get(socket.data.roomCode);
      if (!room?.game || room.status !== 'playing') throw new Error('牌局尚未开始');
      games[room.gameId].action(room.game, room.players, socket.data.playerId, action);
      runBots(room); armTurnTimer(room); ack?.({ ok: true }); emitRoom(room);
    } catch (error) { fail(ack, error); }
  });

  socket.on('chat:send', (payload: Record<string, unknown>, ack?: (value: unknown) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      const player = room?.players.find((candidate) => candidate.id === socket.data.playerId);
      if (!room || !player) throw new Error('请先加入房间');
      const text = String(payload.text ?? '').trim().slice(0, 120);
      if (!text) throw new Error('消息不能为空');
      room.messages.push({ id: `${Date.now()}-${randomInt(1000, 10000)}`, playerId: player.id, name: player.name.replace(/（托管）$/, ''), text, at: Date.now() });
      room.messages = room.messages.slice(-50);
      ack?.({ ok: true }); emitRoom(room);
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
      if (!room || !player || player.connected || room.status !== 'playing') return;
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
  const stale = Date.now() - 12 * 60 * 60 * 1000;
  for (const [code, room] of rooms) if (room.createdAt < stale) { clearRoomTimer(code); rooms.delete(code); }
}, 60 * 60 * 1000).unref();

httpServer.listen(PORT, () => console.warn(`小赌怡情服务已启动：http://localhost:${PORT}`));
