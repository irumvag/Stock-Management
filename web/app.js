// --- Session State ---
let currentUser = null;
let deleteTargetId = null;

// POS State
let cart = [];
let allProductsCache = [];

// Waiter auto-refresh timer (cleared on logout / view change)
let waiterRefreshTimer = null;

// --- Inactivity Auto-Logout ---
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
let inactivityTimer = null;

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (!currentUser) return;
  inactivityTimer = setTimeout(() => {
    if (currentUser) {
      currentUser = null;
      cart = [];
      showLogin();
      showLoginError('You have been logged out due to inactivity.');
    }
  }, INACTIVITY_TIMEOUT);
}

function startInactivityTracking() {
  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
  events.forEach((evt) => document.addEventListener(evt, resetInactivityTimer, { passive: true }));
  resetInactivityTimer();
}

function stopInactivityTracking() {
  if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
}

// Views accessible by role.
// Owner is a hands-off investor: oversight only — dashboard, reports, activity
// history, and user management. The Cashier runs day-to-day operations and does
// everything hands-on: POS, full inventory management (add products / update
// stock), sales, and the daily reconciliation report.
const OWNER_VIEWS   = ['dashboard', 'pos', 'products', 'sales', 'daily', 'reports', 'analytics', 'activity', 'users'];
const CASHIER_VIEWS = ['pos', 'products', 'daily', 'sales', 'analytics'];
const WAITER_VIEWS  = ['waiter'];

function isWaiter() {
  return currentUser && currentUser.role === 'Waiter';
}

function getAllowedViews() {
  if (isWaiter()) return WAITER_VIEWS;
  return isManager() ? OWNER_VIEWS : CASHIER_VIEWS;
}

function getDefaultView() {
  if (isWaiter()) return 'waiter';
  return isManager() ? 'dashboard' : 'pos';
}

// --- DOM References ---
const loginScreen = document.getElementById('login-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const appContainer = document.getElementById('app');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');
const productModal = document.getElementById('product-modal');
const productForm = document.getElementById('product-form');
const productFormError = document.getElementById('product-form-error');
const deleteModal = document.getElementById('delete-modal');
const receiptModal = document.getElementById('receipt-modal');

// --- Login ---

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username || !password) {
    showLoginError('Please enter both username and password.');
    return;
  }

  const result = await window.api.login(username, password);

  if (result.success) {
    currentUser = result.user;
    window.api.setActor(currentUser); // stamp activity-log entries with who's acting
    showApp();
  } else {
    showLoginError(result.error);
  }
});

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.hidden = false;
}

// --- Logout ---

logoutBtn.addEventListener('click', (e) => {
  e.preventDefault();
  stopInactivityTracking();
  currentUser = null;
  cart = [];
  showLogin();
});

// --- Screen Switching ---

// "Manager" kept as the function name for minimal churn; the Owner role is the
// privileged role in Release 2 (legacy 'Manager' still recognised for old data).
function isManager() {
  return currentUser && (currentUser.role === 'Owner' || currentUser.role === 'Manager');
}

function showApp() {
  loginScreen.hidden = true;
  appContainer.hidden = false;
  userInfo.innerHTML = `
    <div class="user-name">${escapeHtml(currentUser.username)}</div>
    <div class="user-role">${escapeHtml(currentUser.role)}</div>`;

  // Role-based nav: show/hide links
  const allowed = getAllowedViews();
  document.querySelectorAll('#sidebar a[data-view]').forEach((link) => {
    const li = link.parentElement;
    if (allowed.includes(link.dataset.view)) {
      li.style.display = '';
    } else {
      li.style.display = 'none';
      link.classList.remove('active');
    }
  });

  // Waiter mode: full-screen mobile layout, no sidebar
  if (isWaiter()) {
    appContainer.classList.add('waiter-mode');
  } else {
    appContainer.classList.remove('waiter-mode');
  }

  const defaultView = getDefaultView();
  const activeLink = document.querySelector('#sidebar a.active');
  if (activeLink) activeLink.classList.remove('active');
  const defaultLink = document.querySelector(`[data-view="${defaultView}"]`);
  if (defaultLink) defaultLink.classList.add('active');
  loadView(defaultView);

  // Start auto-logout timer
  startInactivityTracking();
}

function showLogin() {
  stopInactivityTracking();
  clearInterval(waiterRefreshTimer);
  appContainer.hidden = true;
  appContainer.classList.remove('waiter-mode');
  loginScreen.hidden = false;
  loginForm.reset();
  loginError.hidden = true;
  document.getElementById('username').focus();
}

// --- Navigation ---

document.querySelectorAll('#sidebar a[data-view]').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const active = document.querySelector('#sidebar a.active');
    if (active) active.classList.remove('active');
    link.classList.add('active');
    loadView(link.dataset.view);
  });
});

async function loadView(view) {
  // Route protection: redirect to default view if not allowed
  const allowed = getAllowedViews();
  if (!allowed.includes(view)) {
    view = getDefaultView();
    const active = document.querySelector('#sidebar a.active');
    if (active) active.classList.remove('active');
    const link = document.querySelector(`[data-view="${view}"]`);
    if (link) link.classList.add('active');
  }

  // Stop waiter auto-refresh when leaving the waiter view
  clearInterval(waiterRefreshTimer);

  const content = document.getElementById('content');
  switch (view) {
    case 'dashboard':  await loadDashboard(content);        break;
    case 'pos':        await loadPOS(content);              break;
    case 'products':   await loadInventory(content);        break;
    case 'sales':      await loadSalesHistory(content);     break;
    case 'daily':      await loadDailyStockReport(content); break;
    case 'reports':    await loadReports(content);          break;
    case 'analytics':  await loadAnalytics(content);        break;
    case 'activity':   await loadActivity(content);         break;
    case 'users':      await loadUsers(content);            break;
    case 'waiter':     await loadWaiterView(content);       break;
  }
}

// =====================================================
// ACTIVITY HISTORY (owner oversight / audit trail)
// =====================================================

