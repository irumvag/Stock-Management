const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const { app } = require('electron');

const SALT_ROUNDS = 10;

let db;

function getDbPath() {
  return path.join(app.getPath('userData'), 'stock-management.db');
}

function initialize() {
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createTables();
  seedDefaultAdmin();
  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'Waiter' CHECK (role IN ('Manager', 'Waiter')),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      category        TEXT    NOT NULL,
      size_unit       TEXT    NOT NULL,
      buying_price    REAL    NOT NULL DEFAULT 0,
      selling_price   REAL    NOT NULL DEFAULT 0,
      current_stock   INTEGER NOT NULL DEFAULT 0,
      min_stock_alert INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_date       TEXT    NOT NULL DEFAULT (datetime('now')),
      products        TEXT    NOT NULL,
      total_amount    REAL    NOT NULL DEFAULT 0,
      waiter_name     TEXT    NOT NULL,
      customer_name   TEXT,
      payment_method  TEXT    NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'Card', 'Mobile Money')),
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_name     ON products(name);
    CREATE INDEX IF NOT EXISTS idx_sales_date        ON sales(sale_date);
  `);
}

// --- Auth / Users ---

function seedDefaultAdmin() {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!existing) {
    const hash = bcrypt.hashSync('admin123', SALT_ROUNDS);
    db.prepare(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
    ).run('admin', hash, 'Manager');
  }
}

function authenticate(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return { success: false, error: 'Invalid username or password' };

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) return { success: false, error: 'Invalid username or password' };

  const { password_hash, ...safeUser } = user;
  return { success: true, user: safeUser };
}

function createUser({ username, password, role }) {
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const stmt = db.prepare(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
  );
  const result = stmt.run(username, hash, role || 'Waiter');
  return { id: result.lastInsertRowid, username, role: role || 'Waiter' };
}

function getAllUsers() {
  return db.prepare(
    'SELECT id, username, role, created_at FROM users ORDER BY username'
  ).all();
}

function changePassword(userId, currentPassword, newPassword) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { success: false, error: 'User not found' };

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return { success: false, error: 'Current password is incorrect' };
  }

  const hash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  return { success: true };
}

// --- Products ---

function getAllProducts() {
  return db.prepare('SELECT * FROM products ORDER BY name').all();
}

function getProductById(id) {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
}

function getProductsByCategory(category) {
  return db.prepare('SELECT * FROM products WHERE category = ? ORDER BY name').all(category);
}

function searchProducts(query) {
  const pattern = `%${query}%`;
  return db.prepare(
    'SELECT * FROM products WHERE name LIKE ? OR category LIKE ? OR size_unit LIKE ? ORDER BY name'
  ).all(pattern, pattern, pattern);
}

function getCategories() {
  return db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all()
    .map((r) => r.category);
}

function getLowStockProducts() {
  return db.prepare(
    'SELECT * FROM products WHERE current_stock <= min_stock_alert ORDER BY current_stock ASC'
  ).all();
}

function createProduct({ name, category, size_unit, buying_price, selling_price, current_stock, min_stock_alert }) {
  const stmt = db.prepare(`
    INSERT INTO products (name, category, size_unit, buying_price, selling_price, current_stock, min_stock_alert)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    name, category, size_unit,
    buying_price || 0, selling_price || 0,
    current_stock || 0, min_stock_alert || 0
  );
  return getProductById(result.lastInsertRowid);
}

