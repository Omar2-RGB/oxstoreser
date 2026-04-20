const loginBtn = document.getElementById("loginBtn");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");

/* =========================
   HELPERS
========================= */

function hasDB() {
  return typeof window !== "undefined" && !!window.api;
}
function hasPermission(permission) {
  if (!currentUser) return false;
  const permissions = safeArray(currentUser.permissions);
  if (permissions.includes("all")) return true;
  return permissions.includes(permission);
}

function requirePermission(permission) {
  if (!hasPermission(permission)) {
    alert("ليس لديك صلاحية للوصول إلى هذا القسم");
    return false;
  }
  return true;
}
function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function num(v, d = 0) {
  const n = Number(v);
  return Number.isNaN(n) ? d : n;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  return `${num(value).toFixed(2)} ${appSettings.currency}`.trim();
}

/* =========================
   STATE
========================= */
let currentUser = null;
let usersData = [];
let cart = [];
let selectedCustomerId = null;
let categories = ["كل المنتجات"];
let categoriesRows = [];
let customersData = [];
let productsData = [];
let suppliersData = [];
let invoiceData = [];
let editingProductId = null;

let appSettings = {
  storeName: "Ox Store",
  storePhone: "",
  storeAddress: "",
  currency: "ليرة سورية",
  taxEnabled: false,
  taxPercent: 0,
  barcodeType: "CODE128"
};
async function loadUsersFromDB() {
  if (!hasDB() || !window.api.users?.getAll) {
    usersData = [];
    return;
  }

  try {
    const rows = await window.api.users.getAll();
    usersData = safeArray(rows).map((u) => ({
      id: Number(u.id),
      fullName: u.full_name || "",
      username: u.username || "",
      role: u.role || "cashier",
      isActive: Number(u.is_active) === 1,
      createdAt: u.created_at || "",
      password: u.password || ""

    }));
  } catch (error) {
    console.error("خطأ تحميل المستخدمين:", error);
    usersData = [];
  }
}

async function loadInvoicesFromDB() {
  if (!hasDB() || !window.api.invoices?.getAll) {
    invoicesData = [];
    return;
  }

  try {
    const rows = await window.api.invoices.getAll();
invoicesData = safeArray(rows).map((r) => ({
  id: Number(r.id),
  customerName: r.customer_name || "عميل نقدي",
  paymentMethod: r.payment_method || "نقدي",
  subtotal: num(r.subtotal),
  discount: num(r.discount_value),
  net: num(r.net_total),
  paid: num(r.paid_amount),
  rest: num(r.rest_amount),
  profit: num(r.profit_total),
  cashierName: r.cashier_name || "admin",
  createdAt: r.created_at || ""
}));
  } catch (error) {
    console.error("خطأ تحميل الفواتير:", error);
    invoicesData = [];
  }
}
/* =========================
   LOADERS
========================= */

async function loadCategoriesFromDB() {
  if (!hasDB() || !window.api.categories?.getAll) {
    categoriesRows = [];
    categories = ["كل المنتجات"];
    return;
  }

  try {
    const rows = await window.api.categories.getAll();
    categoriesRows = safeArray(rows).map((r) => ({
      id: r.id,
      name: r.name || ""
    }));
    categories = ["كل المنتجات", ...categoriesRows.map((r) => r.name)];
  } catch (error) {
    console.error("خطأ تحميل الفئات:", error);
    categoriesRows = [];
    categories = ["كل المنتجات"];
  }
}
 async function loadProductsFromDB() {
  if (!hasDB() || !window.api.products?.getAll) {
    productsData = [];
    return;
  }

  try {
    const rows = await window.api.products.getAll();

    productsData = safeArray(rows).map((r) => ({
      id: r.id,
      barcode: r.barcode || "",
      barcodeType: r.barcode_type || r.barcodeType || "CODE128",
      name: r.name || "",
      category: r.category_name || r.category || "عام",
      categoryId: r.category_id ?? r.categoryId ?? null,
      saleType: r.sale_type || r.saleType || "قطعة",
      price: num(r.price),
      cost: num(r.cost),
      stock: num(r.stock),
      image: r.image || "",
      alertLimit: num(r.alert_limit ?? r.alertLimit),
    }));
  } catch (error) {
    console.error("خطأ تحميل المنتجات:", error);
    productsData = [];
  }
}

async function loadSuppliersFromDB() {
  if (!hasDB() || !window.api.suppliers?.getAll) {
    suppliersData = [];
    return;
  }

  try {
    const rows = await window.api.suppliers.getAll();
    suppliersData = safeArray(rows).map((r) => ({
      id: r.id,
      name: r.name || "",
      phone: r.phone || "",
      openingBalance: num(r.opening_balance ?? r.openingBalance),
      notes: r.notes || ""
    }));
  } catch (error) {
    console.error("خطأ تحميل الموردين:", error);
    suppliersData = [];
  }
}

async function loadSettingsFromDB() {
  if (!hasDB() || !window.api.settings?.get) return;

  try {
    const row = await window.api.settings.get();
    if (!row) return;

    appSettings = {
      ...appSettings,
      storeName: row.store_name || row.storeName || "Ox Store",
      storePhone: row.store_phone || row.storePhone || "",
      storeAddress: row.store_address || row.storeAddress || "",
      currency: row.currency || "ليرة سورية",
      taxEnabled: !!row.tax_enabled,
      taxPercent: num(row.tax_percent),
      barcodeType: row.barcode_type || row.barcodeType || "CODE128"
    };
  } catch (error) {
    console.error("خطأ تحميل الإعدادات:", error);
  }
}
/* =========================
   REPORT HELPERS
========================= */
function getSalesLast7DaysFromInvoices() {
  const days = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);

    const key = d.toISOString().slice(0, 10);

    const dayInvoices = invoicesData.filter((inv) => {
      const invDate = new Date(inv.createdAt);
      if (Number.isNaN(invDate.getTime())) return false;
      return invDate.toISOString().slice(0, 10) === key;
    });

    days.push({
      day: d.toLocaleDateString("ar-EG", { weekday: "short" }),
      sales: dayInvoices.reduce((sum, inv) => sum + num(inv.net), 0),
      profit: dayInvoices.reduce((sum, inv) => sum + num(inv.profit), 0)
    });
  }

  return days;
}
function getReportStats() {
  const productsCount = productsData.length;
  const lowStockCount = productsData.filter((p) => num(p.stock) <= num(p.alertLimit)).length;
  const stockValue = productsData.reduce((sum, p) => sum + (num(p.stock) * num(p.cost)), 0);

  const netSales = invoicesData.reduce((sum, inv) => sum + num(inv.net), 0);
  const invoicesCount = invoicesData.length;
  const avgInvoice = invoicesCount ? netSales / invoicesCount : 0;

  const totalProfit = invoicesData.reduce((sum, inv) => sum + num(inv.profit), 0);

  const totalExpenses = expensesData.reduce((sum, e) => sum + num(e.amount), 0);
  const netProfit = totalProfit - totalExpenses;

  const cashPaid = invoicesData
    .filter((inv) => inv.paymentMethod === "نقدي")
    .reduce((sum, inv) => sum + num(inv.net), 0);

  const cardPaid = invoicesData
    .filter((inv) => inv.paymentMethod === "بطاقة")
    .reduce((sum, inv) => sum + num(inv.net), 0);

  const laterPaid = invoicesData
    .filter((inv) => inv.paymentMethod === "آجل")
    .reduce((sum, inv) => sum + num(inv.net), 0);

  return {
    netSales,
    invoicesCount,
    avgInvoice,
    totalProfit,
    totalExpenses,
    netProfit,
    customersCount: customersData.length,
    debtCustomers: customersData.filter((c) => c.status === "عليه فلوس" || num(c.dueBalance) > 0).length,
    totalDebts: customersData.reduce((sum, c) => sum + num(c.dueBalance), 0),
    cashierCount: 1,
    productsCount,
    lowStockCount,
    stockValue,
    cashPaid,
    cardPaid,
    laterPaid,
    totalReturns: returnsData.reduce((sum, r) => sum + num(r.total), 0)
  };
}

function reportCard(title, value, extraClass = "") {
  return `
    <div class="report-stat-card ${extraClass}">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}


function getSalesLast7Days() {
  return [
    { day: "السبت", sales: 0, profit: 0 },
    { day: "الأحد", sales: 0, profit: 0 },
    { day: "الاثنين", sales: 0, profit: 0 },
    { day: "الثلاثاء", sales: 0, profit: 0 },
    { day: "الأربعاء", sales: 0, profit: 0 },
    { day: "الخميس", sales: 0, profit: 0 },
    { day: "الجمعة", sales: 0, profit: 0 }
  ];
}

function getTopProducts() {
  return productsData.slice(0, 5).map((p) => ({
    name: p.name,
    qty: 0
  }));
}

function getPaymentRevenue() {
  return [
    { method: "نقدي", amount: 0 },
    { method: "بطاقة", amount: 0 },
    { method: "آجل", amount: 0 }
  ];
}
function reportCard(title, value) {
  return `
    <div class="report-stat-card">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}
function setupReportsMenu() {
  document.querySelectorAll(".report-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".report-nav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderReportTab(btn.dataset.reportPage);
    });
  });
}
function setupReports() {
  const tabs = document.querySelectorAll(".report-tab");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".report-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      const tabName = tab.dataset.reportTab;
      renderReportTab(tabName);
    });
  });
}

