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

  const transaction = db.transaction(() => {
    const result = insertSale.run(
      JSON.stringify(saleProducts), total_amount,
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
};
