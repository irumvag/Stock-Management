// PWA entry point. Sets up window.api (Dexie-backed), starts the sync engine,
// renders the sync-status badge, then loads the renderer (app.js).
import './api.js';
import { initSync, onStatus, syncNow } from './sync.js';

const LABELS = {
  idle: ['Ready', 'sync-idle'],
  offline: ['Offline', 'sync-offline'],
  pending: ['Pending', 'sync-pending'],
  syncing: ['Syncing…', 'sync-syncing'],
  synced: ['Synced', 'sync-synced'],
  error: ['Sync error', 'sync-error'],
};

function renderBadge(status, pending) {
  const el = document.getElementById('sync-badge');
  if (!el) return;
  const [label, cls] = LABELS[status] || LABELS.idle;
  const count = (status === 'pending' && pending) ? ` (${pending})` : '';
  el.className = `sync-badge ${cls}`;
  el.innerHTML = `<span class="sync-dot"></span>${label}${count}`;
  el.title = 'Click to sync now';
}

initSync();
onStatus(renderBadge);
document.addEventListener('click', (e) => {
  if (e.target.closest('#sync-badge')) syncNow();
});

// app.js sets up the renderer; window.api is already assigned by the static
// import above, so a plain dynamic import (no top-level await) is enough.
import('./app.js');