function renderReportTab(tabName) {
  const box = document.getElementById("reportsContent");
  if (!box) return;

  const stats = getReportStats();
if (tabName === "dashboard") {
  box.innerHTML = `
    <div class="reports-grid stats-4">
      ${reportCard("عدد المنتجات", stats.productsCount)}
      ${reportCard("مخزون منخفض", stats.lowStockCount, stats.lowStockCount > 0 ? "loss-card" : "profit-card")}
      ${reportCard("قيمة المخزون", money(stats.stockValue))}
      ${reportCard("عدد الكاشيرية", stats.cashierCount)}
    </div>

    <div class="reports-grid stats-3">
      ${reportCard("إجمالي المبيعات", money(stats.netSales))}
      ${reportCard("إجمالي الربح", money(stats.totalProfit), stats.totalProfit >= 0 ? "profit-card" : "loss-card")}
      ${reportCard("صافي الربح", money(stats.netProfit), stats.netProfit >= 0 ? "profit-card" : "loss-card")}
    </div>
  `;

  }
  
  else if (tabName === "sales") {
  const recentInvoices = [...invoicesData]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);

  box.innerHTML = `
    <div class="reports-grid stats-4">
      ${reportCard("إجمالي المبيعات", money(stats.netSales))}
      ${reportCard("إجمالي الفواتير", stats.invoicesCount)}
      ${reportCard("متوسط الفاتورة", money(stats.avgInvoice))}
      ${reportCard("إجمالي الربح", money(stats.totalProfit), stats.totalProfit >= 0 ? "profit-card" : "loss-card")}
    </div>

    <div class="reports-grid stats-3">
      ${reportCard("إجمالي المصاريف", money(stats.totalExpenses))}
      ${reportCard("صافي الربح", money(stats.netProfit), stats.netProfit >= 0 ? "profit-card" : "loss-card")}
      ${reportCard("إجمالي المرتجعات", money(stats.totalReturns))}
    </div>

    <div class="report-panel">
      <div class="panel-title">آخر فواتير المبيعات</div>

      <div class="table-wrap">
        <table class="products-table">
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>العميل</th>
              <th>الدفع</th>
              <th>الصافي</th>
              <th>الربح</th>
              <th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            ${
              recentInvoices.length
                ? recentInvoices.map((inv) => `
                  <tr>
                    <td><strong>#${inv.id}</strong></td>
                    <td>${escapeHtml(inv.customerName)}</td>
                    <td>${escapeHtml(inv.paymentMethod)}</td>
                    <td>${money(inv.net)}</td>
                    <td style="color:${num(inv.profit) >= 0 ? '#16a34a' : '#dc2626'};font-weight:700;">
                      ${money(inv.profit)}
                    </td>
                    <td>${escapeHtml(formatDateOnly(inv.createdAt))}</td>
                  </tr>
                `).join("")
                : `<tr><td colspan="6" class="empty-row">لا توجد بيانات مبيعات حالياً</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

else if (tabName === "payments") {
  box.innerHTML = `
    <div class="reports-grid stats-3">
      ${reportCard("نقدي", money(stats.cashPaid))}
      ${reportCard("بطاقة", money(stats.cardPaid))}
      ${reportCard("آجل", money(stats.laterPaid))}
    </div>

    <div class="report-panel">
      <div class="panel-title">طرق الدفع</div>
      <div class="reports-grid stats-3">
        ${reportCard("نسبة النقدي", stats.netSales ? ((stats.cashPaid / stats.netSales) * 100).toFixed(1) + "%" : "0%")}
        ${reportCard("نسبة البطاقة", stats.netSales ? ((stats.cardPaid / stats.netSales) * 100).toFixed(1) + "%" : "0%")}
        ${reportCard("نسبة الآجل", stats.netSales ? ((stats.laterPaid / stats.netSales) * 100).toFixed(1) + "%" : "0%")}
      </div>
    </div>
  `;
}

else if (tabName === "customers") {
  const totalCustomers = customersData.length;
  const debtCustomers = customersData.filter(
    (c) => c.status === "عليه فلوس" || num(c.dueBalance) > 0
  ).length;
  const totalDebts = customersData.reduce((sum, c) => sum + num(c.dueBalance), 0);

  box.innerHTML = `
    <div class="customers-page">
      <div class="suppliers-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <button class="blue-btn" onclick="openCustomerModal()">+ إضافة عميل</button>

        <div class="suppliers-title">
          <h2>العملاء والديون</h2>
          <p>إدارة العملاء والحسابات المستحقة</p>
        </div>
      </div>
<div class="supplier-stat-card green-soft">
  <div class="supplier-stat-icon">📈</div>
  <div class="supplier-stat-label">إجمالي الأرباح</div>
  <div class="supplier-stat-value">${money(invoicesData.reduce((sum, i) => sum + num(i.profit), 0))}</div>
  <div class="supplier-stat-sub green-text">أرباح الفواتير</div>
</div>
      <div class="suppliers-stats">
        <div class="supplier-stat-card blue-soft">
          <div class="supplier-stat-icon">👥</div>
          <div class="supplier-stat-label">إجمالي العملاء</div>
          <div class="supplier-stat-value">${totalCustomers}</div>
          <div class="supplier-stat-sub blue-text">عدد العملاء المسجلين</div>
        </div>

        <div class="supplier-stat-card red-soft">
          <div class="supplier-stat-icon">⚠️</div>
          <div class="supplier-stat-label">عملاء عليهم فلوس</div>
          <div class="supplier-stat-value red-text">${debtCustomers}</div>
          <div class="supplier-stat-sub">غير مسددين</div>
        </div>

        <div class="supplier-stat-card green-soft">
          <div class="supplier-stat-icon">💰</div>
          <div class="supplier-stat-label">إجمالي الديون</div>
          <div class="supplier-stat-value">${money(totalDebts)}</div>
          <div class="supplier-stat-sub green-text">المبالغ المستحقة</div>
        </div>
      </div>

      <div class="products-card" style="margin-top:20px;">
        <div class="search-row supplier-search-row" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <input id="customerSearch" type="text" placeholder="بحث باسم العميل أو الهاتف..." oninput="renderCustomersTable()" />
        </div>
      </div>

      <div class="products-card" style="margin-top:20px;">
        <div class="table-wrap">
          <table class="products-table">
            <thead>
              <tr>
                <th>اسم العميل</th>
                <th>رقم الهاتف</th>
                <th>ملاحظات</th>
                <th>حالة الحساب</th>
                <th>الرصيد المستحق</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody id="customersTableBody"></tbody>
          </table>
        </div>
      </div>

      <div id="modalRoot"></div>
    </div>
  `;

  renderCustomersTable();
}else if (tabName === "cashier") {
  box.innerHTML = `
    <div class="reports-grid stats-3">
      ${reportCard("عدد الكاشيرية", stats.cashierCount)}
      ${reportCard("عدد الفواتير", stats.invoicesCount)}
      ${reportCard("إجمالي المبيعات", money(stats.netSales))}
    </div>

    <div class="report-panel">
      <div class="panel-title">الكاشير</div>
      <div class="reports-grid stats-2">
        ${reportCard("متوسط الفاتورة", money(stats.avgInvoice))}
        ${reportCard("صافي الربح", money(stats.netProfit), stats.netProfit >= 0 ? "profit-card" : "loss-card")}
      </div>
    </div>
  `;
}
else if (tabName === "inventory") {
  box.innerHTML = `
    <div class="reports-grid stats-3">
      ${reportCard("عدد المنتجات", stats.productsCount)}
      ${reportCard("مخزون منخفض", stats.lowStockCount, stats.lowStockCount > 0 ? "loss-card" : "profit-card")}
      ${reportCard("قيمة المخزون الحالي", money(stats.stockValue))}
    </div>

    <div class="report-panel">
      <div class="panel-title">المخزون</div>

      <div class="table-wrap">
        <table class="products-table">
          <thead>
            <tr>
              <th>المنتج</th>
              <th>الفئة</th>
              <th>الوحدة</th>
              <th>المخزون</th>
              <th>سعر البيع</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${
              productsData.length
                ? productsData.map((p) => `
                  <tr>
                    <td>${escapeHtml(p.name)}</td>
                    <td>${escapeHtml(p.category)}</td>
                    <td>${escapeHtml(p.saleType)}</td>
                    <td>${num(p.stock)}</td>
                    <td>${num(p.price).toFixed(2)}</td>
                    <td>
                      <span class="${num(p.stock) <= num(p.alertLimit) ? "stock-alert" : "stock-ok"}">
                        ${num(p.stock) <= num(p.alertLimit) ? "منخفض" : "جيد"}
                      </span>
                    </td>
                  </tr>
                `).join("")
                : `<tr><td colspan="6" class="empty-row">لا توجد منتجات</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}


else if (tabName === "expenses") {
  const totalExpenses = expensesData.reduce((sum, e) => sum + num(e.amount), 0);

  box.innerHTML = `
    <div class="expenses-page">
      <div class="report-panel" style="background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;border:none;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;">
          <div style="display:flex;flex-direction:column;gap:12px;">
            <button class="blue-btn" style="background:#fff;color:#dc2626;" onclick="openExpenseModal()">+ إضافة مصروف</button>
            <button class="secondary-full-btn" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.35);" onclick="exportExpensesCSV()">تصدير</button>
          </div>

          <div style="text-align:right;">
            <div style="font-size:22px;font-weight:700;">إجمالي المصروفات</div>
            <div style="font-size:48px;font-weight:800;margin-top:10px;">${money(totalExpenses)}</div>
            <div style="opacity:.9;margin-top:8px;">${expensesData.length} مصروف مسجل</div>
          </div>
        </div>
      </div>

      <div class="products-card" style="margin-top:20px;">
        <div class="search-row supplier-search-row">
          <input id="expenseSearch" type="text" placeholder="بحث بعنوان المصروف أو التصنيف..." oninput="renderExpensesTable()" />
        </div>
      </div>

      <div class="products-card" style="margin-top:20px;">
        <div class="table-wrap">
          <table class="products-table">
            <thead>
              <tr>
                <th>المصروف</th>
                <th>التصنيف</th>
                <th>الكاشير</th>
                <th>التاريخ</th>
                <th>المبلغ</th>
                <th>ملاحظات</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody id="expensesTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  renderExpensesTable();
}
  else if (tabName === "returns") {
  const totalReturns = returnsData.reduce((sum, r) => sum + num(r.total), 0);

  box.innerHTML = `
    <div class="customers-page">

      <div class="orange-card">
        <div>
          <button class="white-btn" onclick="openReturnModal()">
            + تسجيل مرتجع
          </button>
        </div>

        <div style="text-align:right;">
          <div style="font-size:16px;">إجمالي المرتجعات</div>
          <div style="font-size:42px;font-weight:800;">${money(totalReturns)}</div>
          <div style="font-size:14px;">${returnsData.length} عملية مرتجع</div>
        </div>
      </div>

      <div class="products-card" style="margin-top:20px;">
        <div class="table-wrap">
          <table class="products-table">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>الكمية</th>
                <th>سعر الوحدة</th>
                <th>الإجمالي</th>
                <th>سبب المرتجع</th>
                <th>التاريخ</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody id="returnsTableBody"></tbody>
          </table>
        </div>
      </div>

      <div id="modalRoot"></div>
    </div>
  `;

  renderReturnsTable();
}
} 

async function loadAllData() {
  await Promise.all([
    loadCategoriesFromDB(),
    loadProductsFromDB(),
    loadSuppliersFromDB(),
    loadCustomersFromDB(),
    loadSettingsFromDB(),
    loadExpensesFromDB(),
    loadReturnsFromDB(),
    loadInvoicesFromDB(),
     loadUsersFromDB()
  ]);
}
function toggleLoginPassword() {
  const passwordInput = document.getElementById("loginPassword");
  const toggleText = document.getElementById("togglePasswordText");

  if (!passwordInput || !toggleText) return;

  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    toggleText.textContent = "إخفاء";
  } else {
    passwordInput.type = "password";
    toggleText.textContent = "إظهار";
  }
}
function renderSplashScreen() {
  const appRoot = document.getElementById("app");

  appRoot.innerHTML = `
    <div class="splash-screen">
      
      <div class="splash-content">
        <img src="logo.png" class="splash-logo" />

        <h1>Ox Store</h1>
        <p>نظام ذكي لإدارة المبيعات والمخزون والعملاء</p>

        <div class="splash-loader">
          <div class="splash-bar"></div>
        </div>

        <div class="splash-text">جاري تهيئة النظام...</div>
      </div>

    </div>
  `;
}
function renderLoginScreen() {
  const appRoot = document.getElementById("app");
  if (!appRoot) return;

  appRoot.innerHTML = `
    <div class="login-page">
      <div class="login-bg-shape login-bg-shape-1"></div>
      <div class="login-bg-shape login-bg-shape-2"></div>
      <div class="login-grid"></div>

      <div class="login-shell">
        <div class="login-brand-side">
          <div class="right-logo">
          <img src="logo.png" />
          </div>
          <p>نظام ذكي لإدارة المبيعات والفواتير والمخزون باحترافية وسرعة</p>
      <div class="login-feature-list">
      <div class="login-feature-item">⚡️ سرعة في الاستخدام</div>
      <div class="login-feature-item">📦 إدارة مخزون دقيقة</div>
      <div class="login-feature-item">🧾 فواتير وتقارير جاهزة</div>
      </div>
        </div>

        <div class="login-card">
         <div class="login-card-top" style="
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  text-align:center;
  gap:12px;
  position:relative;
  z-index:10;
">
  <div class="login-logo">
    <img src="logo.png" alt="logo" />
  </div>

  <div style="text-align:center;">
    <h2 style="
      color:#ffffff !important;
      font-size:48px;
      font-weight:900;
      margin:0;
      line-height:1.2;
      text-shadow:0 4px 18px rgba(0,0,0,0.35);
      display:block;
      opacity:1;
      visibility:visible;
    ">
      تسجيل الدخول
    </h2>

    <p style="
      color:#dbeafe !important;
      font-size:18px;
      margin:10px 0 0;
      font-weight:600;
    ">
      أدخل بياناتك للمتابعة إلى لوحة النظام
    </p>
  </div>
</div>
          <div class="login-form">
            <div class="login-field">
              <label>اسم المستخدم</label>
              <div class="login-input-wrap">
                <span class="login-input-icon">👤</span>
                <input
                  id="loginUsername"
                  type="text"
                  class="login-input"
                  placeholder="أدخل اسم المستخدم"
                  value=""
                />
              </div>
            </div>
<div class="login-field">
  <label>كلمة المرور</label>
  <div class="login-input-wrap">
    <span class="login-input-icon">🔒</span>
    <input
      id="loginPassword"
      type="password"
      class="login-input"
      placeholder="أدخل كلمة المرور"
      value=""
    />
    <button type="button" class="toggle-password-btn" onclick="toggleLoginPassword()">
      <span id="togglePasswordText">إظهار</span>
    </button>
  </div>
</div>
<div class="login-hint">
  <span class="hint-text">سيطر على مبيعاتك وارتقِ بأعمالك📊🔥</span>
</div>
<button id="loginBtn" class="login-btn" onclick="handleLogin()">
تسجيل الدخول
</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function handleLogin() {
  const btn = document.getElementById("loginBtn");

  const usernameInput = document.getElementById("loginUsername");
  const passwordInput = document.getElementById("loginPassword");

  const username = usernameInput?.value.trim() || "";
  const password = passwordInput?.value.trim() || "";

  if (!username || !password) {
    alert("أدخل اسم المستخدم وكلمة المرور");
    return;
  }

  btn.disabled = true;
  btn.innerText = "جاري تسجيل الدخول...";

  try {
    const user = await window.api.auth.login({ username, password });

    if (!user) {
      alert("بيانات الدخول غير صحيحة");
      btn.disabled = false;
      btn.innerText = "تسجيل الدخول";
      return;
    }

    currentUser = user;

    if (typeof loadAllData === "function") {
      await loadAllData();
    }

    setTimeout(() => {
      renderDashboard();
    }, 500);

  } catch (error) {
    console.error("خطأ تسجيل الدخول:", error);
    alert("صار خطأ أثناء تسجيل الدخول");

    btn.disabled = false;
    btn.innerText = "تسجيل الدخول";
  }
}

  renderLoginScreen();

function renderUsersTable() {
  const body = document.getElementById("usersTableBody");
  if (!body) return;

  body.innerHTML = usersData.length
    ? usersData.map((user) => `
      <tr>
        <td>${escapeHtml(user.fullName)}</td>
        <td>${escapeHtml(user.username)}</td>
        <td>${escapeHtml(user.role === "admin" ? "أدمن" : "كاشير")}</td>
        <td>${user.isActive ? "مفعل" : "موقوف"}</td>
        <td>
          <div class="actions-row">
            <button class="icon-btn blue" onclick="openUserModal(${user.id})">✏️</button>
            ${user.username !== "admin" ? `<button class="icon-btn red" onclick="deleteUser(${user.id})">🗑</button>` : ""}
          </div>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="5" class="empty-row">لا يوجد مستخدمون</td></tr>`;
}


function openUserModal(userId = null) {
  const user = userId ? usersData.find(u => Number(u.id) === Number(userId)) : null;

  openModal(`
    <div class="modal-header">
      <h3>${user ? "تعديل مستخدم" : "إضافة مستخدم"}</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <input type="hidden" id="userId" value="${user?.id || ""}" />

      <label>الاسم الكامل</label>
      <input id="userFullName" class="modal-input" value="${user?.fullName || ""}" />

      <label>اسم المستخدم</label>
      <input id="userUsername" class="modal-input" value="${user?.username || ""}" />

      <label>كلمة المرور</label>
      <input id="userPassword" class="modal-input" value="" placeholder="${user ? "اتركها فارغة إن لم تتغير" : ""}" />

      <label>الدور</label>
      <select id="userRole" class="modal-input">
        <option value="admin" ${user?.role === "admin" ? "selected" : ""}>أدمن</option>
        <option value="cashier" ${user?.role === "cashier" ? "selected" : ""}>كاشير</option>
      </select>

      <label style="display:flex;align-items:center;gap:10px;margin-top:10px;">
        <input id="userIsActive" type="checkbox" ${user?.isActive ?? true ? "checked" : ""} />
        مفعل
      </label>

      <button class="primary-full-btn" onclick="saveUser()">حفظ</button>
    </div>
  `, "small");
}

async function saveUser() {
  const id = Number(document.getElementById("userId")?.value || 0);
  const fullName = document.getElementById("userFullName")?.value.trim() || "";
  const username = document.getElementById("userUsername")?.value.trim() || "";
  const passwordInput = document.getElementById("userPassword")?.value.trim() || "";
  const role = document.getElementById("userRole")?.value || "cashier";
  const isActive = document.getElementById("userIsActive")?.checked ? true : false;

  if (!fullName || !username) {
    alert("أدخل الاسم واسم المستخدم");
    return;
  }

  try {
    if (id) {
      const oldUser = usersData.find(u => Number(u.id) === id);
      await window.api.users.update({
        id,
        fullName,
        username,
        password: passwordInput || oldUser?.password || "1234",
        role,
        isActive
      });
    } else {
      if (!passwordInput) {
        alert("أدخل كلمة المرور");
        return;
      }

      await window.api.users.add({
        fullName,
        username,
        password: passwordInput,
        role,
        isActive
      });
    }

    await loadUsersFromDB();
    closeModal();
    renderUsersTable();
  } catch (error) {
    console.error("خطأ حفظ المستخدم:", error);
    alert("صار خطأ أثناء حفظ المستخدم");
  }
}
async function createBackup() {
  try {
    const result = await window.api.backup.create();
    alert(result.message);
  } catch (error) {
    console.error("خطأ النسخ الاحتياطي:", error);
    alert("صار خطأ أثناء إنشاء النسخة الاحتياطية");
  }
}

async function restoreBackup() {
  const ok = confirm("استعادة النسخة الاحتياطية ستستبدل البيانات الحالية. هل أنت متأكد؟");
  if (!ok) return;

  try {
    const result = await window.api.backup.restore();
    alert(result.message);

    if (result.success) {
      location.reload();
    }
  } catch (error) {
    console.error("خطأ استعادة النسخة:", error);
    alert("صار خطأ أثناء استعادة النسخة الاحتياطية");
  }
}


async function deleteUser(userId) {
  if (!confirm("هل تريد حذف هذا المستخدم؟")) return;

  try {
    await window.api.users.remove(userId);
    await loadUsersFromDB();
    renderUsersTable();
  } catch (error) {
    console.error("خطأ حذف المستخدم:", error);
    alert(error.message || "صار خطأ أثناء حذف المستخدم");
  }
}

function renderInvoicesTable() {
  const body = document.getElementById("invoicesTableBody");
  const search = document.getElementById("invoiceSearch");
  if (!body) return;

  const q = (search?.value || "").trim().toLowerCase();

  const filtered = invoicesData.filter((invoice) =>
    String(invoice.id).includes(q) ||
    (invoice.customerName || "").toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="9" class="empty-row">لا توجد فواتير</td>
      </tr>
    `;
    return;
  }body.innerHTML = filtered.map((invoice) => `
  <tr>
    <td><strong>#${invoice.id}</strong></td>
    <td>${escapeHtml(invoice.customerName)}</td>
    <td>${escapeHtml(invoice.paymentMethod)}</td>
    <td>${money(invoice.net)}</td>
    <td>${money(invoice.paid)}</td>
    <td>${money(invoice.rest)}</td>
    <td style="color:${num(invoice.profit) >= 0 ? '#16a34a' : '#dc2626'};font-weight:700;">
      ${money(invoice.profit)}
    </td>
    <td>${escapeHtml(invoice.cashierName)}</td>
    <td>${escapeHtml(formatDateOnly(invoice.createdAt))}</td>
    <td>
      <div class="actions-row">
        <button class="icon-btn blue" onclick="viewInvoiceDetails(${invoice.id})" title="عرض">👁</button>
        <button class="icon-btn orange" onclick="openInvoiceReturnModal(${invoice.id})" title="مرتجع">↩️</button>
        </div>
    </td>
  </tr>
`).join("");

}
async function openInvoiceReturnModal(invoiceId) {
  try {
    console.log("فتح مرتجع للفاتورة:", invoiceId);
    console.log("API invoices:", window.api?.invoices);

    if (!window.api?.invoices?.getById) {
      alert("getById غير موجود في preload");
      return;
    }

    const invoice = await window.api.invoices.getById(invoiceId);
    console.log("invoice data:", invoice);

    if (!invoice) {
      alert("الفاتورة غير موجودة");
      return;
    }

    if (!Array.isArray(invoice.items)) {
      alert("عناصر الفاتورة غير موجودة");
      return;
    }

    openModal(`
      <div class="modal-header">
        <h3>تسجيل مرتجع - فاتورة #${invoice.id}</h3>
        <button class="close-btn" onclick="closeModal()">✕</button>
      </div>

      <div class="modal-body">
        <input type="hidden" id="returnInvoiceId" value="${invoice.id}" />

        <div class="products-card" style="margin-bottom:16px;">
          ${invoice.items.map((item, index) => {
            const soldQty = num(item.qty);
            const returnedQty = num(item.returnedQty || 0);
            const availableQty = Math.max(soldQty - returnedQty, 0);

            return `
              <div style="border:1px solid #e5e7eb;border-radius:14px;padding:12px;margin-bottom:12px;">
                <div style="font-weight:800;margin-bottom:8px;">
                  ${escapeHtml(item.name || "")}
                </div>

                <div style="color:#64748b;margin-bottom:8px;">
                  مباع: ${soldQty} | مرتجع سابق: ${returnedQty} | المتاح: ${availableQty}
                </div>

                <input type="hidden" id="returnProductId_${index}" value="${num(item.productId)}">
                <input type="hidden" id="returnProductName_${index}" value="${escapeHtml(item.name || "")}">
                <input type="hidden" id="returnProductPrice_${index}" value="${num(item.price)}">
                <input type="hidden" id="returnProductCost_${index}" value="${num(item.cost || 0)}">
                <input type="hidden" id="returnMaxQty_${index}" value="${availableQty}">

                ${
                  availableQty > 0
                    ? `
                      <label>كمية المرتجع</label>
                      <input
                        id="returnQty_${index}"
                        type="number"
                        min="0"
                        max="${availableQty}"
                        value="0"
                        class="modal-input"
                      />

                      <label>سبب المرتجع</label>
                      <input
                        id="returnReason_${index}"
                        class="modal-input"
                        placeholder="اختياري"
                      />
                    `
                    : `
                      <div style="padding:10px 12px;background:#f1f5f9;border-radius:12px;color:#64748b;font-weight:700;">
                        تم إرجاع كامل الكمية لهذا المنتج
                      </div>

                      <input type="hidden" id="returnQty_${index}" value="0" />
                      <input type="hidden" id="returnReason_${index}" value="" />
                    `
                }
              </div>
            `;
          }).join("")}
        </div>

        <input type="hidden" id="returnItemsCount" value="${invoice.items.length}" />

        <button class="primary-full-btn" onclick="saveInvoiceReturn()">تأكيد المرتجع</button>
      </div>
    `, "medium");

  } catch (error) {
    console.error("خطأ فتح نافذة المرتجع:", error);
    alert("تعذر فتح نافذة المرتجعات");
  }
}
async function saveInvoiceReturn() {
  const invoiceId = Number(document.getElementById("returnInvoiceId")?.value || 0);
  const count = Number(document.getElementById("returnItemsCount")?.value || 0);

  const items = [];

  for (let i = 0; i < count; i++) {
    const productId = Number(document.getElementById(`returnProductId_${i}`)?.value || 0);
    const name = document.getElementById(`returnProductName_${i}`)?.value || "";
    const price = Number(document.getElementById(`returnProductPrice_${i}`)?.value || 0);
    const maxQty = Number(document.getElementById(`returnMaxQty_${i}`)?.value || 0);
    const qty = Number(document.getElementById(`returnQty_${i}`)?.value || 0);
    const reason = document.getElementById(`returnReason_${i}`)?.value || "";

    if (qty > 0) {
      if (qty > maxQty) {
  alert(`الحد الأقصى المسموح للمرتجع للمنتج "${name}" هو ${maxQty}`);
  return;
}
if (qty < 0) {
  alert(`كمية المرتجع غير صحيحة للمنتج: ${name}`);
  return;
}
      const cost = Number(document.getElementById(`returnProductCost_${i}`)?.value || 0);
      items.push({
        productId,
        name,
        price,
        cost,
        qty,
        reason
      });
    }
  }

  if (items.length === 0) {
    alert("حدد على الأقل منتج واحد للمرتجع");
    return;
  }

  try {
    await window.api.invoices.returnItems({
      invoiceId,
      items
    });

    await loadProductsFromDB();
    await loadReturnsFromDB();
    await loadInvoicesFromDB();

    closeModal();
    alert("تم تسجيل المرتجع بنجاح");

    if (typeof renderReturnsTable === "function") {
      renderReturnsTable();
    }
  } catch (error) {
    console.error("خطأ حفظ المرتجع:", error);
    alert("صار خطأ أثناء حفظ المرتجع");
  }
}
async function viewInvoiceDetails(invoiceId) {
  try {
    if (!hasDB() || !window.api.invoices?.getItems) {
      alert("عرض تفاصيل الفاتورة غير متوفر");
      return;
    }

    const invoice = invoicesData.find((i) => Number(i.id) === Number(invoiceId));
    if (!invoice) {
      alert("الفاتورة غير موجودة");
      return;
    }

    const items = await window.api.invoices.getItems(invoiceId);

    openModal(`
      <div class="modal-header">
        <h3>تفاصيل الفاتورة #${invoice.id}</h3>
        <button class="close-btn" onclick="closeModal()">✕</button>
      </div>

      <div class="modal-body">
        <div class="details-box">
          <p><strong>العميل:</strong> ${escapeHtml(invoice.customerName)}</p>
          <p><strong>طريقة الدفع:</strong> ${escapeHtml(invoice.paymentMethod)}</p>
          <p><strong>الكاشير:</strong> ${escapeHtml(invoice.cashierName)}</p>
          <p><strong>التاريخ:</strong> ${escapeHtml(formatDateOnly(invoice.createdAt))}</p>
        </div>

        <div class="table-wrap" style="margin-top:16px;">
          <table class="products-table">
            <thead>
              <tr>
                <th>الصنف</th>
                <th>الكمية</th>
                <th>سعر الوحدة</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${
                safeArray(items).length
                  ? safeArray(items).map((item) => `
                    <tr>
                      <td>${escapeHtml(item.product_name || "")}</td>
                      <td>${num(item.quantity)}</td>
                      <td>${money(item.unit_price)}</td>
                      <td>${money(item.line_total)}</td>
                    </tr>
                  `).join("")
                  : `<tr><td colspan="4" class="empty-row">لا توجد أصناف</td></tr>`
              }
            </tbody>
          </table>
        </div>

        <div class="totals" style="margin-top:20px;">
          <div class="total-row"><span>المجموع الفرعي</span><span>${money(invoice.subtotal)}</span></div>
          <div class="total-row"><span>الخصم</span><span>${money(invoice.discount)}</span></div>
          <div class="total-row net-total"><span>الصافي</span><span>${money(invoice.net)}</span></div>
          <div class="total-row"><span>المدفوع</span><span>${money(invoice.paid)}</span></div>
          <div class="total-row"><span>الباقي</span><span>${money(invoice.rest)}</span></div>
        </div>
      </div>
    `, "medium");
  } catch (error) {
    console.error("خطأ عرض تفاصيل الفاتورة:", error);
    alert("تعذر عرض تفاصيل الفاتورة");
  }
}
function renderExpensesTable() {
  const body = document.getElementById("expensesTableBody");
  const search = document.getElementById("expenseSearch");
  if (!body) return;

  const q = (search?.value || "").trim().toLowerCase();

  const filtered = expensesData.filter((e) =>
    (e.title || "").toLowerCase().includes(q) ||
    (e.category || "").toLowerCase().includes(q) ||
    (e.notes || "").toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty-row">لا توجد مصروفات</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = filtered.map((expense) => `
    <tr>
      <td><strong>${escapeHtml(expense.title)}</strong></td>
      <td>${escapeHtml(expense.category || "عام")}</td>
      <td>${escapeHtml(expense.cashier || "admin")}</td>
      <td>${escapeHtml(formatDateOnly(expense.date))}</td>
      <td style="color:#dc2626;font-weight:700;">${money(expense.amount)}</td>
      <td>${escapeHtml(expense.notes || "-")}</td>
      <td>
        <div class="actions-row">
          <button class="icon-btn blue" onclick="openExpenseModal(${Number(expense.id)})" title="تعديل">✏️</button>
          <button class="icon-btn red" onclick="deleteExpense(${Number(expense.id)})" title="حذف">🗑</button>
        </div>
      </td>
    </tr>
  `).join("");
}
function formatDateOnly(value) {
  if (!value) return "-";

  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("ar-EG");
  } catch {
    return String(value);
  }
}
function openExpenseModal(expenseId = null) {
  const numericId = expenseId !== null ? Number(expenseId) : null;

  const expense = numericId !== null
    ? expensesData.find((e) => Number(e.id) === numericId)
    : {
        title: "",
        amount: 0,
        category: "عام",
        notes: ""
      };

  openModal(`
    <div class="modal-header">
      <h3>${numericId !== null ? "تعديل مصروف" : "إضافة مصروف جديد"}</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <input id="editingExpenseId" type="hidden" value="${numericId ?? ""}" />

      <div class="form-grid">
        <div>
          <label>عنوان المصروف</label>
          <input id="expenseTitle" class="modal-input" placeholder="مثل: إيجار المحل" value="${escapeHtml(expense?.title || "")}" />
        </div>

        <div>
          <label>المبلغ</label>
          <input id="expenseAmount" type="number" class="modal-input" value="${num(expense?.amount)}" />
        </div>

        <div>
          <label>التصنيف</label>
          <select id="expenseCategory" class="modal-input">
            <option value="عام" ${(expense?.category || "عام") === "عام" ? "selected" : ""}>عام</option>
            <option value="إيجار" ${expense?.category === "إيجار" ? "selected" : ""}>إيجار</option>
            <option value="كهرباء ومياه" ${expense?.category === "كهرباء ومياه" ? "selected" : ""}>كهرباء ومياه</option>
            <option value="رواتب" ${expense?.category === "رواتب" ? "selected" : ""}>رواتب</option>
            <option value="صيانة" ${expense?.category === "صيانة" ? "selected" : ""}>صيانة</option>
            <option value="مواد تشغيل" ${expense?.category === "مواد تشغيل" ? "selected" : ""}>مواد تشغيل</option>
            <option value="نقل" ${expense?.category === "نقل" ? "selected" : ""}>نقل</option>
            <option value="أخرى" ${expense?.category === "أخرى" ? "selected" : ""}>أخرى</option>
          </select>
        </div>

        <div>
          <label>ملاحظات</label>
          <input id="expenseNotes" class="modal-input" placeholder="اختياري" value="${escapeHtml(expense?.notes || "")}" />
        </div>
      </div>

      <button class="primary-full-btn" onclick="saveExpense()">حفظ</button>
    </div>
  `, "medium");
}
async function saveExpense() {
  const expenseIdValue = document.getElementById("editingExpenseId")?.value || "";
  const expenseId = expenseIdValue !== "" ? Number(expenseIdValue) : null;

  const title = document.getElementById("expenseTitle")?.value.trim() || "";
  const amount = parseFloat(document.getElementById("expenseAmount")?.value || "0") || 0;
  const category = document.getElementById("expenseCategory")?.value || "عام";
  const notes = document.getElementById("expenseNotes")?.value.trim() || "";

  if (!title || amount <= 0) {
    alert("عنوان المصروف والمبلغ الصحيح مطلوبان");
    return;
  }

  try {
    if (!hasDB() || !window.api.expenses) {
      alert("ربط المصروفات غير متوفر");
      return;
    }

    const payload = {
      title,
      amount,
      category,
      cashier: "admin",
      notes
    };

    if (expenseId !== null && window.api.expenses.update) {
      await window.api.expenses.update({
        id: expenseId,
        ...payload
      });
    } else if (window.api.expenses.add) {
      await window.api.expenses.add(payload);
    }

    await loadExpensesFromDB();
    closeModal();
    renderReportTab("expenses");
  } catch (error) {
    console.error("خطأ حفظ المصروف:", error);
    alert("صار خطأ أثناء حفظ المصروف");
  }
}
async function deleteExpense(expenseId) {
  const expense = expensesData.find((e) => Number(e.id) === Number(expenseId));
  if (!expense) return;

  if (!confirm(`حذف المصروف: ${expense.title} ؟`)) return;

  try {
    if (!hasDB() || !window.api.expenses?.remove) {
      alert("حذف المصروف غير متوفر");
      return;
    }

    await window.api.expenses.remove(expenseId);
    await loadExpensesFromDB();
    renderReportTab("expenses");
  } catch (error) {
    console.error("خطأ حذف المصروف:", error);
    alert("صار خطأ أثناء حذف المصروف");
  }
}

function exportExpensesCSV() {
  const headers = ["title", "category", "cashier", "date", "amount", "notes"];

  const rows = expensesData.map((e) => [
    e.title || "",
    e.category || "",
    e.cashier || "",
    formatDateOnly(e.date),
    e.amount || 0,
    e.notes || "",
  ]);

  const csv = [
    headers.join(";"),
    ...rows.map((r) =>
      r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")
    )
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "expenses.csv";
  a.click();

  URL.revokeObjectURL(url);
}


let returnsData = [];
let totalProfitValue = 0;
async function loadReturnsFromDB() {
  if (!hasDB() || !window.api.returns?.getAll) {
    returnsData = [];
    return;
  }

  try {
    const rows = await window.api.returns.getAll();

    returnsData = rows.map(r => ({
      id: Number(r.id),
      productId: Number(r.product_id),
      productName: r.product_name || "",
      qty: num(r.qty),
      unitPrice: num(r.unit_price),
      total: num(r.total),
      reason: r.reason || "",
      cashier: r.cashier || "admin",
      date: r.created_at || ""
    }));
  } catch (e) {
    console.error("خطأ تحميل المرتجعات", e);
    returnsData = [];
  }
}
function openReturnModal(returnId = null) {
  const numericId = returnId !== null ? Number(returnId) : null;

  const row = numericId !== null
    ? returnsData.find((r) => Number(r.id) === numericId)
    : null;

  openModal(`
    <div class="modal-header">
      <h3>${numericId !== null ? "تعديل مرتجع" : "تسجيل مرتجع جديد"}</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <input id="editingReturnId" type="hidden" value="${numericId ?? ""}" />

      <div class="form-grid">
        <div>
          <label>المنتج</label>
          <select id="returnProduct" class="modal-input">
            <option value="">اختر منتج</option>
            ${productsData.map(p => `
              <option 
                value="${p.id}" 
                data-price="${p.price}"
                ${row && String(p.id) === String(row.productId) ? "selected" : ""}
              >
                ${escapeHtml(p.name)}
              </option>
            `).join("")}
          </select>
        </div>

        <div>
          <label>الكمية</label>
          <input id="returnQty" type="number" class="modal-input" value="${row ? num(row.qty) : 1}" />
        </div>

        <div>
          <label>سعر الوحدة</label>
          <input id="returnPrice" type="number" class="modal-input" value="${row ? num(row.unitPrice) : 0}" />
        </div>

        <div>
          <label>سبب المرتجع</label>
          <input id="returnReason" class="modal-input" placeholder="اختياري" value="${escapeHtml(row?.reason || "")}" />
        </div>
      </div>

      <button class="primary-full-btn" onclick="saveReturn()">
        ${numericId !== null ? "حفظ التعديل" : "حفظ"}
      </button>
    </div>
  `, "medium");

  setTimeout(() => {
    const productSelect = document.getElementById("returnProduct");
    const priceInput = document.getElementById("returnPrice");

    if (productSelect && priceInput && !row) {
      productSelect.addEventListener("change", () => {
        const selectedOption = productSelect.options[productSelect.selectedIndex];
        const productPrice = selectedOption?.dataset?.price || "0";
        priceInput.value = productPrice;
      });
    }
  }, 0);
}
async function saveReturn() {
  const returnIdValue = document.getElementById("editingReturnId")?.value || "";
  const returnId = returnIdValue !== "" ? Number(returnIdValue) : null;

  const productId = document.getElementById("returnProduct")?.value || "";
  const qty = Number(document.getElementById("returnQty")?.value || 0);
  const price = Number(document.getElementById("returnPrice")?.value || 0);
  const reason = document.getElementById("returnReason")?.value || "";

  if (!productId || qty <= 0) {
    alert("اختر المنتج وأدخل كمية صحيحة");
    return;
  }

  const product = productsData.find(p => Number(p.id) === Number(productId));

  const payload = {
    productId: Number(productId),
    productName: product?.name || "",
    qty,
    unitPrice: price,
    total: qty * price,
    reason,
    cashier: "admin"
  };

  try {
    if (returnId !== null && window.api.returns?.update) {
      await window.api.returns.update({
        id: returnId,
        ...payload
      });
    } else {
      await window.api.returns.add(payload);
    }

    await loadReturnsFromDB();
    closeModal();
    renderReportTab("returns");
  } catch (error) {
    console.error("خطأ حفظ المرتجع:", error);
    alert("صار خطأ أثناء حفظ المرتجع");
  }
}
function renderReturnsTable() {
  const body = document.getElementById("returnsTableBody");
  if (!body) return;

  if (returnsData.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="7">لا يوجد مرتجعات</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = returnsData.map(r => `
    <tr>
      <td>${escapeHtml(r.productName)}</td>
      <td>${r.qty}</td>
      <td>${money(r.unitPrice)}</td>
      <td>${money(r.total)}</td>
      <td>${escapeHtml(r.reason || "-")}</td>
      <td>${r.date}</td>
      <td>
  <div class="actions-row">
    <button class="icon-btn blue" onclick="openReturnModal(${Number(r.id)})" title="تعديل">✏️</button>
    <button class="icon-btn red" onclick="deleteReturn(${Number(r.id)})" title="حذف">🗑</button>
  </div>
</td>
    </tr>
  `).join("");
}

async function deleteReturn(id) {
  if (!confirm("حذف المرتجع؟")) return;

  await window.api.returns.remove(id);

  await loadReturnsFromDB();
  renderReturnsTable();
}

/* =========================
   LOGIN
========================= */

if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    const username = usernameInput?.value.trim() || "";
    const password = passwordInput?.value.trim() || "";

    if (!username || !password) {
      alert("يرجى تعبئة جميع الحقول");
      return;
    }

    try {
      if (!hasDB()) {
        alert("لا يوجد اتصال مع قاعدة البيانات");
        return;
      }

      if (window.api.auth?.login) {
        const user = await window.api.auth.login(username, password);
        if (!user) {
          alert("بيانات الدخول غير صحيحة");
          return;
        }
      } else {
        if (!(username === "admin" && password === "1234")) {
          alert("بيانات الدخول غير صحيحة");
          return;
        }
      }

      await loadAllData();
      renderDashboard();
    } catch (error) {
  console.error("LOGIN ERROR:", error);
  alert("حدث خطأ أثناء تسجيل الدخول:\n" + (error?.message || error));
}
  });
}

if (passwordInput) {
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      loginBtn?.click();
    }
  });
}

if (usernameInput && passwordInput) {
  usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      passwordInput.focus();
    }
  });
}

/* =========================
   DASHBOARD
========================= */

function renderDashboard() {
  document.body.innerHTML = `
    <div class="dashboard">
      <aside class="sidebar">
        <div>
          <div class="logo">${escapeHtml(appSettings.storeName)}</div>
          <ul>
            <li class="nav active" data-page="home">🏠 الرئيسية</li>
            <li class="nav" data-page="pos">💰 الكاشير</li>
            <li class="nav" data-page="products">📦 المنتجات</li>
            <li class="nav" data-page="invoices">💸 الفواتير</li>
            <li class="nav" data-page="reports">📊 التقارير</li>
            <li class="nav" data-page="suppliers">👥 الموردين</li>
            <li class="nav" data-page="settings">⚙️ الإعدادات</li>
            ${hasPermission("users_manage") ? `
           <li class="nav" data-page="users">👤 المستخدمون</li>
           <li class="nav" data-page="about">❗️عن البرنامج</li>
           ` : ""}
          </ul>
        </div>
        <div class="sidebar-user" id="logout">تسجيل الخروج ↩️</div>
      </aside>

      <main class="main">
        <div class="topbar">
          <h2 id="pageTitle">لوحة التحكم</h2>
          <div class="user">👤 admin</div>
        </div>

        <div id="content"></div>
      </main>
    </div>
  `;

  setupNavigation();
  loadPage("home");

  const logoutBtn = document.getElementById("logout");
  if (logoutBtn) {
    logoutBtn.onclick = () => location.reload();
  }
}

/* =========================
   NAVIGATION
========================= */

function setupNavigation() {
  document.querySelectorAll(".nav").forEach((item) => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav").forEach((n) => n.classList.remove("active"));
      item.classList.add("active");
      loadPage(item.dataset.page);
    });
  });
}

/* =========================
   PAGES
========================= */

function loadPage(page) {
  const content = document.getElementById("content");
  const title = document.getElementById("pageTitle");

  if (!content || !title) return;
 else if (page === "home") {
  title.textContent = "لوحة التحكم";

  const lowStockProducts = productsData.filter((p) => num(p.stock) <= num(p.alertLimit));
  const stockValue = productsData.reduce((sum, p) => sum + num(p.stock) * num(p.cost), 0);
  const totalSales = invoicesData.reduce((sum, inv) => sum + num(inv.net), 0);
  const totalProfit = invoicesData.reduce((sum, inv) => sum + num(inv.profit), 0);
  const recentInvoices = [...invoicesData]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  content.innerHTML = `
    <div class="dashboard-clean-page">

      <div class="dashboard-clean-header">
        <h2>أهلاً بك في ${escapeHtml(appSettings.storeName)}</h2>
        <p>ملخص سريع لأهم أرقام المتجر اليوم</p>
      </div>

      <div class="dashboard-clean-stats">
        <div class="clean-stat-card">
          <span>إجمالي المبيعات</span>
          <strong>${money(totalSales)}</strong>
        </div>

        <div class="clean-stat-card">
          <span>إجمالي الربح</span>
          <strong>${money(totalProfit)}</strong>
        </div>

        <div class="clean-stat-card">
          <span>عدد المنتجات</span>
          <strong>${productsData.length}</strong>
        </div>

        <div class="clean-stat-card">
          <span>مخزون منخفض</span>
          <strong>${lowStockProducts.length}</strong>
        </div>
      </div>

      <div class="dashboard-clean-grid">
        <div class="clean-panel">
          <div class="clean-panel-head">
            <h3>آخر الفواتير</h3>
          </div>

          <div class="table-wrap">
            <table class="compact-table">
              <thead>
                <tr>
                  <th>رقم</th>
                  <th>العميل</th>
                  <th>الصافي</th>
                  <th>الربح</th>
                </tr>
              </thead>
              <tbody>
                ${
                  recentInvoices.length
                    ? recentInvoices.map((inv) => `
                      <tr>
                        <td><strong>#${inv.id}</strong></td>
                        <td>${escapeHtml(inv.customerName)}</td>
                        <td>${money(inv.net)}</td>
                        <td style="color:${num(inv.profit) >= 0 ? '#16a34a' : '#dc2626'};font-weight:800;">
                          ${money(inv.profit)}
                        </td>
                      </tr>
                    `).join("")
                    : `<tr><td colspan="4" class="empty-row">لا توجد فواتير بعد</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="clean-panel">
          <div class="clean-panel-head">
            <h3>تنبيهات المخزون</h3>
          </div>

          <div class="clean-alerts">
            ${
              lowStockProducts.length
                ? lowStockProducts.slice(0, 6).map((p) => `
                  <div class="clean-alert-item">
                    <div>
                      <strong>${escapeHtml(p.name)}</strong>
                      <small>${escapeHtml(p.category)}</small>
                    </div>
                    <span>${num(p.stock)}</span>
                  </div>
                `).join("")
                : `<div class="clean-empty">لا يوجد نقص في المخزون</div>`
            }
          </div>

         <div class="clean-bottom-box" style="background:#1e293b !important; color:white !important; border:1px solid #334155 !important; border-radius:16px !important; padding:16px !important;">
         <span style="color:#cbd5e1 !important;">قيمة المخزون</span>
         <strong style="color:white !important; background:transparent !important;">${money(stockValue)}</strong>
        </div>
        </div>
      </div>
    </div>
  `;
}
else if (page === "users") {
  if (!requirePermission("users_manage")) return;

  content.innerHTML = `
    <div style="width:100%; display:flex; justify-content:center; padding:20px; box-sizing:border-box;">
      <div style="width:95%; max-width:1200px;">
        
        <div class="products-modern-top" style="margin-bottom:20px;">
          <div>
            <h2>إدارة المستخدمين</h2>
            <p>إضافة وتعديل المستخدمين والصلاحيات</p>
          </div>

          <div class="products-modern-actions">
            <button class="btn-add" onclick="openUserModal()">إضافة مستخدم</button>
          </div>
        </div>

        <div class="products-table-box" style="width:100%; max-width:none; margin:0;">
          <div class="table-wrap" style="width:100%;">
            <table class="products-modern-table" style="width:100%;">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>اسم المستخدم</th>
                  <th>الدور</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody id="usersTableBody"></tbody>
            </table>
          </div>
        </div>

      </div>
    </div>

    <div id="modalRoot"></div>
  `;

  renderUsersTable();
}


  else if (page === "pos") {
    if (!requirePermission("pos")) return;
    title.textContent = "الكاشير";

   content.innerHTML = `
  <div class="pos-modern-page">

    <div class="pos-modern-cart">
      <div class="pos-cart-box">
        <div class="pos-panel-title">🛒 سلة المشتريات</div>
        <div class="pos-panel-subtitle">أدخل الباركود أو اختر منتجًا من القائمة</div>

        <input id="barcodeInput" class="pos-modern-input" placeholder="🔎 امسح الباركود هنا" />

        <input
          id="customer"
          class="pos-modern-input"
          placeholder="👤 اسم العميل"
          value="عميل نقدي"
        />

        <select id="paymentMethod" class="pos-modern-input">
          <option value="نقدي">نقدي</option>
          <option value="بطاقة">بطاقة</option>
          <option value="آجل">آجل</option>
        </select>

        <div id="cartItems" class="pos-cart-items"></div>

        <div class="pos-summary-card">
          <div class="pos-summary-row">
            <span>المجموع الفرعي</span>
            <strong id="subtotal">0.00</strong>
          </div>

          <div class="pos-summary-row pos-summary-input-row">
            <span>الخصم</span>
            <input id="discount" type="number" min="0" value="0" class="pos-summary-input" />
          </div>

          <div class="pos-summary-row">
            <span>الصافي</span>
            <strong id="net">0.00</strong>
          </div>

          <div class="pos-summary-row pos-summary-input-row">
            <span>المدفوع</span>
            <input id="paid" type="number" min="0" value="0" class="pos-summary-input" />
          </div>

          <div class="pos-summary-row">
            <span>الباقي</span>
            <strong id="rest">0.00</strong>
          </div>
        </div>

        <div class="pos-action-buttons">
          <button onclick="pay('print')" class="pos-btn pos-btn-green">💰 دفع وطباعة</button>
          <button onclick="pay('preview')" class="pos-btn pos-btn-blue">👁 دفع ومعاينة</button>
          <button onclick="pay('save')" class="pos-btn pos-btn-dark">💾 حفظ فقط</button>
        </div>
      </div>
    </div>

    <div class="pos-modern-products">
      <div class="pos-products-head">
        <div>
          <div class="pos-panel-title">المنتجات</div>
          <div class="pos-panel-subtitle">اختر منتجًا أو امسح الباركود</div>
        </div>
      </div>

      <div class="pos-products-grid">
        ${productsData.map((product) => `
          <div
            class="pos-product-card"
            data-id="${product.id}"
            data-name="${escapeHtml(product.name)}"
            data-price="${num(product.price)}"
          >
            <div class="pos-product-name">${escapeHtml(product.name)}</div>
            <div class="pos-product-price">${num(product.price).toFixed(2)}</div>
            <div class="pos-product-stock ${num(product.stock) <= num(product.alertLimit) ? "low" : ""}">
              المخزون: ${num(product.stock)}
            </div>
          </div>
        `).join("")}
      </div>
    </div>

  </div>
`;
    setupPOS();
  }
 
else if (page === "invoices") {

  title.textContent = "الفواتير";

  content.innerHTML = `
    <div class="customers-page">
      <div class="suppliers-header">
        <div class="suppliers-title">
          <h2>الفواتير المحفوظة</h2>
          <p>عرض جميع فواتير البيع المسجلة</p>
        </div>
      </div>

      <div class="suppliers-stats">
        <div class="supplier-stat-card blue-soft">
          <div class="supplier-stat-icon">🧾</div>
          <div class="supplier-stat-label">عدد الفواتير</div>
          <div class="supplier-stat-value">${invoicesData.length}</div>
          <div class="supplier-stat-sub blue-text">إجمالي الفواتير المحفوظة</div>
        </div>

        <div class="supplier-stat-card green-soft">
          <div class="supplier-stat-icon">💰</div>
          <div class="supplier-stat-label">إجمالي الصافي</div>
          <div class="supplier-stat-value">${money(invoicesData.reduce((sum, i) => sum + num(i.net), 0))}</div>
          <div class="supplier-stat-sub green-text">صافي الفواتير</div>
        </div>

        <div class="supplier-stat-card red-soft">
          <div class="supplier-stat-icon">⏳</div>
          <div class="supplier-stat-label">إجمالي المتبقي</div>
          <div class="supplier-stat-value red-text">${money(invoicesData.reduce((sum, i) => sum + num(i.rest), 0))}</div>
          <div class="supplier-stat-sub">مبالغ غير مدفوعة</div>
        </div>
      </div>

      <div class="products-card">
        <div class="search-row supplier-search-row">
          <input id="invoiceSearch" type="text" placeholder="بحث برقم الفاتورة أو العميل..." oninput="renderInvoicesTable()" />
        </div>
      </div>

      <div class="products-card">
        <div class="table-wrap">
          <table class="products-table">
            <thead>
              <tr>
                <th>رقم الفاتورة</th>
                <th>العميل</th>
                <th>الدفع</th>
                <th>الصافي</th>
                <th>المدفوع</th>
                <th>الباقي</th>
                <th>الربح</th>
                <th>الكاشير</th>
                <th>التاريخ</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody id="invoicesTableBody"></tbody>
          </table>
        </div>
      </div>

      <div id="modalRoot"></div>
    </div>
  `;

  renderInvoicesTable();
}
 else if (page === "products") {
  if (!requirePermission("products")) return;

  title.textContent = "إدارة المنتجات";

  content.innerHTML = `
    <div style="width:100%; display:flex; justify-content:stretch; padding:20px; box-sizing:border-box;">
      <div style="width:100%; max-width:none; display:flex; gap:20px; align-items:flex-start; box-sizing:border-box;">

        <div class="products-modern-sidebar" style="width:260px; flex:0 0 260px;">
          <div class="products-modern-card" style="width:100%;">
            <div class="products-modern-side-head">
              <h3>الفئات</h3>
              <button class="products-circle-add" onclick="openCategoryModal()">＋</button>
            </div>

            <div id="categoriesList" class="products-modern-categories"></div>
          </div>
        </div>

        <div class="products-modern-main" style="flex:1; min-width:0; width:calc(100% - 280px);">
          <div class="products-modern-top" style="margin-bottom:20px;">
            <div>
              <h2>إدارة المنتجات</h2>
              <p>إضافة وتعديل ومتابعة المنتجات والمخزون</p>
            </div>

            <div class="products-modern-actions">
              <button class="btn-export" onclick="exportProductsCSV()">تصدير CSV</button>

              <label class="btn-import products-file-label">
                استيراد CSV
                <input type="file" accept=".csv" onchange="importProductsCSV(event)" hidden>
              </label>

              <button class="btn-add" onclick="openProductModal()">إضافة منتج</button>
            </div>
          </div>

          <div class="products-modern-search-card" style="margin-bottom:20px; width:100%;">
            <div class="products-modern-search-row" style="width:100%;">
              <input
                id="productSearch"
                type="text"
                placeholder="ابحث بالاسم أو الباركود..."
                oninput="renderProductsTable()"
                style="width:100%; box-sizing:border-box;"
              />
            </div>
          </div>

          <div class="products-table-box" style="width:100%; max-width:none; margin:0; overflow:visible;">
            <div class="table-wrap" style="width:100%; overflow-x:auto; overflow-y:visible;">
              <table class="products-modern-table" style="width:100%; min-width:1100px; table-layout:auto;">
                <thead>
                  <tr>
                    <th>الباركود</th>
                    <th>الاسم</th>
                    <th>الفئة</th>
                    <th>نوع البيع</th>
                    <th>السعر</th>
                    <th>التكلفة</th>
                    <th>المخزون</th>
                    <th>الإجراءات</th>
                    <th>الصورة</th>
                  </tr>
                </thead>
                <tbody id="productsTableBody"></tbody>
              </table>
            </div>

            <div class="products-modern-footer">
              <span id="productsCount"></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="modalRoot"></div>
  `;

  renderProductsPage();
}

  else if (page === "suppliers") {
    title.textContent = "إدارة الموردين";

    content.innerHTML = `
      <div class="suppliers-page">
        <div class="suppliers-header">
          <button class="blue-btn" onclick="openSupplierModal()">+ مورد جديد</button>

          <div class="suppliers-title">
            <h2>إدارة الموردين</h2>
            <p>متابعة المشتريات والمدفوعات</p>
          </div>
        </div>

        <div class="suppliers-stats">
          <div class="supplier-stat-card green-soft">
            <div class="supplier-stat-icon">✅</div>
            <div class="supplier-stat-label">موردين مسددين</div>
            <div class="supplier-stat-value" id="paidSuppliersCount">0</div>
            <div class="supplier-stat-sub green-text">لا توجد مستحقات</div>
          </div>

          <div class="supplier-stat-card red-soft">
            <div class="supplier-stat-icon">⚠️</div>
            <div class="supplier-stat-label">المستحقات القائمة</div>
            <div class="supplier-stat-value red-text" id="suppliersDueAmount">0.00</div>
            <div class="supplier-stat-sub">${escapeHtml(appSettings.currency)}</div>
          </div>

          <div class="supplier-stat-card blue-soft">
            <div class="supplier-stat-icon">👥</div>
            <div class="supplier-stat-label">إجمالي الموردين</div>
            <div class="supplier-stat-value" id="suppliersCount">0</div>
            <div class="supplier-stat-sub blue-text"><span id="suppliersPendingCount">0</span> مستحق • <span id="suppliersPaidCount">0</span> مسدد</div>
          </div>
        </div>

        <div class="products-card">
          <div class="search-row supplier-search-row">
            <input id="supplierSearch" type="text" placeholder="بحث باسم المورد أو الهاتف..." oninput="renderSuppliersTable()" />
          </div>
        </div>

        <div class="products-card">
          <div class="table-wrap">
            <table class="products-table">
              <thead>
                <tr>
                  <th>اسم المورد</th>
                  <th>رقم الهاتف</th>
                  <th>الرصيد الابتدائي</th>
                  <th>الحالة</th>
                  <th>الملاحظات</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody id="suppliersTableBody"></tbody>
            </table>
          </div>
        </div>

        <div id="modalRoot"></div>
      </div>
    `;

    renderSuppliersPage();
  }
else if (page === "customers") {
  title.textContent = "العملاء والديون";

  const totalCustomers = customersData.length;
  const debtCustomers = customersData.filter((c) => c.status === "عليه فلوس" || num(c.dueBalance) > 0).length;
  const totalDebts = customersData.reduce((sum, c) => sum + num(c.dueBalance), 0);

  content.innerHTML = `
    <div class="customers-page">
      <div class="suppliers-header">
        <button class="blue-btn" onclick="openCustomerModal()">+ إضافة عميل</button>

        <div class="suppliers-title">
          <h2>العملاء والديون</h2>
          <p>إدارة العملاء والحسابات المستحقة</p>
        </div>
      </div>

      <div class="suppliers-stats">
        <div class="supplier-stat-card blue-soft">
          <div class="supplier-stat-icon">👥</div>
          <div class="supplier-stat-label">إجمالي العملاء</div>
          <div class="supplier-stat-value" id="customersTotalCount">${totalCustomers}</div>
          <div class="supplier-stat-sub blue-text">عدد العملاء المسجلين</div>
        </div>

        <div class="supplier-stat-card red-soft">
          <div class="supplier-stat-icon">⚠️</div>
          <div class="supplier-stat-label">عملاء عليهم فلوس</div>
          <div class="supplier-stat-value red-text" id="customersDebtCount">${debtCustomers}</div>
          <div class="supplier-stat-sub">غير مسددين</div>
        </div>

        <div class="supplier-stat-card green-soft">
          <div class="supplier-stat-icon">💰</div>
          <div class="supplier-stat-label">إجمالي الديون</div>
          <div class="supplier-stat-value" id="customersDebtsTotal">${money(totalDebts)}</div>
          <div class="supplier-stat-sub green-text">المبالغ المستحقة</div>
        </div>
      </div>

      <div class="products-card">
        <div class="search-row supplier-search-row">
          <input id="customerSearch" type="text" placeholder="بحث باسم العميل أو الهاتف..." oninput="renderCustomersTable()" />
        </div>
      </div>

      <div class="products-card">
        <div class="table-wrap">
          <table class="products-table">
            <thead>
              <tr>
                <th>العميل</th>
                <th>الهاتف</th>
                <th>إجمالي المشتريات</th>
                <th>فواتير غير مسددة</th>
                <th>الرصيد المستحق</th>
                <th>آخر عملية</th>
                <th>حالة الحساب</th>
                <th>ملاحظات</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody id="customersTableBody"></tbody>
          </table>
        </div>
      </div>

      <div id="modalRoot"></div>
    </div>
  `;

  renderCustomersTable();
}
  else if (page === "settings") {
    if (!requirePermission("settings")) return;
    title.textContent = "إعدادات النظام";

    content.innerHTML = `
      <div class="settings-page">
        <div class="settings-header">
          <div class="settings-title-box">
            <h2>إعدادات النظام</h2>
            <p>تخصيص وإدارة إعدادات ${escapeHtml(appSettings.storeName)}</p>
          </div>

          <button class="blue-btn" onclick="saveSettings()">حفظ الإعدادات</button>
        </div>
       <div class="about-actions">
      <button class="about-btn about-btn-blue" onclick="createBackup()">إنشاء نسخة احتياطية</button>
      <button class="about-btn about-btn-green" onclick="restoreBackup()">استعادة نسخة</button>
      </div>
        <div class="settings-card">
          <div class="settings-section-title">بيانات المتجر</div>

          <div class="form-grid">
            <div class="full-col">
              <label>اسم المتجر</label>
              <input id="storeName" class="modal-input" value="${escapeHtml(appSettings.storeName)}" />
            </div>

            <div>
              <label>رقم الهاتف</label>
              <input id="storePhone" class="modal-input" value="${escapeHtml(appSettings.storePhone)}" />
            </div>

            <div>
              <label>العملة</label>
              <select id="storeCurrency" class="modal-input">
                <option value="ليرة سورية" ${appSettings.currency === "ليرة سورية" ? "selected" : ""}>ليرة سورية</option>
                <option value="دولار" ${appSettings.currency === "دولار" ? "selected" : ""}>دولار</option>
              </select>
            </div>

            <div class="full-col">
              <label>العنوان</label>
              <input id="storeAddress" class="modal-input" value="${escapeHtml(appSettings.storeAddress)}" />
            </div>

            <div>
              <label>تفعيل الضريبة</label>
              <select id="taxEnabled" class="modal-input">
                <option value="false" ${!appSettings.taxEnabled ? "selected" : ""}>غير مفعلة</option>
                <option value="true" ${appSettings.taxEnabled ? "selected" : ""}>مفعلة</option>
              </select>
            </div>

            <div>
              <label>نسبة الضريبة</label>
              <input id="taxPercent" type="number" class="modal-input" value="${num(appSettings.taxPercent)}" />
            </div>

            <div>
              <label>نوع الباركود</label>
              <select id="barcodeType" class="modal-input">
                <option value="CODE128" ${appSettings.barcodeType === "CODE128" ? "selected" : ""}>CODE128</option>
                <option value="EAN13" ${appSettings.barcodeType === "EAN13" ? "selected" : ""}>EAN13</option>
                <option value="QR" ${appSettings.barcodeType === "QR" ? "selected" : ""}>QR</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  /* 👇 هون تحط التقارير */
else if (page === "reports") {
  if (!requirePermission("reports")) return;
  title.textContent = "التقارير";

  content.innerHTML = `
    <div class="reports-page">
      <div class="reports-header-card">
        <h2>التقارير</h2>
      </div>

      <div class="reports-tabs">
        <button class="report-tab active" data-report-tab="dashboard">لوحة التحكم</button>
        <button class="report-tab" data-report-tab="sales">تقارير المبيعات</button>
        <button class="report-tab" data-report-tab="payments">طرق الدفع</button>
        <button class="report-tab" data-report-tab="customers">العملاء والديون</button>
        <button class="report-tab" data-report-tab="cashier">الكاشير</button>
        <button class="report-tab" data-report-tab="inventory">المخزون</button>
        <button class="report-tab" data-report-tab="expenses">المصروفات</button>
        <button class="report-tab" data-report-tab="returns">المرتجعات</button>
      </div>

      <div id="reportsContent"></div>
      <div id="modalRoot"></div>
    </div>
  `;

  setupReports();
  renderReportTab("dashboard");
}
else if (page === "about") {
  title.textContent = "عن البرنامج";

  content.innerHTML = `
    <div class="about-container">

      <div class="about-header">
        <h1>OX STORE</h1>
        <p>نظام ذكي لإدارة المبيعات والفواتير والمخزون والعملاء</p>
        <span class="about-version">الإصدار 1.0.0</span>
      </div>

      <div class="about-row">
        <div class="about-card">
          <h3>الدعم الفني</h3>
          <p><strong>البريد الإلكتروني:</strong> oaziz5951@gmail.com</p>
          <p><strong>واتساب:</strong> 0995339401</p>
          <p><strong>ساعات الدعم:</strong> يومياً من 9 ص إلى 9 م</p>
          <p><strong>نوع الدعم:</strong> فني - تحديثات - تفعيل</p>

          <div class="about-actions">
            <button class="about-btn about-btn-blue">مراسلة الدعم</button>
            <button class="about-btn about-btn-green">واتساب</button>
          </div>
        </div>

        <div class="about-card">
          <h3>معلومات النظام</h3>
          <p><strong>المطور:</strong> عمر شعلان عبد العزيز</p>
          <p><strong>نوع النظام:</strong> OX STORE </p>
          <p><strong>الإصدار:</strong> 1.0.0</p>
          <p><strong>اللغة:</strong> العربية</p>
          <p><strong>وضع التشغيل:</strong> online</p>
          <p><strong>الترخيص:</strong> مرخص لجهاز واحد</p>
        </div>
      </div>

      <div class="about-card about-card-full about-card-warning">
        <h3>ملاحظات مهمة</h3>
        <ul class="about-list">
          <li>هذا النظام مخصص للاستخدام التجاري الداخلي.</li>
          <li>يمنع النسخ أو إعادة التوزيع بدون إذن.</li>
          <li>يوصى بإنشاء نسخة احتياطية بشكل دوري.</li>
          <li>التحديثات والصيانة تتم من خلال المطور فقط.</li>
        </ul>
      </div>

    </div>
  `;
}
}

/* =========================
   POS
========================= */
function setupPOS() {
  const products = document.querySelectorAll(".pos-product-card");
  const cartItems = document.getElementById("cartItems");
  const subtotalEl = document.getElementById("subtotal");
  const netEl = document.getElementById("net");
  const restEl = document.getElementById("rest");
  const discountInput = document.getElementById("discount");
  const paidInput = document.getElementById("paid");
  const barcodeInput = document.getElementById("barcodeInput");

  function playBeep() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(900, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.12);
  } catch (error) {
    console.error("خطأ الصوت:", error);
  }
}

  function calculateTotals() {
    const subtotal = parseFloat(subtotalEl?.textContent || "0") || 0;
    const discount = parseFloat(discountInput?.value || "0") || 0;
    const paid = parseFloat(paidInput?.value || "0") || 0;

    const net = Math.max(subtotal - discount, 0);
    const rest = Math.max(net - paid, 0);

    if (netEl) netEl.textContent = net.toFixed(2);
    if (restEl) restEl.textContent = rest.toFixed(2);
  }

  function addProductToCart(product) {
  const existing = cart.find((item) => Number(item.id) === Number(product.id));

  const currentQtyInCart = existing ? existing.qty : 0;

  // 🚨 تحقق من المخزون
  if (currentQtyInCart + 1 > num(product.stock)) {
    alert("⚠️ لا يوجد مخزون كافي");
    return;
  }

  if (existing) {
    existing.qty++;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: num(product.price),
      qty: 1
    });
  }

  renderCart();
}

  function renderCart() {
    if (!cartItems || !subtotalEl) return;

    cartItems.innerHTML = "";

    if (cart.length === 0) {
      cartItems.innerHTML = `<p style="text-align:center;color:#64748b;">لا يوجد منتجات</p>`;
    }

    let subtotal = 0;

    cart.forEach((item, index) => {
      const lineTotal = num(item.price) * num(item.qty);
      subtotal += lineTotal;

      cartItems.innerHTML += `
        <div class="cart-item">
          <div>
            <strong>${escapeHtml(item.name)}</strong><br>
            <small>${num(item.price).toFixed(2)} × ${item.qty} = ${lineTotal.toFixed(2)}</small>
          </div>
<div class="qty-controls">

  <button onclick="changeQty(${index}, -1)">-</button>

  <input 
    type="number" 
    value="${item.qty}" 
    min="1"
    style="width:50px;text-align:center;"
    oninput="updateQty(${index}, this.value)"
  />

  <button onclick="changeQty(${index}, 1)">+</button>

</div>
        </div>
      `;
    });

    subtotalEl.textContent = subtotal.toFixed(2);
    calculateTotals();
  }

 window.changeQty = function (index, delta) {
  const item = cart[index];
  if (!item) return;

  const product = productsData.find(p => Number(p.id) === Number(item.id));
  if (!product) return;

  const newQty = item.qty + delta;

  // 🚨 منع تجاوز المخزون
  if (newQty > num(product.stock)) {
    alert(`المتوفر فقط ${product.stock}`);
    return;
  }

  if (newQty <= 0) {
    cart.splice(index, 1);
  } else {
    item.qty = newQty;
  }

  renderCart();
};

  window.pay = async function (type) {
    console.log("pay fired",  type);
    const customer = document.getElementById("customer")?.value.trim() || "عميل نقدي";
    const paymentMethod = document.getElementById("paymentMethod")?.value || "نقدي";
    const subtotal = document.getElementById("subtotal")?.textContent || "0";
    const discount = document.getElementById("discount")?.value || "0";
    const net = document.getElementById("net")?.textContent || "0";
    const paid = document.getElementById("paid")?.value || "0";
    const rest = document.getElementById("rest")?.textContent || "0";
if (cart.length === 0)
{
  alert("لا يوجد منتجات في السلة");
  return;
}
const invoiceItems = cart.map((item) => {
  const product = productsData.find((p) => Number(p.id) === Number(item.id));

  return {
    productId: item.id,
    name: item.name,
    qty: Number(item.qty || 0),
    price: Number(item.price || 0),
    cost: Number(product?.cost || 0)
  };
});
let savedInvoiceId = null;
try {
  if (!hasDB() || !window.api.invoices?.add) {
    alert("ربط الفواتير غير متوفر");
    return;
  }
const customerInput = document.getElementById("customer");
const customerName = customerInput?.value.trim() || "عميل نقدي";

let selectedCustomer = customersData.find(
  (c) => (c.name || "").trim().toLowerCase() === customerName.toLowerCase()
);

let selectedCustomerId = selectedCustomer ? Number(selectedCustomer.id) : null;

// إذا في دين أو الدفع آجل والعميل غير موجود، أنشئه تلقائياً
if (
  !selectedCustomerId &&
  customerName !== "عميل نقدي" &&
  (Number(rest) > 0 || paymentMethod === "آجل")
) {
  await window.api.customers.add({
    name: customerName,
    phone: "",
    notes: "تم إنشاؤه تلقائياً من فاتورة آجل",
    status: "مسدد",
    dueBalance: 0,
    unpaidInvoices: 0,
    totalPurchases: 0
  });

  await loadCustomersFromDB();

  selectedCustomer = customersData.find(
    (c) => (c.name || "").trim().toLowerCase() === customerName.toLowerCase()
  );

  selectedCustomerId = selectedCustomer ? Number(selectedCustomer.id) : null;
}
 
const result = await window.api.invoices.add({
  customerId: selectedCustomerId || null,
  customerName: customerName,
  paymentMethod,
  subtotal: Number(subtotal || 0),
  discount: Number(discount || 0),
  net: Number(net || 0),
  paid: Number(paid || 0),
  rest: Number(rest || 0),
  cashierName: "admin",
  items: invoiceItems
});

  savedInvoiceId = result?.invoiceId || null;

} catch (error) {
  console.error("خطأ في حفظ الفاتورة", error);
  alert("فشل حفظ الفاتورة")
  return;
}

    let itemsHtml = "";
    cart.forEach((item) => {
      const lineTotal = num(item.price) * num(item.qty);
      itemsHtml += `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${item.qty}</td>
          <td>${num(item.price).toFixed(2)}</td>
          <td>${lineTotal.toFixed(2)}</td>
        </tr>
      `;
    });

    const invoiceNumber = savedInvoiceId || Date.now();

const invoiceHtml = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>فاتورة</title>
  <script src="https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #fff;
      font-family: Tahoma, Arial, sans-serif;
      color: #000;
    }

    .receipt {
      width: 80mm;
      margin: 0 auto;
      padding: 10px 8px 18px;
      box-sizing: border-box;
      background: #fff;
    }

    .center {
      text-align: center;
    }

    .store-logo {
      width: 68px;
      height: 68px;
      object-fit: contain;
      display: block;
      margin: 0 auto 8px;
      border-radius: 10px;
    }

    .store-name {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .store-info {
      font-size: 12px;
      line-height: 1.6;
      margin-bottom: 8px;
    }

    .divider {
      border-top: 1px dashed #000;
      margin: 8px 0;
    }

    .meta {
      font-size: 12px;
      line-height: 1.8;
    }

    .meta-row,
    .total-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 12px;
    }

    th, td {
      padding: 6px 2px;
      text-align: center;
      vertical-align: middle;
      word-break: break-word;
    }

    thead th {
      border-bottom: 1px dashed #000;
      border-top: 1px dashed #000;
      font-size: 11px;
    }

    tbody td {
      border-bottom: 1px dotted #ccc;
    }

    .item-name {
      text-align: right;
      font-weight: 700;
      font-size: 11px;
    }

    .totals {
      margin-top: 8px;
      font-size: 13px;
      line-height: 1.9;
    }

    .net-total {
      font-size: 15px;
      font-weight: 700;
    }

    .qr-box,
    .barcode-box {
      text-align: center;
      margin-top: 10px;
    }

    .qr-caption,
    .barcode-caption {
      font-size: 11px;
      margin-top: 4px;
    }

    .footer {
      text-align: center;
      margin-top: 10px;
      font-size: 12px;
      line-height: 1.7;
    }

    @media print {
      @page {
        size: 80mm auto;
        margin: 0;
      }

      body {
        width: 80mm;
      }

      .receipt {
        width: 80mm;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="receipt">

    <div class="center">
      ${appSettings.storeLogo ? `<img src="${appSettings.storeLogo}" class="store-logo" alt="logo">` : ""}
      <div class="store-name">${escapeHtml(appSettings.storeName)}</div>
      <div class="store-info">
        ${appSettings.storePhone ? `<div>${escapeHtml(appSettings.storePhone)}</div>` : ""}
        ${appSettings.storeAddress ? `<div>${escapeHtml(appSettings.storeAddress)}</div>` : ""}
      </div>
    </div>

    <div class="divider"></div>

    <div class="meta">
      <div class="meta-row"><span>رقم الفاتورة</span><span>#${invoiceNumber}</span></div>
      <div class="meta-row"><span>العميل</span><span>${escapeHtml(customer)}</span></div>
      <div class="meta-row"><span>الدفع</span><span>${escapeHtml(paymentMethod)}</span></div>
      <div class="meta-row"><span>التاريخ</span><span>${new Date().toLocaleString("ar-EG")}</span></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>الصنف</th>
          <th>ك</th>
          <th>سعر</th>
          <th>إجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${
          cart.length
            ? cart.map((item) => {
                const total = num(item.price) * num(item.qty);
                return `
                  <tr>
                    <td class="item-name">${escapeHtml(item.name)}</td>
                    <td>${item.qty}</td>
                    <td>${num(item.price).toFixed(2)}</td>
                    <td>${total.toFixed(2)}</td>
                  </tr>
                `;
              }).join("")
            : `<tr><td colspan="4">لا يوجد أصناف</td></tr>`
        }
      </tbody>
    </table>

    <div class="divider"></div>

    <div class="totals">
      <div class="total-row"><span>المجموع</span><span>${subtotal}</span></div>
      <div class="total-row"><span>الخصم</span><span>${discount}</span></div>
      <div class="total-row net-total"><span>الصافي</span><span>${net}</span></div>
      <div class="total-row"><span>المدفوع</span><span>${paid}</span></div>
      <div class="total-row"><span>الباقي</span><span>${rest}</span></div>
    </div>

    <div class="qr-box">
      <canvas id="invoiceQR"></canvas>
      <div class="qr-caption">QR الفاتورة</div>
    </div>

    <div class="barcode-box">
      <svg id="invoiceBarcode"></svg>
      <div class="barcode-caption">Barcode #${invoiceNumber}</div>
    </div>

    <div class="divider"></div>

    <div class="footer">
      شكراً لتسوقكم معنا
      <br>
      نرحب بكم دائماً
    </div>
  </div>

  <script>
    new QRious({
      element: document.getElementById("invoiceQR"),
      value: [
        "المتجر: ${escapeHtml(appSettings.storeName)}",
        "رقم الفاتورة: ${invoiceNumber}",
        "العميل: ${escapeHtml(customer)}",
        "الصافي: ${net}",
        "التاريخ: ${new Date().toLocaleString("ar-EG")}"
      ].join(" | "),
      size: 110
    });

    JsBarcode("#invoiceBarcode", "${invoiceNumber}", {
      format: "CODE128",
      width: 1.5,
      height: 38,
      displayValue: false,
      margin: 0
    });
  <\/script>
</body>
</html>
`;

    if (type === "print") {
      const printWindow = window.open("", "_blank", "width=800,height=600");
      printWindow.document.open();
      printWindow.document.write(invoiceHtml);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } else if (type === "preview") {
      const previewWindow = window.open("", "_blank", "width=900,height=700");
      previewWindow.document.open();
      previewWindow.document.write(invoiceHtml);
      previewWindow.document.close();
    } else {
      alert("تم حفظ الفاتورة بنجاح");
    
    }
    cart = [];
renderCart();

const discountInputEl = document.getElementById("discount");
const paidInputEl = document.getElementById("paid");
const customerInputEl = document.getElementById("customer");
const paymentMethodEl = document.getElementById("paymentMethod");

if (discountInputEl) discountInputEl.value = "0";
if (paidInputEl) paidInputEl.value = "0";
if (customerInputEl) customerInputEl.value = "عميل نقدي";
if (paymentMethodEl) paymentMethodEl.value = "نقدي";

calculateTotals();
barcodeInput?.focus();
await loadProductsFromDB();
await loadInvoicesFromDB();
  };

  products.forEach((p) => {
    p.addEventListener("click", () => {
      const id = Number(p.dataset.id);
      const product = productsData.find((item) => Number(item.id) === id);
      if (!product) return;

      addProductToCart(product);
    });
  });

  barcodeInput?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    const code = (barcodeInput.value || "").trim();
    if (!code) return;

    const product = productsData.find((p) => String(p.barcode || "").trim() === code);

    if (product) {
      addProductToCart(product);
      playBeep();
    } else {
      alert("المنتج غير موجود");
    }

    barcodeInput.value = "";
    barcodeInput.focus();
  });

  discountInput?.addEventListener("input", calculateTotals);
  paidInput?.addEventListener("input", calculateTotals);

  renderCart();
  barcodeInput?.focus();
}
/* =========================
   MODALS
========================= */
function pay(type) {
  if (typeof window.pay === "function") {
    return window.pay(type);
  }

  alert("دالة الدفع غير جاهزة");
  console.error("window.pay is not ready");
}
function openModal(html, size = "") {
  const root = document.getElementById("modalRoot");
  if (!root) return;

  root.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal-card ${size}" onclick="event.stopPropagation()">
        ${html}
      </div>
    </div>
  `;
}

function closeModal(event) {
  if (event && event.target && !event.target.classList.contains("modal-overlay")) return;
  const root = document.getElementById("modalRoot");
  if (root) root.innerHTML = "";
}

/* =========================
   PRODUCTS
========================= */

function renderProductsPage() {
  renderCategoriesList();
  renderProductsTable();
}

function renderCategoriesList() {
  const box = document.getElementById("categoriesList");
  if (!box) return;

  box.innerHTML = categories.map((cat, index) => `
    <div class="category-item ${index === 0 ? "category-active" : ""}">
      ${escapeHtml(cat)}
    </div>
  `).join("");
}

function renderProductsTable() {
  const body = document.getElementById("productsTableBody");
  const countEl = document.getElementById("productsCount");
  const searchEl = document.getElementById("productSearch");

  if (!body) return;

  const q = (searchEl?.value || "").trim().toLowerCase();

  const filtered = productsData.filter((p) =>
    (p.name || "").toLowerCase().includes(q) ||
    (p.barcode || "").toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="9" class="empty-row">لا توجد منتجات</td>
      </tr>
    `;
  } else {
    body.innerHTML = filtered.map((product) => `
      <tr>
        <td>${escapeHtml(product.barcode || "")}</td>

        <td>
          <div class="product-main-name">${escapeHtml(product.name || "")}</div>
        </td>

        <td>${escapeHtml(product.category || "")}</td>
        <td>${escapeHtml(product.saleType || "")}</td>
        <td class="price-text">${num(product.price).toFixed(2)}</td>
        <td>${num(product.cost).toFixed(2)}</td>

        <td>
          <span class="${num(product.stock) <= num(product.alertLimit) ? "stock-low-badge" : "stock-ok-badge"}">
            ${num(product.stock)}
          </span>
        </td>

        <td>
          <div class="products-action-row">
            ${hasPermission("edit") ? `<button class="icon-btn blue" onclick="openProductModal(${product.id})">✏️</button>` : ""}
            ${hasPermission("delete") ? `<button class="icon-btn red" onclick="deleteProduct(${product.id})">🗑</button>` : ""}
            <button class="action-btn barcode-btn" onclick="openBarcodeModal(${product.id})">🏷</button>
          </div>
        </td>

        <td>
          ${
            product.image && product.image.startsWith("data:image")
              ? `<img src="${product.image}" style="width:50px;height:50px;object-fit:cover;border-radius:8px;">`
              : ""
          }
        </td>
      </tr>
    `).join("");
  }

  if (countEl) {
    countEl.textContent = `إجمالي: ${filtered.length} منتج`;
  }
}

function openBarcodeModal(productId) {
  const product = productsData.find((p) => Number(p.id) === Number(productId));
  if (!product) {
    alert("المنتج غير موجود");
    return;
  }

  const barcodeValue = String(product.barcode || "").trim();
  if (!barcodeValue) {
    alert("هذا المنتج لا يحتوي على رقم باركود");
    return;
  }

  openModal(`
    <div class="modal-header">
      <h3>طباعة باركود</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <div class="barcode-preview-box">
        <div class="barcode-product-name">${escapeHtml(product.name)}</div>

        <svg id="barcodeSvg"></svg>

        <div class="barcode-number">${escapeHtml(barcodeValue)}</div>
        <div class="barcode-price">${money(product.price)}</div>
      </div>

      <div class="barcode-copies-row">
        <label>عدد النسخ:</label>
        <div class="barcode-counter">
          <button type="button" onclick="changeBarcodeCopies(-1)">−</button>
          <input id="barcodeCopies" type="number" min="1" value="1" />
          <button type="button" onclick="changeBarcodeCopies(1)">＋</button>
        </div>
      </div>

      <button class="green-btn" style="width:100%;margin-top:20px;" onclick="printBarcode(${product.id})">
        طباعة الباركود
      </button>
    </div>
  `, "small");

  setTimeout(() => {
    try {
      JsBarcode("#barcodeSvg", barcodeValue, {
        format: product.barcodeType || appSettings.barcodeType || "CODE128",
        lineColor: "#111",
        width: 2,
        height: 70,
        displayValue: false,
        margin: 10
      });
    } catch (error) {
      console.error(error);
      alert("فشل إنشاء الباركود. تأكد من نوع الباركود والرقم.");
    }
  }, 0);
}
function changeBarcodeCopies(delta) {
  const input = document.getElementById("barcodeCopies");
  if (!input) return;

  let value = Number(input.value || 1);
  value += delta;
  if (value < 1) value = 1;
  input.value = value;
}
function printBarcode(productId) {
  const product = productsData.find((p) => Number(p.id) === Number(productId));
  if (!product) {
    alert("المنتج غير موجود");
    return;
  }

  const barcodeValue = String(product.barcode || "").trim();
  if (!barcodeValue) {
    alert("لا يوجد باركود لهذا المنتج");
    return;
  }

  const copies = Math.max(1, Number(document.getElementById("barcodeCopies")?.value || 1));

  let labelsHtml = "";

  for (let i = 0; i < copies; i++) {
    labelsHtml += `
      <div class="print-label">
        <div class="print-name">${escapeHtml(product.name)}</div>
        <svg class="print-barcode"
             jsbarcode-format="${escapeHtml(product.barcodeType || appSettings.barcodeType || "CODE128")}"
             jsbarcode-value="${escapeHtml(barcodeValue)}"
             jsbarcode-width="2"
             jsbarcode-height="60"
             jsbarcode-displayvalue="false"
             jsbarcode-margin="0"></svg>
        <div class="print-number">${escapeHtml(barcodeValue)}</div>
        <div class="print-price">${money(product.price)}</div>
      </div>
    `;
  }

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("تعذر فتح نافذة الطباعة");
    return;
  }

  win.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8" />
      <title>طباعة باركود</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
      <style>
        body {
          font-family: Arial, Tahoma, sans-serif;
          margin: 20px;
          background: #fff;
        }

        .labels-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .print-label {
          width: 220px;
          border: 1px solid #ddd;
          border-radius: 12px;
          padding: 14px;
          text-align: center;
          page-break-inside: avoid;
        }

        .print-name {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 10px;
        }

        .print-number {
          margin-top: 8px;
          font-size: 18px;
          color: #555;
        }

        .print-price {
          margin-top: 10px;
          font-size: 26px;
          font-weight: 800;
          color: #16a34a;
        }

        svg {
          max-width: 100%;
        }
      </style>
    </head>
    <body>
      <div class="labels-wrap">
        ${labelsHtml}
      </div>

      <script>
        document.querySelectorAll(".print-barcode").forEach((el) => {
          JsBarcode(el, el.getAttribute("jsbarcode-value"), {
            format: el.getAttribute("jsbarcode-format") || "CODE128",
            lineColor: "#111",
            width: 2,
            height: 60,
            displayValue: false,
            margin: 0
          });
        });

        window.onload = () => {
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);

  win.document.close();
}
function openCategoryModal() {
  openModal(`
    <div class="modal-header">
      <h3>إضافة فئة</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <label>اسم الفئة</label>
      <input id="newCategoryName" class="modal-input" placeholder="اكتب اسم الفئة" />
      <button class="primary-full-btn" onclick="saveCategory()">حفظ</button>
    </div>
  `, "small");
}

