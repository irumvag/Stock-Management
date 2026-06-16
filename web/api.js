// Browser implementation of the `window.api` surface the renderer used to get
// from Electron's preload. Everything reads/writes IndexedDB (Dexie) so the app
// works fully offline; mutations are queued in the outbox and synced to Neon by
// sync.js. Reports are computed locally from synced data. No buying price / no
// profit anywhere — only selling price and what went OUT.
import { db, uuid, nowIso, enqueue, getMeta, setMeta } from './db.js';
import { apiFetch, setToken, notifyMutation, syncNow } from './sync.js';

// SHA-256 of "username:password" stored locally for offline credential check.
async function hashCredential(username, password) {
  const buf = await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(`${username}:${password}`));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const active = (rows) => rows.filter((r) => !r.deleted);
const localDate = (d) => new Date(d).toLocaleDateString('en-CA'); // YYYY-MM-DD local

async function persist(table, row) {
  await db[table].put(row);
  await enqueue(table, row);
  notifyMutation();
}

// ---------- Activity log (audit trail) ----------
// app.js calls setActor() at login so each logged action records who did it.
let currentActor = { username: 'unknown', role: '' };
function setActor(user) {
  if (user) currentActor = { username: user.username, role: user.role };
}

// Append an immutable activity record (synced like any other table).
async function logActivity(action, details = '') {
  const row = {
    uuid: uuid(), at: nowIso(), username: currentActor.username,
    role: currentActor.role, action, details, deleted: false, updated_at: nowIso(),
  };
  await db.activity_log.add(row);
  await enqueue('activity_log', { ...row });
  // no notifyMutation(): logging shouldn't itself flip the badge to "pending"
}

async function getActivityLog(limit = 200) {
  const rows = (await db.activity_log.toArray()).filter((r) => !r.deleted);
  return rows.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit);
}

// ---------- Auth ----------

async function login(username, password) {
  // Prefer online: authoritative + caches credentials for offline use.
  if (navigator.onLine) {
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        await setToken(data.token);
        // Cache credential hash + user profile so this device works offline.
        const hash = await hashCredential(username, password);
        await setMeta(`offline_cred_${username}`, hash);
        await setMeta(`offline_user_${username}`, JSON.stringify(data.user));
        await syncNow();
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error || 'Invalid username or password' };
    } catch {
      /* network failure — fall through to offline path */
    }
  }
  // Offline path: verify against locally stored credential hash.
  const storedHash = await getMeta(`offline_cred_${username}`);
  if (!storedHash) {
    return {
      success: false,
      error: 'No offline access for this account. Connect to the internet and sign in once first.',
    };
  }
  const hash = await hashCredential(username, password);
  if (hash !== storedHash) {
    return { success: false, error: 'Wrong password (you are offline).' };
  }
  const cachedUser = await getMeta(`offline_user_${username}`);
  const user = cachedUser ? JSON.parse(cachedUser) : { username };
  return { success: true, user };
}

