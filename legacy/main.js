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
  // Wrap database calls to catch errors and return them gracefully
  // instead of crashing the app with unhandled rejections
  function safeHandle(channel, handler) {
    ipcMain.handle(channel, async (...args) => {
      try {
        return handler(...args);
      } catch (err) {
        console.error(`IPC error [${channel}]:`, err.message);
        throw err; // Re-throw so renderer can catch it in try/catch
      }
    });
  }

  // Auth
  safeHandle('auth:login', (_e, username, password) => database.authenticate(username, password));
  safeHandle('auth:createUser', (_e, user) => database.createUser(user));
  safeHandle('auth:getUsers', () => database.getAllUsers());
  safeHandle('auth:changePassword', (_e, userId, currentPw, newPw) => database.changePassword(userId, currentPw, newPw));
  safeHandle('auth:updateUser', (_e, id, data) => database.updateUser(id, data));
  safeHandle('auth:resetPassword', (_e, userId, newPw) => database.resetPassword(userId, newPw));
  safeHandle('auth:deleteUser', (_e, id) => database.deleteUser(id));

  // Products
  safeHandle('products:getAll', () => database.getAllProducts());
  safeHandle('products:getById', (_e, id) => database.getProductById(id));
  safeHandle('products:getByCategory', (_e, category) => database.getProductsByCategory(category));
  safeHandle('products:search', (_e, query) => database.searchProducts(query));
  safeHandle('products:getCategories', () => database.getCategories());
  safeHandle('products:getLowStock', () => database.getLowStockProducts());
  safeHandle('products:create', (_e, product) => database.createProduct(product));
  safeHandle('products:update', (_e, product) => database.updateProduct(product));
  safeHandle('products:delete', (_e, id) => database.deleteProduct(id));

  // Sales
  safeHandle('sales:create', (_e, sale) => database.createSale(sale));
  safeHandle('sales:getAll', () => database.getAllSales());
  safeHandle('sales:getById', (_e, id) => database.getSaleById(id));
  safeHandle('sales:refund', (_e, id) => database.refundSale(id));

  // Waiters (name-only)
  safeHandle('waiters:getAll', () => database.getAllWaiters());
  safeHandle('waiters:getActive', () => database.getActiveWaiters());
  safeHandle('waiters:create', (_e, name) => database.createWaiter(name));
  safeHandle('waiters:update', (_e, id, name) => database.updateWaiter(id, name));
  safeHandle('waiters:toggle', (_e, id, active) => database.toggleWaiter(id, active));
  safeHandle('waiters:delete', (_e, id) => database.deleteWaiter(id));

  // Drafts (open tabs)
  safeHandle('drafts:create', (_e, data) => database.createDraft(data));
  safeHandle('drafts:addItems', (_e, draftId, items) => database.addItemsToDraft(draftId, items));
  safeHandle('drafts:removeItem', (_e, itemId) => database.removeItemFromDraft(itemId));
  safeHandle('drafts:updateItemQty', (_e, itemId, newQty) => database.updateDraftItemQty(itemId, newQty));
  safeHandle('drafts:getById', (_e, id) => database.getDraftById(id));
  safeHandle('drafts:getOpen', () => database.getOpenDrafts());
  safeHandle('drafts:complete', (_e, draftId, paymentMethod) => database.completeDraft(draftId, paymentMethod));
  safeHandle('drafts:update', (_e, id, data) => database.updateDraft(id, data));
  safeHandle('drafts:delete', (_e, id) => database.deleteDraft(id));

  // Reports
  safeHandle('reports:salesReport', (_e, start, end) => database.getSalesReport(start, end));
  safeHandle('reports:monthlySummary', () => database.getMonthlySummary());
  safeHandle('reports:waiterDaily', (_e, date) => database.getWaiterDailyReport(date));
  safeHandle('reports:inventoryValue', () => database.getInventoryValueReport());

  // Helper: write HTML to temp file for reliable rendering
  function writeTempHtml(html) {
    const tmpPath = path.join(app.getPath('temp'), `receipt-${Date.now()}.html`);
    fs.writeFileSync(tmpPath, html, 'utf-8');
    return tmpPath;
  }

  // Printing
  ipcMain.handle('print:receipt', async (_e, receiptHtml) => {
    const tmpPath = writeTempHtml(receiptHtml);

    return new Promise((resolve) => {
      receiptWindow = new BrowserWindow({
        show: false,
        width: 302,
        height: 800,
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      });

      // Timeout fallback: if page doesn't load within 15 seconds, clean up
      const loadTimeout = setTimeout(() => {
        try { if (receiptWindow) { receiptWindow.close(); receiptWindow = null; } } catch (_) {}
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        resolve({ success: false, error: 'Print timed out' });
      }, 15000);

      receiptWindow.loadFile(tmpPath);

      receiptWindow.webContents.on('did-finish-load', () => {
        clearTimeout(loadTimeout);
        setTimeout(() => {
          receiptWindow.webContents.print({ silent: false, printBackground: true }, (success) => {
            receiptWindow.close();
            receiptWindow = null;
            try { fs.unlinkSync(tmpPath); } catch (_) {}
            resolve({ success });
          });
        }, 500);
      });
    });
  });

  // Save Report as PDF (A4 landscape)
  ipcMain.handle('print:saveReportPdf', async (_e, reportHtml, defaultName) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Report as PDF',
      defaultPath: path.join(app.getPath('documents'), `${defaultName}.pdf`),
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) return { success: false };

    const tmpPath = writeTempHtml(reportHtml);

    return new Promise((resolve) => {
      const pdfWindow = new BrowserWindow({
        show: false,
        width: 1200,
        height: 900,
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      });

      pdfWindow.loadFile(tmpPath);

      pdfWindow.webContents.on('did-finish-load', () => {
        setTimeout(async () => {
          try {
            const pdfData = await pdfWindow.webContents.printToPDF({
              printBackground: true,
              landscape: true,
              pageSize: 'A4',
              margins: { top: 10, bottom: 10, left: 15, right: 15 },
            });
            fs.writeFileSync(filePath, pdfData);
            pdfWindow.close();
            try { fs.unlinkSync(tmpPath); } catch (_) {}
            resolve({ success: true, filePath });
          } catch (err) {
            pdfWindow.close();
            try { fs.unlinkSync(tmpPath); } catch (_) {}
            resolve({ success: false, error: err.message });
          }
        }, 500);
      });
    });
  });

  // Save Receipt as PDF (thermal receipt width)
  ipcMain.handle('print:savePdf', async (_e, receiptHtml, defaultName) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Receipt as PDF',
      defaultPath: path.join(app.getPath('documents'), `${defaultName}.pdf`),
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) return { success: false };

    const tmpPath = writeTempHtml(receiptHtml);

    return new Promise((resolve) => {
      const pdfWindow = new BrowserWindow({
        show: false,
        width: 302,
        height: 800,
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      });

      pdfWindow.loadFile(tmpPath);

      pdfWindow.webContents.on('did-finish-load', () => {
        setTimeout(async () => {
          try {
            const pdfData = await pdfWindow.webContents.printToPDF({
              printBackground: true,
              pageSize: { width: 80000, height: 297000 },
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
            });
            fs.writeFileSync(filePath, pdfData);
            pdfWindow.close();
            try { fs.unlinkSync(tmpPath); } catch (_) {}
            resolve({ success: true, filePath });
          } catch (err) {
            pdfWindow.close();
            try { fs.unlinkSync(tmpPath); } catch (_) {}
            resolve({ success: false, error: err.message });
          }
        }, 500);
      });
    });
  });
}