async function saveCategory() {
  const name = document.getElementById("newCategoryName")?.value.trim() || "";

  if (!name) {
    alert("اكتب اسم الفئة");
    return;
  }

  try {
    if (!hasDB() || !window.api.categories?.add) {
      alert("ربط الفئات غير متوفر");
      return;
    }

    await window.api.categories.add(name);
    await loadCategoriesFromDB();
    renderCategoriesList();
    closeModal();
  } catch (error) {
    console.error(error);
    alert("صار خطأ أثناء حفظ الفئة");
  }
}

function openProductModal(productId = null) {
  editingProductId = productId;

  const product = productId
    ? productsData.find((p) => p.id === productId)
    : {
        barcode: "",
        name: "",
        categoryId: categoriesRows[0]?.id ?? null,
        saleType: "قطعة",
        price: 0,
        cost: 0,
        stock: 0,
        alertLimit: 0
      };

  const categoryOptions = categoriesRows.map((c) => `
    <option value="${c.id}" ${product.categoryId === c.id ? "selected" : ""}>
      ${escapeHtml(c.name)}
    </option>
  `).join("");

  openModal(`
    <div class="modal-header">
      <h3>${productId ? "تعديل منتج" : "إضافة منتج"}</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <div class="form-grid">
        <div>
          <label>الباركود</label>
          <input id="productBarcode" class="modal-input" value="${escapeHtml(product.barcode)}" />
        </div>

        <div>
          <label>اسم المنتج</label>
          <input id="productName" class="modal-input" value="${escapeHtml(product.name)}" />
        </div>

        <div>
          <label>الفئة</label>
          <select id="productCategory" class="modal-input">${categoryOptions}</select>
        </div>

        <div>
          <label>نوع البيع</label>
          <select id="productSaleType" class="modal-input">
            ${["قطعة", "علبة", "كرتون", "كيلو", "متر", "box"].map((t) => `
              <option value="${t}" ${product.saleType === t ? "selected" : ""}>${t}</option>
            `).join("")}
          </select>
        </div>

        <div>
          <label>السعر</label>
          <input id="productPrice" type="number" class="modal-input" value="${num(product.price)}" />
        </div>

        <div>
          <label>التكلفة</label>
          <input id="productCost" type="number" class="modal-input" value="${num(product.cost)}" />
        </div>

        <div>
          <label>المخزون</label>
          <input id="productStock" type="number" class="modal-input" value="${num(product.stock)}" />
        </div>
        <div class="form-group">
        <label>صورة المنتج</label>
        <input type="file" id="productImage" accept="image/*">
        </div>

        <div class="form-group">
        <img id="productImagePreview" src="" alt="" style="max-width:120px; max-height:120px; display:none; border-radius:10px;">
        </div>
        <div>
          <label>حد التنبيه</label>
          <input id="productAlert" type="number" class="modal-input" value="${num(product.alertLimit)}" />
        </div>
      </div>

      <button class="primary-full-btn" onclick="saveProduct()">حفظ</button>
    </div>
  `, "medium");
}

