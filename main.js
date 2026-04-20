const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const express = require("express");
const { getDb } = require("./db");
//const { connectMongo } = require("./mongo");
const { syncToServer } = require("./database/atlas");
const { sync } = require("isexe");


function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // إذا كانت صفحتك الرئيسية غير index.html بدّلها لاسم الصفحة الصحيحة
  win.loadFile("index.html");
  const { Menu } = require('electron');
  Menu.setApplicationMenu(null);
}

const COLLECTIONS = [
  "users",
  "role_permissions",
  "categories",
  "products",
  "suppliers",
  "settings",
  "customers",
  "customer_transactions",
  "expenses",
  "returns",
  "stock_movements",
  "invoices",
  "invoice_items",
  "counters"
];

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function nextSequence(name) {
  const db = await getDb();

  const result = await db.collection("counters").findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    {
      upsert: true,
      returnDocument: "after"
    }
  );

  return result.value?.seq ?? 1;
}


async function seedDefaults() {
  const db = await getDb();

  const adminUser = await db.collection("users").findOne({ username: "admin" });
  if (!adminUser) {
    const userId = await nextSequence("users");
    await db.collection("users").insertOne({
      id: userId,
      full_name: "Administrator",
      username: "admin",
      password: "1234",
      role: "admin",
      is_active: 1,
      created_at: new Date().toISOString()
    });
  }

  const roles = [
    { role: "admin", permissions: JSON.stringify(["all"]) },
    { role: "cashier", permissions: JSON.stringify([]) }
  ];

  for (const roleRow of roles) {
    const existing = await db.collection("role_permissions").findOne({ role: roleRow.role });
    if (!existing) {
      await db.collection("role_permissions").insertOne(roleRow);
    }
  }

  const settings = await db.collection("settings").findOne({});
  if (!settings) {
    await db.collection("settings").insertOne({
      id: 1,
      store_name: "Ox Store",
      store_phone: "",
      store_address: "",
      currency: "ليرة سورية",
      tax_enabled: 0,
      tax_percent: 0,
      barcode_type: "CODE128",
      paper_type: "80mm",
      language: "العربية"
    });
  }
}

