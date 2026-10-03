import type { Room } from './types.js';

export function shouldEvictRoom(room: Room, now = Date.now()): boolean {
  return now - (room.updatedAt ?? room.createdAt) >= 12 * 60 * 60 * 1000
    && !room.players.some((player) => player.connected && !player.bot);
}