async function saveProduct() {
  const barcode = document.getElementById("productBarcode")?.value.trim() || "";
  const name = document.getElementById("productName")?.value.trim() || "";
  const categoryId = Number(document.getElementById("productCategory")?.value);
  const saleType = document.getElementById("productSaleType")?.value || "قطعة";
  const price = parseFloat(document.getElementById("productPrice")?.value || "0") || 0;
  const cost = parseFloat(document.getElementById("productCost")?.value || "0") || 0;
  const stock = parseFloat(document.getElementById("productStock")?.value || "0") || 0;
  const alertLimit = parseFloat(document.getElementById("productAlert")?.value || "0") || 0;
  const fileInput = document.getElementById("productImage");
  let image = "";

  if (fileInput && fileInput.files && fileInput.files[0]) {
  const file = fileInput.files[0];

  image = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}
  if (!barcode || !name) {
    alert("الباركود واسم المنتج مطلوبان");
    return;
  }

  try {
    if (!hasDB() || !window.api.products) {
      alert("ربط المنتجات غير متوفر");
      return;
    }

    const payload = {
      barcode,
      barcodeType: appSettings.barcodeType || "CODE128",
      name,
      categoryId,
      saleType,
      price,
      cost,
      stock,
      alertLimit,
      image
    };
    console.log("IMAGE TO SAVE:", image);
    console.log("PAYLOAD:", payload);
    if (editingProductId && window.api.products.update) {
      await window.api.products.update({
        id: editingProductId,
        ...payload
      });
    } else if (window.api.products.add) {
      await window.api.products.add(payload);
    }
    await loadProductsFromDB();
    editingProductId = null;
    renderProductsTable();
    closeModal();
  } catch (error) {
    console.error(error);
    alert("صار خطأ أثناء حفظ المنتج");
  }
}