// User management is online-only (touches credentials). Cashier devices receive
// changes on their next sync.
async function getUsers() {
  if (navigator.onLine) {
    try {
      const res = await apiFetch('/api/users');
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        return res.json();
      }
    } catch {}
  }
  return active(await db.users.toArray()).map((u) => ({ uuid: u.uuid, username: u.username, role: u.role }));
}
async function createUser(user) {
  try {
    const res = await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(user) });
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) {
      return { success: false, error: 'Cannot reach server. Connect to the internet and try again.' };
    }
    const data = await res.json();
    if (data.success) syncNow();
    return data;
  } catch {
    return { success: false, error: 'Cannot reach server. Connect to the internet and try again.' };
  }
}
async function updateUser(uuid, data) {
  try {
    const res = await apiFetch('/api/users', { method: 'PUT', body: JSON.stringify({ uuid, ...data }) });
    if (!res.ok) {
      let msg = 'Server error. Try again.';
      try { const j = await res.json(); msg = j.error || msg; } catch {}
      return { success: false, error: msg };
    }
    const out = await res.json();
    if (out.success) syncNow();
    return out;
  } catch {
    return { success: false, error: 'Cannot reach server. Connect to the internet and try again.' };
  }
}
async function resetPassword(uuid, newPassword) {
  try {
    const res = await apiFetch('/api/users', { method: 'PUT', body: JSON.stringify({ uuid, newPassword }) });
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) {
      return { success: false, error: 'Cannot reach server. Connect to the internet and try again.' };
    }
    return res.json();
  } catch {
    return { success: false, error: 'Cannot reach server. Connect to the internet and try again.' };
  }
}
async function changePassword(uuid, _current, newPassword) {
  return resetPassword(uuid, newPassword);
}
async function deleteUser(uuid) {
  try {
    const res = await apiFetch('/api/users', { method: 'DELETE', body: JSON.stringify({ uuid }) });
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) {
      return { success: false, error: 'Cannot reach server. Connect to the internet and try again.' };
    }
    const out = await res.json();
    if (out.success) syncNow();
    return out;
  } catch {
    return { success: false, error: 'Cannot reach server. Connect to the internet and try again.' };
  }
}

// ---------- Products ----------

async function getProducts() {
  return (await db.products.toArray()).filter((p) => !p.deleted).sort((a, b) => a.name.localeCompare(b.name));
}
async function getProduct(id) {
  return db.products.get(id);
}
async function getProductsByCategory(category) {
  return (await getProducts()).filter((p) => p.category === category);
}
async function searchProducts(query) {
  const q = query.toLowerCase();
  return (await getProducts()).filter(
    (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || (p.size_unit || '').toLowerCase().includes(q)
  );
}
async function getCategories() {
  return [...new Set((await getProducts()).map((p) => p.category))].sort();
}
async function getLowStockProducts() {
  return (await getProducts()).filter((p) => Number(p.current_stock) <= Number(p.min_stock_alert)).sort((a, b) => Number(a.current_stock) - Number(b.current_stock));
}
async function createProduct(p) {
  const row = {
    uuid: uuid(), name: p.name, category: p.category, size_unit: p.size_unit || '',
    selling_price: Number(p.selling_price) || 0, current_stock: Number(p.current_stock) || 0,
    min_stock_alert: Number(p.min_stock_alert) || 0, updated_at: nowIso(), deleted: false,
  };
  const id = await db.products.add(row);
  await enqueue('products', { ...row });
  notifyMutation();
  await logActivity('Added product', `${row.name} (${row.category}) — stock ${row.current_stock}, price ${row.selling_price}`);
  return { id, ...row };
}
async function updateProduct(p) {
  const existing = await db.products.get(p.id);
  if (!existing) return null;
  const row = {
    ...existing, name: p.name, category: p.category, size_unit: p.size_unit || '',
    selling_price: Number(p.selling_price) || 0, current_stock: Number(p.current_stock) || 0,
    min_stock_alert: Number(p.min_stock_alert) || 0, updated_at: nowIso(),
  };
  await persist('products', row);
  const parts = [];
  if (existing.current_stock !== row.current_stock) parts.push(`stock ${existing.current_stock} → ${row.current_stock}`);
  if (existing.selling_price !== row.selling_price) parts.push(`price ${existing.selling_price} → ${row.selling_price}`);
  await logActivity('Updated product', `${row.name}${parts.length ? ' — ' + parts.join(', ') : ''}`);
  return row;
}
async function deleteProduct(id) {
  const existing = await db.products.get(id);
  if (existing) {
    await persist('products', { ...existing, deleted: true, updated_at: nowIso() });
    await logActivity('Deleted product', existing.name);
  }
  return { success: true };
}

async function adjustStock(productId, delta) {
  const p = await db.products.get(productId);
  if (!p) return;
  await persist('products', { ...p, current_stock: Number(p.current_stock) + delta, updated_at: nowIso() });
}

// ---------- Sales ----------

async function createSale({ products: items, total_amount, waiter_name, customer_name, payment_method }) {
  for (const item of items) {
    const prod = await db.products.get(item.product_id);
    if (!prod) throw new Error(`Product "${item.product_name || item.product_id}" not found`);
    if (prod.current_stock < item.quantity) {
      throw new Error(`Insufficient stock for "${prod.name}": only ${prod.current_stock} available, requested ${item.quantity}`);
    }
  }
  const enriched = items.map((i) => ({
    product_uuid: i.product_uuid, product_id: i.product_id, product_name: i.product_name,
    size_unit: i.size_unit || '', unit_price: i.unit_price, quantity: i.quantity, subtotal: i.subtotal,
  }));
  const row = {
    uuid: uuid(), sale_date: nowIso(), products: enriched, total_amount,
    waiter_name, customer_name: customer_name || null, payment_method: payment_method || 'Cash',
    cashier: currentActor.username, refunded: false, updated_at: nowIso(), deleted: false,
  };
  const id = await db.sales.add(row);
  await enqueue('sales', { ...row });
  for (const item of items) await adjustStock(item.product_id, -item.quantity);
  notifyMutation();
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  await logActivity('Recorded sale', `${itemCount} item(s), ${row.total_amount} (${row.payment_method}) — ${row.waiter_name}`);
  return { id, ...row };
}
async function getSales() {
  return (await db.sales.toArray()).filter((s) => !s.deleted).sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date));
}
async function getSale(id) {
  return db.sales.get(id);
}
async function refundSale(id) {
  const sale = await db.sales.get(id);
  if (!sale) return { success: false, error: 'Sale not found' };
  if (sale.refunded) return { success: false, error: 'Sale already refunded' };
  for (const item of sale.products) await adjustStock(item.product_id, item.quantity);
  await persist('sales', { ...sale, refunded: true, updated_at: nowIso() });
  await logActivity('Refunded sale', `${sale.total_amount} — ${sale.waiter_name}`);
  return { success: true };
}

