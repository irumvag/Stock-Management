// Navigation
document.querySelectorAll('#sidebar a').forEach((link) => {
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
      content.innerHTML = '<h1>Dashboard</h1><p>Welcome to the Stock Management System.</p>';
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