async function loadActivity(container) {
  const entries = await window.api.getActivityLog(300);

  const actionClass = (a) => {
    if (/Deleted|Refunded/.test(a)) return 'act-danger';
    if (/Added|Recorded|Captured/.test(a)) return 'act-success';
    return 'act-info';
  };
  const fmtWhen = (iso) => new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  container.innerHTML = `
    <div class="view-header">
      <h1>Activity History</h1>
      <span class="chart-subtitle">${entries.length} recent action(s) — newest first</span>
    </div>
    ${entries.length === 0 ? '<div class="empty-state">No activity recorded yet.</div>' : `
    <table>
      <thead>
        <tr><th>When</th><th>User</th><th>Action</th><th>Details</th></tr>
      </thead>
      <tbody>
        ${entries.map((e) => `
          <tr>
            <td style="white-space:nowrap;">${fmtWhen(e.at)}</td>
            <td>${escapeHtml(e.username)}${e.role ? ` <span class="role-badge role-${String(e.role).toLowerCase()}">${escapeHtml(e.role)}</span>` : ''}</td>
            <td><span class="activity-tag ${actionClass(e.action)}">${escapeHtml(e.action)}</span></td>
            <td>${escapeHtml(e.details || '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`}`;
}

// =====================================================
// DASHBOARD
// =====================================================

// Vertical bar chart (SVG) for the 7-day sales trend.
function renderVBars(items) {
  const W = 320, H = 150, pad = 22, base = H - 18;
  const max = Math.max(...items.map((i) => i.value), 1);
  const n = items.length;
  const slot = (W - pad * 2) / n;
  const bw = Math.min(28, slot * 0.55);
  const bars = items.map((it, i) => {
    const x = pad + slot * i + (slot - bw) / 2;
    const h = Math.round((it.value / max) * (base - 12));
    const y = base - h;
    return `<rect x="${x.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${h}" rx="3" fill="#3b82f6"></rect>
      <text x="${(x + bw / 2).toFixed(1)}" y="${base + 13}" text-anchor="middle" class="vbar-label">${escapeHtml(it.label)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="vbars" preserveAspectRatio="xMidYMid meet">
    <line x1="${pad}" y1="${base}" x2="${W - pad}" y2="${base}" stroke="#e2e8f0"></line>${bars}</svg>`;
}

// Horizontal bars for ranked lists. money=true formats values as currency.
function renderHBars(items, color, money) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return `<div class="hbars">${items.map((i) => `
    <div class="hbar-row">
      <div class="hbar-label" title="${escapeHtml(i.label)}">${escapeHtml(i.label)}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(3, Math.round(i.value / max * 100))}%;background:${color}"></div></div>
      <div class="hbar-value">${money ? fmtNum(i.value) : i.value}</div>
    </div>`).join('')}</div>`;
}

async function loadDashboard(container) {
  const products = await window.api.getProducts();
  const lowStock = products.filter((p) => Number(p.current_stock) <= Number(p.min_stock_alert));
  const totalValue = products.reduce((sum, p) => sum + Number(p.selling_price) * Number(p.current_stock), 0);
  const categories = [...new Set(products.map((p) => p.category))];

  // --- Chart data ---
  const dayKey = (d) => d.toLocaleDateString('en-CA');
  const today = new Date();
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    last7.push({ key: dayKey(d), label: d.toLocaleDateString('en-GB', { weekday: 'short' }) });
  }
  const sales = (await window.api.getSales()).filter((s) => !s.refunded);
  const byDay = Object.fromEntries(last7.map((d) => [d.key, 0]));
  for (const s of sales) {
    const k = dayKey(new Date(s.sale_date));
    if (k in byDay) byDay[k] += Number(s.total_amount);
  }
  const week = last7.map((d) => ({ label: d.label, value: byDay[d.key] }));
  const weekTotal = week.reduce((s, d) => s + d.value, 0);

  // Top products by units sold (last 30 days)
  const start30 = new Date(today); start30.setDate(start30.getDate() - 29);
  const rep = await window.api.getSalesReport(dayKey(start30), dayKey(today));
  const topProducts = rep.bestSellers.slice(0, 5).map((p) => ({ label: p.product_name, value: p.total_qty }));

  // Stock value by category
  const inv = await window.api.getInventoryValueReport();
  const catValues = inv.categories.slice(0, 6).map((c) => ({ label: c.category, value: c.sellingValue }));

  container.innerHTML = `
    <h1>Dashboard</h1>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${products.length}</div>
        <div class="stat-label">Total Products</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${categories.length}</div>
        <div class="stat-label">Categories</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${fmtCurrency(totalValue)}</div>
        <div class="stat-label">Stock Value (Selling)</div>
      </div>
      <div class="stat-card ${lowStock.length > 0 ? 'stat-warning' : ''}">
        <div class="stat-value">${lowStock.length}</div>
        <div class="stat-label">Low Stock Alerts</div>
      </div>
    </div>

    <div class="dashboard-charts">
      <div class="chart-card">
        <h3>Sales — Last 7 Days</h3>
        <div class="chart-subtitle">Total out: ${fmtCurrency(weekTotal)}</div>
        ${renderVBars(week)}
      </div>
      <div class="chart-card">
        <h3>Top Products — Units Sold (30 days)</h3>
        ${topProducts.length ? renderHBars(topProducts, '#3b82f6', false) : '<div class="empty-state">No sales in the last 30 days.</div>'}
      </div>
      <div class="chart-card">
        <h3>Stock Value by Category</h3>
        ${catValues.length ? renderHBars(catValues, '#10b981', true) : '<div class="empty-state">No products yet.</div>'}
      </div>
    </div>

    ${lowStock.length > 0 ? `
      <h2 style="margin-top:30px;">Low Stock Alerts</h2>
      <table class="low-stock-table">
        <thead><tr><th>Product</th><th>Category</th><th>Size</th><th>Stock</th><th>Min Alert</th></tr></thead>
        <tbody>
          ${lowStock.map((p) => `
            <tr class="row-low-stock">
              <td>${escapeHtml(p.name)}</td>
              <td>${escapeHtml(p.category)}</td>
              <td>${escapeHtml(p.size_unit)}</td>
              <td><strong>${p.current_stock}</strong></td>
              <td>${p.min_stock_alert}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : ''}`;
}

// =====================================================
// POINT OF SALE
// =====================================================

let activeDraftId = null; // When adding to an existing draft

async function loadPOS(container) {
  allProductsCache = await window.api.getProducts();
  const waiters = await window.api.getActiveWaiters();
  const openDrafts = await window.api.getOpenDrafts();

  activeDraftId = null;

  const waiterOptions = waiters.length === 0
    ? '<option value="">-- No waiters added yet --</option>'
    : `<option value="">-- Select Waiter --</option>${waiters.map((w) => `<option value="${escapeHtml(w.name)}">${escapeHtml(w.name)}</option>`).join('')}`;

  container.innerHTML = `
    <div class="view-header">
      <h1>Point of Sale</h1>
    </div>
    <div id="pos-takings" class="takings-strip" aria-live="polite"></div>
    <div class="pos-tabs">
      <button class="pos-tab active" data-pos-tab="order">New Order</button>
      <button class="pos-tab" data-pos-tab="drafts">Open Tabs <span class="draft-count">${openDrafts.length}</span></button>
    </div>
    <div id="pos-order-panel">
      <div class="pos-layout">
        <div class="pos-products">
          <input type="text" id="pos-search" class="search-input pos-search-input" placeholder="Search products by name, category, or size..." autofocus>
          <div id="pos-product-list" class="pos-product-list">
            ${renderPOSProductGrid(allProductsCache)}
          </div>
        </div>
        <div class="pos-cart-panel">
          <h2 class="pos-cart-title" id="pos-cart-title">Cart</h2>
          <div id="pos-cart-items" class="pos-cart-items">
            <div class="empty-state">Cart is empty</div>
          </div>
          <div class="pos-cart-total" id="pos-cart-total">
            <span>Total:</span>
            <strong>UGX 0</strong>
          </div>
          <div class="pos-checkout-form">
            <div class="form-group">
              <label for="pos-waiter">Waiter</label>
              <select id="pos-waiter" class="select-input">${waiterOptions}</select>
            </div>
            <div class="form-group">
              <label for="pos-table">Table</label>
              <input type="text" id="pos-table" placeholder="e.g. Table 1, VIP, Bar">
            </div>
            <div class="form-group">
              <label for="pos-customer">Customer (optional)</label>
              <input type="text" id="pos-customer" placeholder="Customer name">
            </div>
            <div id="pos-error" class="error-message" hidden></div>
            <button class="btn-primary pos-complete-btn" id="pos-save-draft-btn">Save to Tab</button>
            <div class="pos-checkout-alt">
              <div class="form-group">
                <label for="pos-payment">Payment Method (direct sale)</label>
                <select id="pos-payment" class="select-input">
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Mobile Money">Mobile Money</option>
                </select>
              </div>
              <button class="btn-secondary pos-complete-btn" id="pos-complete-btn">Direct Sale & Print</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="pos-drafts-panel" hidden>
      <div id="drafts-list-container"></div>
    </div>`;

  // Tab switching
  container.querySelectorAll('.pos-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      container.querySelector('.pos-tab.active').classList.remove('active');
      tab.classList.add('active');
      const isOrder = tab.dataset.posTab === 'order';
      document.getElementById('pos-order-panel').hidden = !isOrder;
      document.getElementById('pos-drafts-panel').hidden = isOrder;
      if (!isOrder) renderDraftsList();
    });
  });

  document.getElementById('pos-search').addEventListener('input', debounce(posSearchProducts, 200));
  document.getElementById('pos-save-draft-btn').addEventListener('click', saveToDraft);
  document.getElementById('pos-complete-btn').addEventListener('click', completeSale);
  bindPOSProductEvents();
  refreshTakings();
}

// Live "money I collected today" strip on POS. Refreshes after each sale.
async function refreshTakings() {
  const el = document.getElementById('pos-takings');
  if (!el || !currentUser) return;
  const today = new Date().toLocaleDateString('en-CA');
  const t = await window.api.getCashierTakings(today, currentUser.username);
  const pay = Object.entries(t.payments);
  el.innerHTML = `
    <div class="takings-main">
      <div class="takings-label">Your takings today · ${escapeHtml(currentUser.username)}</div>
      <div class="takings-value">${fmtCurrency(t.totalCollected)}</div>
    </div>
    <div class="takings-meta">
      <span><strong>${t.salesCount}</strong> sale(s)</span>
      <span><strong>${t.itemsCount}</strong> item(s)</span>
      ${pay.map(([m, a]) => `<span>${escapeHtml(m)}: <strong>${fmtNum(a)}</strong></span>`).join('')}
    </div>`;
}

function renderPOSProductGrid(products) {
  if (products.length === 0) {
    return '<div class="empty-state">No products found.</div>';
  }

  return `<div class="pos-grid">
    ${products.map((p) => {
      const outOfStock = p.current_stock <= 0;
      return `
      <div class="pos-product-card ${outOfStock ? 'out-of-stock' : ''}" data-id="${p.id}">
        <div class="pos-card-name">${escapeHtml(p.name)}</div>
        <div class="pos-card-detail">${escapeHtml(p.category)} &middot; ${escapeHtml(p.size_unit)}</div>
        <div class="pos-card-price">${fmtCurrency(p.selling_price)}</div>
        <div class="pos-card-stock ${Number(p.current_stock) <= Number(p.min_stock_alert) ? 'stock-low' : ''}">
          ${outOfStock ? 'Out of stock' : p.current_stock + ' in stock'}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function bindPOSProductEvents() {
  const list = document.getElementById('pos-product-list');
  if (!list) return;

  list.addEventListener('click', (e) => {
    const card = e.target.closest('.pos-product-card');
    if (!card || card.classList.contains('out-of-stock')) return;
    addToCart(Number(card.dataset.id));
  });
}

function posSearchProducts() {
  const query = document.getElementById('pos-search').value.trim().toLowerCase();
  let filtered = allProductsCache;

  if (query) {
    filtered = allProductsCache.filter((p) =>
      p.name.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query) ||
      p.size_unit.toLowerCase().includes(query)
    );
  }

  const list = document.getElementById('pos-product-list');
  list.innerHTML = renderPOSProductGrid(filtered);
  // Note: do NOT call bindPOSProductEvents() here - the delegated click handler
  // on the container persists through innerHTML changes and stacking handlers
  // would cause addToCart to fire multiple times per click.
}

// --- Cart Management ---

function addToCart(productId) {
  const product = allProductsCache.find((p) => p.id === productId);
  if (!product) return;

  // Neon returns NUMERIC columns as strings — coerce to Number to avoid string concatenation.
  const unitPrice = Number(product.selling_price) || 0;
  const existing = cart.find((item) => item.product_id === productId);
  if (existing) {
    if (existing.quantity >= product.current_stock) return;
    existing.quantity += 1;
    existing.subtotal = existing.quantity * existing.unit_price;
  } else {
    cart.push({
      product_id: product.id,
      product_uuid: product.uuid,
      product_name: product.name,
      size_unit: product.size_unit,
      unit_price: unitPrice,
      quantity: 1,
      subtotal: unitPrice,
      max_stock: product.current_stock,
    });
  }

  renderCart();
}

function updateCartQuantity(productId, newQty) {
  const item = cart.find((i) => i.product_id === productId);
  if (!item) return;

  if (newQty <= 0) {
    cart = cart.filter((i) => i.product_id !== productId);
  } else if (newQty > item.max_stock) {
    return; // can't exceed stock
  } else {
    item.quantity = newQty;
    item.subtotal = item.quantity * item.unit_price;
  }

  renderCart();
}

function removeFromCart(productId) {
  cart = cart.filter((i) => i.product_id !== productId);
  renderCart();
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + Number(item.subtotal), 0);
}

function renderCart() {
  const container = document.getElementById('pos-cart-items');
  const totalEl = document.getElementById('pos-cart-total');

  if (cart.length === 0) {
    container.innerHTML = '<div class="empty-state">Cart is empty</div>';
    totalEl.innerHTML = '<span>Total:</span><strong>UGX 0</strong>';
    return;
  }

  container.innerHTML = cart.map((item) => `
    <div class="cart-item" data-id="${item.product_id}">
      <div class="cart-item-top">
        <div class="cart-item-name">${escapeHtml(item.product_name)}${item.size_unit ? `<span class="cart-item-size"> · ${escapeHtml(item.size_unit)}</span>` : ''}</div>
        <button class="btn-cart-remove" data-id="${item.product_id}" title="Remove">&times;</button>
      </div>
      <div class="cart-item-bottom">
        <div class="cart-item-detail">${fmtCurrency(item.unit_price)} each</div>
        <div class="cart-item-controls">
          <button class="btn-cart-qty" data-action="minus" data-id="${item.product_id}">&#8722;</button>
          <span class="cart-item-qty">${item.quantity}</span>
          <button class="btn-cart-qty" data-action="plus" data-id="${item.product_id}">+</button>
        </div>
        <div class="cart-item-subtotal">${fmtCurrency(item.subtotal)}</div>
      </div>
    </div>`).join('');

  const total = getCartTotal();
  totalEl.innerHTML = `<span>Total:</span><strong>${fmtCurrency(total)}</strong>`;

  // Bind cart events via delegation
  container.onclick = (e) => {
    const btn = e.target.closest('[data-action]');
    const removeBtn = e.target.closest('.btn-cart-remove');

    if (btn) {
      const id = Number(btn.dataset.id);
      const item = cart.find((i) => i.product_id === id);
      if (!item) return;
      const newQty = btn.dataset.action === 'plus' ? item.quantity + 1 : item.quantity - 1;
      updateCartQuantity(id, newQty);
    } else if (removeBtn) {
      removeFromCart(Number(removeBtn.dataset.id));
    }
  };
}

// --- Save to Draft (Tab) ---

async function saveToDraft() {
  const posError = document.getElementById('pos-error');
  posError.hidden = true;

  if (cart.length === 0) {
    posError.textContent = 'Add items to the cart first.';
    posError.hidden = false;
    return;
  }

  const waiter = document.getElementById('pos-waiter').value;
  if (!waiter) {
    posError.textContent = 'Please select a waiter.';
    posError.hidden = false;
    return;
  }

  const table = document.getElementById('pos-table').value.trim();
  if (!table) {
    posError.textContent = 'Please enter a table number.';
    posError.hidden = false;
    return;
  }

  const customer = document.getElementById('pos-customer').value.trim();

  const items = cart.map((item) => ({
    product_id: item.product_id,
    product_uuid: item.product_uuid,
    product_name: item.product_name,
    size_unit: item.size_unit,
    unit_price: item.unit_price,
    quantity: item.quantity,
    subtotal: item.subtotal,
  }));

  try {
    if (activeDraftId) {
      // Adding more items to existing draft
      const result = await window.api.addItemsToDraft(activeDraftId, items);
      if (!result.success) {
        posError.textContent = result.error;
        posError.hidden = false;
        return;
      }
    } else {
      // Create new draft then add items
      const draft = await window.api.createDraft({ waiter_name: waiter, table_number: table, customer_name: customer });
      const result = await window.api.addItemsToDraft(draft.id, items);
      if (!result.success) {
        posError.textContent = result.error;
        posError.hidden = false;
        return;
      }
    }
    cart = [];
    activeDraftId = null;
    allProductsCache = await window.api.getProducts();
    await loadPOS(document.getElementById('content'));
    // Switch to drafts tab
    const draftsTab = document.querySelector('[data-pos-tab="drafts"]');
    if (draftsTab) draftsTab.click();
  } catch (err) {
    posError.textContent = err.message || 'Failed to save draft.';
    posError.hidden = false;
  }
}

// --- Direct Sale (immediate payment) ---

async function completeSale() {
  const posError = document.getElementById('pos-error');
  posError.hidden = true;

  if (cart.length === 0) {
    posError.textContent = 'Add items to the cart before completing a sale.';
    posError.hidden = false;
    return;
  }

  const waiter = document.getElementById('pos-waiter').value;
  if (!waiter) {
    posError.textContent = 'Please select a waiter.';
    posError.hidden = false;
    return;
  }

  const customer = document.getElementById('pos-customer').value.trim();
  const payment = document.getElementById('pos-payment').value;

  const saleData = {
    products: cart.map((item) => ({
      product_id: item.product_id,
      product_uuid: item.product_uuid,
      product_name: item.product_name,
      size_unit: item.size_unit,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
    })),
    total_amount: getCartTotal(),
    waiter_name: waiter,
    customer_name: customer || null,
    payment_method: payment,
  };

  try {
    const sale = await window.api.createSale(saleData);
    cart = [];
    activeDraftId = null;
    allProductsCache = await window.api.getProducts();
    showReceipt(sale);
    await loadPOS(document.getElementById('content'));
  } catch (err) {
    posError.textContent = err.message || 'Failed to complete sale.';
    posError.hidden = false;
  }
}

// --- Drafts List ---

async function renderDraftsList() {
  const drafts = await window.api.getOpenDrafts();
  const container = document.getElementById('drafts-list-container');
  const countBadge = document.querySelector('.draft-count');
  if (countBadge) countBadge.textContent = drafts.length;

  if (drafts.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:40px 0;">No open tabs. Create one from "New Order" tab.</div>';
    return;
  }

  container.innerHTML = `
    <div class="drafts-grid">
      ${drafts.map((d) => {
        const itemCount = d.items.reduce((s, i) => s + Number(i.quantity), 0);
        const timeAgo = getTimeAgo(d.updated_at);
        return `
        <div class="draft-card" data-draft-id="${d.id}">
          <div class="draft-card-header">
            <div class="draft-table-badge">${escapeHtml(d.table_number)}</div>
            <span class="draft-time">${timeAgo}</span>
          </div>
          <div class="draft-card-info">
            <div class="draft-waiter">Waiter: <strong>${escapeHtml(d.waiter_name)}</strong></div>
            ${d.customer_name ? `<div class="draft-customer">Customer: ${escapeHtml(d.customer_name)}</div>` : ''}
            <div class="draft-summary">${itemCount} item${itemCount !== 1 ? 's' : ''} &middot; ${fmtCurrency(d.total_amount)}</div>
          </div>
          <div class="draft-card-items">
            ${d.items.map((item) => `
              <div class="draft-item-row" data-item-id="${item.id}">
                <span class="draft-item-name">${escapeHtml(item.product_name)} <small>${escapeHtml(item.size_unit)}</small></span>
                <div class="draft-item-controls">
                  <button class="btn-draft-qty" data-item-minus="${item.id}" title="Reduce quantity">-</button>
                  <span class="draft-item-qty">${item.quantity}</span>
                  <button class="btn-draft-qty" data-item-plus="${item.id}" title="Add quantity">+</button>
                  <span class="draft-item-subtotal">${fmtNum(item.subtotal)}</span>
                  <button class="btn-draft-remove" data-item-remove="${item.id}" title="Remove item">&times;</button>
                </div>
              </div>`).join('')}
          </div>
          <div class="draft-card-actions">
            <button class="btn-primary btn-sm" data-draft-add="${d.id}">+ Add Items</button>
            <button class="btn-sm" style="background:#16a34a;color:#fff;" data-draft-complete="${d.id}">Complete & Print</button>
            <button class="btn-secondary btn-sm" data-draft-delete="${d.id}">Cancel Tab</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  // Bind draft actions
  container.querySelectorAll('[data-draft-add]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const draftId = Number(btn.dataset.draftAdd);
      const draft = await window.api.getDraft(draftId);
      if (!draft) return;
      activeDraftId = draftId;
      // Switch to order tab with draft context
      const orderTab = document.querySelector('[data-pos-tab="order"]');
      if (orderTab) orderTab.click();
      // Pre-fill waiter and table
      const waiterSelect = document.getElementById('pos-waiter');
      const tableInput = document.getElementById('pos-table');
      const customerInput = document.getElementById('pos-customer');
      const cartTitle = document.getElementById('pos-cart-title');
      if (waiterSelect) { waiterSelect.value = draft.waiter_name; waiterSelect.disabled = true; }
      if (tableInput) { tableInput.value = draft.table_number; tableInput.readOnly = true; }
      if (customerInput) customerInput.value = draft.customer_name || '';
      if (cartTitle) cartTitle.textContent = `Adding to: ${draft.table_number}`;
    });
  });

  container.querySelectorAll('[data-draft-complete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const draftId = Number(btn.dataset.draftComplete);
      showCompleteDraftModal(draftId);
    });
  });

  container.querySelectorAll('[data-draft-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const draftId = Number(btn.dataset.draftDelete);
      if (!confirm('Cancel this tab? All items will be returned to stock.')) return;
      await window.api.deleteDraft(draftId);
      allProductsCache = await window.api.getProducts();
      renderDraftsList();
    });
  });

  // Bind item quantity +/- and remove buttons
  container.querySelectorAll('[data-item-minus]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const itemId = btn.dataset.itemMinus;
      const qtyEl = btn.parentElement.querySelector('.draft-item-qty');
      const currentQty = parseInt(qtyEl.textContent, 10);
      if (currentQty <= 1) {
        if (!confirm('Remove this item from the tab? Stock will be restored.')) return;
        const result = await window.api.removeItemFromDraft(itemId);
        if (!result.success) { alert(result.error); return; }
      } else {
        const result = await window.api.updateDraftItemQty(itemId, currentQty - 1);
        if (!result.success) { alert(result.error); return; }
      }
      allProductsCache = await window.api.getProducts();
      renderDraftsList();
    });
  });

  container.querySelectorAll('[data-item-plus]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const itemId = btn.dataset.itemPlus;
      const qtyEl = btn.parentElement.querySelector('.draft-item-qty');
      const currentQty = parseInt(qtyEl.textContent, 10);
      const result = await window.api.updateDraftItemQty(itemId, currentQty + 1);
      if (!result.success) { alert(result.error || 'Not enough stock'); return; }
      allProductsCache = await window.api.getProducts();
      renderDraftsList();
    });
  });

  container.querySelectorAll('[data-item-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const itemId = btn.dataset.itemRemove;
      if (!confirm('Remove this item from the tab? Stock will be restored.')) return;
      const result = await window.api.removeItemFromDraft(itemId);
      if (!result.success) { alert(result.error); return; }
      allProductsCache = await window.api.getProducts();
      renderDraftsList();
    });
  });
}

function showCompleteDraftModal(draftId) {
  // Create inline completion form
  const card = document.querySelector(`[data-draft-id="${draftId}"]`);
  if (!card) return;

  const existingForm = card.querySelector('.draft-complete-form');
  if (existingForm) { existingForm.remove(); return; }

  const formHtml = `
    <div class="draft-complete-form">
      <div class="form-group">
        <label>Payment Method</label>
        <select class="select-input" id="draft-payment-${draftId}">
          <option value="Cash">Cash</option>
          <option value="Card">Card</option>
          <option value="Mobile Money">Mobile Money</option>
        </select>
      </div>
      <button class="btn-primary btn-sm" id="draft-confirm-${draftId}">Confirm & Print Receipt</button>
    </div>`;

  card.insertAdjacentHTML('beforeend', formHtml);

  document.getElementById(`draft-confirm-${draftId}`).addEventListener('click', async () => {
    const payment = document.getElementById(`draft-payment-${draftId}`).value;
    const result = await window.api.completeDraft(draftId, payment);
    if (result.success) {
      showReceipt(result.sale);
      allProductsCache = await window.api.getProducts();
      renderDraftsList();
      refreshTakings();
    } else {
      alert(result.error || 'Failed to complete tab.');
    }
  });
}

function getTimeAgo(dateStr) {
  const diff = Date.now() - parseDbDate(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// =====================================================
// RECEIPT
// =====================================================

const HOTEL_NAME = 'CLUB TMP';
const HOTEL_TAGLINE = 'Bar & Restaurant';
const HOTEL_ADDRESS = 'Bukerere Road, Joggo-Sonde';
const HOTEL_PHONE = '0760-011106';

let lastSaleReceipt = null;

function formatReceiptDate(dateStr) {
  const d = parseDbDate(dateStr);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return { date, time };
}

function padReceiptNo(id) {
  return String(id).padStart(6, '0');
}

function showReceipt(sale) {
  lastSaleReceipt = sale;
  const receiptContent = document.getElementById('receipt-content');
  const { date, time } = formatReceiptDate(sale.sale_date);
  const items = sale.products;
  const itemCount = items.reduce((s, i) => s + Number(i.quantity), 0);

  receiptContent.innerHTML = `
    <div class="receipt">
      <div class="receipt-logo">
        <div class="receipt-logo-icon">H</div>
      </div>
      <div class="receipt-brand">
        <div class="receipt-hotel-name">${escapeHtml(HOTEL_NAME)}</div>
        <div class="receipt-hotel-tagline">${escapeHtml(HOTEL_TAGLINE)}</div>
        <div class="receipt-hotel-address">${escapeHtml(HOTEL_ADDRESS)}</div>
        <div class="receipt-hotel-phone">${escapeHtml(HOTEL_PHONE)}</div>
      </div>
      <div class="receipt-divider"></div>
      <div class="receipt-number">Receipt #${padReceiptNo(sale.id)}</div>
      <div class="receipt-meta">
        <div class="receipt-meta-row"><span>Date:</span><span>${escapeHtml(date)}</span></div>
        <div class="receipt-meta-row"><span>Time:</span><span>${escapeHtml(time)}</span></div>
        <div class="receipt-meta-row"><span>Waiter:</span><span>${escapeHtml(sale.waiter_name)}</span></div>
        ${sale.customer_name ? `<div class="receipt-meta-row"><span>Customer:</span><span>${escapeHtml(sale.customer_name)}</span></div>` : ''}
        <div class="receipt-meta-row"><span>Payment:</span><span>${escapeHtml(sale.payment_method)}</span></div>
      </div>
      <div class="receipt-divider"></div>
      <table class="receipt-table">
        <thead><tr><th>Item</th><th>Size</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${escapeHtml(item.product_name)}</td>
              <td>${escapeHtml(item.size_unit || '')}</td>
              <td>${item.quantity}</td>
              <td>${fmtNum(item.unit_price)}</td>
              <td>${fmtNum(item.subtotal)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="receipt-divider"></div>
      <div class="receipt-summary">
        <div class="receipt-summary-row"><span>Items:</span><span>${itemCount}</span></div>
        <div class="receipt-summary-row receipt-grand-total"><span>TOTAL:</span><span>UGX ${fmtNum(sale.total_amount)}</span></div>
      </div>
      <div class="receipt-divider"></div>
      <div class="receipt-footer">
        Thank you for visiting ${escapeHtml(HOTEL_NAME)}!<br>
        We look forward to serving you again.
      </div>
    </div>`;

  receiptModal.hidden = false;
}

function buildReceiptPrintHtml(sale) {
  const { date, time } = formatReceiptDate(sale.sale_date);
  const items = sale.products;
  const itemCount = items.reduce((s, i) => s + Number(i.quantity), 0);

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; width: 302px; margin: 0 auto; padding: 12px; font-size: 12px; color: #000; }
  .logo { text-align: center; margin-bottom: 2px; font-size: 28px; font-weight: bold; letter-spacing: 2px; }
  .hotel-name { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 1px; }
  .tagline { text-align: center; font-size: 11px; margin-bottom: 1px; }
  .contact { text-align: center; font-size: 10px; color: #444; margin-bottom: 2px; }
  .currency-label { text-align: center; font-size: 10px; color: #666; margin-bottom: 4px; }
  .divider { border-top: 1px dashed #000; margin: 8px 0; }
  .receipt-no { text-align: center; font-weight: bold; font-size: 13px; margin-bottom: 6px; }
  .meta-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 1px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  th { text-align: left; font-size: 10px; border-bottom: 1px solid #000; padding: 3px 2px; text-transform: uppercase; }
  td { padding: 3px 2px; font-size: 11px; border-bottom: 1px dotted #ccc; }
  th:nth-child(3), td:nth-child(3) { text-align: center; }
  th:nth-child(4), td:nth-child(4),
  th:nth-child(5), td:nth-child(5) { text-align: right; }
  .summary-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 2px; }
  .grand-total { font-size: 16px; font-weight: bold; border-top: 2px solid #000; padding-top: 4px; margin-top: 4px; }
  .footer { text-align: center; font-size: 11px; margin-top: 10px; line-height: 1.5; }
  .footer-thanks { font-weight: bold; font-size: 12px; }
</style></head><body>
  <div class="logo">H</div>
  <div class="hotel-name">${escapeHtml(HOTEL_NAME)}</div>
  <div class="tagline">${escapeHtml(HOTEL_TAGLINE)}</div>
  <div class="contact">${escapeHtml(HOTEL_ADDRESS)} | ${escapeHtml(HOTEL_PHONE)}</div>
  <div class="currency-label">All prices in UGX</div>
  <div class="divider"></div>
  <div class="receipt-no">Receipt #${padReceiptNo(sale.id)}</div>
  <div class="meta-row"><span>Date:</span><span>${escapeHtml(date)}</span></div>
  <div class="meta-row"><span>Time:</span><span>${escapeHtml(time)}</span></div>
  <div class="meta-row"><span>Waiter:</span><span>${escapeHtml(sale.waiter_name)}</span></div>
  ${sale.customer_name ? `<div class="meta-row"><span>Customer:</span><span>${escapeHtml(sale.customer_name)}</span></div>` : ''}
  <div class="meta-row"><span>Payment:</span><span>${escapeHtml(sale.payment_method)}</span></div>
  <div class="divider"></div>
  <table>
    <thead><tr><th>Item</th><th>Size</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
    <tbody>
      ${items.map((i) => `<tr>
        <td>${escapeHtml(i.product_name)}</td>
        <td>${escapeHtml(i.size_unit || '')}</td>
        <td>${i.quantity}</td>
        <td>${Math.round(i.unit_price).toLocaleString()}</td>
        <td>${Math.round(i.subtotal).toLocaleString()}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div class="divider"></div>
  <div class="summary-row"><span>Items:</span><span>${itemCount}</span></div>
  <div class="summary-row grand-total"><span>TOTAL:</span><span>UGX ${Math.round(sale.total_amount).toLocaleString()}</span></div>
  <div class="divider"></div>
  <div class="footer">
    <div class="footer-thanks">Thank you for visiting ${escapeHtml(HOTEL_NAME)}!</div>
    We look forward to serving you again.
  </div>
</body></html>`;
}

document.getElementById('receipt-close-btn').addEventListener('click', () => { receiptModal.hidden = true; });
document.getElementById('receipt-done-btn').addEventListener('click', () => { receiptModal.hidden = true; });
document.getElementById('receipt-print-btn').addEventListener('click', async () => {
  if (!lastSaleReceipt) return;
  await window.api.printReceipt(buildReceiptPrintHtml(lastSaleReceipt));
});
document.getElementById('receipt-pdf-btn').addEventListener('click', async () => {
  if (!lastSaleReceipt) return;
  await window.api.saveReceiptPdf(buildReceiptPrintHtml(lastSaleReceipt), `Receipt-${padReceiptNo(lastSaleReceipt.id)}`);
});

// =====================================================
// SALES HISTORY
// =====================================================

async function loadSalesHistory(container) {
  const sales = await window.api.getSales();

  container.innerHTML = `
    <div class="view-header">
      <h1>Sales History</h1>
    </div>
    ${sales.length === 0 ? '<div class="empty-state">No sales recorded yet.</div>' : `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Date</th>
            <th>Waiter</th>
            <th>Customer</th>
            <th>Items</th>
            <th>Payment</th>
            <th>Total</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${sales.map((s) => {
            const isRefunded = !!s.refunded;
            return `
            <tr class="${isRefunded ? 'row-refunded' : ''}">
              <td>${s.id}</td>
              <td>${parseDbDate(s.sale_date).toLocaleString()}</td>
              <td>${escapeHtml(s.waiter_name)}</td>
              <td>${escapeHtml(s.customer_name || '-')}</td>
              <td>${s.products.length} item${s.products.length !== 1 ? 's' : ''}</td>
              <td>${isRefunded ? '<span class="refund-badge">REFUNDED</span>' : escapeHtml(s.payment_method)}</td>
              <td><strong>${isRefunded ? '-' : fmtCurrency(s.total_amount)}</strong></td>
              <td class="actions-cell">
                <button class="btn-sm btn-secondary" data-sale-view="${s.id}" title="View details">View</button>
                ${isRefunded ? '' : `<button class="btn-sm btn-primary" data-sale-reprint="${s.id}" title="Reprint receipt">Reprint</button>
                <button class="btn-sm btn-danger" data-sale-refund="${s.id}" title="Refund">Refund</button>`}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div id="sale-detail-panel" hidden></div>`}`;

  // Bind View buttons
  container.querySelectorAll('[data-sale-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const saleId = Number(btn.dataset.saleView);
      const sale = sales.find((s) => s.id === saleId);
      if (sale) showSaleDetail(sale);
    });
  });

  // Bind Reprint buttons
  container.querySelectorAll('[data-sale-reprint]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const saleId = Number(btn.dataset.saleReprint);
      const sale = sales.find((s) => s.id === saleId);
      if (sale) showReceipt(sale);
    });
  });

  // Bind Refund buttons (Manager only)
  container.querySelectorAll('[data-sale-refund]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const saleId = Number(btn.dataset.saleRefund);
      const sale = sales.find((s) => s.id === saleId);
      if (!sale) return;
      const itemList = sale.products.map((p) => `${p.quantity}x ${p.product_name}`).join(', ');
      if (!confirm(`Refund sale #${saleId}?\n\nItems: ${itemList}\nTotal: ${fmtCurrency(sale.total_amount)}\n\nThis will restore stock and mark the sale as refunded.`)) return;
      const result = await window.api.refundSale(saleId);
      if (result.success) {
        await loadSalesHistory(container);
      } else {
        alert(result.error || 'Failed to refund sale.');
      }
    });
  });
}

function showSaleDetail(sale) {
  const panel = document.getElementById('sale-detail-panel');
  if (!panel) return;

  const { date, time } = formatReceiptDate(sale.sale_date);
  const items = sale.products;
  const itemCount = items.reduce((s, i) => s + Number(i.quantity), 0);

  panel.innerHTML = `
    <div class="sale-detail-card">
      <div class="sale-detail-header">
        <h3>Transaction #${padReceiptNo(sale.id)}</h3>
        <button class="btn-secondary btn-sm" id="sale-detail-close">Close</button>
      </div>
      <div class="sale-detail-meta">
        <div class="sale-detail-meta-item"><span class="meta-label">Date:</span> ${escapeHtml(date)} at ${escapeHtml(time)}</div>
        <div class="sale-detail-meta-item"><span class="meta-label">Waiter:</span> ${escapeHtml(sale.waiter_name)}</div>
        <div class="sale-detail-meta-item"><span class="meta-label">Customer:</span> ${escapeHtml(sale.customer_name || 'Walk-in')}</div>
        <div class="sale-detail-meta-item"><span class="meta-label">Payment:</span> ${escapeHtml(sale.payment_method)}</div>
      </div>
      <table class="sale-detail-table">
        <thead>
          <tr><th>Product</th><th>Size</th><th>Unit Price</th><th>Qty</th><th>Subtotal</th></tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${escapeHtml(item.product_name)}</td>
              <td>${escapeHtml(item.size_unit || '')}</td>
              <td>${fmtNum(item.unit_price)}</td>
              <td>${item.quantity}</td>
              <td>${fmtNum(item.subtotal)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="sale-detail-summary">
        <div class="sale-detail-summary-row"><span>Items:</span><span>${itemCount}</span></div>
        <div class="sale-detail-summary-row sale-detail-total"><span>TOTAL:</span><span>${fmtCurrency(sale.total_amount)}</span></div>
      </div>
      <div class="sale-detail-actions">
        ${sale.refunded ? '<span class="refund-badge" style="font-size:14px;padding:6px 16px;">REFUNDED</span>' : `
          <button class="btn-primary btn-sm" id="sale-detail-reprint">Reprint Receipt</button>
          <button class="btn-secondary btn-sm" id="sale-detail-pdf">Save as PDF</button>
          <button class="btn-secondary btn-sm" id="sale-detail-print">Print</button>
          <button class="btn-danger btn-sm" id="sale-detail-refund">Refund Sale</button>
        `}
      </div>
    </div>`;

  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth' });

  document.getElementById('sale-detail-close').addEventListener('click', () => { panel.hidden = true; });

  const reprintBtn = document.getElementById('sale-detail-reprint');
  if (reprintBtn) reprintBtn.addEventListener('click', () => { showReceipt(sale); });
  const pdfBtn = document.getElementById('sale-detail-pdf');
  if (pdfBtn) pdfBtn.addEventListener('click', async () => {
    await window.api.saveReceiptPdf(buildReceiptPrintHtml(sale), `Receipt-${padReceiptNo(sale.id)}`);
  });
  const printBtn = document.getElementById('sale-detail-print');
  if (printBtn) printBtn.addEventListener('click', async () => {
    await window.api.printReceipt(buildReceiptPrintHtml(sale));
  });
  const refundBtn = document.getElementById('sale-detail-refund');
  if (refundBtn) refundBtn.addEventListener('click', async () => {
    if (!confirm(`Refund sale #${sale.id}? This will restore stock and mark the sale as refunded.`)) return;
    const result = await window.api.refundSale(sale.id);
    if (result.success) {
      panel.hidden = true;
      await loadSalesHistory(document.getElementById('content'));
    } else {
      alert(result.error || 'Failed to refund sale.');
    }
  });
}

// =====================================================
// REPORTS & ANALYTICS
// =====================================================

let currentReportTab = 'daily';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function loadReports(container) {
  container.innerHTML = `
    <div class="view-header">
      <h1>Reports & Analytics</h1>
      <div>
        <button class="btn-secondary btn-sm" id="report-print-btn">Print Report</button>
        <button class="btn-secondary btn-sm" id="report-pdf-btn">Save as PDF</button>
      </div>
    </div>
    <div class="report-tabs">
      <button class="report-tab active" data-tab="daily">Daily Sales</button>
      <button class="report-tab" data-tab="daterange">Date Range</button>
      <button class="report-tab" data-tab="monthly">Monthly Summary</button>
      <button class="report-tab" data-tab="bywaiter">By Waiter</button>
      <button class="report-tab" data-tab="bycashier">By Cashier</button>
      <button class="report-tab" data-tab="bestsellers">Best Sellers</button>
      <button class="report-tab" data-tab="inventory">Inventory Value</button>
    </div>
    <div id="report-content"></div>`;

  // Tab switching
  container.querySelectorAll('.report-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      container.querySelector('.report-tab.active').classList.remove('active');
      tab.classList.add('active');
      currentReportTab = tab.dataset.tab;
      loadReportTab(tab.dataset.tab);
    });
  });

  document.getElementById('report-print-btn').addEventListener('click', printCurrentReport);
  document.getElementById('report-pdf-btn').addEventListener('click', saveCurrentReportPdf);

  loadReportTab(currentReportTab);
}