async function deleteProduct(productId) {
  const product = productsData.find((p) => p.id === productId);
  if (!product) return;

  if (!confirm(`حذف المنتج: ${product.name} ؟`)) return;

  try {
    if (!hasDB() || !window.api.products?.remove) {
      alert("حذف المنتج غير متوفر");
      return;
    }

    await window.api.products.remove(productId);
    await loadProductsFromDB();
    renderProductsTable();
  } catch (error) {
    console.error(error);
    alert("صار خطأ أثناء حذف المنتج");
  }
}
function exportProductsCSV() {
  const headers = [
    "barcode",
    "name",
    "category",
    "saleType",
    "price",
    "cost",
    "stock",
    "alertLimit",
    "image"
  ];

  const sorted = [...productsData].sort((a, b) => Number(a.id) - Number(b.id));

  const rows = sorted.map((p) => [
    p.barcode || "",
    p.name || "",
    p.category || "",
    p.saleType || "",
    p.price || 0,
    p.cost || 0,
    p.stock || 0,
    p.alertLimit || 0,
    p.image || ""
  ]);

  const csv = [
    headers.join(";"),
    ...rows.map((r) =>
      r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")
    )
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "products.csv";
  a.click();

  URL.revokeObjectURL(url);
}

async function importProductsCSV(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async function (e) {
    const text = String(e.target?.result || "");
    const lines = text.split(/\r?\n/).filter(Boolean);

    if (lines.length < 2) return;

    const parseCSVLine = (line) => {
      const result = [];
      let current = "";
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"' && inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ";" && !inQuotes) {
          result.push(current);
          current = "";
        } else {
          current += char;
        }
      }

      result.push(current);
      return result;
    };

    const headers = parseCSVLine(lines[0]);
    const rows = lines.slice(1);

    try {
      for (const row of rows) {
        const values = parseCSVLine(row);
        const obj = {};

        headers.forEach((h, i) => {
          obj[h] = values[i] ?? "";
        });

        const categoryObj = categoriesRows.find(
          (c) => c.name === (obj.category || "عام")
        );

        if (hasDB() && window.api.products?.add) {
          await window.api.products.add({
            barcode: obj.barcode || "",
            barcodeType: appSettings.barcodeType || "CODE128",
            name: obj.name || "",
            categoryId: categoryObj?.id ?? null,
            saleType: obj.saleType || "قطعة",
            price: parseFloat(obj.price || "0") || 0,
            cost: parseFloat(obj.cost || "0") || 0,
            stock: parseFloat(obj.stock || "0") || 0,
            alertLimit: parseFloat(obj.alertLimit || "0") || 0,
            image: obj.image || ""
          });
        }
      }

      await loadProductsFromDB();
      renderProductsTable();
      alert("تم استيراد المنتجات بنجاح");
    } catch (error) {
      console.error(error);
      alert("صار خطأ أثناء استيراد المنتجات");
    }

    event.target.value = "";
  };

  reader.readAsText(file, "utf-8");
}

