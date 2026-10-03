import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Room } from './types.js';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe('房间快照', () => {
  it('按顺序写入可恢复完整局面，凭据只传给服务端存储', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
    const room: Room = {
      code: '123456', hostId: 'a', gameId: 'poker', status: 'playing', round: 1,
      players: [{ id: 'a', name: '甲', avatar: 0, connected: true, reconnectSecret: 'private-secret' }],
      game: { gameId: 'poker', phase: 'preflop', turn: 0, hands: { a: [] }, message: '行动' },
      matchScores: {}, scoredRound: 0, targetPlayers: 2, options: {}, createdAt: 1, messages: [],
    };
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const [verb] = JSON.parse(String(init.body)) as string[];
      return Response.json({ result: verb === 'GET' ? JSON.stringify([room]) : 'OK' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { loadRooms, saveRooms } = await import('./room-store.js');
    await saveRooms([room]);
    expect((JSON.parse(String(fetchMock.mock.calls[0]![1].body)) as unknown[]).slice(0, 2)).toEqual(['SET', 'xiaoduyiqing:rooms:v1']);
    expect(await loadRooms()).toEqual([room]);
    expect(fetchMock.mock.calls[0]![1].headers).toMatchObject({ Authorization: 'Bearer test-token' });
  });
});
