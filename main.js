const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const database = require('./database');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('renderer/index.html');
}

app.whenReady().then(() => {
  database.initialize();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  database.close();
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

function registerIpcHandlers() {
  // Auth
  ipcMain.handle('auth:login', (_e, username, password) => database.authenticate(username, password));
  ipcMain.handle('auth:createUser', (_e, user) => database.createUser(user));
  ipcMain.handle('auth:getUsers', () => database.getAllUsers());
  ipcMain.handle('auth:changePassword', (_e, userId, currentPw, newPw) => database.changePassword(userId, currentPw, newPw));

  // Products
  ipcMain.handle('products:getAll', () => database.getAllProducts());
  ipcMain.handle('products:getById', (_e, id) => database.getProductById(id));
  ipcMain.handle('products:getByCategory', (_e, category) => database.getProductsByCategory(category));
  ipcMain.handle('products:search', (_e, query) => database.searchProducts(query));
  ipcMain.handle('products:getCategories', () => database.getCategories());
  ipcMain.handle('products:getLowStock', () => database.getLowStockProducts());
  ipcMain.handle('products:create', (_e, product) => database.createProduct(product));
  ipcMain.handle('products:update', (_e, product) => database.updateProduct(product));
  ipcMain.handle('products:delete', (_e, id) => database.deleteProduct(id));

  // Sales
  ipcMain.handle('sales:create', (_e, sale) => database.createSale(sale));
  ipcMain.handle('sales:getAll', () => database.getAllSales());
  ipcMain.handle('sales:getById', (_e, id) => database.getSaleById(id));
}