async function loadReportTab(tab) {
  const rc = document.getElementById('report-content');
  switch (tab) {
    case 'daily': await loadDailyReport(rc); break;
    case 'daterange': await loadDateRangeReport(rc); break;
    case 'monthly': await loadMonthlyReport(rc); break;
    case 'bywaiter': await loadWaiterDailyReport(rc); break;
    case 'bycashier': await loadCashierDailyReport(rc); break;
    case 'bestsellers': await loadBestSellersReport(rc); break;
    case 'inventory': await loadInventoryValueReport(rc); break;
  }
}

// =====================================================
// DAILY STOCK REPORT (reconciliation sheet — opening/closing/sold/amount)
// =====================================================

let dailyReportDate = null;
let dailyStockMode = 'full'; // 'full' = every item (like the book), 'sold' = only items that moved

const DAILY_STOCK_HEAD = '<thead><tr><th>Item</th><th>Size</th><th>Opening</th><th>Closing</th><th>Sold</th><th>Price</th><th>Amount</th></tr></thead>';

function dailyStockRow(i) {
  const moved = i.sold > 0;
  return `<tr class="${moved ? '' : 'row-muted'}">
      <td>${escapeHtml(i.product_name)}</td>
      <td>${escapeHtml(i.size_unit || '')}</td>
      <td>${i.opening_stock}</td>
      <td>${i.closing_stock}</td>
      <td><strong>${i.sold || 0}</strong></td>
      <td>${fmtNum(i.unit_price)}</td>
      <td>${moved ? fmtNum(i.amount) : '—'}</td>
    </tr>`;
}