app.whenReady().then(async () => {
   try {
    await getDb();
    console.log("DB ready");
  } catch (error) {
    console.error("Startup DB error:", error);
  }
  await seedDefaults();
  createWindow();

  const mobileServer = express();
  mobileServer.use(express.urlencoded({ extended: true }));
  mobileServer.use(express.json());

  mobileServer.get("/", (_req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="ar">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>قارئ الباركود</title>
        <script src="https://unpkg.com/html5-qrcode"></script>
        <style>
          body {
            font-family: Arial, sans-serif;
            direction: rtl;
            text-align: center;
            background: #0f172a;
            color: white;
            margin: 0;
            padding: 20px;
          }
          h2 {
            margin-bottom: 20px;
          }
          #reader {
            width: 320px;
            max-width: 100%;
            margin: 0 auto 20px;
            background: white;
            border-radius: 16px;
            padding: 10px;
          }
          #result {
            background: #1e293b;
            border-radius: 16px;
            padding: 20px;
            min-height: 120px;
          }
        </style>
      </head>
      <body>
        <h2>📱 امسح الباركود</h2>
        <div id="reader"></div>
        <div id="result">بانتظار المسح...</div>

        <script>
          const resultDiv = document.getElementById("result");
          let scanning = true;function onScanSuccess(decodedText) {
            if (!scanning) return;
            scanning = false;
   fetch("/api/...")
  .then(res => res.text())
  .then(html => {
    resultDiv.innerHTML = html;
  });
            setTimeout(() => {
              scanning = true;
            }, 2000);
          }

          const html5QrCode = new Html5Qrcode("reader");

          Html5Qrcode.getCameras().then(devices => {
            if (devices && devices.length) {
              html5QrCode.start(
                devices[0].id,
                { fps: 10, qrbox: 250 },
                onScanSuccess
              );
            } else {
              resultDiv.innerHTML = "ما في كاميرا متاحة";
            }
          }).catch(() => {
            resultDiv.innerHTML = "تعذر تشغيل الكاميرا";
          });
        </script>
      </body>
      </html>
    `);
  });

mobileServer.get("/product", async (req, res) => {
  try {
    const code = String(req.query.code || "").trim();
    const db = await getDb(); // ✅ بدل connectMongo

    console.log("SCANNED CODE:", code);

    if (!code) {
      return res.send(`
        <div style="color:white;">باركود غير صالح</div>
      `);
    }

    const product = await db.collection("products").findOne({
      barcode: code
    });

    if (!product) {
      return res.send(`
        <div style="background:#1e293b;padding:20px;border-radius:16px;color:white;">
          <h2 style="color:#f87171;">المنتج غير موجود</h2>
          <p>الباركود: ${code}</p>
        </div>
      `);
    }

    res.send(`
      <div style="background:#1e293b;padding:20px;border-radius:16px;color:white;">
        <h1 style="margin:0 0 12px;color:#38bdf8;">${product.name || ""}</h1>
        <h2>السعر: ${Number(product.price || 0)}</h2>
        <h3>الكمية: ${Number(product.stock || 0)}</h3>
        <p>الباركود: ${product.barcode}</p>
      </div>
    `);
  } catch (error) {
    console.error("mobileServer /product error:", error);

    res.status(500).send(`
      <div style="color:white;">خطأ بالسيرفر</div>
    `);
  }
});


mobileServer.listen(3000, "0.0.0.0", () => {
  console.log("Mobile server running on http://localhost:3000");
});



  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* =========================
   USERS & PERMISSIONS
========================= */
ipcMain.handle("auth:login", async (_event, data) => {
  const db = await getDb();
  const username = String(data.username || "").trim();
  const password = String(data.password || "").trim();

  const user = await db.collection("users").findOne({
    username,
    password,
    is_active: 1
  });

  if (!user) return null;

  const roleRow = await db.collection("role_permissions").findOne({ role: user.role });

  return {
    id: user.id,
    fullName: user.full_name || "",
    username: user.username || "",
    role: user.role || "cashier",
    permissions: roleRow ? JSON.parse(roleRow.permissions || "[]") : []
  };
});

ipcMain.handle("users:getAll", async () => {
  const db = await getDb();

  return await db.collection("users")
    .find({})
    .sort({ id: -1 })
    .project({
      _id: 0,
      id: 1,
      full_name: 1,
      username: 1,
      password: 1,
      role: 1,
      is_active: 1,
      created_at: 1
    })
    .toArray();
});

ipcMain.handle("users:add", async (_event, user) => {
  const db = await getDb();
  const id = await nextSequence("users");

  await db.collection("users").insertOne({
    id,
    full_name: user.fullName || "",
    username: user.username || "",
    password: user.password || "",
    role: user.role || "cashier",
    is_active: user.isActive ? 1 : 0,
    created_at: new Date().toISOString()
  });

  return { success: true, id };
});

ipcMain.handle("users:update", async (_event, user) => {
  const db = await getDb();

  await db.collection("users").updateOne(
    { id: user.id },
    {
      $set: {
        full_name: user.fullName || "",
        username: user.username || "",
        password: user.password || "",role: user.role || "cashier",
        is_active: user.isActive ? 1 : 0
      }
    }
  );

  return { success: true };
});

ipcMain.handle("users:remove", async (_event, id) => {
  const db = await getDb();
  const user = await db.collection("users").findOne({ id });

  if (!user) return { success: false };

  if (user.username === "admin") {
    throw new Error("لا يمكن حذف المستخدم admin");
  }

  await db.collection("users").deleteOne({ id });
  return { success: true };
});

ipcMain.handle("permissions:getByRole", async (_event, role) => {
  const db = await getDb();
  const row = await db.collection("role_permissions").findOne({ role });

  if (!row) return [];
  return JSON.parse(row.permissions || "[]");
});

ipcMain.handle("permissions:updateRole", async (_event, data) => {
  const db = await getDb();

  await db.collection("role_permissions").updateOne(
    { role: data.role },
    { $set: { permissions: JSON.stringify(data.permissions || []) } },
    { upsert: true }
  );

  return { success: true };
});

/* =========================
   CATEGORIES
========================= */
ipcMain.handle("categories:getAll", async () => {
  const db = await getDb();

  return await db.collection("categories")
    .find({})
    .sort({ id: -1 })
    .project({ _id: 0, id: 1, name: 1 })
    .toArray();
});

ipcMain.handle("categories:add", async (_event, name) => {
  const db = await getDb();
  const cleanName = String(name || "").trim();

  if (!cleanName) {
    throw new Error("اسم الفئة مطلوب");
  }

  const existing = await db.collection("categories").findOne({ name: cleanName });
  if (existing) return { id: existing.id, name: existing.name };

  const id = await nextSequence("categories");
  await db.collection("categories").insertOne({
    id,
    name: cleanName,
    created_at: new Date().toISOString()
  });

  return { id, name: cleanName };
});

ipcMain.handle("categories:remove", async (_event, id) => {
  const db = await getDb();
  await db.collection("categories").deleteOne({ id });
  return { success: true };
});

/* =========================
   CUSTOMERS PAYMENTS & STATEMENT
========================= */
ipcMain.handle("customers:addPayment", async (_event, data) => {
  const db = await getDb();
  const customerId = toNumber(data.customerId, 0);
  const amount = toNumber(data.amount, 0);
  const notes = data.notes || "";

  if (!customerId || amount <= 0) {
    throw new Error("بيانات الدفعة غير صحيحة");
  }

  const trxId = await nextSequence("customer_transactions");

  await db.collection("customer_transactions").insertOne({
    id: trxId,
    customer_id: customerId,
    type: "payment",
    amount: -amount,
    description: notes || "دفعة تسديد",
    created_at: new Date().toISOString()
  });

  const customer = await db.collection("customers").findOne({ id: customerId });
  const currentDue = toNumber(customer?.due_balance, 0);
  const newDue = Math.max(currentDue - amount, 0);

  await db.collection("customers").updateOne(
    { id: customerId },
    {
      $set: {
        due_balance: newDue,
        status: newDue <= 0 ? "مسدد" : "عليه فلوس",
        last_operation: todayDate()
      }
    }
  );

  return { success: true };
});

ipcMain.handle("customers:getStatement", async (_event, customerId) => {
  const db = await getDb();

  const customer = await db.collection("customers").findOne({ id: customerId });
  if (!customer) return null;

  const transactions = await db.collection("customer_transactions")
    .find({ customer_id: customerId })
    .sort({ id: -1 })
    .project({ _id: 0 })
    .toArray();

  return {
    customer: {
      id: customer.id,
      name: customer.name || "",
      phone: customer.phone || "",
      dueBalance: toNumber(customer.due_balance),
      status: customer.status || "مسدد",
      notes: customer.notes || "",
      unpaidInvoices: toNumber(customer.unpaid_invoices),
      lastOperation: customer.last_operation || ""
    },
    transactions
  };
});

/* =========================
   PRODUCTS
========================= */
ipcMain.handle("products:getAll", async () => {
  const db = await getDb();

  const products = await db.collection("products").aggregate([
    {
      $lookup: {
        from: "categories",
        localField: "category_id",
        foreignField: "id",
        as: "category"
      }
    },
    {
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $sort: { id: -1 }
    },
    {
      $project: {
        _id: 0,
        id: 1,
        barcode: 1,
        barcode_type: 1,
        name: 1,
        category_id: 1,
        category_name: "$category.name",
        sale_type: 1,
        price: 1,
        cost: 1,
        stock: 1,
        alert_limit: 1,
        image: 1
      }
    }
  ]).toArray();

  return products.map((product) => ({
    id: product.id,
    barcode: product.barcode || "",
    barcode_type: product.barcode_type || "CODE128",
    name: product.name || "",
    category_id: product.category_id ?? null,
    category_name: product.category_name || "",
    sale_type: product.sale_type || "قطعة",
    price: toNumber(product.price),
    cost: toNumber(product.cost),
    stock: toNumber(product.stock),
    alert_limit: toNumber(product.alert_limit),
    image: product.image || ""
  }));
});


ipcMain.handle("products:add", async (_event, product) => {
  const db = await getDb();
  const id = await nextSequence("products");

  await db.collection("products").insertOne({
    id,
    barcode: product.barcode || "",
    barcode_type: product.barcodeType || "CODE128",
    name: product.name || "",
    category_id: product.categoryId ?? null,
    sale_type: product.saleType || "قطعة",
    price: toNumber(product.price),
    cost: toNumber(product.cost),
    stock: toNumber(product.stock),
    alert_limit: toNumber(product.alertLimit),
    image: product.image || "",
    created_at: new Date().toISOString()
  });

  // sync بالخلفية بدون تعطيل الإضافة
  syncToServer({
    id,
    barcode: product.barcode || "",
    barcodeType: product.barcodeType || "CODE128",
    name: product.name || "",
    categoryId: product.categoryId ?? null,
    saleType: product.saleType || "قطعة",
    price: toNumber(product.price),
    cost: toNumber(product.cost),
    stock: toNumber(product.stock),
    alertLimit: toNumber(product.alertLimit),
    image: product.image || ""
  }).catch((err) => {
    console.error("sync failed:", err);
  });

  return { success: true, id };
});


ipcMain.handle("products:update", async (_event, product) => {
  const db = await getDb();

  await db.collection("products").updateOne(
    { id: product.id },
    {
      $set: {
        barcode: product.barcode || "",
        barcode_type: product.barcodeType || "CODE128",
        name: product.name || "",
        category_id: product.categoryId ?? null,
        sale_type: product.saleType || "قطعة",
        price: toNumber(product.price),
        cost: toNumber(product.cost),
        stock: toNumber(product.stock),
        alert_limit: toNumber(product.alertLimit),
        image: product.image || "",
        updated_at: new Date().toISOString()
      }
    }
  );

  return { success: true };
});

ipcMain.handle("products:remove", async (_event, id) => {
  const db = await getDb();
  await db.collection("products").deleteOne({ id });
  return { success: true };
});

/* =========================
   SUPPLIERS
========================= */
ipcMain.handle("suppliers:getAll", async () => {
  const db = await getDb();

  return await db.collection("suppliers")
    .find({})
    .sort({ id: -1 })
    .project({ _id: 0 })
    .toArray();
});

ipcMain.handle("suppliers:add", async (_event, supplier) => {
  const db = await getDb();
  const id = await nextSequence("suppliers");

  await db.collection("suppliers").insertOne({
    id,
    name: supplier.name || "",
    phone: supplier.phone || "",
    opening_balance: toNumber(supplier.openingBalance),
    notes: supplier.notes || "",
    created_at: new Date().toISOString()
  });

  return { success: true, id };
});

ipcMain.handle("suppliers:update", async (_event, supplier) => {
  const db = await getDb();

  await db.collection("suppliers").updateOne(
    { id: supplier.id },
    {
      $set: {
        name: supplier.name || "",
        phone: supplier.phone || "",
        opening_balance: toNumber(supplier.openingBalance),
        notes: supplier.notes || ""
      }
    }
  );

  return { success: true };
});

ipcMain.handle("suppliers:remove", async (_event, id) => {
  const db = await getDb();
  await db.collection("suppliers").deleteOne({ id });
  return { success: true };
});

/* =========================
   SETTINGS
========================= */
ipcMain.handle("settings:get", async () => {const db = await getDb();

  return await db.collection("settings").findOne(
    {},
    { projection: { _id: 0 } }
  );
});

ipcMain.handle("settings:save", async (_event, settings) => {
  const db = await getDb();

  const payload = {
    id: 1,
    store_name: settings.storeName || "Ox Store",
    store_phone: settings.storePhone || "",
    store_address: settings.storeAddress || "",
    currency: settings.currency || "ليرة سورية",
    tax_enabled: settings.taxEnabled ? 1 : 0,
    tax_percent: toNumber(settings.taxPercent),
    barcode_type: settings.barcodeType || "CODE128",
    paper_type: settings.paperType || "80mm",
    language: settings.language || "العربية"
  };

  await db.collection("settings").updateOne(
    { id: 1 },
    { $set: payload },
    { upsert: true }
  );

  return { success: true, id: 1 };
});

/* =========================
   INVOICES
========================= */
ipcMain.handle("invoices:add", async (_event, invoiceData) => {
  const db = await getDb();
  const invoiceId = await nextSequence("invoices");
let totalProfit = 0;

for (const item of (invoiceData.items || [])) {
  const qty = toNumber(item.qty);
  const price = toNumber(item.price);
  const cost = toNumber(item.cost);

  totalProfit += (price - cost) * qty;
}

// 👇 أهم تعديل
const paid = toNumber(invoiceData.paid);
const net = toNumber(invoiceData.net);

// إذا ما دفع → ما في ربح
if (paid <= 0) {
  totalProfit = 0;
}

// إذا دفع جزئي → ربح نسبي
else if (paid < net) {
  const ratio = paid / net;
  totalProfit = totalProfit * ratio;
}

  await db.collection("invoices").insertOne({
    id: invoiceId,
    customer_name: invoiceData.customerName || "عميل نقدي",
    payment_method: invoiceData.paymentMethod || "نقدي",
    subtotal: toNumber(invoiceData.subtotal),
    discount_value: toNumber(invoiceData.discount),
    net_total: toNumber(invoiceData.net),
    paid_amount: toNumber(invoiceData.paid),
    rest_amount: toNumber(invoiceData.rest),
    profit_total: toNumber(totalProfit),
    cashier_name: invoiceData.cashierName || "admin",
    created_at: new Date().toISOString()
  });

  for (const item of (invoiceData.items || [])) {
    const itemId = await nextSequence("invoice_items");
    const qty = toNumber(item.qty);
    const price = toNumber(item.price);
    const cost = toNumber(item.cost);
    const lineTotal = qty * price;
    const lineProfit = (price - cost) * qty;

    await db.collection("invoice_items").insertOne({
      id: itemId,
      invoice_id: invoiceId,
      product_id: item.productId ?? null,
      product_name: item.name || "",
      quantity: qty,
      unit_price: price,
      line_total: lineTotal,
      line_profit: lineProfit,
      cost
    });

    if (item.productId) {
      const product = await db.collection("products").findOne({ id: item.productId });
      const currentStock = toNumber(product?.stock);
      const newStock = currentStock - qty;

      await db.collection("products").updateOne(
        { id: item.productId },
        { $set: { stock: newStock } }
      );

      const movementId = await nextSequence("stock_movements");
      await db.collection("stock_movements").insertOne({
        id: movementId,
        product_id: item.productId,
        type: "بيع",
        qty: -qty,
        balance: newStock,
        reason: "فاتورة مبيعات #" + invoiceId,
        created_at: new Date().toISOString()
      });
    }
  }

  return { success: true, invoiceId };
});

ipcMain.handle("invoices:returnItems", async (_event, data) => {
  const db = await getDb();
  const { invoiceId, items } = data;

  for (const item of (items || [])) {
    const qty = toNumber(item.qty);
    const price = toNumber(item.price);
    const cost = toNumber(item.cost);

    const soldDocs = await db.collection("invoice_items")
      .find({ invoice_id: invoiceId, product_id: item.productId })
      .toArray();

    const soldQty = soldDocs.reduce((sum, row) => sum + toNumber(row.quantity), 0);

    const returnedDocs = await db.collection("returns")
      .find({ invoice_id: invoiceId, product_id: item.productId })
      .toArray();

    const returnedQty = returnedDocs.reduce((sum, row) => sum + toNumber(row.qty), 0);
    const availableQty = soldQty - returnedQty;

    if (qty > availableQty) {
      throw new Error("الكمية المسموحة للمرتجع للمنتج " + (item.name || "") + " هي " + availableQty + " فقط");
    }

    const total = qty * price;
    const profitLoss = (price - cost) * qty;
    const returnId = await nextSequence("returns");

    await db.collection("returns").insertOne({
      id: returnId,
      invoice_id: invoiceId,
      product_id: item.productId ?? null,
      product_name: item.name || "",
      qty,
      unit_price: price,
      total,
      reason: item.reason || "",
      cashier: "admin",
      created_at: new Date().toISOString()
    });

    if (item.productId) {
      const product = await db.collection("products").findOne({ id: item.productId });
      const currentStock = toNumber(product?.stock);
      const newStock = currentStock + qty;

      await db.collection("products").updateOne(
        { id: item.productId },
        { $set: { stock: newStock } }
      );

      const movementId = await nextSequence("stock_movements");
      await db.collection("stock_movements").insertOne({
        id: movementId,
        product_id: item.productId,
        type: "مرتجع فاتورة",
        qty,
        balance: newStock,
        reason: "مرتجع فاتورة #" + invoiceId,
        created_at: new Date().toISOString()
      });
    }

    const invoice = await db.collection("invoices").findOne({ id: invoiceId });
    await db.collection("invoices").updateOne(
      { id: invoiceId },
      { $set: { profit_total: toNumber(invoice?.profit_total) - profitLoss } }
    );
  }

  return { success: true };
});

ipcMain.handle("invoices:getAll", async () => {
  const db = await getDb();

  return await db.collection("invoices")
    .find({})
    .sort({ id: -1 })
    .project({ _id: 0 })
    .toArray();
});

ipcMain.handle("invoices:getItems", async (_event, invoiceId) => {
  const db = await getDb();

  return await db.collection("invoice_items")
    .find({ invoice_id: invoiceId })
    .sort({ id: 1 })
    .project({ _id: 0 })
    .toArray();
});

ipcMain.handle("invoices:getById", async (_event, invoiceId) => {
  const db = await getDb();

  const invoice = await db.collection("invoices").findOne({ id: invoiceId });
  if (!invoice) return null;

  const itemsRaw = await db.collection("invoice_items")
    .find({ invoice_id: invoiceId })
    .sort({ id: 1 })
    .toArray();

  const returnsRaw = await db.collection("returns").find({ invoice_id: invoiceId }).toArray();

  const items = itemsRaw.map(ii => {
    const returnedQty = returnsRaw
      .filter(r => r.product_id === ii.product_id)
      .reduce((sum, r) => sum + toNumber(r.qty), 0);

    return {
      productId: ii.product_id,
      name: ii.product_name || "",
      qty: toNumber(ii.quantity),
      price: toNumber(ii.unit_price),
      cost: toNumber(ii.cost),
      total: toNumber(ii.line_total),
      profit: toNumber(ii.line_profit),
      returnedQty
    };
  });

  return {
    id: invoice.id,
    customerName: invoice.customer_name || "عميل نقدي",
    paymentMethod: invoice.payment_method || "نقدي",
    subtotal: toNumber(invoice.subtotal),
    discount: toNumber(invoice.discount_value),
    net: toNumber(invoice.net_total),
    paid: toNumber(invoice.paid_amount),
    rest: toNumber(invoice.rest_amount),
    profit: toNumber(invoice.profit_total),
    cashierName: invoice.cashier_name || "admin",
    createdAt: invoice.created_at || "",
    items
  };
});

/* =========================
   CUSTOMERS
========================= */
ipcMain.handle("customers:getAll", async () => {
  const db = await getDb();

  return await db.collection("customers")
    .find({})
    .sort({ id: -1 })
    .project({ _id: 0 })
    .toArray();
});

ipcMain.handle("customers:add", async (_event, customer) => {
  const db = await getDb();
  const id = await nextSequence("customers");

  await db.collection("customers").insertOne({
    id,
    name: customer.name || "",
    phone: customer.phone || "",
    notes: customer.notes || "",
    status: customer.status || "مسدد",
    due_balance: toNumber(customer.dueBalance),
    unpaid_invoices: toNumber(customer.unpaidInvoices),
    total_purchases: 0,last_operation: todayDate()
  });

  return { success: true, id };
});

ipcMain.handle("customers:update", async (_event, customer) => {
  const db = await getDb();

  await db.collection("customers").updateOne(
    { id: customer.id },
    {
      $set: {
        name: customer.name || "",
        phone: customer.phone || "",
        notes: customer.notes || "",
        status: customer.status || "مسدد",
        due_balance: toNumber(customer.dueBalance),
        unpaid_invoices: toNumber(customer.unpaidInvoices)
      }
    }
  );

  return { success: true };
});

ipcMain.handle("customers:remove", async (_event, id) => {
  const db = await getDb();
  await db.collection("customers").deleteOne({ id });
  return { success: true };
});

/* =========================
   EXPENSES
========================= */
ipcMain.handle("expenses:getAll", async () => {
  const db = await getDb();

  return await db.collection("expenses")
    .find({})
    .sort({ id: -1 })
    .project({ _id: 0 })
    .toArray();
});

ipcMain.handle("expenses:add", async (_event, expense) => {
  const db = await getDb();
  const id = await nextSequence("expenses");

  await db.collection("expenses").insertOne({
    id,
    title: expense.title || "",
    amount: toNumber(expense.amount),
    category: expense.category || "عام",
    cashier: expense.cashier || "admin",
    notes: expense.notes || "",
    created_at: new Date().toISOString()
  });

  return { success: true, id };
});

ipcMain.handle("expenses:update", async (_event, expense) => {
  const db = await getDb();

  await db.collection("expenses").updateOne(
    { id: expense.id },
    {
      $set: {
        title: expense.title || "",
        amount: toNumber(expense.amount),
        category: expense.category || "عام",
        cashier: expense.cashier || "admin",
        notes: expense.notes || ""
      }
    }
  );

  return { success: true };
});

ipcMain.handle("expenses:remove", async (_event, id) => {
  const db = await getDb();
  await db.collection("expenses").deleteOne({ id });
  return { success: true };
});

/* =========================
   RETURNS
========================= */
ipcMain.handle("returns:getAll", async () => {
  const db = await getDb();

  return await db.collection("returns")
    .find({})
    .sort({ id: -1 })
    .project({ _id: 0 })
    .toArray();
});

ipcMain.handle("returns:add", async (_event, returnData) => {
  const db = await getDb();
  const id = await nextSequence("returns");

  await db.collection("returns").insertOne({
    id,
    product_id: returnData.productId ?? null,
    product_name: returnData.productName || "",
    qty: toNumber(returnData.qty),
    unit_price: toNumber(returnData.unitPrice),
    total: toNumber(returnData.total),
    reason: returnData.reason || "",
    cashier: returnData.cashier || "admin",
    created_at: new Date().toISOString()
  });

  if (returnData.productId) {
    const product = await db.collection("products").findOne({ id: returnData.productId });
    const currentStock = toNumber(product?.stock);
    const newStock = currentStock + toNumber(returnData.qty);

    await db.collection("products").updateOne(
      { id: returnData.productId },
      { $set: { stock: newStock } }
    );

    const movementId = await nextSequence("stock_movements");
    await db.collection("stock_movements").insertOne({
      id: movementId,
      product_id: returnData.productId,
      type: "مرتجع",
      qty: toNumber(returnData.qty),
      balance: newStock,
      reason: returnData.reason || "مرتجع",
      created_at: new Date().toISOString()
    });
  }

  return { success: true, id };
});

ipcMain.handle("returns:remove", async (_event, id) => {
  const db = await getDb();
  await db.collection("returns").deleteOne({ id });
  return { success: true };
});

ipcMain.handle("returns:update", async (_event, returnData) => {
  const db = await getDb();

  await db.collection("returns").updateOne(
    { id: toNumber(returnData.id) },
    {
      $set: {
        product_id: returnData.productId ?? null,
        product_name: returnData.productName || "",
        qty: toNumber(returnData.qty),
        unit_price: toNumber(returnData.unitPrice),
        total: toNumber(returnData.total),
        reason: returnData.reason || "",
        cashier: returnData.cashier || "admin"
      }
    }
  );

  return { success: true };
});

/* =========================
   STOCK MOVEMENTS
========================= */
ipcMain.handle("stock:getMovements", async (_event, productId) => {
  const db = await getDb();

  return await db.collection("stock_movements")
    .find({ product_id: productId })
    .sort({ id: -1 })
    .project({ _id: 0 })
    .toArray();
});

/* =========================
   BACKUP / RESTORE - JSON
========================= */
ipcMain.handle("backup:create", async () => {
  try {
    const db = await getDb();
    const now = new Date();

    const fileName =
      "oxstore-backup-" +
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0") +
      "_" +
      String(now.getHours()).padStart(2, "0") +
      "-" +
      String(now.getMinutes()).padStart(2, "0") +
      ".json";

    const result = await dialog.showSaveDialog({
      title: "حفظ نسخة احتياطية",
      defaultPath: fileName,
      filters: [{ name: "JSON Backup", extensions: ["json"] }]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, message: "تم الإلغاء" };
    }

    const backup = {};
    for (const name of COLLECTIONS) {
      backup[name] = await db.collection(name).find({}).toArray();
    }

    fs.writeFileSync(result.filePath, JSON.stringify(backup, null, 2), "utf8");

    return { success: true, message: "تم إنشاء النسخة الاحتياطية بنجاح" };
  } catch (error) {
    console.error("خطأ إنشاء النسخة الاحتياطية:", error);
    return { success: false, message: "فشل إنشاء النسخة الاحتياطية" };
  }
});

ipcMain.handle("backup:restore", async () => {
  try {
    const db = await getDb();
    const result = await dialog.showOpenDialog({
      title: "اختيار ملف النسخة الاحتياطية",
      properties: ["openFile"],
      filters: [{ name: "JSON Backup", extensions: ["json"] }]
    });

    if (result.canceled || !result.filePaths?.length) {
      return { success: false, message: "تم الإلغاء" };
    }

    const selectedFile = result.filePaths[0];
    const raw = fs.readFileSync(selectedFile, "utf8");
    const backup = JSON.parse(raw);

    for (const name of COLLECTIONS) {
      await db.collection(name).deleteMany({});
      if (Array.isArray(backup[name]) && backup[name].length) {
        await db.collection(name).insertMany(backup[name]);
      }
    }

    return {
      success: true,
      message: "تمت استعادة النسخة الاحتياطية بنجاح."
    };
  } catch (error) {
    console.error("خطأ استعادة النسخة الاحتياطية:", error);
    return { success: false, message: "فشل استعادة النسخة الاحتياطية" };
  }
});

/* =========================
   BARCODE LOOKUP
========================= */
ipcMain.handle("products:getByBarcode", async (_event, barcode) => {
  const db = await getDb();

  const product = await db.collection("products").findOne({
    barcode: String(barcode || "").trim()
  });

  if (!product) return null;

  return {
    id: product.id,
    barcode: product.barcode || "",
    barcode_type: product.barcode_type || "CODE128",
    name: product.name || "",
    category_id: product.category_id ?? null,
    sale_type: product.sale_type || "قطعة",
    price: toNumber(product.price),
    cost: toNumber(product.cost),
    stock: toNumber(product.stock),
    alert_limit: toNumber(product.alert_limit)
  };
});