// ---------- Waiters ----------

async function getWaiters() {
  return (await db.waiters.toArray()).filter((w) => !w.deleted).sort((a, b) => a.name.localeCompare(b.name));
}
async function getActiveWaiters() {
  return (await getWaiters()).filter((w) => w.active);
}
async function createWaiter(name) {
  if ((await getWaiters()).some((w) => w.name === name)) return { success: false, error: 'Waiter name already exists' };
  const row = { uuid: uuid(), name, active: true, updated_at: nowIso(), deleted: false };
  const id = await db.waiters.add(row);
  await enqueue('waiters', { ...row });
  notifyMutation();
  return { success: true, id };
}
async function updateWaiter(id, name) {
  if ((await getWaiters()).some((w) => w.name === name && w.id !== id)) return { success: false, error: 'Waiter name already exists' };
  const w = await db.waiters.get(id);
  if (w) await persist('waiters', { ...w, name, updated_at: nowIso() });
  return { success: true };
}
async function toggleWaiter(id, activeFlag) {
  const w = await db.waiters.get(id);
  if (w) await persist('waiters', { ...w, active: !!activeFlag, updated_at: nowIso() });
  return { success: true };
}
async function deleteWaiter(id) {
  const w = await db.waiters.get(id);
  if (w) await persist('waiters', { ...w, deleted: true, updated_at: nowIso() });
  return { success: true };
}

// ---------- Drafts (items embedded) ----------

