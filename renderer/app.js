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

let lastSaleReceipt = null;

function showReceipt(sale) {
  lastSaleReceipt = sale;
  const receiptContent = document.getElementById('receipt-content');

  const date = new Date(sale.sale_date).toLocaleString();
  const items = sale.products;

  receiptContent.innerHTML = `
    <div class="receipt">
      <div class="receipt-header">
        <strong>Stock Manager</strong><br>
        Receipt #${sale.id}
      </div>
      <div class="receipt-meta">
        <div>Date: ${escapeHtml(date)}</div>
        <div>Waiter: ${escapeHtml(sale.waiter_name)}</div>
        ${sale.customer_name ? `<div>Customer: ${escapeHtml(sale.customer_name)}</div>` : ''}
        <div>Payment: ${escapeHtml(sale.payment_method)}</div>
      </div>
      <table class="receipt-table">
        <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${escapeHtml(item.product_name)}</td>
              <td>${item.quantity}</td>
              <td>${item.unit_price.toFixed(2)}</td>
              <td>${item.subtotal.toFixed(2)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="receipt-total">
        <strong>Total: ${sale.total_amount.toFixed(2)}</strong>
      </div>
    </div>`;

  receiptModal.hidden = false;
}

function buildReceiptPrintHtml(sale) {
  const date = new Date(sale.sale_date).toLocaleString();
  const items = sale.products;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { font-family: 'Courier New', monospace; width: 280px; margin: 0 auto; padding: 10px; font-size: 12px; }
  h2 { text-align: center; margin: 0 0 4px; font-size: 16px; }
  .center { text-align: center; }
  .meta { margin: 8px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { text-align: left; padding: 2px 0; }
  th:last-child, td:last-child { text-align: right; }
  th:nth-child(2), td:nth-child(2) { text-align: center; }
  th:nth-child(3), td:nth-child(3) { text-align: right; }
  .total { border-top: 1px dashed #000; padding-top: 6px; font-size: 14px; font-weight: bold; text-align: right; }
  .footer { text-align: center; margin-top: 12px; font-size: 11px; }
</style></head><body>
  <h2>Stock Manager</h2>
  <p class="center">Receipt #${sale.id}</p>
  <div class="meta">
    <div>Date: ${date}</div>
    <div>Waiter: ${sale.waiter_name}</div>
    ${sale.customer_name ? `<div>Customer: ${sale.customer_name}</div>` : ''}
    <div>Payment: ${sale.payment_method}</div>
  </div>
  <table>
    <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
    <tbody>
      ${items.map((i) => `<tr><td>${i.product_name}</td><td>${i.quantity}</td><td>${i.unit_price.toFixed(2)}</td><td>${i.subtotal.toFixed(2)}</td></tr>`).join('')}
    </tbody>
  </table>
  <div class="total">TOTAL: ${sale.total_amount.toFixed(2)}</div>
  <p class="footer">Thank you for your purchase!</p>
</body></html>`;
}

document.getElementById('receipt-close-btn').addEventListener('click', () => { receiptModal.hidden = true; });
document.getElementById('receipt-done-btn').addEventListener('click', () => { receiptModal.hidden = true; });
document.getElementById('receipt-print-btn').addEventListener('click', async () => {
  if (!lastSaleReceipt) return;
  await window.api.printReceipt(buildReceiptPrintHtml(lastSaleReceipt));
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
