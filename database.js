const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db;

function getDbPath() {
  return path.join(app.getPath('userData'), 'stock-management.db');
}

function initialize() {
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createTables();
  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      contact_person  TEXT,
      email           TEXT,
      phone           TEXT,
      address         TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      sku           TEXT    NOT NULL UNIQUE,
      description   TEXT,
      category_id   INTEGER,
      supplier_id   INTEGER,
      quantity       INTEGER NOT NULL DEFAULT 0,
      price         REAL    NOT NULL DEFAULT 0,
      reorder_level INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)  ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id  INTEGER NOT NULL,
      type        TEXT    NOT NULL CHECK (type IN ('in', 'out', 'adjustment')),
      quantity    INTEGER NOT NULL,
      reason      TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_products_sku         ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_category    ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
  `);
}

// --- Categories ---

function getAllCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY name').all();
}

function createCategory({ name, description }) {
  const stmt = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)');
  const result = stmt.run(name, description || null);
  return { id: result.lastInsertRowid, name, description };
}

// --- Suppliers ---

function getAllSuppliers() {
  return db.prepare('SELECT * FROM suppliers ORDER BY name').all();
}

function createSupplier({ name, contact_person, email, phone, address }) {
  const stmt = db.prepare(
    'INSERT INTO suppliers (name, contact_person, email, phone, address) VALUES (?, ?, ?, ?, ?)'
  );
  const result = stmt.run(name, contact_person || null, email || null, phone || null, address || null);
  return { id: result.lastInsertRowid, name };
}

// --- Products ---

function getAllProducts() {
  return db.prepare(`
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.name
  `).all();
}

function getProductById(id) {
  return db.prepare(`
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).get(id);
}

function createProduct({ name, sku, description, category_id, supplier_id, quantity, price, reorder_level }) {
  const stmt = db.prepare(`
    INSERT INTO products (name, sku, description, category_id, supplier_id, quantity, price, reorder_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    name, sku, description || null,
    category_id || null, supplier_id || null,
    quantity || 0, price || 0, reorder_level || 0
  );
  return getProductById(result.lastInsertRowid);
}

function updateProduct({ id, name, sku, description, category_id, supplier_id, quantity, price, reorder_level }) {
  const stmt = db.prepare(`
    UPDATE products
    SET name = ?, sku = ?, description = ?, category_id = ?, supplier_id = ?,
        quantity = ?, price = ?, reorder_level = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(name, sku, description || null, category_id || null, supplier_id || null,
    quantity, price, reorder_level, id);
  return getProductById(id);
}

function deleteProduct(id) {
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return { success: true };
}

// --- Stock Movements ---

function recordStockMovement({ product_id, type, quantity, reason }) {
  const insert = db.prepare(
    'INSERT INTO stock_movements (product_id, type, quantity, reason) VALUES (?, ?, ?, ?)'
  );

  const updateQty = db.prepare('UPDATE products SET quantity = quantity + ?, updated_at = datetime(\'now\') WHERE id = ?');

  const transaction = db.transaction(() => {
    insert.run(product_id, type, quantity, reason || null);
    const delta = type === 'out' ? -quantity : quantity;
    updateQty.run(delta, product_id);
  });

  transaction();
  return getProductById(product_id);
}

function getStockMovements(productId) {
  return db.prepare(
    'SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC'
  ).all(productId);
}

// --- Lifecycle ---

function close() {
  if (db) db.close();
}

module.exports = {
  initialize,
  close,
  getAllCategories,
  createCategory,
  getAllSuppliers,
  createSupplier,
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  recordStockMovement,
  getStockMovements,
};