/* =========================
   SUPPLIERS
========================= */

function renderSuppliersPage() {
  updateSuppliersStats();
  renderSuppliersTable();
}

function updateSuppliersStats() {
  const total = suppliersData.length;
  const paid = suppliersData.filter((s) => num(s.openingBalance) <= 0).length;
  const pending = suppliersData.filter((s) => num(s.openingBalance) > 0).length;
  const dueAmount = suppliersData
    .filter((s) => num(s.openingBalance) > 0)
    .reduce((sum, s) => sum + num(s.openingBalance), 0);

  const suppliersCount = document.getElementById("suppliersCount");
  const suppliersPaidCount = document.getElementById("suppliersPaidCount");
  const suppliersPendingCount = document.getElementById("suppliersPendingCount");
  const paidSuppliersCount = document.getElementById("paidSuppliersCount");
  const suppliersDueAmount = document.getElementById("suppliersDueAmount");

  if (suppliersCount) suppliersCount.textContent = total;
  if (suppliersPaidCount) suppliersPaidCount.textContent = paid;
  if (suppliersPendingCount) suppliersPendingCount.textContent = pending;
  if (paidSuppliersCount) paidSuppliersCount.textContent = paid;
  if (suppliersDueAmount) suppliersDueAmount.textContent = dueAmount.toFixed(2);
}

