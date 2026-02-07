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
  createProduct: (product) => ipcRenderer.invoke('products:create', product),
  updateProduct: (product) => ipcRenderer.invoke('products:update', product),
  deleteProduct: (id) => ipcRenderer.invoke('products:delete', id),

  // Categories
  getCategories: () => ipcRenderer.invoke('categories:getAll'),
  createCategory: (category) => ipcRenderer.invoke('categories:create', category),

  // Stock movements
  recordStockMovement: (movement) => ipcRenderer.invoke('stock:record', movement),
  getStockMovements: (productId) => ipcRenderer.invoke('stock:getByProduct', productId),

  // Suppliers
  getSuppliers: () => ipcRenderer.invoke('suppliers:getAll'),
  createSupplier: (supplier) => ipcRenderer.invoke('suppliers:create', supplier),
});
