import type { Room } from './types.js';

// One snapshot per instance: Render's free filesystem is ephemeral. Configure
// Upstash REST credentials on the server to enable restart/deploy recovery.
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const key = 'xiaoduyiqing:rooms:v1';
export const durableRooms = Boolean(url && token);

async function command(parts: (string | number)[]): Promise<unknown> {
  if (!url || !token) return null;
  const response = await fetch(url, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(parts), signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`房间存储 HTTP ${response.status}`);
  const body = await response.json() as { result?: unknown; error?: string };
  if (body.error) throw new Error(body.error);
  return body.result;
}

export async function loadRooms(): Promise<Room[]> {
  const raw = await command(['GET', key]);
  if (typeof raw !== 'string') return [];
  const rooms = JSON.parse(raw) as Room[];
  return Array.isArray(rooms) ? rooms : [];
}

export async function saveRooms(rooms: Iterable<Room>): Promise<void> {
  if (!durableRooms) return;
  // TTL also bounds abandoned room numbers; active rooms refresh on changes.
  await command(['SET', key, JSON.stringify([...rooms]), 'EX', 7 * 24 * 3600]);
}
