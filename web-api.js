const API_BASE = "";

async function parseResponse(res) {
  const contentType = res.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(`الرد ليس JSON. Status: ${res.status}. Response: ${text.slice(0, 200)}`);
  }

  const data = await res.json();

  if (!res.ok || data.success === false) {
    throw new Error(data.message || "Request failed");
  }

  return data.data ?? data;
}

async function apiGet(url) {
  const res = await fetch(API_BASE + url, {
    credentials: "include"
  });
  return parseResponse(res);
}

async function apiPost(url, body) {
  const res = await fetch(API_BASE + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body || {})
  });
  return parseResponse(res);
}

async function apiPut(url, body) {
  const res = await fetch(API_BASE + url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body || {})
  });
  return parseResponse(res);
}

async function apiDelete(url) {
  const res = await fetch(API_BASE + url, {
    method: "DELETE",
    credentials: "include"
  });
  return parseResponse(res);
}

window.api = {
  auth: {
    login: (data) => apiPost("/api/auth/login", data)
  },

  backup: {
    create: () => apiPost("/api/backup/create"),
    restore: () => apiPost("/api/backup/restore")
  },

  users: {
    getAll: () => apiGet("/api/users"),
    add: (user) => apiPost("/api/users", user),
    update: (user) => apiPut(`/api/users/${user.id}`, user),
    remove: (id) => apiDelete(`/api/users/${id}`)
  },

  permissions: {
    getByRole: (role) => apiGet(`/api/permissions/${encodeURIComponent(role)}`),
    updateRole: (data) => apiPut("/api/permissions", data)
  },

  categories: {
    getAll: () => apiGet("/api/categories"),
    add: (name) => apiPost("/api/categories", { name }),
    remove: (id) => apiDelete(`/api/categories/${id}`)
  },

  products: {
    getAll: () => apiGet("/api/products"),
    add: (product) => apiPost("/api/products", product),
    update: (product) => apiPut(`/api/products/${product.id}`, product),
    remove: (id) => apiDelete(`/api/products/${id}`)
  },

  suppliers: {
    getAll: () => apiGet("/api/suppliers"),
    add: (supplier) => apiPost("/api/suppliers", supplier),
    update: (supplier) => apiPut(`/api/suppliers/${supplier.id}`, supplier),
    remove: (id) => apiDelete(`/api/suppliers/${id}`)
  },

  settings: {
    get: () => apiGet("/api/settings"),
    save: (settings) => apiPut("/api/settings", settings)
  },

  invoices: {
    getAll: () => apiGet("/api/invoices"),
    getItems: (invoiceId) => apiGet(`/api/invoices/${invoiceId}/items`),
    getById: (invoiceId) => apiGet(`/api/invoices/${invoiceId}`),
    add: (invoice) => apiPost("/api/invoices", invoice),
    returnItems: (data) => apiPost("/api/invoices/return-items", data)
  },

  customers: {
    getAll: () => apiGet("/api/customers"),
    add: (customer) => apiPost("/api/customers", customer),
    update: (customer) => apiPut(`/api/customers/${customer.id}`, customer),
    remove: (id) => apiDelete(`/api/customers/${id}`),
    addPayment: (data) => apiPost("/api/customers/payment", data),
    getStatement: (customerId) => apiGet(`/api/customers/${customerId}/statement`)
  },

  expenses: {
    getAll: () => apiGet("/api/expenses"),
    add: (expense) => apiPost("/api/expenses", expense),
    update: (expense) => apiPut(`/api/expenses/${expense.id}`, expense),
    remove: (id) => apiDelete(`/api/expenses/${id}`)
  },

  returns: {
    getAll: () => apiGet("/api/returns"),
    add: (data) => apiPost("/api/returns", data),
    remove: (id) => apiDelete(`/api/returns/${id}`),
    update: (data) => apiPut(`/api/returns/${data.id}`, data)
  },

  stock: {
    getMovements: (productId) => apiGet(`/api/stock/${productId}/movements`)
  },

  getProductByBarcode: (code) => apiGet(`/api/products/barcode/${encodeURIComponent(code)}`)
};