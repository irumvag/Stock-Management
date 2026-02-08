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
  seedSampleProducts();
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
      payment_method  TEXT    NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'Card', 'Mobile Money', 'REFUNDED')),
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS waiters (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      active      INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      waiter_name     TEXT    NOT NULL,
      table_number    TEXT    NOT NULL,
      customer_name   TEXT    DEFAULT '',
      status          TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      completed_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS draft_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      draft_id      INTEGER NOT NULL,
      product_id    INTEGER NOT NULL,
      product_name  TEXT    NOT NULL,
      size_unit     TEXT    DEFAULT '',
      unit_price    REAL    NOT NULL,
      buying_price  REAL    DEFAULT 0,
      quantity      INTEGER NOT NULL,
      subtotal      REAL    NOT NULL,
      added_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (draft_id) REFERENCES drafts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_name     ON products(name);
    CREATE INDEX IF NOT EXISTS idx_sales_date        ON sales(sale_date);
    CREATE INDEX IF NOT EXISTS idx_drafts_status     ON drafts(status);
    CREATE INDEX IF NOT EXISTS idx_draft_items_draft ON draft_items(draft_id);
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

function seedSampleProducts() {
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM products').get().cnt;
  if (count > 0) return; // Only seed if the table is empty

  const insert = db.prepare(
    'INSERT INTO products (name, category, size_unit, buying_price, selling_price, current_stock, min_stock_alert) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const products = [
    // ── Beers ──
    ['Nile Special',     'Beers', 'Bottle', 3600,  5000,  91, 10],
    ['Club',             'Beers', 'Bottle', 3200,  4000,  80, 10],
    ['Castle Lite',      'Beers', 'Bottle', 3375,  4000,  42, 10],
    ['Bell Lager',       'Beers', 'Bottle', 2800,  4000,  37, 10],
    ['Pilsner',          'Beers', 'Bottle', 2600,  4000,  32, 10],
    ['Tusker Lager',     'Beers', 'Bottle', 3750,  4000,  44, 10],
    ['Tusker Malt',      'Beers', 'Bottle', 3000,  4000,  48, 10],
    ['Tusker Lite',      'Beers', 'Bottle', 3000,  4000,  28, 10],
    ['Guinness',         'Beers', 'Bottle', 2900,  4000, 103, 10],
    ['Smooth',           'Beers', 'Bottle', 2900,  4000,  41, 10],
    ['Smirnoff Ice',     'Beers', 'Bottle', 3400,  5000,  60, 10],
    ['Tusker Cider',     'Beers', 'Bottle', 3800,  6000,  55, 10],
    ['Bell Citrus',      'Beers', 'Bottle', 2800,  4000,  15, 10],
    ['Heineken',         'Beers', 'Bottle', 7000, 10000,  21, 10],
    ['Hunters',          'Beers', 'Bottle', 5000, 10000,  13, 10],

    // ── Soft Drinks ──
    ['Soda Coca-Cola',   'Soft Drinks', 'Bottle',  813,  2000, 105, 20],
    ['Soda Pepsi',       'Soft Drinks', 'Bottle',  813,  2000,  72, 20],
    ['Minute Maid',      'Soft Drinks', 'Bottle', 2083,  3000,  19, 10],
    ['Oner',             'Soft Drinks', 'Bottle', 2000,  3000,  16, 10],
    ['Sting',            'Soft Drinks', 'Bottle', 2000,  3000,  17, 10],
    ['Predator',         'Soft Drinks', 'Bottle', 1500,  3000,  21, 10],
    ['H2O Big',          'Soft Drinks', 'Bottle', 1541,  3000,  17, 10],
    ['H2O Small',        'Soft Drinks', 'Bottle',  833,  2500,  42, 15],
    ['H2O Uzima',        'Soft Drinks', 'Bottle',  413,  1000,  73, 20],
    ['Rock Boom',        'Soft Drinks', 'Bottle', 1900,  3000,  17, 10],

    // ── Spirits (75cl Bottles) ──
    ['Uganda Waragi Premium',  'Spirits', '75cl',  50000, 100000, 2, 2],
    ['Uganda Waragi Coconut',  'Spirits', '75cl',  50000, 100000, 2, 2],
    ['Uganda Waragi Lemon',    'Spirits', '75cl',  50000, 100000, 2, 2],
    ['V&A',                    'Spirits', '75cl',  50000, 100000, 2, 2],
    ['Bond 7',                 'Spirits', '75cl',  50000, 100000, 2, 2],
    ['Vat 69',                 'Spirits', '75cl',  70000, 140000, 1, 2],
    ['Black & White',          'Spirits', '75cl', 120000, 240000, 2, 1],
    ['Smirnoff Vodka',         'Spirits', '75cl',  60000, 120000, 2, 2],
    ['Gilbeys',                'Spirits', '75cl',  60000, 120000, 1, 2],
    ['4 Cousins Wine',         'Spirits', '75cl',  55000, 110000, 3, 2],
    ['Captain Morgan',         'Spirits', '75cl',  50000, 100000, 3, 2],
    ['Richot Label',           'Spirits', '75cl', 130000, 250000, 1, 1],
    ['Amarula',                'Spirits', '75cl', 190000, 350000, 1, 1],

    // ── Spirits (Half 375ml) ──
    ['Uganda Waragi Premium',  'Spirits', '1/2 (375ml)', 25000, 50000, 7, 3],
    ['Uganda Waragi Coconut',  'Spirits', '1/2 (375ml)', 25000, 50000, 8, 3],

    // ── Spirits (Quarter 250ml) ──
    ['Uganda Waragi Premium',  'Spirits', '1/4 (250ml)', 18000, 35000, 2, 3],
    ['Bond 7',                 'Spirits', '1/4 (250ml)', 12500, 25000, 3, 3],
    ['Vat 69',                 'Spirits', '1/4 (250ml)', 19000, 38000, 4, 3],
    ['Black & White',          'Spirits', '1/4 (250ml)', 45000, 90000, 1, 2],
    ['Gilbeys',                'Spirits', '1/4 (250ml)', 25000, 50000, 2, 3],
    ['Captain Morgan',         'Spirits', '1/4 (250ml)', 19000, 38000, 4, 3],

    // ── Spirits (Other Sizes) ──
    ['Smirnoff Guarana',       'Spirits', '200ml',  10000,  20000, 21, 5],
    ['4 Cousins Rose',         'Wines',   '1.5lts', 100000, 200000, 2, 1],
    ['4 Cousins Radler',       'Wines',   '1.5lts', 100000, 200000, 1, 1],
    ['Toppo Red',              'Wines',   '75cl',   150000, 300000, 1, 1],
    ['Frosty',                 'Wines',   '5lts',   100000, 200000, 1, 1],
    ['4 Cousins',              'Wines',   '5lts',    10000,  20000, 1, 1],
  ];

  const insertMany = db.transaction(() => {
    for (const p of products) {
      insert.run(...p);
    }
  });
  insertMany();
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

function updateUser(id, { username, role }) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
  if (existing) return { success: false, error: 'Username already taken' };
  db.prepare('UPDATE users SET username = ?, role = ? WHERE id = ?').run(username, role, id);
  return { success: true };
}

function resetPassword(userId, newPassword) {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return { success: false, error: 'User not found' };
  const hash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  return { success: true };
}

function deleteUser(id) {
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
  if (!user) return { success: false, error: 'User not found' };
  if (user.username === 'admin') return { success: false, error: 'Cannot delete the default admin account' };
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
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

function refundSale(saleId) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
  if (!sale) return { success: false, error: 'Sale not found' };
  if (sale.payment_method === 'REFUNDED') return { success: false, error: 'Sale already refunded' };

  const items = JSON.parse(sale.products);

  const transaction = db.transaction(() => {
    // Restore stock for each item
    for (const item of items) {
      db.prepare(
        "UPDATE products SET current_stock = current_stock + ?, updated_at = datetime('now') WHERE id = ?"
      ).run(item.quantity, item.product_id);
    }
    // Mark sale as refunded
    db.prepare(
      "UPDATE sales SET payment_method = 'REFUNDED', total_amount = 0 WHERE id = ?"
    ).run(saleId);
  });

  transaction();
  return { success: true };
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

function getWaiterDailyReport(date) {
  const sales = db.prepare(
    'SELECT * FROM sales WHERE date(sale_date) = date(?) ORDER BY sale_date DESC'
  ).all(date);

  const waiterMap = {};
  for (const sale of sales) {
    const w = sale.waiter_name;
    if (!waiterMap[w]) {
      waiterMap[w] = { waiter_name: w, totalSales: 0, totalRevenue: 0, totalCost: 0, totalItems: 0, sales: [] };
    }
    waiterMap[w].totalSales += 1;
    waiterMap[w].totalRevenue += sale.total_amount;
    const items = JSON.parse(sale.products);
    for (const item of items) {
      waiterMap[w].totalItems += item.quantity;
      waiterMap[w].totalCost += (item.buying_price || 0) * item.quantity;
    }
    waiterMap[w].sales.push({ ...sale, products: items });
  }

  const waiters = Object.values(waiterMap).map((w) => ({
    ...w,
    totalProfit: w.totalRevenue - w.totalCost,
  })).sort((a, b) => b.totalRevenue - a.totalRevenue);

  const grandTotalRevenue = waiters.reduce((s, w) => s + w.totalRevenue, 0);
  const grandTotalCost = waiters.reduce((s, w) => s + w.totalCost, 0);
  const grandTotalItems = waiters.reduce((s, w) => s + w.totalItems, 0);
  const grandTotalSales = waiters.reduce((s, w) => s + w.totalSales, 0);

  return {
    date,
    waiters,
    grandTotalSales,
    grandTotalRevenue,
    grandTotalCost,
    grandTotalProfit: grandTotalRevenue - grandTotalCost,
    grandTotalItems,
  };
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

// --- Waiters (name-only, no password) ---

function getAllWaiters() {
  return db.prepare('SELECT * FROM waiters ORDER BY name').all();
}

function getActiveWaiters() {
  return db.prepare('SELECT * FROM waiters WHERE active = 1 ORDER BY name').all();
}

function createWaiter(name) {
  const existing = db.prepare('SELECT id FROM waiters WHERE name = ?').get(name);
  if (existing) return { success: false, error: 'Waiter name already exists' };
  const result = db.prepare('INSERT INTO waiters (name) VALUES (?)').run(name);
  return { success: true, id: result.lastInsertRowid };
}

function updateWaiter(id, name) {
  const existing = db.prepare('SELECT id FROM waiters WHERE name = ? AND id != ?').get(name, id);
  if (existing) return { success: false, error: 'Waiter name already exists' };
  db.prepare('UPDATE waiters SET name = ? WHERE id = ?').run(name, id);
  return { success: true };
}

function toggleWaiter(id, active) {
  db.prepare('UPDATE waiters SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  return { success: true };
}

function deleteWaiter(id) {
  db.prepare('DELETE FROM waiters WHERE id = ?').run(id);
  return { success: true };
}

// --- Drafts (open tabs) ---

function createDraft({ waiter_name, table_number, customer_name }) {
  const result = db.prepare(
    'INSERT INTO drafts (waiter_name, table_number, customer_name) VALUES (?, ?, ?)'
  ).run(waiter_name, table_number, customer_name || '');
  return getDraftById(result.lastInsertRowid);
}

function addItemsToDraft(draftId, items) {
  const draft = db.prepare('SELECT * FROM drafts WHERE id = ? AND status = ?').get(draftId, 'open');
  if (!draft) return { success: false, error: 'Draft not found or already completed' };

  const insertItem = db.prepare(
    'INSERT INTO draft_items (draft_id, product_id, product_name, size_unit, unit_price, buying_price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const updateStock = db.prepare(
    "UPDATE products SET current_stock = current_stock - ?, updated_at = datetime('now') WHERE id = ?"
  );
  const getProduct = db.prepare('SELECT buying_price FROM products WHERE id = ?');

  const transaction = db.transaction(() => {
    for (const item of items) {
      const prod = getProduct.get(item.product_id);
      const buyingPrice = prod ? prod.buying_price : 0;
      insertItem.run(
        draftId, item.product_id, item.product_name, item.size_unit || '',
        item.unit_price, buyingPrice, item.quantity, item.subtotal
      );
      updateStock.run(item.quantity, item.product_id);
    }
    db.prepare("UPDATE drafts SET updated_at = datetime('now') WHERE id = ?").run(draftId);
  });

  transaction();
  return { success: true, draft: getDraftById(draftId) };
}

function removeItemFromDraft(draftItemId) {
  const item = db.prepare('SELECT * FROM draft_items WHERE id = ?').get(draftItemId);
  if (!item) return { success: false, error: 'Item not found' };

  const draft = db.prepare('SELECT status FROM drafts WHERE id = ?').get(item.draft_id);
  if (!draft || draft.status !== 'open') return { success: false, error: 'Draft is not open' };

  const transaction = db.transaction(() => {
    db.prepare(
      "UPDATE products SET current_stock = current_stock + ?, updated_at = datetime('now') WHERE id = ?"
    ).run(item.quantity, item.product_id);
    db.prepare('DELETE FROM draft_items WHERE id = ?').run(draftItemId);
    db.prepare("UPDATE drafts SET updated_at = datetime('now') WHERE id = ?").run(item.draft_id);
  });

  transaction();
  return { success: true };
}

function getDraftById(id) {
  const draft = db.prepare('SELECT * FROM drafts WHERE id = ?').get(id);
  if (!draft) return null;
  draft.items = db.prepare('SELECT * FROM draft_items WHERE draft_id = ? ORDER BY added_at').all(id);
  draft.total_amount = draft.items.reduce((s, i) => s + i.subtotal, 0);
  return draft;
}

function getOpenDrafts() {
  const drafts = db.prepare("SELECT * FROM drafts WHERE status = 'open' ORDER BY updated_at DESC").all();
  return drafts.map((d) => {
    d.items = db.prepare('SELECT * FROM draft_items WHERE draft_id = ? ORDER BY added_at').all(d.id);
    d.total_amount = d.items.reduce((s, i) => s + i.subtotal, 0);
    return d;
  });
}

function completeDraft(draftId, paymentMethod) {
  const draft = getDraftById(draftId);
  if (!draft) return { success: false, error: 'Draft not found' };
  if (draft.status !== 'open') return { success: false, error: 'Draft already completed' };
  if (draft.items.length === 0) return { success: false, error: 'Draft has no items' };

  const enriched = draft.items.map((item) => ({
    product_id: item.product_id,
    product_name: item.product_name,
    size_unit: item.size_unit,
    unit_price: item.unit_price,
    buying_price: item.buying_price,
    quantity: item.quantity,
    subtotal: item.subtotal,
  }));

  const transaction = db.transaction(() => {
    // Create the sale from draft (stock already reduced when items were added)
    const result = db.prepare(
      'INSERT INTO sales (products, total_amount, waiter_name, customer_name, payment_method) VALUES (?, ?, ?, ?, ?)'
    ).run(
      JSON.stringify(enriched), draft.total_amount,
      draft.waiter_name, draft.customer_name || null, paymentMethod || 'Cash'
    );
    // Mark draft as completed
    db.prepare(
      "UPDATE drafts SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).run(draftId);
    return result.lastInsertRowid;
  });

  const saleId = transaction();
  return { success: true, sale: getSaleById(saleId) };
}

function updateDraft(draftId, { table_number, customer_name }) {
  const draft = db.prepare("SELECT * FROM drafts WHERE id = ? AND status = 'open'").get(draftId);
  if (!draft) return { success: false, error: 'Draft not found or already completed' };
  db.prepare(
    "UPDATE drafts SET table_number = ?, customer_name = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(table_number, customer_name || '', draftId);
  return { success: true };
}

function deleteDraft(draftId) {
  const draft = getDraftById(draftId);
  if (!draft) return { success: false, error: 'Draft not found' };
  if (draft.status !== 'open') return { success: false, error: 'Cannot delete a completed draft' };

  const transaction = db.transaction(() => {
    // Restore stock for all items
    for (const item of draft.items) {
      db.prepare(
        "UPDATE products SET current_stock = current_stock + ?, updated_at = datetime('now') WHERE id = ?"
      ).run(item.quantity, item.product_id);
    }
    db.prepare('DELETE FROM draft_items WHERE draft_id = ?').run(draftId);
    db.prepare('DELETE FROM drafts WHERE id = ?').run(draftId);
  });

  transaction();
  return { success: true };
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
  updateUser,
  resetPassword,
  deleteUser,
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
  refundSale,
  getSalesByDateRange,
  getSalesReport,
  getMonthlySummary,
  getWaiterDailyReport,
  getInventoryValueReport,
  getAllWaiters,
  getActiveWaiters,
  createWaiter,
  updateWaiter,
  toggleWaiter,
  deleteWaiter,
  createDraft,
  addItemsToDraft,
  removeItemFromDraft,
  getDraftById,
  getOpenDrafts,
  completeDraft,
  updateDraft,
  deleteDraft,
};