async function createDraft({ waiter_name, table_number, customer_name }) {
  const row = {
    uuid: uuid(), waiter_name, table_number, customer_name: customer_name || '',
    status: 'open', items: [], total_amount: 0, created_at: nowIso(), updated_at: nowIso(),
    completed_at: null, deleted: false,
  };
  const id = await db.drafts.add(row);
  await enqueue('drafts', { ...row });
  notifyMutation();
  return { id, ...row };
}
function recalcDraft(d) {
  d.total_amount = d.items.reduce((s, i) => s + Number(i.subtotal), 0);
  return d;
}
async function addItemsToDraft(draftId, items) {
  const draft = await db.drafts.get(draftId);
  if (!draft || draft.status !== 'open') return { success: false, error: 'Draft not found or already completed' };
  for (const item of items) {
    const prod = await db.products.get(item.product_id);
    if (!prod) return { success: false, error: `Product not found` };
    if (prod.current_stock < item.quantity) return { success: false, error: `Insufficient stock for "${prod.name}": only ${prod.current_stock} available` };
  }
  for (const item of items) {
    draft.items.push({
      id: uuid(), product_uuid: item.product_uuid, product_id: item.product_id, product_name: item.product_name,
      size_unit: item.size_unit || '', unit_price: item.unit_price, quantity: item.quantity, subtotal: item.subtotal,
    });
    await adjustStock(item.product_id, -item.quantity);
  }
  recalcDraft(draft); draft.updated_at = nowIso();
  await persist('drafts', draft);
  return { success: true, draft };
}
async function findDraftByItem(itemId) {
  return (await db.drafts.toArray()).find((d) => d.status === 'open' && d.items.some((i) => i.id === itemId));
}
async function removeItemFromDraft(itemId) {
  const draft = await findDraftByItem(itemId);
  if (!draft) return { success: false, error: 'Item not found' };
  const item = draft.items.find((i) => i.id === itemId);
  await adjustStock(item.product_id, item.quantity);
  draft.items = draft.items.filter((i) => i.id !== itemId);
  recalcDraft(draft); draft.updated_at = nowIso();
  await persist('drafts', draft);
  return { success: true };
}
async function updateDraftItemQty(itemId, newQty) {
  if (newQty <= 0) return removeItemFromDraft(itemId);
  const draft = await findDraftByItem(itemId);
  if (!draft) return { success: false, error: 'Item not found' };
  const item = draft.items.find((i) => i.id === itemId);
  const diff = newQty - item.quantity;
  if (diff > 0) {
    const prod = await db.products.get(item.product_id);
    if (!prod || prod.current_stock < diff) return { success: false, error: `Insufficient stock for "${item.product_name}"` };
  }
  await adjustStock(item.product_id, -diff);
  item.quantity = newQty; item.subtotal = newQty * item.unit_price;
  recalcDraft(draft); draft.updated_at = nowIso();
  await persist('drafts', draft);
  return { success: true };
}
async function getDraft(id) {
  return db.drafts.get(id);
}
async function getOpenDrafts() {
  return (await db.drafts.toArray()).filter((d) => !d.deleted && d.status === 'open').sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}
async function completeDraft(draftId, paymentMethod) {
  const draft = await db.drafts.get(draftId);
  if (!draft || draft.status !== 'open') return { success: false, error: 'Draft not found or already completed' };
  if (draft.items.length === 0) return { success: false, error: 'Draft has no items' };
  // Stock already deducted when items were added — record sale directly.
  const enriched = draft.items.map((i) => ({
    product_uuid: i.product_uuid, product_id: i.product_id, product_name: i.product_name,
    size_unit: i.size_unit, unit_price: i.unit_price, quantity: i.quantity, subtotal: i.subtotal,
  }));
  const sale = {
    uuid: uuid(), sale_date: nowIso(), products: enriched, total_amount: draft.total_amount,
    waiter_name: draft.waiter_name, customer_name: draft.customer_name || null,
    payment_method: paymentMethod || 'Cash', cashier: currentActor.username,
    refunded: false, updated_at: nowIso(), deleted: false,
  };
  const id = await db.sales.add(sale);
  await enqueue('sales', { ...sale });
  draft.status = 'completed'; draft.completed_at = nowIso(); draft.updated_at = nowIso();
  await persist('drafts', draft);
  return { success: true, sale: { id, ...sale } };
}
async function updateDraft(id, { table_number, customer_name }) {
  const draft = await db.drafts.get(id);
  if (!draft || draft.status !== 'open') return { success: false, error: 'Draft not found or already completed' };
  await persist('drafts', { ...draft, table_number, customer_name: customer_name || '', updated_at: nowIso() });
  return { success: true };
}
async function deleteDraft(id) {
  const draft = await db.drafts.get(id);
  if (!draft) return { success: false, error: 'Draft not found' };
  if (draft.status !== 'open') return { success: false, error: 'Cannot delete a completed draft' };
  for (const item of draft.items) await adjustStock(item.product_id, item.quantity);
  await persist('drafts', { ...draft, deleted: true, items: [], total_amount: 0, updated_at: nowIso() });
  return { success: true };
}

