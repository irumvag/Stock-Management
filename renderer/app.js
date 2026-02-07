// --- Session State ---
let currentUser = null;
let deleteTargetId = null;

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
    case 'products':
      await loadInventory(content);
      break;
    case 'sales':
      content.innerHTML = '<h1>Sales</h1><p>Sales module coming soon.</p>';
      break;
  }
}

// --- Dashboard ---

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

// --- Inventory View ---

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

  // Bind events
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

  // Populate category datalist
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

// --- Utilities ---

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
