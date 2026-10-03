import { describe, expect, it } from 'vitest';
import { shouldEvictRoom } from './room-lifecycle.js';
import type { Room } from './types.js';

const room = (createdAt: number, connected: boolean): Room => ({
  code: '123456', hostId: 'a', gameId: 'poker', players: [{ id: 'a', name: '甲', avatar: 0, connected }],
  status: 'playing', game: null, round: 1, matchScores: {}, scoredRound: 0,
  targetPlayers: 2, options: {}, createdAt, messages: [],
});

describe('房间回收', () => {
  it('建房超过十二小时但玩家在线的牌局不能删除', () => {
    expect(shouldEvictRoom(room(0, true), 13 * 60 * 60 * 1000)).toBe(false);
  });
  it('断线但近期活动的房间保留，长期无人连接才回收', () => {
    const value = room(0, false);
    value.updatedAt = 2 * 60 * 60 * 1000;
    expect(shouldEvictRoom(value, 13 * 60 * 60 * 1000)).toBe(false);
    expect(shouldEvictRoom(value, 15 * 60 * 60 * 1000)).toBe(true);
  });
});