// Builds the stock table. mode 'sold' = flat list of moved items; 'full' = every
// item grouped by category with subtotals (matches the handwritten daily sheet).
function buildDailyStockSection(report, mode) {
  const items = report.items;
  if (mode === 'sold') {
    const sold = items.filter((i) => i.sold > 0);
    if (sold.length === 0) return '<div class="empty-state">No items have gone out yet. Use "Capture Opening Stock" at the start of the day, then sales will appear here.</div>';
    return `<table>${DAILY_STOCK_HEAD}<tbody>${sold.map(dailyStockRow).join('')}</tbody>
      <tfoot><tr><th colspan="6" style="text-align:right">Total amount from stock</th><th>${fmtNum(report.totalAmountFromStock)}</th></tr></tfoot></table>`;
  }
  if (items.length === 0) return '<div class="empty-state">No products yet. Add products in Inventory first.</div>';
  const byCat = {};
  for (const i of items) (byCat[i.category] = byCat[i.category] || []).push(i);
  let grand = 0;
  let bodyHtml = '';
  for (const cat of Object.keys(byCat).sort()) {
    const list = byCat[cat];
    const sub = list.reduce((s, i) => s + i.amount, 0);
    grand += sub;
    bodyHtml += `<tr class="cat-row"><td colspan="7">${escapeHtml(cat)}</td></tr>`;
    bodyHtml += list.map(dailyStockRow).join('');
    bodyHtml += `<tr class="subtotal-row"><td colspan="6" style="text-align:right">${escapeHtml(cat)} subtotal</td><td>${fmtNum(sub)}</td></tr>`;
  }
  return `<table>${DAILY_STOCK_HEAD}<tbody>${bodyHtml}</tbody>
    <tfoot><tr><th colspan="6" style="text-align:right">Total amount from stock</th><th>${fmtNum(grand)}</th></tr></tfoot></table>`;
}

async function loadDailyStockReport(container) {
  dailyReportDate = dailyReportDate || todayStr();
  container.innerHTML = `
    <div class="view-header">
      <h1>Daily Report</h1>
      <div>
        <input type="date" id="daily-date" value="${dailyReportDate}">
        <button class="btn-secondary btn-sm" id="daily-capture-btn" title="Snapshot today's opening stock">Capture Opening Stock</button>
        <button class="btn-secondary btn-sm" id="daily-print-btn">Print / PDF</button>
      </div>
    </div>
    <div id="daily-report-body"></div>`;

  document.getElementById('daily-date').addEventListener('change', (e) => {
    dailyReportDate = e.target.value;
    renderDailyStockReport();
  });
  document.getElementById('daily-capture-btn').addEventListener('click', async () => {
    await window.api.captureOpeningStock(dailyReportDate);
    renderDailyStockReport();
  });
  document.getElementById('daily-print-btn').addEventListener('click', () => {
    const body = document.getElementById('daily-report-body');
    if (body) window.api.saveReportPdf(buildDailyReportPrintHtml(body.innerHTML));
  });

  renderDailyStockReport();
}

async function renderDailyStockReport() {
  const body = document.getElementById('daily-report-body');
  if (!body) return;
  const date = dailyReportDate;
  const report = await window.api.getDailyStockReport(date);

  const payments = Object.entries(report.payments);
  const fmtAddedAt = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const expensesRows = report.expenses.map((e) => `
    <tr>
      <td>${escapeHtml(e.label)}</td>
      <td>${escapeHtml(e.category)}</td>
      <td>${fmtNum(e.amount)}</td>
      <td>${escapeHtml(e.added_by || '—')}</td>
      <td style="white-space:nowrap;">${fmtAddedAt(e.added_at || e.updated_at)}</td>
      <td><button class="btn-icon btn-delete" data-exp-del="${e.id}" title="Delete">&#128465;</button></td>
    </tr>`).join('');

  body.innerHTML = `
    <div class="report-section">
      <div class="view-header" style="margin-bottom:8px;">
        <h2 style="margin:0;">Stock Sheet — ${formatDateLabel(date)}</h2>
        <div class="stock-mode-toggle">
          <button class="stock-mode-btn ${dailyStockMode === 'full' ? 'active' : ''}" data-stock-mode="full">Full Sheet</button>
          <button class="stock-mode-btn ${dailyStockMode === 'sold' ? 'active' : ''}" data-stock-mode="sold">Sold Only</button>
        </div>
      </div>
      ${buildDailyStockSection(report, dailyStockMode)}

      <h3 style="margin:20px 0 10px;">Payments &amp; Cash</h3>
      <div class="payment-breakdown">
        ${payments.length === 0 ? '<div class="empty-state">No sales recorded.</div>' :
          payments.map(([m, a]) => `<div class="payment-card"><div class="payment-method">${escapeHtml(m)}</div><div class="payment-amount">${fmtCurrency(a)}</div></div>`).join('')}
      </div>

      <h3 style="margin:20px 0 10px;">Expenses</h3>
      <form id="daily-expense-form" class="report-date-picker" style="align-items:flex-end;">
        <div class="form-group"><label>Label</label><input type="text" id="exp-label" placeholder="e.g. Food" required></div>
        <div class="form-group"><label>Category</label><select id="exp-category"><option value="Food">Food</option><option value="Other">Other</option></select></div>
        <div class="form-group"><label>Amount</label><input type="number" id="exp-amount" min="0" step="0.01" required></div>
        <button type="submit" class="btn-primary btn-sm">Add Expense</button>
      </form>
      ${report.expenses.length === 0 ? '' : `
      <table style="margin-top:12px;">
        <thead><tr><th>Label</th><th>Category</th><th>Amount</th><th>Added by</th><th>Added at</th><th></th></tr></thead>
        <tbody>${expensesRows}</tbody>
      </table>`}

      <div class="stats-grid" style="margin-top:20px;">
        <div class="stat-card"><div class="stat-value">${fmtCurrency(report.totalOut)}</div><div class="stat-label">Total Out (Sales)</div></div>
        <div class="stat-card"><div class="stat-value">${fmtCurrency(report.totalExpenses)}</div><div class="stat-label">Total Expenses</div></div>
        <div class="stat-card"><div class="stat-value">${fmtCurrency(report.grandTotal)}</div><div class="stat-label">Net (Sales − Expenses)</div></div>
      </div>
    </div>`;

  document.getElementById('daily-expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await window.api.createExpense({
      expense_date: date,
      label: document.getElementById('exp-label').value.trim(),
      amount: parseFloat(document.getElementById('exp-amount').value),
      category: document.getElementById('exp-category').value,
    });
    renderDailyStockReport();
  });
  body.querySelectorAll('[data-exp-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.api.deleteExpense(Number(btn.dataset.expDel));
      renderDailyStockReport();
    });
  });
  body.querySelectorAll('[data-stock-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      dailyStockMode = btn.dataset.stockMode;
      renderDailyStockReport();
    });
  });
}

