// --- Session State ---
let currentUser = null;

// --- DOM References ---
const loginScreen = document.getElementById('login-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const appContainer = document.getElementById('app');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');

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

function showApp() {
  loginScreen.hidden = true;
  appContainer.hidden = false;
  userInfo.innerHTML = `
    <div class="user-name">${currentUser.full_name}</div>
    <div class="user-role">${currentUser.role}</div>`;

  // Reset to dashboard
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
      content.innerHTML = `<h1>Dashboard</h1><p>Welcome, ${currentUser.full_name}.</p>`;
      break;
    case 'products':
      await loadProducts(content);
      break;
    case 'categories':
      await loadCategories(content);
      break;
    case 'suppliers':
      await loadSuppliers(content);
      break;
    case 'movements':
      await loadMovements(content);
      break;
  }
}

// --- Views ---

async function loadProducts(container) {
  const products = await window.api.getProducts();
  container.innerHTML = `
    <h1>Products</h1>
    <table>
      <thead>
        <tr><th>ID</th><th>Name</th><th>SKU</th><th>Category</th><th>Qty</th><th>Price</th></tr>
      </thead>
      <tbody>
        ${products.map((p) => `
          <tr>
            <td>${p.id}</td>
            <td>${p.name}</td>
            <td>${p.sku}</td>
            <td>${p.category_name || '-'}</td>
            <td>${p.quantity}</td>
            <td>${p.price.toFixed(2)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function loadCategories(container) {
  const categories = await window.api.getCategories();
  container.innerHTML = `
    <h1>Categories</h1>
    <table>
      <thead><tr><th>ID</th><th>Name</th><th>Description</th></tr></thead>
      <tbody>
        ${categories.map((c) => `
          <tr><td>${c.id}</td><td>${c.name}</td><td>${c.description || '-'}</td></tr>`).join('')}
      </tbody>
    </table>`;
}

async function loadSuppliers(container) {
  const suppliers = await window.api.getSuppliers();
  container.innerHTML = `
    <h1>Suppliers</h1>
    <table>
      <thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th></tr></thead>
      <tbody>
        ${suppliers.map((s) => `
          <tr>
            <td>${s.id}</td><td>${s.name}</td>
            <td>${s.contact_person || '-'}</td>
            <td>${s.email || '-'}</td>
            <td>${s.phone || '-'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function loadMovements(container) {
  container.innerHTML = `
    <h1>Stock Movements</h1>
    <p>Select a product to view its stock movements.</p>`;
}