// ---------- Expenses & daily snapshots (new for Release 2) ----------

async function getExpenses(date) {
  return (await db.expenses.toArray()).filter((e) => !e.deleted && e.expense_date === date);
}
async function createExpense({ expense_date, label, amount, category }) {
  const now = nowIso();
  const row = {
    uuid: uuid(), expense_date, label, amount: Number(amount) || 0, category: category || 'Other',
    added_by: currentActor.username, added_at: now, updated_at: now, deleted: false,
  };
  const id = await db.expenses.add(row);
  await enqueue('expenses', { ...row });
  notifyMutation();
  await logActivity('Added expense', `${row.label} — ${row.amount} (${row.category})`);
  return { id, ...row };
}
async function deleteExpense(id) {
  const e = await db.expenses.get(id);
  if (e) await persist('expenses', { ...e, deleted: true, updated_at: nowIso() });
  return { success: true };
}

// Capture today's opening stock from current stock (call once at day start).
async function captureOpeningStock(date) {
  const products = await getProducts();
  for (const p of products) {
    const existing = (await db.daily_snapshots.toArray()).find((s) => s.snapshot_date === date && s.product_uuid === p.uuid && !s.deleted);
    if (existing) continue;
    const row = {
      uuid: uuid(), snapshot_date: date, product_uuid: p.uuid, product_name: p.name,
      category: p.category, size_unit: p.size_unit, opening_stock: Number(p.current_stock),
      closing_stock: null, unit_price: Number(p.selling_price), updated_at: nowIso(), deleted: false,
    };
    await db.daily_snapshots.add(row);
    await enqueue('daily_snapshots', { ...row });
  }
  notifyMutation();
  await logActivity('Captured opening stock', `for ${date}`);
  return { success: true };
}

// Daily reconciliation report (matches the handwritten sheet).
async function getDailyStockReport(date) {
  const products = await getProducts();
  const snaps = (await db.daily_snapshots.toArray()).filter((s) => s.snapshot_date === date && !s.deleted);
  const snapByUuid = Object.fromEntries(snaps.map((s) => [s.product_uuid, s]));

  const items = products.map((p) => {
    const snap = snapByUuid[p.uuid];
    const opening = snap ? Number(snap.opening_stock) : Number(p.current_stock);
    const closing = Number(p.current_stock);
    const sold = Math.max(0, opening - closing);
    const price = Number(p.selling_price);
    return {
      product_name: p.name, category: p.category, size_unit: p.size_unit,
      opening_stock: opening, closing_stock: closing, sold,
      unit_price: price, amount: sold * price,
    };
  });

  // Payment breakdown from the day's (non-refunded) sales.
  const sales = (await getSales()).filter((s) => !s.refunded && localDate(s.sale_date) === date);
  const payments = {};
  let totalOut = 0;
  for (const s of sales) {
    payments[s.payment_method] = (payments[s.payment_method] || 0) + Number(s.total_amount);
    totalOut += Number(s.total_amount);
  }
  const expenses = await getExpenses(date);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return {
    date,
    items: items.sort((a, b) => a.category.localeCompare(b.category) || a.product_name.localeCompare(b.product_name)),
    totalAmountFromStock: items.reduce((s, i) => s + i.amount, 0),
    payments, totalOut, expenses, totalExpenses,
    grandTotal: totalOut - totalExpenses,
  };
}

// ---------- Reports (no cost/profit — "what went out") ----------

