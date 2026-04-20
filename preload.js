const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  auth: {
    login: (data) => ipcRenderer.invoke("auth:login", data)
  },

  backup: {
    create: () => ipcRenderer.invoke("backup:create"),
    restore: () => ipcRenderer.invoke("backup:restore")
  },

  users: {
    getAll: () => ipcRenderer.invoke("users:getAll"),
    add: (user) => ipcRenderer.invoke("users:add", user),
    update: (user) => ipcRenderer.invoke("users:update", user),
    remove: (id) => ipcRenderer.invoke("users:remove", id)
  },

  permissions: {
    getByRole: (role) => ipcRenderer.invoke("permissions:getByRole", role),
    updateRole: (data) => ipcRenderer.invoke("permissions:updateRole", data)
  },

  categories: {
    getAll: () => ipcRenderer.invoke("categories:getAll"),
    add: (name) => ipcRenderer.invoke("categories:add", name),
    remove: (id) => ipcRenderer.invoke("categories:remove", id)
  },

  products: {
    getAll: () => ipcRenderer.invoke("products:getAll"),
    add: (product) => ipcRenderer.invoke("products:add", product),
    update: (product) => ipcRenderer.invoke("products:update", product),
    remove: (id) => ipcRenderer.invoke("products:remove", id)
  },

  suppliers: {
    getAll: () => ipcRenderer.invoke("suppliers:getAll"),
    add: (supplier) => ipcRenderer.invoke("suppliers:add", supplier),
    update: (supplier) => ipcRenderer.invoke("suppliers:update", supplier),
    remove: (id) => ipcRenderer.invoke("suppliers:remove", id)
  },

  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    save: (settings) => ipcRenderer.invoke("settings:save", settings)
  },

  invoices: {
    getAll: () => ipcRenderer.invoke("invoices:getAll"),
    getItems: (invoiceId) => ipcRenderer.invoke("invoices:getItems", invoiceId),
    getById: (invoiceId) => ipcRenderer.invoke("invoices:getById", invoiceId),
    add: (invoice) => ipcRenderer.invoke("invoices:add", invoice),
    returnItems: (data) => ipcRenderer.invoke("invoices:returnItems", data)
  },

  customers: {
    getAll: () => ipcRenderer.invoke("customers:getAll"),
    add: (customer) => ipcRenderer.invoke("customers:add", customer),
    update: (customer) => ipcRenderer.invoke("customers:update", customer),
    remove: (id) => ipcRenderer.invoke("customers:remove", id),
    addPayment: (data) => ipcRenderer.invoke("customers:addPayment", data),
    getStatement: (customerId) => ipcRenderer.invoke("customers:getStatement", customerId)
  },

  expenses: {
    getAll: () => ipcRenderer.invoke("expenses:getAll"),
    add: (expense) => ipcRenderer.invoke("expenses:add", expense),
    update: (expense) => ipcRenderer.invoke("expenses:update", expense),
    remove: (id) => ipcRenderer.invoke("expenses:remove", id)
  },

  returns: {
    getAll: () => ipcRenderer.invoke("returns:getAll"),
    add: (data) => ipcRenderer.invoke("returns:add", data),
    remove: (id) => ipcRenderer.invoke("returns:remove", id),
    update: (data) => ipcRenderer.invoke("returns:update", data)
  },

  stock: {
    getMovements: (productId) => ipcRenderer.invoke("stock:getMovements", productId),
    addMovement: (movement) => ipcRenderer.invoke("stock:addMovement", movement)
  },

  getProductByBarcode: (code) => ipcRenderer.invoke("products:getByBarcode", code)
});