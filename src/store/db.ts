import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { GameRecord } from '../lichess/normalize';
import type { Interval } from './intervals';

export interface SyncMeta {
  userId: string;
  /** Time spans (createdAt, ms) for which every finished game is stored. */
  covered: Interval[];
  /** Games that were still being played at the last sync; re-checked on the next one. */
  pendingIds: string[];
  lastSyncAt?: number;
}

interface HeatmapDB extends DBSchema {
  games: { key: string; value: GameRecord; indexes: { byUser: [string, number] } };
  meta: { key: string; value: SyncMeta };
}

let dbPromise: Promise<IDBPDatabase<HeatmapDB>> | undefined;

function db(): Promise<IDBPDatabase<HeatmapDB>> {
  dbPromise ??= openDB<HeatmapDB>('lichess-heatmap', 1, {
    upgrade(database) {
      const games = database.createObjectStore('games', { keyPath: 'id' });
      games.createIndex('byUser', ['userId', 'createdAt']);
      database.createObjectStore('meta', { keyPath: 'userId' });
    },
  });
  return dbPromise;
}

function userRange(userId: string): IDBKeyRange {
  return IDBKeyRange.bound([userId, -Infinity], [userId, Infinity]);
}

export async function loadGames(userId: string): Promise<GameRecord[]> {
  return (await db()).getAllFromIndex('games', 'byUser', userRange(userId));
}

export async function saveGames(games: GameRecord[]): Promise<void> {
  if (games.length === 0) return;
  const tx = (await db()).transaction('games', 'readwrite');
  await Promise.all([...games.map((g) => tx.store.put(g)), tx.done]);
}

export async function loadMeta(userId: string): Promise<SyncMeta> {
  return (await (await db()).get('meta', userId)) ?? { userId, covered: [], pendingIds: [] };
}

export async function saveMeta(meta: SyncMeta): Promise<void> {
  await (await db()).put('meta', meta);
}

export async function clearUser(userId: string): Promise<void> {
  const tx = (await db()).transaction(['games', 'meta'], 'readwrite');
  let cursor = await tx.objectStore('games').index('byUser').openKeyCursor(userRange(userId));
  while (cursor) {
    await tx.objectStore('games').delete(cursor.primaryKey);
    cursor = await cursor.continue();
  }
  await tx.objectStore('meta').delete(userId);
  await tx.done;
}