async function salesInRange(start, end) {
  return (await getSales()).filter((s) => {
    if (s.refunded) return false;
    const d = localDate(s.sale_date);
    return d >= start && d <= end;
  });
}

async function getSalesReport(start, end) {
  const sales = await salesInRange(start, end);
  const productMap = {};
  let totalOut = 0, totalItems = 0;
  for (const sale of sales) {
    totalOut += Number(sale.total_amount);
    for (const item of sale.products) {
      totalItems += Number(item.quantity);
      const key = item.product_uuid || item.product_name;
      if (!productMap[key]) productMap[key] = { product_name: item.product_name, size_unit: item.size_unit || '', total_qty: 0, total_amount: 0 };
      productMap[key].total_qty += Number(item.quantity);
      productMap[key].total_amount += Number(item.subtotal);
    }
  }
  const payments = {};
  for (const sale of sales) payments[sale.payment_method] = (payments[sale.payment_method] || 0) + Number(sale.total_amount);
  return {
    startDate: start, endDate: end,
    totalSales: sales.length, totalItems, totalOut,
    bestSellers: Object.values(productMap).sort((a, b) => b.total_qty - a.total_qty),
    paymentBreakdown: payments, sales,
  };
}

async function getMonthlySummary() {
  const sales = (await getSales()).filter((s) => !s.refunded);
  const months = {};
  for (const s of sales) {
    const m = localDate(s.sale_date).slice(0, 7);
    if (!months[m]) months[m] = { month: m, totalSales: 0, totalOut: 0, totalItems: 0 };
    months[m].totalSales += 1;
    months[m].totalOut += Number(s.total_amount);
    for (const item of s.products) months[m].totalItems += Number(item.quantity);
  }
  return Object.values(months).sort((a, b) => b.month.localeCompare(a.month));
}

async function getWaiterDailyReport(date) {
  const sales = await salesInRange(date, date);
  const map = {};
  for (const sale of sales) {
    const w = sale.waiter_name;
    if (!map[w]) map[w] = { waiter_name: w, totalSales: 0, totalOut: 0, totalItems: 0, sales: [] };
    map[w].totalSales += 1;
    map[w].totalOut += Number(sale.total_amount);
    for (const item of sale.products) map[w].totalItems += Number(item.quantity);
    map[w].sales.push(sale);
  }
  const waiters = Object.values(map).sort((a, b) => b.totalOut - a.totalOut);
  return {
    date, waiters,
    grandTotalSales: waiters.reduce((s, w) => s + w.totalSales, 0),
    grandTotalOut: waiters.reduce((s, w) => s + w.totalOut, 0),
    grandTotalItems: waiters.reduce((s, w) => s + w.totalItems, 0),
  };
}

// How much money a single cashier collected on a given day (their "takings").
async function getCashierTakings(date, cashier) {
  const sales = (await getSales()).filter((s) => !s.refunded && localDate(s.sale_date) === date && (s.cashier || '') === cashier);
  const payments = {};
  let totalCollected = 0, itemsCount = 0;
  for (const s of sales) {
    payments[s.payment_method] = (payments[s.payment_method] || 0) + Number(s.total_amount);
    totalCollected += Number(s.total_amount);
    for (const it of s.products) itemsCount += Number(it.quantity);
  }
  return { date, cashier, salesCount: sales.length, itemsCount, totalCollected, payments };
}

// Per-cashier takings for a day (owner oversight) — who collected how much.
async function getCashiersDaily(date) {
  const sales = (await getSales()).filter((s) => !s.refunded && localDate(s.sale_date) === date);
  const map = {};
  for (const s of sales) {
    const c = s.cashier || '(unknown)';
    if (!map[c]) map[c] = { cashier: c, salesCount: 0, itemsCount: 0, totalCollected: 0, payments: {} };
    map[c].salesCount += 1;
    map[c].totalCollected += Number(s.total_amount);
    for (const it of s.products) map[c].itemsCount += Number(it.quantity);
    map[c].payments[s.payment_method] = (map[c].payments[s.payment_method] || 0) + Number(s.total_amount);
  }
  return Object.values(map).sort((a, b) => b.totalCollected - a.totalCollected);
}