function renderSuppliersTable() {
  const body = document.getElementById("suppliersTableBody");
  const search = document.getElementById("supplierSearch");
  if (!body) return;

  const q = (search?.value || "").trim().toLowerCase();

  const filtered = suppliersData.filter((s) =>
    (s.name || "").toLowerCase().includes(q) ||
    (s.phone || "").toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="6" class="empty-row">لا يوجد موردين</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = filtered.map((supplier) => `
    <tr>
      <td><strong>${escapeHtml(supplier.name)}</strong></td>
      <td>${escapeHtml(supplier.phone)}</td>
      <td>${num(supplier.openingBalance).toFixed(2)}</td>
      <td>
        <span class="${num(supplier.openingBalance) > 0 ? "stock-alert" : "stock-ok"}">
          ${num(supplier.openingBalance) > 0 ? "عليه مستحقات" : "مسدد"}
        </span>
      </td>
      <td>${escapeHtml(supplier.notes || "-")}</td>
      <td>
        <div class="actions-row">
          <button class="icon-btn blue" onclick="openSupplierModal(${supplier.id})">✏️</button>
          <button class="icon-btn red" onclick="deleteSupplier(${supplier.id})">🗑</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function openSupplierModal(supplierId = null) {
  const supplier = supplierId
    ? suppliersData.find((s) => s.id === supplierId)
    : {
        name: "",
        phone: "",
        openingBalance: 0,
        notes: ""
      };

  openModal(`
    <div class="modal-header">
      <h3>${supplierId ? "تعديل مورد" : "مورد جديد"}</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <div class="form-grid">
        <div>
          <label>اسم المورد</label>
          <input id="supplierName" class="modal-input" value="${escapeHtml(supplier.name)}" />
        </div>

        <div>
          <label>رقم الهاتف</label>
          <input id="supplierPhone" class="modal-input" value="${escapeHtml(supplier.phone)}" />
        </div>

        <div>
          <label>رصيد ابتدائي</label>
          <input id="supplierOpeningBalance" type="number" class="modal-input" value="${num(supplier.openingBalance)}" />
        </div>

        <div>
          <label>ملاحظات</label>
          <input id="supplierNotes" class="modal-input" value="${escapeHtml(supplier.notes)}" />
        </div>
      </div>

      <button class="primary-full-btn" onclick="saveSupplier(${supplierId || 0})">حفظ</button>
    </div>
  `, "small");
}

async function saveSupplier(supplierId = 0) {
  const name = document.getElementById("supplierName")?.value.trim() || "";
  const phone = document.getElementById("supplierPhone")?.value.trim() || "";
  const openingBalance = parseFloat(document.getElementById("supplierOpeningBalance")?.value || "0") || 0;
  const notes = document.getElementById("supplierNotes")?.value.trim() || "";

  if (!name || !phone) {
    alert("اسم المورد ورقم الهاتف مطلوبان");
    return;
  }

  try {
    if (!hasDB() || !window.api.suppliers) {
      alert("ربط الموردين غير متوفر");
      return;
    }

    if (supplierId && window.api.suppliers.update) {
      await window.api.suppliers.update({
        id: supplierId,
        name,
        phone,
        openingBalance,
        notes
      });
    } else if (window.api.suppliers.add) {
      await window.api.suppliers.add({
        name,
        phone,
        openingBalance,
        notes
      });
    }

    await loadSuppliersFromDB();
    closeModal();
    updateSuppliersStats();
    renderSuppliersTable();
  } catch (error) {
    console.error(error);
    alert("صار خطأ أثناء حفظ المورد");
  }
}
let editingCustomerId = null;

async function loadCustomersFromDB() {
  if (!hasDB() || !window.api.customers?.getAll) {
    customersData = [];
    return;
  }

  try {
    const rows = await window.api.customers.getAll();

    customersData = safeArray(rows).map((r) => ({
      id: Number(r.id),
      name: r.name || "",
      phone: r.phone || "",
      notes: r.notes || "",
      status: r.status || "مسدد",
      totalPurchases: num(r.total_purchases),
      unpaidInvoices: num(r.unpaid_invoices),
      dueBalance: num(r.due_balance),
      lastOperation: r.last_operation || ""
    }));

    console.log("customersData:", customersData);
  } catch (error) {
    console.error("خطأ تحميل العملاء:", error);
    customersData = [];
  }
}
 function openCustomerModal(customerId = null) {
  const numericId = customerId !== null ? Number(customerId) : null;

  const customer = numericId !== null
    ? customersData.find((c) => Number(c.id) === numericId)
    : {
        name: "",
        phone: "",
        notes: "",
        status: "مسدد",
        dueBalance: 0
      };

  if (numericId !== null && !customer) {
    alert("لم يتم العثور على بيانات العميل للتعديل");
    return;
  }

  openModal(`
    <div class="modal-header">
      <h3>${numericId !== null ? "تعديل عميل" : "إضافة عميل جديد"}</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <input id="editingCustomerId" type="hidden" value="${numericId ?? ""}" />

      <div class="form-grid">
        <div>
          <label>الاسم</label>
          <input id="customerName" class="modal-input" value="${escapeHtml(customer?.name || "")}" />
        </div>

        <div>
          <label>الهاتف</label>
          <input id="customerPhone" class="modal-input" value="${escapeHtml(customer?.phone || "")}" />
        </div>

        <div>
          <label>ملاحظات</label>
          <input id="customerNotes" class="modal-input" value="${escapeHtml(customer?.notes || "")}" />
        </div>

        <div>
          <label>حالة الحساب</label>
          <select id="customerStatus" class="modal-input" onchange="toggleCustomerDueBalance()">
            <option value="مسدد" ${(customer?.status || "مسدد") === "مسدد" ? "selected" : ""}>مسدد</option>
            <option value="عليه فلوس" ${(customer?.status || "") === "عليه فلوس" ? "selected" : ""}>عليه فلوس</option>
          </select>
        </div>

        <div>
          <label>الرصيد المستحق</label>
          <input id="customerDueBalance" type="number" class="modal-input" value="${num(customer?.dueBalance)}" />
        </div>
      </div>

      <button class="primary-full-btn" onclick="saveCustomer()">حفظ</button>
    </div>
  `, "medium");
}
function toggleDueBalanceField() {
  const statusEl = document.getElementById("customerStatus");
  const wrap = document.getElementById("dueBalanceWrap");
  if (!statusEl || !wrap) return;

  wrap.style.display = statusEl.value === "عليه فلوس" ? "block" : "none";
}async function saveCustomer(customerId = null) {
  const name = document.getElementById("customerName")?.value.trim() || "";
  const phone = document.getElementById("customerPhone")?.value.trim() || "";
  const notes = document.getElementById("customerNotes")?.value.trim() || "";
  const status = document.getElementById("customerStatus")?.value || "مسدد";
  const dueBalance = parseFloat(document.getElementById("customerDueBalance")?.value || "0") || 0;

  if (!name || !phone) {
    alert("اسم العميل ورقم الهاتف مطلوبان");
    return;
  }

  try {
    if (!hasDB() || !window.api.customers) {
      alert("ربط العملاء غير متوفر");
      return;
    }

    const payload = {
      name,
      phone,
      notes,
      status,
      dueBalance,
      unpaidInvoices: dueBalance > 0 ? 1 : 0
    };

    if (customerId !== null && customerId !== undefined && window.api.customers.update) {
      await window.api.customers.update({
        id: customerId,
        ...payload
      });
    } else if (window.api.customers.add) {
      await window.api.customers.add(payload);
    }

    editingCustomerId = null;

    await loadCustomersFromDB();
    
    closeModal();
    renderReportTab("customers");
  } catch (error) {
    console.error(error);
    alert("صار خطأ أثناء حفظ العميل");
  }
}

async function deleteCustomer(customerId) {
  const customer = customersData.find((c) => c.id === customerId);
  if (!customer) return;

  if (!confirm(`حذف العميل: ${customer.name} ؟`)) return;

  try {
    if (!hasDB() || !window.api.customers?.remove) {
      alert("حذف العميل غير متوفر");
      return;
    }

    await window.api.customers.remove(customerId);
    await loadCustomersFromDB();
    renderReportTab("customers");
  } catch (error) {
    console.error(error);
    alert("صار خطأ أثناء حذف العميل");
  }
}

function renderCustomersPageStats() {
  const totalCustomers = customersData.length;
  const debtCustomers = customersData.filter((c) => c.status === "عليه فلوس" || num(c.dueBalance) > 0).length;
  const totalDebts = customersData.reduce((sum, c) => sum + num(c.dueBalance), 0);

  const totalCustomersEl = document.getElementById("customersTotalCount");
  const debtCustomersEl = document.getElementById("customersDebtCount");
  const totalDebtsEl = document.getElementById("customersDebtsTotal");

  if (totalCustomersEl) totalCustomersEl.textContent = totalCustomers;
  if (debtCustomersEl) debtCustomersEl.textContent = debtCustomers;
  if (totalDebtsEl) totalDebtsEl.textContent = money(totalDebts);
}

async function deleteSupplier(supplierId) {
  const supplier = suppliersData.find((s) => s.id === supplierId);
  if (!supplier) return;

  if (!confirm(`حذف المورد: ${supplier.name} ؟`)) return;

  try {
    if (!hasDB() || !window.api.suppliers?.remove) {
      alert("حذف المورد غير متوفر");
      return;
    }

    await window.api.suppliers.remove(supplierId);
    await loadSuppliersFromDB();
    updateSuppliersStats();
    renderSuppliersTable();
  } catch (error) {
    console.error(error);
    alert("صار خطأ أثناء حذف المورد");
  }
}function renderCustomersTable() {
  const body = document.getElementById("customersTableBody");
  const search = document.getElementById("customerSearch");
  if (!body) return;

  const q = (search?.value || "").trim().toLowerCase();

  const filtered = customersData.filter((c) =>
    (c.name || "").toLowerCase().includes(q) ||
    (c.phone || "").toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="6" class="empty-row">لا يوجد عملاء مسجلين</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = filtered.map((customer) => `
    <tr>
      <td><strong>${escapeHtml(customer.name)}</strong></td>
      <td>${escapeHtml(customer.phone || "-")}</td>
      <td>${escapeHtml(customer.notes || "-")}</td>
      <td>
        <span class="${num(customer.dueBalance) > 0 ? "stock-alert" : "stock-ok"}">
          ${num(customer.dueBalance) > 0 ? "عليه فلوس" : "مسدد"}
        </span>
      </td>
      <td>${money(customer.dueBalance)}</td>
      <td>
       <div class="actions-row">
  <button class="icon-btn cyan" onclick="openCustomerStatement(${Number(customer.id)})" title="كشف حساب">📄</button>
  <button class="icon-btn orange" onclick="openCustomerPaymentModal(${Number(customer.id)})" title="دفعة">💵</button>
  <button class="icon-btn blue" onclick="openCustomerModal(${Number(customer.id)})" title="تعديل">✏️</button>
  <button class="icon-btn red" onclick="deleteCustomer(${Number(customer.id)})" title="حذف">🗑</button>
</div>
      </td>
    </tr>
  `).join("");
}
function openCustomerPaymentModal(customerId) {
  const customer = customersData.find(c => Number(c.id) === Number(customerId));
  if (!customer) return;

  openModal(`
    <div class="modal-header">
      <h3>تسجيل دفعة - ${escapeHtml(customer.name)}</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <input type="hidden" id="paymentCustomerId" value="${customer.id}" />

      <label>المبلغ</label>
      <input id="paymentAmount" type="number" class="modal-input" value="0" />

      <label>ملاحظات</label>
      <input id="paymentNotes" class="modal-input" placeholder="اختياري" />

      <button class="primary-full-btn" onclick="saveCustomerPayment()">حفظ الدفعة</button>
    </div>
  `, "small");
}
async function saveCustomerPayment() {
  const customerId = Number(document.getElementById("paymentCustomerId")?.value || 0);
  const amount = Number(document.getElementById("paymentAmount")?.value || 0);
  const notes = document.getElementById("paymentNotes")?.value.trim() || "";

  if (!customerId || amount <= 0) {
    alert("أدخل مبلغ صحيح");
    return;
  }

  try {
    await window.api.customers.addPayment({
      customerId,
      amount,
      notes
    });

    await loadCustomersFromDB();
    closeModal();

    if (document.getElementById("customersTableBody")) {
      renderCustomersTable();
    }

    if (typeof renderReportTab === "function") {
      renderReportTab("customers");
    }
  } catch (error) {
    console.error("خطأ تسجيل الدفعة:", error);
    alert("صار خطأ أثناء تسجيل الدفعة");
  }
}
async function openCustomerStatement(customerId) {
  try {
    const data = await window.api.customers.getStatement(customerId);

    if (!data) {
      alert("تعذر تحميل كشف الحساب");
      return;
    }

    const { customer, transactions } = data;

    openModal(`
      <div class="modal-header">
        <h3>كشف حساب - ${escapeHtml(customer.name)}</h3>
        <button class="close-btn" onclick="closeModal()">✕</button>
      </div>

      <div class="modal-body">
        <div class="stock-info-box">
          <span>الرصيد الحالي: ${money(customer.dueBalance)}</span>
          <span>الحالة: ${escapeHtml(customer.status)}</span>
        </div>

        <div class="table-wrap">
          <table class="products-table">
            <thead>
              <tr>
                <th>النوع</th>
                <th>المبلغ</th>
                <th>الوصف</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              ${
                transactions.length
                  ? transactions.map((t) => `
                    <tr>
                      <td>${escapeHtml(t.type)}</td>
                      <td style="color:${num(t.amount) < 0 ? '#16a34a' : '#dc2626'};font-weight:700;">
                        ${money(t.amount)}
                      </td>
                      <td>${escapeHtml(t.description || "-")}</td>
                      <td>${escapeHtml(formatDateOnly(t.created_at))}</td>
                    </tr>
                  `).join("")
                  : `<tr><td colspan="4" class="empty-row">لا توجد حركات</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `, "medium");
  } catch (error) {
    console.error("خطأ فتح كشف الحساب:", error);
    alert("صار خطأ أثناء فتح كشف الحساب");
  }
}
function toggleCustomerDueBalance() {
  const status = document.getElementById("customerStatus")?.value || "مسدد";
  const dueInput = document.getElementById("customerDueBalance");

  if (!dueInput) return;

  if (status === "مسدد") {
    dueInput.value = "0";
  }
}
function toggleDueBalanceField() {
  const statusEl = document.getElementById("customerStatus");
  const dueWrap = document.getElementById("dueBalanceWrap");
  const dueInput = document.getElementById("customerDueBalance");

  if (!statusEl || !dueWrap || !dueInput) return;

  if (statusEl.value === "عليه فلوس") {
    dueWrap.style.display = "block";
  } else {
    dueWrap.style.display = "none";
    dueInput.value = "0";
  }
}
async function saveCustomer() {
  const customerIdValue = document.getElementById("editingCustomerId")?.value || "";
  const customerId = customerIdValue !== "" ? Number(customerIdValue) : null;

  const name = document.getElementById("customerName")?.value.trim() || "";
  const phone = document.getElementById("customerPhone")?.value.trim() || "";
  const notes = document.getElementById("customerNotes")?.value.trim() || "";
  const selectedStatus = document.getElementById("customerStatus")?.value || "مسدد";
  let dueBalance = parseFloat(document.getElementById("customerDueBalance")?.value || "0") || 0;

  if (!name || !phone) {
    alert("اسم العميل ورقم الهاتف مطلوبان");
    return;
  }

  if (selectedStatus === "مسدد") {
    dueBalance = 0;
  }

  const finalStatus = dueBalance > 0 ? "عليه فلوس" : "مسدد";

  try {
    if (!hasDB() || !window.api.customers) {
      alert("ربط العملاء غير متوفر");
      return;
    }

    const payload = {
      name,
      phone,
      notes,
      status: finalStatus,
      dueBalance,
      unpaidInvoices: dueBalance > 0 ? 1 : 0
    };

    console.log("editing customer id =", customerId);
    console.log("customer payload =", payload);

    if (customerId !== null && window.api.customers.update) {
      await window.api.customers.update({
        id: customerId,
        ...payload
      });
    } else if (window.api.customers.add) {
      await window.api.customers.add(payload);
    }

    await loadCustomersFromDB();
    closeModal();
    renderReportTab("customers");
  } catch (error) {
    console.error("خطأ حفظ العميل:", error);
    alert("صار خطأ أثناء حفظ العميل");
  }
}
/* =========================
   SETTINGS
========================= */

async function saveSettings() {
  const storeName = document.getElementById("storeName");
  const storePhone = document.getElementById("storePhone");
  const storeAddress = document.getElementById("storeAddress");
  const storeCurrency = document.getElementById("storeCurrency");
  const taxEnabled = document.getElementById("taxEnabled");
  const taxPercent = document.getElementById("taxPercent");
  const barcodeType = document.getElementById("barcodeType");

  if (storeName) appSettings.storeName = storeName.value.trim();
  if (storePhone) appSettings.storePhone = storePhone.value.trim();
  if (storeAddress) appSettings.storeAddress = storeAddress.value.trim();
  if (storeCurrency) appSettings.currency = storeCurrency.value;
  if (taxEnabled) appSettings.taxEnabled = taxEnabled.value === "true";
  if (taxPercent) appSettings.taxPercent = parseFloat(taxPercent.value || "0") || 0;
  if (barcodeType) appSettings.barcodeType = barcodeType.value;

  try {
    if (!hasDB() || !window.api.settings?.save) {
      alert("ربط الإعدادات غير متوفر");
      return;
    }

    await window.api.settings.save(appSettings);
    alert("تم حفظ الإعدادات بنجاح");
  } catch (error) {
    console.error(error);
    alert("صار خطأ أثناء حفظ الإعدادات");
  }
  
}

let editingExpenseId = null;
let expensesData = [];
async function loadExpensesFromDB() {
  if (!hasDB() || !window.api.expenses?.getAll) {
    expensesData = [];
    return;
  }

  try {
    const rows = await window.api.expenses.getAll();

    expensesData = safeArray(rows).map((r) => ({
      id: Number(r.id),
      title: r.title || "",
      amount: num(r.amount),
      category: r.category || "عام",
      cashier: r.cashier || "admin",
      notes: r.notes || "",
      date: r.created_at || ""
    }));
  } catch (error) {
    console.error("خطأ تحميل المصروفات:", error);
    expensesData = [];
  }
}
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("productImage")?.addEventListener("change", function () {
  const file = this.files?.[0];
  const preview = document.getElementById("productImagePreview");

  if (!file || !preview) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    preview.src = e.target.result;
    preview.style.display = "block";
  };
  reader.readAsDataURL(file);
});
  renderSplashScreen();

  setTimeout(() => {
    renderLoginScreen();
  }, 4000);
});