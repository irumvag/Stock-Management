const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Auth
  login: (username, password) => ipcRenderer.invoke('auth:login', username, password),
  createUser: (user) => ipcRenderer.invoke('auth:createUser', user),
  getUsers: () => ipcRenderer.invoke('auth:getUsers'),
  changePassword: (userId, currentPw, newPw) => ipcRenderer.invoke('auth:changePassword', userId, currentPw, newPw),
  updateUser: (id, data) => ipcRenderer.invoke('auth:updateUser', id, data),
  resetPassword: (userId, newPw) => ipcRenderer.invoke('auth:resetPassword', userId, newPw),
  deleteUser: (id) => ipcRenderer.invoke('auth:deleteUser', id),

  // Products
  getProducts: () => ipcRenderer.invoke('products:getAll'),
  getProduct: (id) => ipcRenderer.invoke('products:getById', id),
  getProductsByCategory: (category) => ipcRenderer.invoke('products:getByCategory', category),
  searchProducts: (query) => ipcRenderer.invoke('products:search', query),
  getCategories: () => ipcRenderer.invoke('products:getCategories'),
  getLowStockProducts: () => ipcRenderer.invoke('products:getLowStock'),
  createProduct: (product) => ipcRenderer.invoke('products:create', product),
  updateProduct: (product) => ipcRenderer.invoke('products:update', product),
  deleteProduct: (id) => ipcRenderer.invoke('products:delete', id),

  // Waiters (name-only)
  getWaiters: () => ipcRenderer.invoke('waiters:getAll'),
  getActiveWaiters: () => ipcRenderer.invoke('waiters:getActive'),
  createWaiter: (name) => ipcRenderer.invoke('waiters:create', name),
  updateWaiter: (id, name) => ipcRenderer.invoke('waiters:update', id, name),
  toggleWaiter: (id, active) => ipcRenderer.invoke('waiters:toggle', id, active),
  deleteWaiter: (id) => ipcRenderer.invoke('waiters:delete', id),

  // Drafts (open tabs)
  createDraft: (data) => ipcRenderer.invoke('drafts:create', data),
  addItemsToDraft: (draftId, items) => ipcRenderer.invoke('drafts:addItems', draftId, items),
  removeItemFromDraft: (itemId) => ipcRenderer.invoke('drafts:removeItem', itemId),
  updateDraftItemQty: (itemId, newQty) => ipcRenderer.invoke('drafts:updateItemQty', itemId, newQty),
  getDraft: (id) => ipcRenderer.invoke('drafts:getById', id),
  getOpenDrafts: () => ipcRenderer.invoke('drafts:getOpen'),
  completeDraft: (draftId, paymentMethod) => ipcRenderer.invoke('drafts:complete', draftId, paymentMethod),
  updateDraft: (id, data) => ipcRenderer.invoke('drafts:update', id, data),
  deleteDraft: (id) => ipcRenderer.invoke('drafts:delete', id),

  // Sales
  createSale: (sale) => ipcRenderer.invoke('sales:create', sale),
  getSales: () => ipcRenderer.invoke('sales:getAll'),
  getSale: (id) => ipcRenderer.invoke('sales:getById', id),
  refundSale: (id) => ipcRenderer.invoke('sales:refund', id),

  // Reports
  getSalesReport: (start, end) => ipcRenderer.invoke('reports:salesReport', start, end),
  getMonthlySummary: () => ipcRenderer.invoke('reports:monthlySummary'),
  getWaiterDailyReport: (date) => ipcRenderer.invoke('reports:waiterDaily', date),
  getInventoryValueReport: () => ipcRenderer.invoke('reports:inventoryValue'),

  // Printing
  printReceipt: (html) => ipcRenderer.invoke('print:receipt', html),
  saveReceiptPdf: (html, defaultName) => ipcRenderer.invoke('print:savePdf', html, defaultName),
  saveReportPdf: (html, defaultName) => ipcRenderer.invoke('print:saveReportPdf', html, defaultName),
});