function updateProduct({ id, name, category, size_unit, buying_price, selling_price, current_stock, min_stock_alert }) {
  const stmt = db.prepare(`
    UPDATE products
    SET name = ?, category = ?, size_unit = ?, buying_price = ?, selling_price = ?,
        current_stock = ?, min_stock_alert = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(name, category, size_unit, buying_price, selling_price,
    current_stock, min_stock_alert, id);
  return getProductById(id);
}

function deleteProduct(id) {
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return { success: true };
}

// --- Sales ---

function createSale({ products: saleProducts, total_amount, waiter_name, customer_name, payment_method }) {
  const insertSale = db.prepare(`
    INSERT INTO sales (products, total_amount, waiter_name, customer_name, payment_method)
    VALUES (?, ?, ?, ?, ?)
  `);
  const updateStock = db.prepare(
    'UPDATE products SET current_stock = current_stock - ?, updated_at = datetime(\'now\') WHERE id = ?'
  );
  const getProduct = db.prepare('SELECT buying_price FROM products WHERE id = ?');

  const transaction = db.transaction(() => {
    // Enrich each item with buying_price for profit tracking
    const enriched = saleProducts.map((item) => {
      const prod = getProduct.get(item.product_id);
      return { ...item, buying_price: prod ? prod.buying_price : 0 };
    });
    const result = insertSale.run(
      JSON.stringify(enriched), total_amount,
      waiter_name, customer_name || null, payment_method || 'Cash'
    );
    for (const item of saleProducts) {
      updateStock.run(item.quantity, item.product_id);
    }
    return result.lastInsertRowid;
  });

  const saleId = transaction();
  return getSaleById(saleId);
}

function getSaleById(id) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (sale) sale.products = JSON.parse(sale.products);
  return sale;
}

function getAllSales() {
  const sales = db.prepare('SELECT * FROM sales ORDER BY sale_date DESC').all();
  return sales.map((s) => ({ ...s, products: JSON.parse(s.products) }));
}

// --- Reports ---

function getSalesByDateRange(startDate, endDate) {
  const sales = db.prepare(
    'SELECT * FROM sales WHERE date(sale_date) >= date(?) AND date(sale_date) <= date(?) ORDER BY sale_date DESC'
  ).all(startDate, endDate);
  return sales.map((s) => ({ ...s, products: JSON.parse(s.products) }));
}

function getSalesReport(startDate, endDate) {
  const sales = getSalesByDateRange(startDate, endDate);
  const productMap = {};

  let totalRevenue = 0;
  let totalCost = 0;
  let totalItems = 0;

  for (const sale of sales) {
    totalRevenue += sale.total_amount;
    for (const item of sale.products) {
      totalItems += item.quantity;
      const buyPrice = item.buying_price || 0;
      totalCost += buyPrice * item.quantity;

      const key = item.product_id;
      if (!productMap[key]) {
        productMap[key] = {
          product_id: item.product_id,
          product_name: item.product_name,
          size_unit: item.size_unit || '',
          total_qty: 0,
          total_revenue: 0,
          total_cost: 0,
        };
      }
      productMap[key].total_qty += item.quantity;
      productMap[key].total_revenue += item.subtotal;
      productMap[key].total_cost += buyPrice * item.quantity;
    }
  }

  const totalProfit = totalRevenue - totalCost;
  const bestSellers = Object.values(productMap)
    .sort((a, b) => b.total_qty - a.total_qty);

  // Payment method breakdown
  const paymentBreakdown = {};
  for (const sale of sales) {
    paymentBreakdown[sale.payment_method] = (paymentBreakdown[sale.payment_method] || 0) + sale.total_amount;
  }

  return {
    startDate,
    endDate,
    totalSales: sales.length,
    totalItems,
    totalRevenue,
    totalCost,
    totalProfit,
    profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    bestSellers,
    paymentBreakdown,
    sales,
  };
}

function getMonthlySummary() {
  const rows = db.prepare(
    "SELECT strftime('%Y-%m', sale_date) AS month, products, total_amount FROM sales ORDER BY sale_date"
  ).all();

  const months = {};
  for (const row of rows) {
    const m = row.month;
    if (!months[m]) {
      months[m] = { month: m, totalSales: 0, totalRevenue: 0, totalCost: 0, totalItems: 0 };
    }
    months[m].totalSales += 1;
    months[m].totalRevenue += row.total_amount;
    const items = JSON.parse(row.products);
    for (const item of items) {
      months[m].totalItems += item.quantity;
      months[m].totalCost += (item.buying_price || 0) * item.quantity;
    }
  }

  return Object.values(months).map((m) => ({
    ...m,
    totalProfit: m.totalRevenue - m.totalCost,
  })).sort((a, b) => b.month.localeCompare(a.month));
}

function getInventoryValueReport() {
  const products = db.prepare('SELECT * FROM products ORDER BY category, name').all();

  let totalBuyingValue = 0;
  let totalSellingValue = 0;

  const items = products.map((p) => {
    const buyVal = p.buying_price * p.current_stock;
    const sellVal = p.selling_price * p.current_stock;
    totalBuyingValue += buyVal;
    totalSellingValue += sellVal;
    return {
      ...p,
      stock_buying_value: buyVal,
      stock_selling_value: sellVal,
      potential_profit: sellVal - buyVal,
    };
  });

  // Category breakdown
  const categories = {};
  for (const p of items) {
    if (!categories[p.category]) {
      categories[p.category] = { category: p.category, buyingValue: 0, sellingValue: 0, itemCount: 0, stockCount: 0 };
    }
    categories[p.category].buyingValue += p.stock_buying_value;
    categories[p.category].sellingValue += p.stock_selling_value;
    categories[p.category].itemCount += 1;
    categories[p.category].stockCount += p.current_stock;
  }

  return {
    totalBuyingValue,
    totalSellingValue,
    potentialProfit: totalSellingValue - totalBuyingValue,
    totalProducts: products.length,
    totalStock: products.reduce((s, p) => s + p.current_stock, 0),
    items,
    categories: Object.values(categories).sort((a, b) => b.sellingValue - a.sellingValue),
  };
}

// --- Lifecycle ---

function close() {
  if (db) db.close();
}

module.exports = {
  initialize,
  close,
  authenticate,
  createUser,
  getAllUsers,
  changePassword,
  getAllProducts,
  getProductById,
  getProductsByCategory,
  searchProducts,
  getCategories,
  getLowStockProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  createSale,
  getSaleById,
  getAllSales,
  getSalesByDateRange,
  getSalesReport,
  getMonthlySummary,
  getInventoryValueReport,
};
