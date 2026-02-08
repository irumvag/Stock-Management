// --- Session State ---
let currentUser = null;
let deleteTargetId = null;

// POS State
let cart = [];
let allProductsCache = [];

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
  currentUser = null;
  cart = [];
  showLogin();
});

// --- Screen Switching ---

function isManager() {
  return currentUser && currentUser.role === 'Manager';
}

function showApp() {
  loginScreen.hidden = true;
  appContainer.hidden = false;
  userInfo.innerHTML = `
    <div class="user-name">${escapeHtml(currentUser.username)}</div>
    <div class="user-role">${escapeHtml(currentUser.role)}</div>`;

  const activeLink = document.querySelector('#sidebar a.active');
  if (activeLink) activeLink.classList.remove('active');
  const dashLink = document.querySelector('[data-view="dashboard"]');
  if (dashLink) dashLink.classList.add('active');
  loadView('dashboard');
}

function showLogin() {
  appContainer.hidden = true;
  loginScreen.hidden = false;
  loginForm.reset();
  loginError.hidden = true;
  document.getElementById('username').focus();
}

// --- Navigation ---

document.querySelectorAll('#sidebar a[data-view]').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('#sidebar a.active').classList.remove('active');
    link.classList.add('active');
    loadView(link.dataset.view);
  });
});

async function loadView(view) {
  const content = document.getElementById('content');
  switch (view) {
    case 'dashboard':
      await loadDashboard(content);
      break;
    case 'pos':
      await loadPOS(content);
      break;
    case 'products':
      await loadInventory(content);
      break;
    case 'sales':
      await loadSalesHistory(content);
      break;
    case 'reports':
      await loadReports(content);
      break;
  }
}

// =====================================================
// DASHBOARD
// =====================================================

