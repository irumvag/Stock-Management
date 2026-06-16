import Dexie from 'dexie';

// Local offline-first store. Every domain row carries a `uuid` (sync key) plus a
// local auto-increment `id` the UI already uses. Mutations are mirrored into the
// `outbox` table so the sync engine can flush them to Neon when online.
export const db = new Dexie('club-tmp-stock');

db.version(1).stores({
  products: '++id, uuid, name, category, deleted',
  sales: '++id, uuid, sale_date, deleted',
  waiters: '++id, uuid, name, deleted',
  drafts: '++id, uuid, status, deleted',
  daily_snapshots: '++id, uuid, snapshot_date, product_uuid, deleted',
  expenses: '++id, uuid, expense_date, deleted',
  users: '++id, uuid, username, deleted', // cached for offline login
  outbox: '++seq, table, uuid',
  meta: 'key', // sync cursor, auth token, current user
});

// v2: append-only activity history so the owner can see what each user did.
db.version(2).stores({
  activity_log: '++id, uuid, at, username, action, deleted',
});

// v3: messages between users.
db.version(3).stores({
  messages: '++id, uuid, from_user, to_user, is_read, deleted',
});

export function uuid() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

// Queue a row for the next push. Called by every local mutation.
export async function enqueue(table, row) {
  await db.outbox.add({ table, uuid: row.uuid, row, queued_at: nowIso() });
}

export async function getMeta(key, fallback = null) {
  const r = await db.meta.get(key);
  return r ? r.value : fallback;
}

export async function setMeta(key, value) {
  await db.meta.put({ key, value });
}