function buildDailyReportPrintHtml(inner) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,'Segoe UI',Roboto,sans-serif; padding:24px 32px; font-size:13px; color:#333; }
    h2 { font-size:17px; margin-bottom:10px; } h3 { font-size:14px; margin:16px 0 8px; }
    table { width:100%; border-collapse:collapse; margin-bottom:16px; }
    th,td { padding:7px 10px; text-align:left; border-bottom:1px solid #ddd; font-size:12px; }
    th { background:#f5f5f5; }
    .payment-breakdown { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
    .payment-card { border:1px solid #ddd; border-radius:6px; padding:10px 16px; }
    .stats-grid { display:flex; gap:12px; margin-top:14px; }
    .stat-card { border:1px solid #ddd; border-radius:6px; padding:12px 16px; text-align:center; flex:1; }
    .stat-value { font-size:18px; font-weight:700; } .stat-label { font-size:11px; color:#666; }
    #daily-expense-form, [data-exp-del] { display:none; }
    @media print { body { padding:10px; } }
  </style></head><body>
    <div style="text-align:center;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:18px;">
      <div style="font-size:20px;font-weight:bold;">${HOTEL_NAME}</div>
      <div style="font-size:12px;color:#666;">Daily Report — generated ${new Date().toLocaleString('en-GB')}</div>
    </div>
    ${inner}
  </body></html>`;
}

// --- Daily Sales Report ---

async function loadDailyReport(container) {
  const today = todayStr();
  const report = await window.api.getSalesReport(today, today);
  container.innerHTML = `
    <div class="report-section">
      <h2>Daily Sales Report - ${formatDateLabel(today)}</h2>
      ${renderSalesReportCards(report)}
      ${renderPaymentBreakdown(report.paymentBreakdown)}
      ${renderBestSellersTable(report.bestSellers, 'Today\'s Items Sold')}
    </div>`;
}

// --- By Waiter Report ---

async function loadWaiterDailyReport(container) {
  const today = todayStr();

  container.innerHTML = `
    <div class="report-section">
      <div class="report-date-picker">
        <div class="form-group">
          <label for="waiter-report-date">Date</label>
          <input type="date" id="waiter-report-date" value="${today}">
        </div>
        <button class="btn-primary btn-sm" id="waiter-report-btn">Generate</button>
      </div>
      <div id="waiter-report-result"></div>
    </div>`;

  document.getElementById('waiter-report-btn').addEventListener('click', generateWaiterReport);
  generateWaiterReport();
}

async function generateWaiterReport() {
  const date = document.getElementById('waiter-report-date').value;
  if (!date) return;

  const report = await window.api.getWaiterDailyReport(date);
  const result = document.getElementById('waiter-report-result');

  if (report.waiters.length === 0) {
    result.innerHTML = `
      <h2>Waiter Report - ${formatDateLabel(date)}</h2>
      <div class="empty-state">No sales recorded on this date.</div>`;
    return;
  }

  result.innerHTML = `
    <h2>Waiter Report - ${formatDateLabel(date)}</h2>
    <div class="stats-grid" style="margin-bottom:20px;">
      <div class="stat-card"><div class="stat-value">${report.waiters.length}</div><div class="stat-label">Waiters Active</div></div>
      <div class="stat-card"><div class="stat-value">${report.grandTotalSales}</div><div class="stat-label">Total Transactions</div></div>
      <div class="stat-card"><div class="stat-value">${report.grandTotalItems}</div><div class="stat-label">Items Sold</div></div>
      <div class="stat-card"><div class="stat-value">${fmtCurrency(report.grandTotalOut)}</div><div class="stat-label">Total Out (Amount)</div></div>
    </div>

    <h3 style="margin-bottom:10px;">Performance by Waiter</h3>
    <table style="margin-bottom:24px;">
      <thead><tr><th>Waiter</th><th>Sales</th><th>Items</th><th>Amount</th></tr></thead>
      <tbody>
        ${report.waiters.map((w) => `<tr>
            <td><strong>${escapeHtml(w.waiter_name)}</strong></td>
            <td>${w.totalSales}</td>
            <td>${w.totalItems}</td>
            <td>${fmtNum(w.totalOut)}</td>
          </tr>`).join('')}
      </tbody>
    </table>

    ${report.waiters.map((w) => `
      <div class="waiter-detail-section">
        <h3>${escapeHtml(w.waiter_name)} - Transactions</h3>
        <table>
          <thead><tr><th>#</th><th>Time</th><th>Customer</th><th>Payment</th><th>Items</th><th>Total</th></tr></thead>
          <tbody>
            ${w.sales.map((s) => {
              const saleTime = parseDbDate(s.sale_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
              const itemCount = s.products.reduce((sum, i) => sum + i.quantity, 0);
              return `<tr>
                <td>${s.id}</td>
                <td>${saleTime}</td>
                <td>${escapeHtml(s.customer_name || 'Walk-in')}</td>
                <td>${escapeHtml(s.payment_method)}</td>
                <td>${itemCount}</td>
                <td><strong>${fmtCurrency(s.total_amount)}</strong></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`).join('')}`;
}

// --- By Cashier Report (how much money each cashier collected that day) ---

async function loadCashierDailyReport(container) {
  const today = todayStr();
  container.innerHTML = `
    <div class="report-section">
      <div class="report-date-picker">
        <div class="form-group">
          <label for="cashier-report-date">Date</label>
          <input type="date" id="cashier-report-date" value="${today}">
        </div>
        <button class="btn-primary btn-sm" id="cashier-report-btn">Generate</button>
      </div>
      <div id="cashier-report-result"></div>
    </div>`;
  document.getElementById('cashier-report-btn').addEventListener('click', generateCashierReport);
  generateCashierReport();
}

async function generateCashierReport() {
  const date = document.getElementById('cashier-report-date').value;
  if (!date) return;
  const cashiers = await window.api.getCashiersDaily(date);
  const result = document.getElementById('cashier-report-result');

  if (cashiers.length === 0) {
    result.innerHTML = `
      <h2>Cashier Takings - ${formatDateLabel(date)}</h2>
      <div class="empty-state">No sales recorded on this date.</div>`;
    return;
  }

  const grandTotal = cashiers.reduce((s, c) => s + c.totalCollected, 0);
  const grandSales = cashiers.reduce((s, c) => s + c.salesCount, 0);

  result.innerHTML = `
    <h2>Cashier Takings - ${formatDateLabel(date)}</h2>
    <div class="stats-grid" style="margin-bottom:20px;">
      <div class="stat-card"><div class="stat-value">${cashiers.length}</div><div class="stat-label">Cashiers Active</div></div>
      <div class="stat-card"><div class="stat-value">${grandSales}</div><div class="stat-label">Total Transactions</div></div>
      <div class="stat-card"><div class="stat-value">${fmtCurrency(grandTotal)}</div><div class="stat-label">Total Collected</div></div>
    </div>

    <h3 style="margin-bottom:10px;">Money Collected by Cashier</h3>
    <table>
      <thead><tr><th>Cashier</th><th>Sales</th><th>Items</th><th>Cash</th><th>Mobile Money</th><th>Card</th><th>Total Collected</th></tr></thead>
      <tbody>
        ${cashiers.map((c) => `<tr>
            <td><strong>${escapeHtml(c.cashier)}</strong></td>
            <td>${c.salesCount}</td>
            <td>${c.itemsCount}</td>
            <td>${fmtNum(c.payments['Cash'] || 0)}</td>
            <td>${fmtNum(c.payments['Mobile Money'] || 0)}</td>
            <td>${fmtNum(c.payments['Card'] || 0)}</td>
            <td><strong>${fmtNum(c.totalCollected)}</strong></td>
          </tr>`).join('')}
      </tbody>
      <tfoot><tr><th>Total</th><th>${grandSales}</th><th></th><th></th><th></th><th></th><th>${fmtNum(grandTotal)}</th></tr></tfoot>
    </table>`;
}

// --- Date Range Report ---

async function loadDateRangeReport(container) {
  const today = todayStr();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  container.innerHTML = `
    <div class="report-section">
      <div class="report-date-picker">
        <div class="form-group">
          <label for="report-start">Start Date</label>
          <input type="date" id="report-start" value="${weekAgo}">
        </div>
        <div class="form-group">
          <label for="report-end">End Date</label>
          <input type="date" id="report-end" value="${today}">
        </div>
        <button class="btn-primary btn-sm" id="report-range-btn">Generate</button>
      </div>
      <div id="report-range-result"></div>
    </div>`;

  document.getElementById('report-range-btn').addEventListener('click', generateDateRangeReport);
  generateDateRangeReport();
}

async function generateDateRangeReport() {
  const start = document.getElementById('report-start').value;
  const end = document.getElementById('report-end').value;
  if (!start || !end) return;

  const report = await window.api.getSalesReport(start, end);
  const result = document.getElementById('report-range-result');
  result.innerHTML = `
    <h2>Sales Report: ${formatDateLabel(start)} to ${formatDateLabel(end)}</h2>
    ${renderSalesReportCards(report)}
    ${renderPaymentBreakdown(report.paymentBreakdown)}
    ${renderBestSellersTable(report.bestSellers, 'Products Sold')}`;
}

// --- Monthly Summary ---

async function loadMonthlyReport(container) {
  const months = await window.api.getMonthlySummary();
  const totalOut = months.reduce((s, m) => s + m.totalOut, 0);

  container.innerHTML = `
    <div class="report-section">
      <h2>Monthly Summary</h2>
      <div class="stats-grid" style="margin-bottom:20px;">
        <div class="stat-card"><div class="stat-value">${months.length}</div><div class="stat-label">Months with Sales</div></div>
        <div class="stat-card"><div class="stat-value">${fmtCurrency(totalOut)}</div><div class="stat-label">All-Time Total Out</div></div>
      </div>
      ${months.length === 0 ? '<div class="empty-state">No sales data yet.</div>' : `
      <!-- Bar chart -->
      <div class="report-chart">
        ${renderMonthlyChart(months)}
      </div>
      <table>
        <thead><tr><th>Month</th><th>Sales</th><th>Items</th><th>Amount</th></tr></thead>
        <tbody>
          ${months.map((m) => `<tr>
              <td>${formatMonthLabel(m.month)}</td>
              <td>${m.totalSales}</td>
              <td>${m.totalItems}</td>
              <td>${fmtNum(m.totalOut)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`}
    </div>`;
}

function renderMonthlyChart(months) {
  const display = months.slice().reverse().slice(-12);
  const maxOut = Math.max(...display.map((m) => m.totalOut), 1);

  return `<div class="chart-bars">
    ${display.map((m) => {
      const h = Math.round((m.totalOut / maxOut) * 140);
      return `<div class="chart-bar-group">
        <div class="chart-bar-stack">
          <div class="chart-bar bar-revenue" style="height:${h}px" title="Amount: ${fmtNum(m.totalOut)}"></div>
        </div>
        <div class="chart-label">${m.month.slice(5)}</div>
      </div>`;
    }).join('')}
  </div>
  <div class="chart-legend">
    <span class="legend-item"><span class="legend-color bar-revenue"></span> Total Out</span>
  </div>`;
}

// --- Best Sellers ---

async function loadBestSellersReport(container) {
  const today = todayStr();
  const monthStart = today.slice(0, 8) + '01';

  container.innerHTML = `
    <div class="report-section">
      <div class="report-date-picker">
        <div class="form-group">
          <label for="bs-start">Start Date</label>
          <input type="date" id="bs-start" value="${monthStart}">
        </div>
        <div class="form-group">
          <label for="bs-end">End Date</label>
          <input type="date" id="bs-end" value="${today}">
        </div>
        <button class="btn-primary btn-sm" id="bs-generate-btn">Generate</button>
      </div>
      <div id="bs-result"></div>
    </div>`;

  document.getElementById('bs-generate-btn').addEventListener('click', generateBestSellers);
  generateBestSellers();
}

async function generateBestSellers() {
  const start = document.getElementById('bs-start').value;
  const end = document.getElementById('bs-end').value;
  if (!start || !end) return;

  const report = await window.api.getSalesReport(start, end);
  const rc = document.getElementById('bs-result');

  rc.innerHTML = `
    <h2>Best Selling Products: ${formatDateLabel(start)} to ${formatDateLabel(end)}</h2>
    ${report.bestSellers.length === 0 ? '<div class="empty-state">No sales in this period.</div>' : `
    <table>
      <thead><tr><th>#</th><th>Product</th><th>Size</th><th>Qty Sold</th><th>Amount</th></tr></thead>
      <tbody>
        ${report.bestSellers.map((p, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(p.product_name)}</td>
            <td>${escapeHtml(p.size_unit)}</td>
            <td><strong>${p.total_qty}</strong></td>
            <td>${fmtNum(p.total_amount)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`}`;
}

// --- Inventory Value ---

async function loadInventoryValueReport(container) {
  const report = await window.api.getInventoryValueReport();

  container.innerHTML = `
    <div class="report-section">
      <h2>Inventory Value Report</h2>
      <div class="stats-grid" style="margin-bottom:20px;">
        <div class="stat-card"><div class="stat-value">${report.totalProducts}</div><div class="stat-label">Products</div></div>
        <div class="stat-card"><div class="stat-value">${report.totalStock}</div><div class="stat-label">Total Units in Stock</div></div>
        <div class="stat-card"><div class="stat-value">${fmtCurrency(report.totalSellingValue)}</div><div class="stat-label">Total Selling Value</div></div>
      </div>

      <h3 style="margin-bottom:10px;">By Category</h3>
      <table style="margin-bottom:24px;">
        <thead><tr><th>Category</th><th>Products</th><th>Stock Units</th><th>Selling Value</th></tr></thead>
        <tbody>
          ${report.categories.map((c) => `
            <tr>
              <td>${escapeHtml(c.category)}</td>
              <td>${c.itemCount}</td>
              <td>${c.stockCount}</td>
              <td>${fmtNum(c.sellingValue)}</td>
            </tr>`).join('')}
        </tbody>
      </table>

      <h3 style="margin-bottom:10px;">All Products</h3>
      <table>
        <thead><tr><th>Product</th><th>Category</th><th>Size</th><th>Stock</th><th>Sell Price</th><th>Stock Value</th></tr></thead>
        <tbody>
          ${report.items.map((p) => `
            <tr class="${Number(p.current_stock) <= Number(p.min_stock_alert) ? 'row-low-stock' : ''}">
              <td>${escapeHtml(p.name)}</td>
              <td>${escapeHtml(p.category)}</td>
              <td>${escapeHtml(p.size_unit)}</td>
              <td>${p.current_stock}</td>
              <td>${fmtNum(p.selling_price)}</td>
              <td>${fmtNum(p.stock_selling_value)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// --- Report Rendering Helpers ---

function renderSalesReportCards(report) {
  return `
    <div class="stats-grid" style="margin-bottom:20px;">
      <div class="stat-card"><div class="stat-value">${report.totalSales}</div><div class="stat-label">Total Sales</div></div>
      <div class="stat-card"><div class="stat-value">${report.totalItems}</div><div class="stat-label">Items Sold</div></div>
      <div class="stat-card"><div class="stat-value">${fmtCurrency(report.totalOut)}</div><div class="stat-label">Total Out (Amount)</div></div>
    </div>`;
}

function renderPaymentBreakdown(breakdown) {
  const entries = Object.entries(breakdown);
  if (entries.length === 0) return '';
  return `
    <h3 style="margin-bottom:10px;">Payment Methods</h3>
    <div class="payment-breakdown">
      ${entries.map(([method, amount]) =>
        `<div class="payment-card"><div class="payment-method">${escapeHtml(method)}</div><div class="payment-amount">${fmtCurrency(amount)}</div></div>`
      ).join('')}
    </div>`;
}

function renderBestSellersTable(bestSellers, title) {
  if (bestSellers.length === 0) return '';
  return `
    <h3 style="margin:20px 0 10px;">${escapeHtml(title)}</h3>
    <table>
      <thead><tr><th>#</th><th>Product</th><th>Size</th><th>Qty Sold</th><th>Amount</th></tr></thead>
      <tbody>
        ${bestSellers.slice(0, 10).map((p, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(p.product_name)}</td>
            <td>${escapeHtml(p.size_unit)}</td>
            <td><strong>${p.total_qty}</strong></td>
            <td>${fmtNum(p.total_amount)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function formatDateLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMonthLabel(monthStr) {
  const [y, m] = monthStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function fmtNum(n) {
  return Math.round(n).toLocaleString();
}

function fmtCurrency(n) {
  return 'UGX ' + fmtNum(n);
}

// SQLite datetime('now') stores UTC without 'Z' suffix.
// Without this helper, JS interprets the date string as local time, showing
// times shifted by the timezone offset (e.g. 3 hours behind in Uganda UTC+3).
function parseDbDate(str) {
  if (!str) return new Date();
  // Release 2 stores ISO timestamps (with T/Z). Older SQLite data used
  // "YYYY-MM-DD HH:MM:SS" in UTC without a zone suffix.
  if (str.includes('T') || str.endsWith('Z')) return new Date(str);
  return new Date(str.replace(' ', 'T') + 'Z');
}

// --- Report Print / PDF ---

function buildReportPrintHtml() {
  const reportContent = document.getElementById('report-content');
  if (!reportContent) return '';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; padding: 24px 32px; font-size: 13px; color: #333; width: 100%; max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 20px; margin-bottom: 6px; }
  h2 { font-size: 17px; margin-bottom: 10px; color: #1e293b; }
  h3 { font-size: 14px; margin-bottom: 8px; color: #334155; }
  .print-header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #333; padding-bottom: 14px; }
  .print-header .hotel { font-size: 20px; font-weight: bold; }
  .print-header .date { font-size: 12px; color: #666; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; display: table; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd; font-size: 13px; }
  th { background: #f5f5f5; font-weight: 600; font-size: 12px; }
  td { font-size: 13px; }
  .stats-grid { display: flex; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
  .stat-card { border: 1px solid #ddd; border-radius: 6px; padding: 14px 18px; text-align: center; flex: 1; min-width: 120px; }
  .stat-value { font-size: 20px; font-weight: 700; }
  .stat-label { font-size: 12px; color: #666; margin-top: 3px; }
  .profit-positive { color: #16a34a; }
  .profit-negative { color: #dc2626; }
  .row-low-stock { background: #fff5f5; }
  .payment-breakdown { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  .payment-card { border: 1px solid #ddd; border-radius: 6px; padding: 12px 18px; text-align: center; min-width: 120px; }
  .payment-method { font-size: 12px; color: #666; }
  .payment-amount { font-size: 17px; font-weight: 600; }
  .waiter-detail-section { margin-top: 16px; padding: 14px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
  .waiter-detail-section h3 { font-size: 14px; margin-bottom: 8px; }
  .report-section { margin-bottom: 20px; }
  .chart-bars, .chart-legend, .report-tabs, .report-date-picker button, #report-print-btn, #report-pdf-btn, .view-header button { display: none; }
  @media print { body { padding: 10px; } }
</style></head><body>
  <div class="print-header">
    <div class="hotel">${HOTEL_NAME} - ${HOTEL_TAGLINE}</div>
    <div style="font-size:13px;color:#666;">${HOTEL_ADDRESS} | ${HOTEL_PHONE}</div>
    <h1 style="margin-top:8px;">Report</h1>
    <div class="date">Generated: ${new Date().toLocaleString('en-GB')}</div>
  </div>
  ${reportContent.innerHTML}
</body></html>`;
}

async function printCurrentReport() {
  const html = buildReportPrintHtml();
  if (html) await window.api.printReceipt(html);
}

async function saveCurrentReportPdf() {
  const html = buildReportPrintHtml();
  if (html) await window.api.saveReportPdf(html, `Report-${todayStr()}`);
}

// =====================================================
// INVENTORY
// =====================================================

async function loadInventory(container) {
  const [products, categories] = await Promise.all([
    window.api.getProducts(),
    window.api.getCategories(),
  ]);

  const categoryOptions = categories.map((c) =>
    `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
  ).join('');

  container.innerHTML = `
    <div class="view-header">
      <h1>Inventory</h1>
      <button class="btn-primary btn-sm" id="add-product-btn">+ Add Product</button>
    </div>
    <div class="toolbar">
      <input type="text" id="search-input" class="search-input" placeholder="Search products...">
      <select id="category-filter" class="select-input">
        <option value="">All Categories</option>
        ${categoryOptions}
      </select>
      <label class="checkbox-label">
        <input type="checkbox" id="low-stock-filter"> Low stock only
      </label>
    </div>
    <div id="products-table-container">
      ${renderProductsTable(products)}
    </div>`;

  const addBtn = document.getElementById('add-product-btn');
  if (addBtn) addBtn.addEventListener('click', () => openProductModal());

  document.getElementById('search-input').addEventListener('input', debounce(filterProducts, 300));
  document.getElementById('category-filter').addEventListener('change', filterProducts);
  document.getElementById('low-stock-filter').addEventListener('change', filterProducts);

  bindProductTableEvents();
}

function renderProductsTable(products) {
  if (products.length === 0) {
    return '<div class="empty-state">No products found.</div>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Category</th>
          <th>Size</th>
          <th>Sell Price (UGX)</th>
          <th>Stock</th>
          <th>Min Alert</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${products.map((p) => {
          const isLow = Number(p.current_stock) <= Number(p.min_stock_alert);
          return `
          <tr class="${isLow ? 'row-low-stock' : ''}" data-id="${p.id}">
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.category)}</td>
            <td>${escapeHtml(p.size_unit)}</td>
            <td>${fmtNum(p.selling_price)}</td>
            <td class="${isLow ? 'stock-low' : ''}">${p.current_stock}</td>
            <td>${p.min_stock_alert}</td>
            <td class="actions-cell">
              <button class="btn-icon btn-edit" data-id="${p.id}" title="Edit">&#9998;</button>
              <button class="btn-icon btn-delete" data-id="${p.id}" title="Delete">&#128465;</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function bindProductTableEvents() {
  const container = document.getElementById('products-table-container');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.btn-edit');
    const deleteBtn = e.target.closest('.btn-delete');

    if (editBtn) {
      openProductModal(Number(editBtn.dataset.id));
    } else if (deleteBtn) {
      openDeleteModal(Number(deleteBtn.dataset.id));
    }
  });
}

async function filterProducts() {
  const query = document.getElementById('search-input').value.trim();
  const category = document.getElementById('category-filter').value;
  const lowOnly = document.getElementById('low-stock-filter').checked;

  let products;
  if (query) {
    products = await window.api.searchProducts(query);
  } else if (category) {
    products = await window.api.getProductsByCategory(category);
  } else {
    products = await window.api.getProducts();
  }

  if (lowOnly) {
    products = products.filter((p) => Number(p.current_stock) <= Number(p.min_stock_alert));
  }

  const container = document.getElementById('products-table-container');
  container.innerHTML = renderProductsTable(products);
  bindProductTableEvents();
}

// --- Product Modal (Add/Edit) ---

async function openProductModal(editId) {
  productFormError.hidden = true;
  productForm.reset();
  document.getElementById('pf-id').value = '';

  const categories = await window.api.getCategories();
  const datalist = document.getElementById('category-list');
  datalist.innerHTML = categories.map((c) => `<option value="${escapeHtml(c)}">`).join('');

  if (editId) {
    document.getElementById('modal-title').textContent = 'Edit Product';
    const p = await window.api.getProduct(editId);
    if (!p) return;
    document.getElementById('pf-id').value = p.id;
    document.getElementById('pf-name').value = p.name;
    document.getElementById('pf-category').value = p.category;
    document.getElementById('pf-size').value = p.size_unit;
    document.getElementById('pf-stock').value = p.current_stock;
    document.getElementById('pf-selling').value = p.selling_price;
    document.getElementById('pf-min-stock').value = p.min_stock_alert;
  } else {
    document.getElementById('modal-title').textContent = 'Add Product';
  }

  productModal.hidden = false;
}

function closeProductModal() {
  productModal.hidden = true;
  productForm.reset();
}

document.getElementById('modal-close-btn').addEventListener('click', closeProductModal);
document.getElementById('modal-cancel-btn').addEventListener('click', closeProductModal);

productForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  productFormError.hidden = true;

  const id = document.getElementById('pf-id').value;
  const data = {
    name: document.getElementById('pf-name').value.trim(),
    category: document.getElementById('pf-category').value.trim(),
    size_unit: document.getElementById('pf-size').value.trim(),
    current_stock: parseInt(document.getElementById('pf-stock').value, 10),
    selling_price: parseFloat(document.getElementById('pf-selling').value),
    min_stock_alert: parseInt(document.getElementById('pf-min-stock').value, 10),
  };

  if (!data.name || !data.category || !data.size_unit) {
    productFormError.textContent = 'Please fill in all required fields.';
    productFormError.hidden = false;
    return;
  }

  try {
    if (id) {
      await window.api.updateProduct({ id: Number(id), ...data });
    } else {
      await window.api.createProduct(data);
    }
    closeProductModal();
    await loadInventory(document.getElementById('content'));
  } catch (err) {
    productFormError.textContent = err.message || 'Failed to save product.';
    productFormError.hidden = false;
  }
});

// --- Delete Confirmation ---

function openDeleteModal(productId) {
  deleteTargetId = productId;
  deleteModal.hidden = false;
}

function closeDeleteModal() {
  deleteTargetId = null;
  deleteModal.hidden = true;
}

document.getElementById('delete-cancel-btn').addEventListener('click', closeDeleteModal);

document.getElementById('delete-confirm-btn').addEventListener('click', async () => {
  if (deleteTargetId) {
    await window.api.deleteProduct(deleteTargetId);
    closeDeleteModal();
    await loadInventory(document.getElementById('content'));
  }
});

// =====================================================
// WAITER MOBILE VIEW
// =====================================================

async function loadWaiterView(container) {
  const waiterName = currentUser.username;
  const today = new Date().toLocaleDateString('en-CA');

  const [myTables, summary] = await Promise.all([
    window.api.getMyTables(waiterName),
    window.api.getWaiterDailySummary(waiterName, today),
  ]);

  container.innerHTML = `
    <div class="waiter-app">
      <div class="waiter-header">
        <div>
          <div class="waiter-header-name">${escapeHtml(waiterName)}</div>
          <div class="waiter-header-date">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <div class="waiter-header-actions">
          <button class="waiter-action-btn" id="waiter-refresh-btn">&#8635; Refresh</button>
          <button class="waiter-action-btn waiter-signout" id="waiter-signout-btn">Sign Out</button>
        </div>
      </div>

      <div class="waiter-summary-strip">
        <div class="waiter-stat">
          <div class="waiter-stat-value">${myTables.length}</div>
          <div class="waiter-stat-label">Open Tables</div>
        </div>
        <div class="waiter-stat">
          <div class="waiter-stat-value">${summary.tablesServed}</div>
          <div class="waiter-stat-label">Served Today</div>
        </div>
        <div class="waiter-stat">
          <div class="waiter-stat-value">${fmtCurrency(summary.totalOut)}</div>
          <div class="waiter-stat-label">Today's Total</div>
        </div>
      </div>

      <div class="waiter-section">
        <h2 class="waiter-section-title">Open Tables (${myTables.length})</h2>
        ${myTables.length === 0
          ? '<div class="waiter-empty">No open tables assigned to you right now.</div>'
          : myTables.map((d) => renderWaiterDraftCard(d)).join('')}
      </div>

      ${summary.sales.length > 0 ? `
        <div class="waiter-section">
          <h2 class="waiter-section-title">Completed Today (${summary.tablesServed})</h2>
          ${summary.sales.map((s) => renderWaiterCompletedCard(s)).join('')}
        </div>` : ''}
    </div>`;

  document.getElementById('waiter-refresh-btn').addEventListener('click', () => loadWaiterView(container));
  document.getElementById('waiter-signout-btn').addEventListener('click', () => {
    currentUser = null; cart = [];
    clearInterval(waiterRefreshTimer);
    showLogin();
  });

  // Expand / collapse item list per card
  container.querySelectorAll('.waiter-items-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const list = btn.previousElementSibling;
      const open = list.hidden;
      list.hidden = !open;
      btn.textContent = open ? '▲ Hide items' : '▼ View items';
    });
  });

  // Auto-refresh every 30 s so waiters see new items without manual refresh
  clearInterval(waiterRefreshTimer);
  waiterRefreshTimer = setInterval(() => loadWaiterView(container), 30000);
}

function renderWaiterDraftCard(draft) {
  const itemCount = draft.items.reduce((s, i) => s + Number(i.quantity), 0);
  return `
    <div class="waiter-table-card waiter-card-open">
      <div class="waiter-card-row">
        <div class="waiter-card-table">🍽 ${escapeHtml(draft.table_number)}</div>
        <div class="waiter-card-time">${getTimeAgo(draft.updated_at)}</div>
      </div>
      ${draft.customer_name ? `<div class="waiter-card-customer">Customer: ${escapeHtml(draft.customer_name)}</div>` : ''}
      <div class="waiter-card-row" style="margin-top:8px;">
        <div class="waiter-card-meta">${itemCount} item${itemCount !== 1 ? 's' : ''}</div>
        <div class="waiter-card-total">${fmtCurrency(draft.total_amount)}</div>
      </div>
      <div class="waiter-items-list" hidden>
        ${draft.items.map((i) => `
          <div class="waiter-item-row">
            <span class="waiter-item-name">${escapeHtml(i.product_name)} <small class="waiter-item-size">${escapeHtml(i.size_unit || '')}</small></span>
            <span class="waiter-item-qty">×${i.quantity}</span>
            <span class="waiter-item-sub">${fmtCurrency(Number(i.subtotal))}</span>
          </div>`).join('')}
        <div class="waiter-items-footer">Total: <strong>${fmtCurrency(draft.total_amount)}</strong></div>
      </div>
      <button class="waiter-items-toggle">▼ View items</button>
    </div>`;
}

function renderWaiterCompletedCard(sale) {
  const { time } = formatReceiptDate(sale.sale_date);
  const itemCount = sale.products.reduce((s, i) => s + Number(i.quantity), 0);
  return `
    <div class="waiter-table-card waiter-card-done">
      <div class="waiter-card-row">
        <div class="waiter-card-table">✓ Table served</div>
        <div class="waiter-card-time">${time}</div>
      </div>
      ${sale.customer_name ? `<div class="waiter-card-customer">Customer: ${escapeHtml(sale.customer_name)}</div>` : ''}
      <div class="waiter-card-row" style="margin-top:6px;">
        <div class="waiter-card-meta">${itemCount} item${itemCount !== 1 ? 's' : ''} · ${escapeHtml(sale.payment_method)}</div>
        <div class="waiter-card-total">${fmtCurrency(Number(sale.total_amount))}</div>
      </div>
    </div>`;
}

// =====================================================
// ANALYTICS
// =====================================================

async function loadAnalytics(container) {
  const today = new Date().toLocaleDateString('en-CA');
  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  // Build last-7-days date range
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    last7.push(d.toLocaleDateString('en-CA'));
  }

  if (isManager()) {
    // ── Owner: full staff dashboard ──
    const [staff, waiterReport, salesReport] = await Promise.all([
      window.api.getCashiersDaily(today),
      window.api.getWaiterDailyReport(today),
      window.api.getSalesReport(last7[0], last7[last7.length - 1]),
    ]);

    // Weekly revenue chart data
    const byDay = Object.fromEntries(last7.map((d) => [d, 0]));
    for (const s of salesReport.sales) {
      const k = new Date(s.sale_date).toLocaleDateString('en-CA');
      if (k in byDay) byDay[k] += Number(s.total_amount);
    }
    const weekBars = last7.map((d) => ({
      label: new Date(d).toLocaleDateString('en-GB', { weekday: 'short' }),
      value: byDay[d],
    }));
    const weekTotal = last7.reduce((s, d) => s + byDay[d], 0);

    container.innerHTML = `
      <div class="view-header"><h1>Analytics</h1></div>

      <h2 style="margin-bottom:16px;">Today — ${dateLabel}</h2>

      <h3 class="analytics-sub">Cashier Takings</h3>
      ${staff.length === 0
        ? '<div class="empty-state" style="margin-bottom:20px;">No sales recorded today.</div>'
        : `<div class="stats-grid" style="margin-bottom:24px;">
            ${staff.map((c) => `
              <div class="stat-card">
                <div class="stat-value">${fmtCurrency(c.totalCollected)}</div>
                <div class="stat-label">${escapeHtml(c.cashier)}</div>
                <div class="analytics-sub-stat">${c.salesCount} sale${c.salesCount !== 1 ? 's' : ''} · ${c.itemsCount} items</div>
              </div>`).join('')}
          </div>`}

      <h3 class="analytics-sub">Waiter Tables Served</h3>
      ${waiterReport.waiters.length === 0
        ? '<div class="empty-state" style="margin-bottom:20px;">No sales recorded today.</div>'
        : `<div class="table-wrap" style="margin-bottom:24px;">
            <table>
              <thead><tr><th>Waiter</th><th>Tables</th><th>Items</th><th>Amount</th></tr></thead>
              <tbody>
                ${waiterReport.waiters.map((w) => `
                  <tr>
                    <td><strong>${escapeHtml(w.waiter_name)}</strong></td>
                    <td>${w.totalSales}</td>
                    <td>${w.totalItems}</td>
                    <td>${fmtCurrency(w.totalOut)}</td>
                  </tr>`).join('')}
              </tbody>
              <tfoot><tr>
                <th>Total</th>
                <th>${waiterReport.grandTotalSales}</th>
                <th>${waiterReport.grandTotalItems}</th>
                <th>${fmtCurrency(waiterReport.grandTotalOut)}</th>
              </tr></tfoot>
            </table>
          </div>`}

      <h3 class="analytics-sub">Revenue — Last 7 Days <span class="analytics-total-tag">${fmtCurrency(weekTotal)}</span></h3>
      <div style="margin-bottom:24px;">${renderVBars(weekBars)}</div>

      <h3 class="analytics-sub">Top Products — Last 7 Days</h3>
      ${salesReport.bestSellers.length === 0
        ? '<div class="empty-state">No sales in the last 7 days.</div>'
        : renderHBars(salesReport.bestSellers.slice(0, 8).map((p) => ({ label: p.product_name, value: p.total_qty })), '#3b82f6', false)}`;

  } else {
    // ── Cashier: personal performance ──
    const cashierName = currentUser.username;
    const [takingsToday, salesReport] = await Promise.all([
      window.api.getCashierTakings(today, cashierName),
      window.api.getSalesReport(last7[0], last7[last7.length - 1]),
    ]);

    // Filter to my sales only
    const mySales = salesReport.sales.filter((s) => (s.cashier || '') === cashierName);
    const myTotal = mySales.reduce((s, sale) => s + Number(sale.total_amount), 0);
    const myItems = mySales.reduce((s, sale) => sale.products.reduce((ss, i) => ss + Number(i.quantity), ss), 0);

    // My weekly chart
    const myByDay = Object.fromEntries(last7.map((d) => [d, 0]));
    for (const s of mySales) {
      const k = new Date(s.sale_date).toLocaleDateString('en-CA');
      if (k in myByDay) myByDay[k] += Number(s.total_amount);
    }
    const weekBars = last7.map((d) => ({
      label: new Date(d).toLocaleDateString('en-GB', { weekday: 'short' }),
      value: myByDay[d],
    }));

    // My top products
    const prodMap = {};
    for (const s of mySales) {
      for (const item of s.products) {
        const key = item.product_uuid || item.product_name;
        if (!prodMap[key]) prodMap[key] = { label: item.product_name, value: 0 };
        prodMap[key].value += Number(item.quantity);
      }
    }
    const topProducts = Object.values(prodMap).sort((a, b) => b.value - a.value).slice(0, 8);

    container.innerHTML = `
      <div class="view-header"><h1>My Analytics</h1></div>

      <h2 style="margin-bottom:16px;">Today — ${dateLabel}</h2>
      <div class="stats-grid" style="margin-bottom:24px;">
        <div class="stat-card">
          <div class="stat-value">${fmtCurrency(takingsToday.totalCollected)}</div>
          <div class="stat-label">Collected Today</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${takingsToday.salesCount}</div>
          <div class="stat-label">Sales Today</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${takingsToday.itemsCount}</div>
          <div class="stat-label">Items Sold</div>
        </div>
        ${Object.entries(takingsToday.payments).map(([m, a]) => `
          <div class="stat-card">
            <div class="stat-value">${fmtCurrency(a)}</div>
            <div class="stat-label">${escapeHtml(m)}</div>
          </div>`).join('')}
      </div>

      <h3 class="analytics-sub">My Revenue — Last 7 Days <span class="analytics-total-tag">${fmtCurrency(myTotal)}</span></h3>
      <div class="analytics-sub-stat" style="margin-bottom:8px;">${mySales.length} sale${mySales.length !== 1 ? 's' : ''} · ${myItems} items</div>
      <div style="margin-bottom:24px;">${renderVBars(weekBars)}</div>

      <h3 class="analytics-sub">My Top Products — Last 7 Days</h3>
      ${topProducts.length === 0
        ? '<div class="empty-state">No sales in the last 7 days.</div>'
        : renderHBars(topProducts, '#10b981', false)}`;
  }
}

// =====================================================
// USER MANAGEMENT (Manager only)
// =====================================================

let userDeleteTargetId = null;

async function loadUsers(container) {
  const [users, waiters] = await Promise.all([window.api.getUsers(), window.api.getWaiters()]);

  container.innerHTML = `
    <div class="view-header">
      <h1>System Users</h1>
      <button class="btn-primary btn-sm" id="add-user-btn">+ Add Login User</button>
    </div>
    <p style="color:#64748b;font-size:13px;margin-bottom:12px;">Login accounts for system access. <strong>Waiter tip:</strong> the username must exactly match the waiter's name in the Waiters list so their tables appear in their mobile view.</p>
    <table>
      <thead>
        <tr><th>Username</th><th>Role</th><th>Created</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${users.map((u) => `
          <tr>
            <td><strong>${escapeHtml(u.username)}</strong>${u.username === 'admin' ? ' <span style="color:#94a3b8;font-size:11px;">(default)</span>' : ''}</td>
            <td><span class="role-badge role-${u.role.toLowerCase()}">${escapeHtml(u.role)}</span></td>
            <td>${u.created_at ? parseDbDate(u.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</td>
            <td class="actions-cell">
              <button class="btn-icon btn-edit" data-user-edit="${u.uuid}" title="Edit user">&#9998;</button>
              <button class="btn-icon" data-user-reset="${u.uuid}" title="Reset password">&#128274;</button>
              ${u.username !== 'admin' ? `<button class="btn-icon btn-delete" data-user-delete="${u.uuid}" data-user-name="${escapeHtml(u.username)}" title="Delete user">&#128465;</button>` : ''}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>

    <!-- Add/Edit User Inline Form -->
    <div id="user-form-section" hidden>
      <div style="background:#fff;border-radius:10px;padding:24px;margin-top:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h3 id="user-form-title" style="margin-bottom:16px;">Add New User</h3>
        <form id="user-form">
          <input type="hidden" id="uf-id">
          <div class="form-row">
            <div class="form-group">
              <label for="uf-username">Username</label>
              <input type="text" id="uf-username" required placeholder="Enter username" minlength="3">
            </div>
            <div class="form-group">
              <label for="uf-role">Role</label>
              <select id="uf-role" required>
                <option value="Cashier">Cashier</option>
                <option value="Waiter">Waiter</option>
                <option value="Owner">Owner</option>
              </select>
            </div>
          </div>
          <div class="form-row" id="uf-password-row">
            <div class="form-group">
              <label for="uf-password">Password</label>
              <input type="password" id="uf-password" placeholder="Enter password" minlength="4">
            </div>
            <div class="form-group">
              <label for="uf-password-confirm">Confirm Password</label>
              <input type="password" id="uf-password-confirm" placeholder="Confirm password">
            </div>
          </div>
          <div id="user-form-error" class="error-message" hidden></div>
          <div class="form-actions">
            <button type="button" class="btn-secondary" id="user-form-cancel">Cancel</button>
            <button type="submit" class="btn-primary" id="user-form-submit">Add User</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Reset Password Section -->
    <div id="reset-pw-section" hidden>
      <div style="background:#fff;border-radius:10px;padding:24px;margin-top:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h3 id="reset-pw-title" style="margin-bottom:16px;">Reset Password</h3>
        <form id="reset-pw-form">
          <input type="hidden" id="rp-id">
          <div class="form-row">
            <div class="form-group">
              <label for="rp-password">New Password</label>
              <input type="password" id="rp-password" required placeholder="Enter new password" minlength="4">
            </div>
            <div class="form-group">
              <label for="rp-password-confirm">Confirm Password</label>
              <input type="password" id="rp-password-confirm" required placeholder="Confirm new password">
            </div>
          </div>
          <div id="reset-pw-error" class="error-message" hidden></div>
          <div class="form-actions">
            <button type="button" class="btn-secondary" id="reset-pw-cancel">Cancel</button>
            <button type="submit" class="btn-primary">Reset Password</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation -->
    <div id="user-delete-section" hidden>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:24px;margin-top:20px;">
        <h3 style="color:#dc2626;margin-bottom:8px;">Confirm Delete</h3>
        <p id="user-delete-msg" style="margin-bottom:16px;">Are you sure?</p>
        <div class="form-actions">
          <button class="btn-secondary" id="user-delete-cancel">Cancel</button>
          <button class="btn-danger" id="user-delete-confirm">Delete User</button>
        </div>
      </div>
    </div>

    <!-- ====== WAITER NAMES SECTION ====== -->
    <div style="margin-top:40px;border-top:2px solid #e2e8f0;padding-top:24px;">
      <div class="view-header">
        <h1>Waiter Names</h1>
        <button class="btn-primary btn-sm" id="add-waiter-btn">+ Add Waiter</button>
      </div>
      <p style="color:#64748b;font-size:13px;margin-bottom:12px;">Waiters are staff names shown in the POS dropdown. No login/password needed.</p>
      ${waiters.length === 0 ? '<div class="empty-state">No waiters added yet. Add waiter names to use them in POS.</div>' : `
      <table>
        <thead><tr><th>Name</th><th>Status</th><th>Added</th><th>Actions</th></tr></thead>
        <tbody>
          ${waiters.map((w) => `
            <tr>
              <td><strong>${escapeHtml(w.name)}</strong></td>
              <td><span class="role-badge ${w.active ? 'role-waiter' : 'role-inactive'}">${w.active ? 'Active' : 'Inactive'}</span></td>
              <td>${w.created_at ? parseDbDate(w.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</td>
              <td class="actions-cell">
                <button class="btn-icon btn-edit" data-waiter-edit="${w.id}" data-waiter-name="${escapeHtml(w.name)}" title="Rename">&#9998;</button>
                <button class="btn-icon" data-waiter-toggle="${w.id}" data-waiter-active="${w.active ? '1' : '0'}" title="${w.active ? 'Deactivate' : 'Activate'}">${w.active ? '&#9940;' : '&#9989;'}</button>
                <button class="btn-icon btn-delete" data-waiter-del="${w.id}" data-waiter-name="${escapeHtml(w.name)}" title="Delete">&#128465;</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`}
      <div id="waiter-form-section" hidden>
        <div style="background:#fff;border-radius:10px;padding:24px;margin-top:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <h3 id="waiter-form-title" style="margin-bottom:16px;">Add Waiter</h3>
          <form id="waiter-form">
            <input type="hidden" id="wf-id">
            <div class="form-group">
              <label for="wf-name">Waiter Name</label>
              <input type="text" id="wf-name" required placeholder="Enter waiter name" minlength="2">
            </div>
            <div id="waiter-form-error" class="error-message" hidden></div>
            <div class="form-actions">
              <button type="button" class="btn-secondary" id="waiter-form-cancel">Cancel</button>
              <button type="submit" class="btn-primary" id="waiter-form-submit">Add Waiter</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  // --- Add User button ---
  document.getElementById('add-user-btn').addEventListener('click', () => {
    showUserForm(null);
  });

  // --- Edit buttons ---
  container.querySelectorAll('[data-user-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.userEdit;
      const allUsers = await window.api.getUsers();
      const user = allUsers.find((u) => u.uuid === userId);
      if (user) showUserForm(user);
    });
  });

  // --- Reset password buttons ---
  container.querySelectorAll('[data-user-reset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      showResetPassword(btn.dataset.userReset);
    });
  });

  // --- Delete buttons ---
  container.querySelectorAll('[data-user-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      userDeleteTargetId = btn.dataset.userDelete;
      const name = btn.dataset.userName;
      document.getElementById('user-delete-msg').textContent = `Are you sure you want to delete user "${name}"? This cannot be undone.`;
      document.getElementById('user-delete-section').hidden = false;
      document.getElementById('user-form-section').hidden = true;
      document.getElementById('reset-pw-section').hidden = true;
    });
  });

  // --- Delete confirm/cancel ---
  document.getElementById('user-delete-cancel').addEventListener('click', () => {
    document.getElementById('user-delete-section').hidden = true;
    userDeleteTargetId = null;
  });

  document.getElementById('user-delete-confirm').addEventListener('click', async () => {
    if (!userDeleteTargetId) return;
    const result = await window.api.deleteUser(userDeleteTargetId);
    if (result.success) {
      userDeleteTargetId = null;
      loadUsers(container);
    } else {
      alert(result.error || 'Failed to delete user');
    }
  });

  // --- User form submit ---
  document.getElementById('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('user-form-error');
    errEl.hidden = true;

    const id = document.getElementById('uf-id').value;
    const username = document.getElementById('uf-username').value.trim();
    const role = document.getElementById('uf-role').value;
    const password = document.getElementById('uf-password').value;
    const passwordConfirm = document.getElementById('uf-password-confirm').value;

    if (username.length < 3) {
      errEl.textContent = 'Username must be at least 3 characters.';
      errEl.hidden = false;
      return;
    }

    if (id) {
      // Editing existing user
      let result;
      try {
        result = await window.api.updateUser(id, { username, role });
      } catch (err) {
        errEl.textContent = 'Unexpected error. Please try again.';
        errEl.hidden = false;
        return;
      }
      if (!result.success) {
        errEl.textContent = result.error || 'Failed to update user.';
        errEl.hidden = false;
        return;
      }
    } else {
      // Creating new user
      if (!password || password.length < 4) {
        errEl.textContent = 'Password must be at least 4 characters.';
        errEl.hidden = false;
        return;
      }
      if (password !== passwordConfirm) {
        errEl.textContent = 'Passwords do not match.';
        errEl.hidden = false;
        return;
      }
      try {
        await window.api.createUser({ username, password, role });
      } catch (err) {
        errEl.textContent = 'Username already exists.';
        errEl.hidden = false;
        return;
      }
    }

    loadUsers(container);
  });

  // --- User form cancel ---
  document.getElementById('user-form-cancel').addEventListener('click', () => {
    document.getElementById('user-form-section').hidden = true;
  });

  // --- Reset password form submit ---
  document.getElementById('reset-pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('reset-pw-error');
    errEl.hidden = true;

    const userId = document.getElementById('rp-id').value;
    const newPw = document.getElementById('rp-password').value;
    const confirmPw = document.getElementById('rp-password-confirm').value;

    if (!newPw || newPw.length < 4) {
      errEl.textContent = 'Password must be at least 4 characters.';
      errEl.hidden = false;
      return;
    }
    if (newPw !== confirmPw) {
      errEl.textContent = 'Passwords do not match.';
      errEl.hidden = false;
      return;
    }

    const result = await window.api.resetPassword(userId, newPw);
    if (result.success) {
      document.getElementById('reset-pw-section').hidden = true;
      // Show brief success feedback
      const section = document.getElementById('reset-pw-section');
      section.hidden = true;
    } else {
      errEl.textContent = result.error;
      errEl.hidden = false;
    }
  });

  // --- Reset password cancel ---
  document.getElementById('reset-pw-cancel').addEventListener('click', () => {
    document.getElementById('reset-pw-section').hidden = true;
  });

  // ====== WAITER NAME MANAGEMENT ======

  // Add waiter button
  document.getElementById('add-waiter-btn').addEventListener('click', () => {
    document.getElementById('waiter-form-section').hidden = false;
    document.getElementById('waiter-form-error').hidden = true;
    document.getElementById('wf-id').value = '';
    document.getElementById('wf-name').value = '';
    document.getElementById('waiter-form-title').textContent = 'Add Waiter';
    document.getElementById('waiter-form-submit').textContent = 'Add Waiter';
    document.getElementById('wf-name').focus();
  });

  // Edit waiter buttons
  container.querySelectorAll('[data-waiter-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('waiter-form-section').hidden = false;
      document.getElementById('waiter-form-error').hidden = true;
      document.getElementById('wf-id').value = btn.dataset.waiterEdit;
      document.getElementById('wf-name').value = btn.dataset.waiterName;
      document.getElementById('waiter-form-title').textContent = 'Rename Waiter';
      document.getElementById('waiter-form-submit').textContent = 'Save';
      document.getElementById('wf-name').focus();
    });
  });

  // Toggle active/inactive
  container.querySelectorAll('[data-waiter-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const id = Number(btn.dataset.waiterToggle);
        const isActive = btn.dataset.waiterActive === '1';
        await window.api.toggleWaiter(id, !isActive);
        await loadUsers(container);
      } catch (err) {
        console.error('Toggle waiter failed', err);
      }
    });
  });

  // Delete waiter
  container.querySelectorAll('[data-waiter-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const name = btn.dataset.waiterName;
        if (!confirm(`Delete waiter "${name}"?`)) return;
        await window.api.deleteWaiter(Number(btn.dataset.waiterDel));
        await loadUsers(container);
      } catch (err) {
        console.error('Delete waiter failed', err);
      }
    });
  });

  // Waiter form submit
  document.getElementById('waiter-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('waiter-form-error');
    errEl.hidden = true;
    const id = document.getElementById('wf-id').value;
    const name = document.getElementById('wf-name').value.trim();
    if (name.length < 2) {
      errEl.textContent = 'Name must be at least 2 characters.';
      errEl.hidden = false;
      return;
    }
    let result;
    if (id) {
      result = await window.api.updateWaiter(Number(id), name);
    } else {
      result = await window.api.createWaiter(name);
    }
    if (!result.success) {
      errEl.textContent = result.error;
      errEl.hidden = false;
      return;
    }
    loadUsers(container);
  });

  // Waiter form cancel
  document.getElementById('waiter-form-cancel').addEventListener('click', () => {
    document.getElementById('waiter-form-section').hidden = true;
  });
}

function showUserForm(user) {
  document.getElementById('user-form-section').hidden = false;
  document.getElementById('user-delete-section').hidden = true;
  document.getElementById('reset-pw-section').hidden = true;
  document.getElementById('user-form-error').hidden = true;

  const title = document.getElementById('user-form-title');
  const submitBtn = document.getElementById('user-form-submit');
  const passwordRow = document.getElementById('uf-password-row');

  if (user) {
    title.textContent = `Edit User: ${user.username}`;
    submitBtn.textContent = 'Save Changes';
    document.getElementById('uf-id').value = user.uuid;
    document.getElementById('uf-username').value = user.username;
    document.getElementById('uf-role').value = user.role;
    passwordRow.hidden = true; // Don't show password fields when editing
  } else {
    title.textContent = 'Add New User';
    submitBtn.textContent = 'Add User';
    document.getElementById('uf-id').value = '';
    document.getElementById('uf-username').value = '';
    document.getElementById('uf-role').value = 'Cashier';
    document.getElementById('uf-password').value = '';
    document.getElementById('uf-password-confirm').value = '';
    passwordRow.hidden = false;
  }

  document.getElementById('uf-username').focus();
}

function showResetPassword(userId) {
  document.getElementById('reset-pw-section').hidden = false;
  document.getElementById('user-form-section').hidden = true;
  document.getElementById('user-delete-section').hidden = true;
  document.getElementById('reset-pw-error').hidden = true;
  document.getElementById('rp-id').value = userId;
  document.getElementById('rp-password').value = '';
  document.getElementById('rp-password-confirm').value = '';
  document.getElementById('rp-password').focus();
}

// =====================================================
// UTILITIES
// =====================================================

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// =====================================================
// KEYBOARD SHORTCUTS
// =====================================================

const NAV_SHORTCUTS = {
  F1: 'dashboard',
  F2: 'pos',
  F3: 'products',
  F4: 'sales',
  F5: 'daily',
  F6: 'reports',
  F7: 'analytics',
  F8: 'activity',
  F9: 'users',
};

document.addEventListener('keydown', (e) => {
  // Don't trigger shortcuts when typing in inputs
  const tag = document.activeElement.tagName;
  const inInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';

  // Escape: close any open modal
  if (e.key === 'Escape') {
    if (!productModal.hidden) { closeProductModal(); e.preventDefault(); return; }
    if (!deleteModal.hidden) { closeDeleteModal(); e.preventDefault(); return; }
    if (!receiptModal.hidden) { receiptModal.hidden = true; e.preventDefault(); return; }
    // If in an input, blur it
    if (inInput) { document.activeElement.blur(); e.preventDefault(); return; }
  }

  // Skip remaining shortcuts if not logged in or inside inputs (except F-keys)
  if (!currentUser) return;
  const isFKey = e.key.startsWith('F') && e.key.length <= 3;

  // F1-F5: Navigate views (respects role-based access)
  if (NAV_SHORTCUTS[e.key]) {
    e.preventDefault();
    const view = NAV_SHORTCUTS[e.key];
    if (!getAllowedViews().includes(view)) return;
    const link = document.querySelector(`[data-view="${view}"]`);
    if (link) {
      const active = document.querySelector('#sidebar a.active');
      if (active) active.classList.remove('active');
      link.classList.add('active');
      loadView(view);
    }
    return;
  }

  // F10: Complete Sale (when in POS)
  if (e.key === 'F10') {
    e.preventDefault();
    const completeBtn = document.getElementById('pos-complete-btn');
    if (completeBtn) completeSale();
    return;
  }

  // Slash key: Focus search (when not in input)
  if (e.key === '/' && !inInput) {
    e.preventDefault();
    const posSearch = document.getElementById('pos-search');
    const invSearch = document.getElementById('search-input');
    if (posSearch) posSearch.focus();
    else if (invSearch) invSearch.focus();
    return;
  }

  // N key: New product (when not in input, only if the Add button is present)
  if (e.key === 'n' && !inInput) {
    const addBtn = document.getElementById('add-product-btn');
    if (addBtn) { e.preventDefault(); openProductModal(); }
    return;
  }
});
