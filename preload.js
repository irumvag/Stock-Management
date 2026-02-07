const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Auth
  login: (username, password) => ipcRenderer.invoke('auth:login', username, password),
  createUser: (user) => ipcRenderer.invoke('auth:createUser', user),
  getUsers: () => ipcRenderer.invoke('auth:getUsers'),
  changePassword: (userId, currentPw, newPw) => ipcRenderer.invoke('auth:changePassword', userId, currentPw, newPw),

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

  // Sales
  createSale: (sale) => ipcRenderer.invoke('sales:create', sale),
  getSales: () => ipcRenderer.invoke('sales:getAll'),
  getSale: (id) => ipcRenderer.invoke('sales:getById', id),

  // Printing
  printReceipt: (html) => ipcRenderer.invoke('print:receipt', html),
});