async function getInventoryValueReport() {
  const products = await getProducts();
  let totalSellingValue = 0;
  const items = products.map((p) => {
    const sellVal = Number(p.selling_price) * Number(p.current_stock);
    totalSellingValue += sellVal;
    return { ...p, stock_selling_value: sellVal };
  });
  const categories = {};
  for (const p of items) {
    if (!categories[p.category]) categories[p.category] = { category: p.category, sellingValue: 0, itemCount: 0, stockCount: 0 };
    categories[p.category].sellingValue += p.stock_selling_value;
    categories[p.category].itemCount += 1;
    categories[p.category].stockCount += Number(p.current_stock);
  }
  return {
    totalSellingValue, totalProducts: products.length,
    totalStock: products.reduce((s, p) => s + Number(p.current_stock), 0),
    items, categories: Object.values(categories).sort((a, b) => b.sellingValue - a.sellingValue),
  };
}

// Open drafts for a specific waiter (used by the Waiter mobile view).
async function getMyTables(waiterName) {
  return (await getOpenDrafts()).filter((d) => d.waiter_name === waiterName);
}

// Waiter's daily summary: tables completed, total revenue, items.
async function getWaiterDailySummary(waiterName, date) {
  const sales = (await getSales()).filter(
    (s) => !s.refunded && localDate(s.sale_date) === date && s.waiter_name === waiterName
  );
  const totalOut = sales.reduce((s, sale) => s + Number(sale.total_amount), 0);
  const totalItems = sales.reduce((s, sale) => sale.products.reduce((ss, i) => ss + Number(i.quantity), ss), 0);
  return { date, waiterName, tablesServed: sales.length, totalOut, totalItems, sales };
}

// Full staff analytics for the Owner: cashiers + waiters for a given date.
async function getStaffAnalytics(date) {
  const [cashiers, waiterReport] = await Promise.all([
    getCashiersDaily(date),
    getWaiterDailyReport(date),
  ]);
  return { date, cashiers, waiters: waiterReport.waiters, grandTotalOut: waiterReport.grandTotalOut };
}

// ---------- Printing (browser) ----------

function printHtml(html) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed'; frame.style.right = '0'; frame.style.bottom = '0';
    frame.style.width = '0'; frame.style.height = '0'; frame.style.border = '0';
    document.body.appendChild(frame);
    frame.onload = () => {
      setTimeout(() => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(() => { document.body.removeChild(frame); resolve({ success: true }); }, 500);
      }, 250);
    };
    frame.srcdoc = html;
  });
}

export const api = {
  setActor, logActivity, getActivityLog,
  login, getUsers, createUser, changePassword, updateUser, resetPassword, deleteUser,
  getProducts, getProduct, getProductsByCategory, searchProducts, getCategories, getLowStockProducts,
  createProduct, updateProduct, deleteProduct,
  getWaiters, getActiveWaiters, createWaiter, updateWaiter, toggleWaiter, deleteWaiter,
  createDraft, addItemsToDraft, removeItemFromDraft, updateDraftItemQty, getDraft, getOpenDrafts,
  completeDraft, updateDraft, deleteDraft,
  createSale, getSales, getSale, refundSale,
  getExpenses, createExpense, deleteExpense, captureOpeningStock, getDailyStockReport,
  getSalesReport, getMonthlySummary, getWaiterDailyReport, getInventoryValueReport,
  getCashierTakings, getCashiersDaily,
  getMyTables, getWaiterDailySummary, getStaffAnalytics,
  // Printing: in the browser, "Save as PDF" is the print dialog's destination.
  printReceipt: (html) => printHtml(html),
  saveReceiptPdf: (html) => printHtml(html),
  saveReportPdf: (html) => printHtml(html),
};

window.api = api;
