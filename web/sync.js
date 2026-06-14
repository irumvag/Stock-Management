import { db, getMeta, setMeta, nowIso } from './db.js';

// Tables pulled from the server, in apply order. `users` included for offline login.
const PULL_TABLES = ['products', 'waiters', 'drafts', 'sales', 'daily_snapshots', 'expenses', 'activity_log', 'users'];

let status = navigator.onLine ? 'idle' : 'offline';
const listeners = new Set();
let syncing = false;

export function onStatus(cb) {
  listeners.add(cb);
  cb(status, pendingCountCache);
  return () => listeners.delete(cb);
}

let pendingCountCache = 0;
async function emit(next) {
  status = next;
  pendingCountCache = await db.outbox.count();
  for (const cb of listeners) cb(status, pendingCountCache);
}

export async function getToken() {
  return getMeta('token');
}
export async function setToken(token) {
  await setMeta('token', token);
}

// Wrapper around fetch that attaches the bearer token. Used by the API shim too.
export async function apiFetch(path, options = {}) {
  const token = await getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  return res;
}

async function pushOutbox() {
  const items = await db.outbox.orderBy('seq').toArray();
  if (items.length === 0) return;
  const mutations = items.map((i) => ({ table: i.table, row: i.row }));
  const res = await apiFetch('/api/sync/push', {
    method: 'POST',
    body: JSON.stringify({ mutations }),
  });
  if (!res.ok) throw new Error(`push failed: ${res.status}`);
  // Clear what we sent (newer local edits will have higher seq, left intact).
  await db.outbox.bulkDelete(items.map((i) => i.seq));
}

async function applyPulled(table, rows) {
  for (const row of rows) {
    const existing = await db[table].where('uuid').equals(row.uuid).first();
    if (existing) {
      // last-write-wins; keep local autoincrement id
      if (new Date(row.updated_at) >= new Date(existing.updated_at || 0)) {
        await db[table].update(existing.id, { ...row });
      }
    } else {
      await db[table].add({ ...row });
    }
  }
}

async function pull() {
  const since = (await getMeta('cursor')) || '1970-01-01T00:00:00.000Z';
  const res = await apiFetch(`/api/sync/pull?since=${encodeURIComponent(since)}`);
  if (!res.ok) throw new Error(`pull failed: ${res.status}`);
  const data = await res.json();
  await db.transaction('rw', PULL_TABLES.map((t) => db[t]), async () => {
    for (const table of PULL_TABLES) {
      if (data.tables[table]) await applyPulled(table, data.tables[table]);
    }
  });
  await setMeta('cursor', data.cursor);
}

export async function syncNow() {
  if (syncing) return;
  if (!navigator.onLine) { await emit('offline'); return; }
  if (!(await getToken())) { await emit('idle'); return; }
  syncing = true;
  await emit('syncing');
  try {
    await pushOutbox();
    await pull();
    await emit('synced');
  } catch (err) {
    console.error('sync error:', err);
    await emit('error');
  } finally {
    syncing = false;
  }
}

let debounceTimer = null;
// Call after any local mutation: marks pending and schedules a push.
export async function notifyMutation() {
  await emit(navigator.onLine ? 'pending' : 'offline');
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(syncNow, 1500);
}

export function initSync() {
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => emit('offline'));
  // Periodic retry / keep-fresh every 60s.
  setInterval(() => { if (navigator.onLine) syncNow(); }, 60000);
  emit(navigator.onLine ? 'idle' : 'offline');
}