async function loadDashboard(container) {
  const products = await window.api.getProducts();
  const lowStock = products.filter((p) => p.current_stock <= p.min_stock_alert);
  const totalValue = products.reduce((sum, p) => sum + p.selling_price * p.current_stock, 0);
  const categories = [...new Set(products.map((p) => p.category))];

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
        <div class="stat-value">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div class="stat-label">Stock Value (Selling)</div>
      </div>
      <div class="stat-card ${lowStock.length > 0 ? 'stat-warning' : ''}">
        <div class="stat-value">${lowStock.length}</div>
        <div class="stat-label">Low Stock Alerts</div>
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

async function loadPOS(container) {
  allProductsCache = await window.api.getProducts();

  container.innerHTML = `
    <div class="view-header">
      <h1>Point of Sale</h1>
    </div>
    <div class="pos-layout">
      <!-- Left: Product Search & Results -->
      <div class="pos-products">
        <input type="text" id="pos-search" class="search-input pos-search-input" placeholder="Search products by name, category, or size..." autofocus>
        <div id="pos-product-list" class="pos-product-list">
          ${renderPOSProductGrid(allProductsCache)}
        </div>
      </div>

      <!-- Right: Cart & Checkout -->
      <div class="pos-cart-panel">
        <h2 class="pos-cart-title">Cart</h2>
        <div id="pos-cart-items" class="pos-cart-items">
          <div class="empty-state">Cart is empty</div>
        </div>
        <div class="pos-cart-total" id="pos-cart-total">
          <span>Total:</span>
          <strong>0.00</strong>
        </div>
        <div class="pos-checkout-form">
          <div class="form-group">
            <label for="pos-waiter">Waiter</label>
            <input type="text" id="pos-waiter" value="${escapeHtml(currentUser.username)}" placeholder="Waiter name">
          </div>
          <div class="form-group">
            <label for="pos-customer">Customer (optional)</label>
            <input type="text" id="pos-customer" placeholder="Customer name">
          </div>
          <div class="form-group">
            <label for="pos-payment">Payment Method</label>
            <select id="pos-payment" class="select-input">
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Mobile Money">Mobile Money</option>
            </select>
          </div>
          <div id="pos-error" class="error-message" hidden></div>
          <button class="btn-primary pos-complete-btn" id="pos-complete-btn">Complete Sale</button>
        </div>
      </div>
    </div>`;

  // Bind events
  document.getElementById('pos-search').addEventListener('input', debounce(posSearchProducts, 200));
  document.getElementById('pos-complete-btn').addEventListener('click', completeSale);
  bindPOSProductEvents();
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
        <div class="pos-card-price">${p.selling_price.toFixed(2)}</div>
        <div class="pos-card-stock ${p.current_stock <= p.min_stock_alert ? 'stock-low' : ''}">
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
  bindPOSProductEvents();
}

// --- Cart Management ---

function addToCart(productId) {
  const product = allProductsCache.find((p) => p.id === productId);
  if (!product) return;

  const existing = cart.find((item) => item.product_id === productId);
  if (existing) {
    if (existing.quantity >= product.current_stock) return; // can't exceed stock
    existing.quantity += 1;
    existing.subtotal = existing.quantity * existing.unit_price;
  } else {
    cart.push({
      product_id: product.id,
      product_name: product.name,
      size_unit: product.size_unit,
      unit_price: product.selling_price,
      quantity: 1,
      subtotal: product.selling_price,
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
  return cart.reduce((sum, item) => sum + item.subtotal, 0);
}

function renderCart() {
  const container = document.getElementById('pos-cart-items');
  const totalEl = document.getElementById('pos-cart-total');

  if (cart.length === 0) {
    container.innerHTML = '<div class="empty-state">Cart is empty</div>';
    totalEl.innerHTML = '<span>Total:</span><strong>0.00</strong>';
    return;
  }

  container.innerHTML = cart.map((item) => `
    <div class="cart-item" data-id="${item.product_id}">
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(item.product_name)}</div>
        <div class="cart-item-detail">${escapeHtml(item.size_unit)} &middot; ${item.unit_price.toFixed(2)} each</div>
      </div>
      <div class="cart-item-controls">
        <button class="btn-cart-qty" data-action="minus" data-id="${item.product_id}">-</button>
        <span class="cart-item-qty">${item.quantity}</span>
        <button class="btn-cart-qty" data-action="plus" data-id="${item.product_id}">+</button>
        <button class="btn-cart-remove" data-id="${item.product_id}" title="Remove">&times;</button>
      </div>
      <div class="cart-item-subtotal">${item.subtotal.toFixed(2)}</div>
    </div>`).join('');

  const total = getCartTotal();
  totalEl.innerHTML = `<span>Total:</span><strong>${total.toFixed(2)}</strong>`;

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

// --- Complete Sale ---

async function completeSale() {
  const posError = document.getElementById('pos-error');
  posError.hidden = true;

  if (cart.length === 0) {
    posError.textContent = 'Add items to the cart before completing a sale.';
    posError.hidden = false;
    return;
  }

  const waiter = document.getElementById('pos-waiter').value.trim();
  if (!waiter) {
    posError.textContent = 'Please enter the waiter name.';
    posError.hidden = false;
    return;
  }

  const customer = document.getElementById('pos-customer').value.trim();
  const payment = document.getElementById('pos-payment').value;

  const saleData = {
    products: cart.map((item) => ({
      product_id: item.product_id,
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
    allProductsCache = await window.api.getProducts(); // refresh stock
    showReceipt(sale);
    await loadPOS(document.getElementById('content')); // re-render POS with updated stock
  } catch (err) {
    posError.textContent = err.message || 'Failed to complete sale.';
    posError.hidden = false;
  }
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
  const d = new Date(dateStr);
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
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

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
              <td>${item.unit_price.toFixed(2)}</td>
              <td>${item.subtotal.toFixed(2)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="receipt-divider"></div>
      <div class="receipt-summary">
        <div class="receipt-summary-row"><span>Items:</span><span>${itemCount}</span></div>
        <div class="receipt-summary-row receipt-grand-total"><span>TOTAL:</span><span>${sale.total_amount.toFixed(2)}</span></div>
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
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; width: 302px; margin: 0 auto; padding: 12px; font-size: 12px; color: #000; }
  .logo { text-align: center; margin-bottom: 2px; font-size: 28px; font-weight: bold; letter-spacing: 2px; }
  .hotel-name { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 1px; }
  .tagline { text-align: center; font-size: 11px; margin-bottom: 1px; }
  .contact { text-align: center; font-size: 10px; color: #444; margin-bottom: 2px; }
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
  <div class="hotel-name">${HOTEL_NAME}</div>
  <div class="tagline">${HOTEL_TAGLINE}</div>
  <div class="contact">${HOTEL_ADDRESS} | ${HOTEL_PHONE}</div>
  <div class="divider"></div>
  <div class="receipt-no">Receipt #${padReceiptNo(sale.id)}</div>
  <div class="meta-row"><span>Date:</span><span>${date}</span></div>
  <div class="meta-row"><span>Time:</span><span>${time}</span></div>
  <div class="meta-row"><span>Waiter:</span><span>${sale.waiter_name}</span></div>
  ${sale.customer_name ? `<div class="meta-row"><span>Customer:</span><span>${sale.customer_name}</span></div>` : ''}
  <div class="meta-row"><span>Payment:</span><span>${sale.payment_method}</span></div>
  <div class="divider"></div>
  <table>
    <thead><tr><th>Item</th><th>Size</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
    <tbody>
      ${items.map((i) => `<tr>
        <td>${i.product_name}</td>
        <td>${i.size_unit || ''}</td>
        <td>${i.quantity}</td>
        <td>${i.unit_price.toFixed(2)}</td>
        <td>${i.subtotal.toFixed(2)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div class="divider"></div>
  <div class="summary-row"><span>Items:</span><span>${itemCount}</span></div>
  <div class="summary-row grand-total"><span>TOTAL:</span><span>${sale.total_amount.toFixed(2)}</span></div>
  <div class="divider"></div>
  <div class="footer">
    <div class="footer-thanks">Thank you for visiting ${HOTEL_NAME}!</div>
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
    <h1>Sales History</h1>
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
          </tr>
        </thead>
        <tbody>
          ${sales.map((s) => `
            <tr>
              <td>${s.id}</td>
              <td>${new Date(s.sale_date).toLocaleString()}</td>
              <td>${escapeHtml(s.waiter_name)}</td>
              <td>${escapeHtml(s.customer_name || '-')}</td>
              <td>${s.products.length} item${s.products.length !== 1 ? 's' : ''}</td>
              <td>${escapeHtml(s.payment_method)}</td>
              <td><strong>${s.total_amount.toFixed(2)}</strong></td>
            </tr>`).join('')}
        </tbody>
      </table>`}`;
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
    case 'bestsellers': await loadBestSellersReport(rc); break;
    case 'inventory': await loadInventoryValueReport(rc); break;
  }
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
  const totalRev = months.reduce((s, m) => s + m.totalRevenue, 0);
  const totalProf = months.reduce((s, m) => s + m.totalProfit, 0);

  container.innerHTML = `
    <div class="report-section">
      <h2>Monthly Summary</h2>
      <div class="stats-grid" style="margin-bottom:20px;">
        <div class="stat-card"><div class="stat-value">${months.length}</div><div class="stat-label">Months with Sales</div></div>
        <div class="stat-card"><div class="stat-value">${fmtNum(totalRev)}</div><div class="stat-label">All-Time Revenue</div></div>
        <div class="stat-card"><div class="stat-value profit-positive">${fmtNum(totalProf)}</div><div class="stat-label">All-Time Profit</div></div>
      </div>
      ${months.length === 0 ? '<div class="empty-state">No sales data yet.</div>' : `
      <!-- Bar chart -->
      <div class="report-chart">
        ${renderMonthlyChart(months)}
      </div>
      <table>
        <thead><tr><th>Month</th><th>Sales</th><th>Items</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Margin</th></tr></thead>
        <tbody>
          ${months.map((m) => {
            const margin = m.totalRevenue > 0 ? ((m.totalProfit / m.totalRevenue) * 100).toFixed(1) : '0.0';
            return `<tr>
              <td>${formatMonthLabel(m.month)}</td>
              <td>${m.totalSales}</td>
              <td>${m.totalItems}</td>
              <td>${fmtNum(m.totalRevenue)}</td>
              <td>${fmtNum(m.totalCost)}</td>
              <td class="${m.totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}">${fmtNum(m.totalProfit)}</td>
              <td>${margin}%</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`}
    </div>`;
}

function renderMonthlyChart(months) {
  const display = months.slice().reverse().slice(-12);
  const maxRev = Math.max(...display.map((m) => m.totalRevenue), 1);

  return `<div class="chart-bars">
    ${display.map((m) => {
      const revH = Math.round((m.totalRevenue / maxRev) * 140);
      const profH = Math.round((Math.max(m.totalProfit, 0) / maxRev) * 140);
      return `<div class="chart-bar-group">
        <div class="chart-bar-stack">
          <div class="chart-bar bar-revenue" style="height:${revH}px" title="Revenue: ${fmtNum(m.totalRevenue)}"></div>
          <div class="chart-bar bar-profit" style="height:${profH}px" title="Profit: ${fmtNum(m.totalProfit)}"></div>
        </div>
        <div class="chart-label">${m.month.slice(5)}</div>
      </div>`;
    }).join('')}
  </div>
  <div class="chart-legend">
    <span class="legend-item"><span class="legend-color bar-revenue"></span> Revenue</span>
    <span class="legend-item"><span class="legend-color bar-profit"></span> Profit</span>
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
      <thead><tr><th>#</th><th>Product</th><th>Size</th><th>Qty Sold</th><th>Revenue</th><th>Cost</th><th>Profit</th></tr></thead>
      <tbody>
        ${report.bestSellers.map((p, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(p.product_name)}</td>
            <td>${escapeHtml(p.size_unit)}</td>
            <td><strong>${p.total_qty}</strong></td>
            <td>${fmtNum(p.total_revenue)}</td>
            <td>${fmtNum(p.total_cost)}</td>
            <td class="${(p.total_revenue - p.total_cost) >= 0 ? 'profit-positive' : 'profit-negative'}">${fmtNum(p.total_revenue - p.total_cost)}</td>
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
        <div class="stat-card"><div class="stat-value">${fmtNum(report.totalBuyingValue)}</div><div class="stat-label">Total Cost Value</div></div>
        <div class="stat-card"><div class="stat-value">${fmtNum(report.totalSellingValue)}</div><div class="stat-label">Total Selling Value</div></div>
        <div class="stat-card"><div class="stat-value profit-positive">${fmtNum(report.potentialProfit)}</div><div class="stat-label">Potential Profit</div></div>
      </div>

      <h3 style="margin-bottom:10px;">By Category</h3>
      <table style="margin-bottom:24px;">
        <thead><tr><th>Category</th><th>Products</th><th>Stock Units</th><th>Cost Value</th><th>Selling Value</th><th>Potential Profit</th></tr></thead>
        <tbody>
          ${report.categories.map((c) => `
            <tr>
              <td>${escapeHtml(c.category)}</td>
              <td>${c.itemCount}</td>
              <td>${c.stockCount}</td>
              <td>${fmtNum(c.buyingValue)}</td>
              <td>${fmtNum(c.sellingValue)}</td>
              <td class="profit-positive">${fmtNum(c.sellingValue - c.buyingValue)}</td>
            </tr>`).join('')}
        </tbody>
      </table>

      <h3 style="margin-bottom:10px;">All Products</h3>
      <table>
        <thead><tr><th>Product</th><th>Category</th><th>Size</th><th>Stock</th><th>Buy Price</th><th>Sell Price</th><th>Stock Value</th><th>Potential Profit</th></tr></thead>
        <tbody>
          ${report.items.map((p) => `
            <tr class="${p.current_stock <= p.min_stock_alert ? 'row-low-stock' : ''}">
              <td>${escapeHtml(p.name)}</td>
              <td>${escapeHtml(p.category)}</td>
              <td>${escapeHtml(p.size_unit)}</td>
              <td>${p.current_stock}</td>
              <td>${p.buying_price.toFixed(2)}</td>
              <td>${p.selling_price.toFixed(2)}</td>
              <td>${fmtNum(p.stock_selling_value)}</td>
              <td class="profit-positive">${fmtNum(p.potential_profit)}</td>
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
      <div class="stat-card"><div class="stat-value">${fmtNum(report.totalRevenue)}</div><div class="stat-label">Revenue</div></div>
      <div class="stat-card"><div class="stat-value">${fmtNum(report.totalCost)}</div><div class="stat-label">Cost</div></div>
      <div class="stat-card"><div class="stat-value profit-positive">${fmtNum(report.totalProfit)}</div><div class="stat-label">Profit</div></div>
      <div class="stat-card"><div class="stat-value">${report.profitMargin.toFixed(1)}%</div><div class="stat-label">Profit Margin</div></div>
    </div>`;
}

function renderPaymentBreakdown(breakdown) {
  const entries = Object.entries(breakdown);
  if (entries.length === 0) return '';
  return `
    <h3 style="margin-bottom:10px;">Payment Methods</h3>
    <div class="payment-breakdown">
      ${entries.map(([method, amount]) =>
        `<div class="payment-card"><div class="payment-method">${escapeHtml(method)}</div><div class="payment-amount">${fmtNum(amount)}</div></div>`
      ).join('')}
    </div>`;
}

function renderBestSellersTable(bestSellers, title) {
  if (bestSellers.length === 0) return '';
  return `
    <h3 style="margin:20px 0 10px;">${escapeHtml(title)}</h3>
    <table>
      <thead><tr><th>#</th><th>Product</th><th>Size</th><th>Qty Sold</th><th>Revenue</th><th>Profit</th></tr></thead>
      <tbody>
        ${bestSellers.slice(0, 10).map((p, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(p.product_name)}</td>
            <td>${escapeHtml(p.size_unit)}</td>
            <td><strong>${p.total_qty}</strong></td>
            <td>${fmtNum(p.total_revenue)}</td>
            <td class="profit-positive">${fmtNum(p.total_revenue - p.total_cost)}</td>
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
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- Report Print / PDF ---

function buildReportPrintHtml() {
  const reportContent = document.getElementById('report-content');
  if (!reportContent) return '';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; padding: 30px; font-size: 13px; color: #333; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin-bottom: 10px; }
  h3 { font-size: 14px; margin-bottom: 8px; }
  .print-header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 12px; }
  .print-header .hotel { font-size: 18px; font-weight: bold; }
  .print-header .date { font-size: 12px; color: #666; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #ddd; font-size: 12px; }
  th { background: #f5f5f5; font-weight: 600; }
  .stats-grid { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .stat-card { border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; text-align: center; flex: 1; min-width: 100px; }
  .stat-value { font-size: 18px; font-weight: 700; }
  .stat-label { font-size: 11px; color: #666; margin-top: 2px; }
  .profit-positive { color: #16a34a; }
  .profit-negative { color: #dc2626; }
  .row-low-stock { background: #fff5f5; }
  .payment-breakdown { display: flex; gap: 10px; margin-bottom: 16px; }
  .payment-card { border: 1px solid #ddd; border-radius: 6px; padding: 10px 16px; text-align: center; }
  .payment-method { font-size: 11px; color: #666; }
  .payment-amount { font-size: 16px; font-weight: 600; }
  .chart-bars, .chart-legend, .report-tabs, .report-date-picker button, #report-print-btn, #report-pdf-btn { display: none; }
  @media print { body { padding: 10px; } }
</style></head><body>
  <div class="print-header">
    <div class="hotel">${HOTEL_NAME} - ${HOTEL_TAGLINE}</div>
    <h1>Report</h1>
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
  if (html) await window.api.saveReceiptPdf(html, `Report-${todayStr()}`);
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
      ${isManager() ? '<button class="btn-primary btn-sm" id="add-product-btn">+ Add Product</button>' : ''}
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
          <th>Buy Price</th>
          <th>Sell Price</th>
          <th>Stock</th>
          <th>Min Alert</th>
          ${isManager() ? '<th>Actions</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${products.map((p) => {
          const isLow = p.current_stock <= p.min_stock_alert;
          return `
          <tr class="${isLow ? 'row-low-stock' : ''}" data-id="${p.id}">
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.category)}</td>
            <td>${escapeHtml(p.size_unit)}</td>
            <td>${p.buying_price.toFixed(2)}</td>
            <td>${p.selling_price.toFixed(2)}</td>
            <td class="${isLow ? 'stock-low' : ''}">${p.current_stock}</td>
            <td>${p.min_stock_alert}</td>
            ${isManager() ? `
              <td class="actions-cell">
                <button class="btn-icon btn-edit" data-id="${p.id}" title="Edit">&#9998;</button>
                <button class="btn-icon btn-delete" data-id="${p.id}" title="Delete">&#128465;</button>
              </td>` : ''}
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
    products = products.filter((p) => p.current_stock <= p.min_stock_alert);
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
    document.getElementById('pf-buying').value = p.buying_price;
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
    buying_price: parseFloat(document.getElementById('pf-buying').value),
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
