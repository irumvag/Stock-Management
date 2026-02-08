const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const database = require('./database');

let mainWindow;
let receiptWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Club TMP Stock Manager',
    icon: path.join(__dirname, 'build', 'icon.png'),
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
  ipcMain.handle('auth:updateUser', (_e, id, data) => database.updateUser(id, data));
  ipcMain.handle('auth:resetPassword', (_e, userId, newPw) => database.resetPassword(userId, newPw));
  ipcMain.handle('auth:deleteUser', (_e, id) => database.deleteUser(id));

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

  // Reports
  ipcMain.handle('reports:salesReport', (_e, start, end) => database.getSalesReport(start, end));
  ipcMain.handle('reports:monthlySummary', () => database.getMonthlySummary());
  ipcMain.handle('reports:waiterDaily', (_e, date) => database.getWaiterDailyReport(date));
  ipcMain.handle('reports:inventoryValue', () => database.getInventoryValueReport());

  // Printing
  ipcMain.handle('print:receipt', async (_e, receiptHtml) => {
    return new Promise((resolve) => {
      receiptWindow = new BrowserWindow({
        show: false,
        width: 302,
        height: 800,
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      });

      receiptWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHtml)}`);

      receiptWindow.webContents.on('did-finish-load', () => {
        receiptWindow.webContents.print({ silent: false, printBackground: true }, (success) => {
          receiptWindow.close();
          receiptWindow = null;
          resolve({ success });
        });
      });
    });
  });

  // Save as PDF
  ipcMain.handle('print:savePdf', async (_e, receiptHtml, defaultName) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Receipt as PDF',
      defaultPath: path.join(app.getPath('documents'), `${defaultName}.pdf`),
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) return { success: false };

    return new Promise((resolve) => {
      const pdfWindow = new BrowserWindow({
        show: false,
        width: 302,
        height: 800,
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      });

      pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHtml)}`);

      pdfWindow.webContents.on('did-finish-load', async () => {
        try {
          const pdfData = await pdfWindow.webContents.printToPDF({
            printBackground: true,
            pageSize: { width: 80000, height: 297000 },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
          });
          fs.writeFileSync(filePath, pdfData);
          pdfWindow.close();
          resolve({ success: true, filePath });
        } catch (err) {
          pdfWindow.close();
          resolve({ success: false, error: err.message });
        }
      });
    });
  });
}
