const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { getDb } = require("./db");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/* =========================
   DB CHECK
========================= */
(async () => {
  try {
    await getDb();
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ DB ERROR:", err);
  }
})();

/* =========================
   HELPERS
========================= */
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

async function nextSequence(name) {
  const db = await getDb();

  const result = await db.collection("counters").findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );

  return result?.seq ?? result?.value?.seq ?? 1;
}

/* =========================
   AUTH
========================= */
app.post("/api/auth/login", async (req, res) => {
  try {
    const db = await getDb();
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "").trim();

    const user = await db.collection("users").findOne({
      username,
      password,
      is_active: 1
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "بيانات الدخول غير صحيحة"
      });
    }

    const roleRow = await db.collection("role_permissions").findOne({
      role: user.role
    });

    const permissions =
      user.role === "admin"
        ? ["all"]
        : (roleRow ? JSON.parse(roleRow.permissions || "[]") : []);

    return res.json({
      success: true,
      data: {
        id: user.id,
        fullName: user.full_name || "",
        username: user.username || "",
        role: user.role || "cashier",
        permissions
      }
    });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    return res.status(500).json({
      success: false,
      message: "login error"
    });
  }
});
/* =========================
   USERS
========================= */
app.get("/api/users", async (_req, res) => {
  try {
    const db = await getDb();
    const rows = await db.collection("users")
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

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("users:getAll error:", e);
    res.status(500).json({ success: false, message: "فشل تحميل المستخدمين" });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const db = await getDb();
    const user = req.body;
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

    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error("users:add error:", e);
    res.status(500).json({ success: false, message: "فشل إضافة المستخدم" });
  }
});

app.put("/api/users/:id", async (req, res) => {
  try {
    const db = await getDb();
    const id = toNumber(req.params.id);

    await db.collection("users").updateOne(
      { id },
      {
        $set: {
          full_name: req.body.fullName || "",
          username: req.body.username || "",
          password: req.body.password || "",
          role: req.body.role || "cashier",
          is_active: req.body.isActive ? 1 : 0
        }
      }
    );

    res.json({ success: true, data: true });
  } catch (e) {
    console.error("users:update error:", e);
    res.status(500).json({ success: false, message: "فشل تعديل المستخدم" });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    const db = await getDb();
    const id = toNumber(req.params.id);

    const user = await db.collection("users").findOne({ id });
    if (!user) {
      return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }

    if (user.username === "admin") {
      return res.status(400).json({ success: false, message: "لا يمكن حذف المستخدم admin" });
    }

    await db.collection("users").deleteOne({ id });

    res.json({ success: true, data: true });
  } catch (e) {
    console.error("users:remove error:", e);
    res.status(500).json({ success: false, message: "فشل حذف المستخدم" });
  }
});

/* =========================
   PERMISSIONS
========================= */
app.get("/api/permissions/:role", async (req, res) => {
  try {
    const db = await getDb();
    const role = req.params.role;
    const row = await db.collection("role_permissions").findOne({ role });

    res.json({
      success: true,
      data: row ? JSON.parse(row.permissions || "[]") : []
    });
  } catch (e) {
    console.error("permissions:getByRole error:", e);
    res.status(500).json({ success: false, message: "فشل تحميل الصلاحيات" });
  }
});

app.put("/api/permissions", async (req, res) => {
  try {
    const db = await getDb();
    const data = req.body;

    await db.collection("role_permissions").updateOne(
      { role: data.role },
      { $set: { permissions: JSON.stringify(data.permissions || []) } },
      { upsert: true }
    );

    res.json({ success: true, data: true });
  } catch (e) {
    console.error("permissions:updateRole error:", e);
    res.status(500).json({ success: false, message: "فشل حفظ الصلاحيات" });
  }
});

/* =========================
   CATEGORIES
========================= */
app.get("/api/categories", async (_req, res) => {
  try {
    const db = await getDb();
    const rows = await db.collection("categories")
      .find({})
      .sort({ id: -1 })
      .project({ _id: 0, id: 1, name: 1 })
      .toArray();

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("categories:getAll error:", e);
    res.status(500).json({ success: false, message: "فشل تحميل الفئات" });
  }
});

app.post("/api/categories", async (req, res) => {
  try {
    const db = await getDb();
    const cleanName = String(req.body.name || "").trim();

    if (!cleanName) {
      return res.status(400).json({
        success: false,
        message: "اسم الفئة مطلوب"
      });
    }

    const existing = await db.collection("categories").findOne({ name: cleanName });
    if (existing) {
      return res.json({
        success: true,
        data: { id: existing.id, name: existing.name }
      });
    }

    const id = await nextSequence("categories");

    await db.collection("categories").insertOne({
      id,
      name: cleanName,
      created_at: new Date().toISOString()
    });

    res.json({
      success: true,
      data: { id, name: cleanName }
    });
  } catch (e) {
    console.error("categories:add error:", e);
    res.status(500).json({ success: false, message: "فشل إضافة الفئة" });
  }
});

app.delete("/api/categories/:id", async (req, res) => {
  try {
    const db = await getDb();
    const id = toNumber(req.params.id);

    await db.collection("categories").deleteOne({ id });

    res.json({ success: true, data: true });
  } catch (e) {
    console.error("categories:remove error:", e);
    res.status(500).json({ success: false, message: "فشل حذف الفئة" });
  }
});

/* =========================
   PRODUCTS
========================= */
app.get("/api/products", async (_req, res) => {
  try {
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

    res.json({ success: true, data: products });
  } catch (e) {
    console.error("products:getAll error:", e);
    res.status(500).json({ success: false, message: "فشل تحميل المنتجات" });
  }
});

app.post("/api/products", async (req, res) => {
  try {
    const db = await getDb();
    const p = req.body;
    const id = await nextSequence("products");

    await db.collection("products").insertOne({
      id,
      barcode: p.barcode || "",
      barcode_type: p.barcodeType || "CODE128",
      name: p.name || "",
      category_id: p.categoryId ?? null,
      sale_type: p.saleType || "قطعة",
      price: toNumber(p.price),
      cost: toNumber(p.cost),
      stock: toNumber(p.stock),
      alert_limit: toNumber(p.alertLimit),
      image: p.image || "",
      created_at: new Date().toISOString()
    });

    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error("products:add error:", e);
    res.status(500).json({ success: false, message: "فشل إضافة المنتج" });
  }
});

app.put("/api/products/:id", async (req, res) => {
  try {
    const db = await getDb();
    const id = toNumber(req.params.id);
    const p = req.body;

    await db.collection("products").updateOne(
      { id },
      {
        $set: {
          barcode: p.barcode || "",
          barcode_type: p.barcodeType || "CODE128",
          name: p.name || "",
          category_id: p.categoryId ?? null,
          sale_type: p.saleType || "قطعة",
          price: toNumber(p.price),
          cost: toNumber(p.cost),
          stock: toNumber(p.stock),
          alert_limit: toNumber(p.alertLimit),
          image: p.image || "",
          updated_at: new Date().toISOString()
        }
      }
    );

    res.json({ success: true, data: true });
  } catch (e) {
    console.error("products:update error:", e);
    res.status(500).json({ success: false, message: "فشل تعديل المنتج" });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    const db = await getDb();
    const id = toNumber(req.params.id);

    await db.collection("products").deleteOne({ id });

    res.json({ success: true, data: true });
  } catch (e) {
    console.error("products:remove error:", e);
    res.status(500).json({ success: false, message: "فشل حذف المنتج" });
  }
});

app.get("/api/products/barcode/:code", async (req, res) => {
  try {
    const db = await getDb();
    const code = String(req.params.code || "").trim();

    const product = await db.collection("products").findOne({ barcode: code });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "المنتج غير موجود"
      });
    }

    res.json({ success: true, data: product });
  } catch (e) {
    console.error("products:getByBarcode error:", e);
    res.status(500).json({ success: false, message: "فشل جلب المنتج" });
  }
});

/* =========================
   SUPPLIERS
========================= */
app.get("/api/suppliers", async (_req, res) => {
  try {
    const db = await getDb();
    const rows = await db.collection("suppliers")
      .find({})
      .sort({ id: -1 })
      .project({ _id: 0 })
      .toArray();

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("suppliers:getAll error:", e);
    res.status(500).json({ success: false, message: "فشل تحميل الموردين" });
  }
});

app.post("/api/suppliers", async (req, res) => {
  try {
    const db = await getDb();
    const supplier = req.body;
    const id = await nextSequence("suppliers");

    await db.collection("suppliers").insertOne({
      id,
      name: supplier.name || "",
      phone: supplier.phone || "",
      opening_balance: toNumber(supplier.openingBalance),
      notes: supplier.notes || "",
      created_at: new Date().toISOString()
    });

    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error("suppliers:add error:", e);
    res.status(500).json({ success: false, message: "فشل إضافة المورد" });
  }
});

app.put("/api/suppliers/:id", async (req, res) => {
  try {
    const db = await getDb();
    const id = toNumber(req.params.id);
    const supplier = req.body;

    await db.collection("suppliers").updateOne(
      { id },
      {
        $set: {
          name: supplier.name || "",
          phone: supplier.phone || "",
          opening_balance: toNumber(supplier.openingBalance),
          notes: supplier.notes || ""
        }
      }
    );

    res.json({ success: true, data: true });
  } catch (e) {
    console.error("suppliers:update error:", e);
    res.status(500).json({ success: false, message: "فشل تعديل المورد" });
  }
});

app.delete("/api/suppliers/:id", async (req, res) => {
  try {
    const db = await getDb();
    const id = toNumber(req.params.id);

    await db.collection("suppliers").deleteOne({ id });

    res.json({ success: true, data: true });
  } catch (e) {
    console.error("suppliers:remove error:", e);
    res.status(500).json({ success: false, message: "فشل حذف المورد" });
  }
});

/* =========================
   SETTINGS
========================= */
app.get("/api/settings", async (_req, res) => {
  try {
    const db = await getDb();
    const row = await db.collection("settings").findOne({}, { projection: { _id: 0 } });

    res.json({ success: true, data: row || {} });
  } catch (e) {
    console.error("settings:get error:", e);
    res.status(500).json({ success: false, message: "فشل تحميل الإعدادات" });
  }
});

app.put("/api/settings", async (req, res) => {
  try {
    const db = await getDb();
    const settings = req.body;

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

    res.json({ success: true, data: true });
  } catch (e) {
    console.error("settings:save error:", e);
    res.status(500).json({ success: false, message: "فشل حفظ الإعدادات" });
  }
});

/* =========================
   CUSTOMERS
========================= */
app.get("/api/customers", async (_req, res) => {
  try {
    const db = await getDb();
    const rows = await db.collection("customers")
      .find({})
      .sort({ id: -1 })
      .project({ _id: 0 })
      .toArray();

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("customers:getAll error:", e);
    res.status(500).json({ success: false, message: "فشل تحميل العملاء" });
  }
});

app.post("/api/customers", async (req, res) => {
  try {
    const db = await getDb();
    const customer = req.body;
    const id = await nextSequence("customers");

    await db.collection("customers").insertOne({
      id,
      name: customer.name || "",
      phone: customer.phone || "",
      notes: customer.notes || "",
      status: customer.status || "مسدد",
      due_balance: toNumber(customer.dueBalance),
      unpaid_invoices: toNumber(customer.unpaidInvoices),
      total_purchases: toNumber(customer.totalPurchases),
      last_operation: customer.lastOperation || todayDate(),
      created_at: new Date().toISOString()
    });

    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error("customers:add error:", e);
    res.status(500).json({ success: false, message: "فشل إضافة العميل" });
  }
});

app.put("/api/customers/:id", async (req, res) => {
  try {
    const db = await getDb();
    const id = toNumber(req.params.id);
    const customer = req.body;

    await db.collection("customers").updateOne(
      { id },
      {
        $set: {
          name: customer.name || "",
          phone: customer.phone || "",
          notes: customer.notes || "",
          status: customer.status || "مسدد",
          due_balance: toNumber(customer.dueBalance),
          unpaid_invoices: toNumber(customer.unpaidInvoices),
          total_purchases: toNumber(customer.totalPurchases),
          last_operation: customer.lastOperation || todayDate()
        }
      }
    );

    res.json({ success: true, data: true });
  } catch (e) {
    console.error("customers:update error:", e);
    res.status(500).json({ success: false, message: "فشل تعديل العميل" });
  }
});

app.delete("/api/customers/:id", async (req, res) => {
  try {
    const db = await getDb();
    const id = toNumber(req.params.id);

    await db.collection("customers").deleteOne({ id });

    res.json({ success: true, data: true });
  } catch (e) {
    console.error("customers:remove error:", e);
    res.status(500).json({ success: false, message: "فشل حذف العميل" });
  }
});

app.post("/api/customers/payment", async (req, res) => {
  try {
    const db = await getDb();
    const customerId = toNumber(req.body.customerId);
    const amount = toNumber(req.body.amount);
    const notes = req.body.notes || "";

    if (!customerId || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "بيانات الدفعة غير صحيحة"
      });
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
    const currentDue = toNumber(customer?.due_balance);
    const newDue = Math.max(currentDue - amount, 0);

    await db.collection("customers").updateOne(
      { id: customerId },
      {
        $set: {
          due_balance: newDue,
          status: newDue > 0 ? "عليه فلوس" : "مسدد",
          last_operation: todayDate()
        }
      }
    );

    res.json({ success: true, data: true });
  } catch (e) {
    console.error("customers:addPayment error:", e);
    res.status(500).json({ success: false, message: "فشل تسجيل الدفعة" });
  }
});

app.get("/api/customers/:id/statement", async (req, res) => {
  try {
    const db = await getDb();
    const customerId = toNumber(req.params.id);

    const customer = await db.collection("customers").findOne({ id: customerId });
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "العميل غير موجود"
      });
    }

    const transactions = await db.collection("customer_transactions")
      .find({ customer_id: customerId })
      .sort({ id: -1 })
      .project({ _id: 0 })
      .toArray();

    res.json({
      success: true,
      data: {
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
      }
    });
  } catch (e) {
    console.error("customers:getStatement error:", e);
    res.status(500).json({ success: false, message: "فشل تحميل كشف الحساب" });
  }
});

/* =========================
   EXPENSES
========================= */
app.get("/api/expenses", async (_req, res) => {
  try {
    const db = await getDb();
    const rows = await db.collection("expenses")
      .find({})
      .sort({ id: -1 })
      .project({ _id: 0 })
      .toArray();

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("expenses:getAll error:", e);
    res.status(500).json({ success: false, message: "فشل تحميل المصروفات" });
  }
});

app.post("/api/expenses", async (req, res) => {
  try {
    const db = await getDb();
    const expense = req.body;
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

    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error("expenses:add error:", e);
    res.status(500).json({ success: false, message: "فشل إضافة المصروف" });
  }
});

app.put("/api/expenses/:id", async (req, res) => {
  try {
    const db = await getDb();
    const id = toNumber(req.params.id);
    const expense = req.body;

    await db.collection("expenses").updateOne(
      { id },
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

    res.json({ success: true, data: true });
  } catch (e) {
    console.error("expenses:update error:", e);
    res.status(500).json({ success: false, message: "فشل تعديل المصروف" });
  }
});

app.delete("/api/expenses/:id", async (req, res) => {
  try {
    const db = await getDb();
    const id = toNumber(req.params.id);

    await db.collection("expenses").deleteOne({ id });

    res.json({ success: true, data: true });
  } catch (e) {
    console.error("expenses:remove error:", e);
    res.status(500).json({ success: false, message: "فشل حذف المصروف" });
  }
});

/* =========================
   RETURNS
========================= */
app.get("/api/returns", async (_req, res) => {
  try {
    const db = await getDb();
    const rows = await db.collection("returns")
      .find({})
      .sort({ id: -1 })
      .project({ _id: 0 })
      .toArray();

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("returns:getAll error:", e);
    res.status(500).json({ success: false, message: "فشل تحميل المرتجعات" });
  }
});

app.post("/api/returns", async (req, res) => {
  try {
    const db = await getDb();
    const returnData = req.body;
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

    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error("returns:add error:", e);
    res.status(500).json({ success: false, message: "فشل إضافة المرتجع" });
  }
});

app.put("/api/returns/:id", async (req, res) => {
  try {
    const db = await getDb();
    const id = toNumber(req.params.id);
    const returnData = req.body;

    await db.collection("returns").updateOne(
      { id },
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

    res.json({ success: true, data: true });
  } catch (e) {
    console.error("returns:update error:", e);
    res.status(500).json({ success: false, message: "فشل تعديل المرتجع" });
  }
});

app.delete("/api/returns/:id", async (req, res) => {
  try {
    const db = await getDb();
    const id = toNumber(req.params.id);

    await db.collection("returns").deleteOne({ id });

    res.json({ success: true, data: true });
    } catch (e) {
    console.error("returns:remove error:", e);
    res.status(500).json({ success: false, message: "فشل حذف المرتجع" });
  }
});


/* =========================
   INVOICES
========================= */
app.get("/api/invoices", async (_req, res) => {
  try {
    const db = await getDb();
    const rows = await db.collection("invoices")
      .find({})
      .sort({ id: -1 })
      .project({ _id: 0 })
      .toArray();

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("invoices:getAll error:", e);
    res.status(500).json({ success: false, message: "فشل تحميل الفواتير" });
  }
});

app.get("/api/invoices/:id", async (req, res) => {
  try {
    const db = await getDb();
    const invoiceId = toNumber(req.params.id);

    const invoice = await db.collection("invoices").findOne({ id: invoiceId });
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "الفاتورة غير موجودة"
      });
    }

    const itemsRaw = await db.collection("invoice_items")
      .find({ invoice_id: invoiceId })
      .sort({ id: 1 })
      .toArray();

    const returnsRaw = await db.collection("returns")
      .find({ invoice_id: invoiceId })
      .toArray();

    const items = itemsRaw.map((ii) => {
      const returnedQty = returnsRaw
        .filter((r) => r.product_id === ii.product_id)
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

    res.json({
      success: true,
      data: {
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
      }
    });
  } catch (e) {
    console.error("invoices:getById error:", e);
    res.status(500).json({ success: false, message: "فشل تحميل الفاتورة" });
  }
});

app.get("/api/invoices/:id/items", async (req, res) => {
  try {
    const db = await getDb();
    const invoiceId = toNumber(req.params.id);

    const rows = await db.collection("invoice_items")
      .find({ invoice_id: invoiceId })
      .sort({ id: 1 })
      .project({ _id: 0 })
      .toArray();

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("invoices:getItems error:", e);
    res.status(500).json({ success: false, message: "فشل تحميل عناصر الفاتورة" });
  }
});

app.post("/api/invoices", async (req, res) => {
  try {
    const db = await getDb();
    const invoiceData = req.body;
    const invoiceId = await nextSequence("invoices");

    let totalProfit = 0;

    for (const item of (invoiceData.items || [])) {
      const qty = toNumber(item.qty);
      const price = toNumber(item.price);
      const cost = toNumber(item.cost);
      totalProfit += (price - cost) * qty;
    }

    await db.collection("invoices").insertOne({
      id: invoiceId,
      customer_id: invoiceData.customerId ? toNumber(invoiceData.customerId) : null,
      customer_name: invoiceData.customerName || "عميل نقدي",
      payment_method: invoiceData.paymentMethod || "نقدي",
      subtotal: toNumber(invoiceData.subtotal),
      discount_value: toNumber(invoiceData.discount),
      net_total: toNumber(invoiceData.net),
      paid_amount: toNumber(invoiceData.paid),
      rest_amount: toNumber(invoiceData.rest),
      profit_total: totalProfit,
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
        const newStock = toNumber(product?.stock) - qty;

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
          reason: "فاتورة #" + invoiceId,
          created_at: new Date().toISOString()
        });
      }
    }
     console.log("REST =", invoiceData.rest);
     console.log("CUSTOMER ID =", invoiceData.customerId);
     console.log("INVOICE DATA =", invoiceData);
    // تسجيل الدين إذا في باقي
    if (toNumber(invoiceData.rest) > 0 && invoiceData.customerId) {
      const customerId = toNumber(invoiceData.customerId);
      const trxId = await nextSequence("customer_transactions");

      await db.collection("customer_transactions").insertOne({
        id: trxId,
        customer_id: customerId,
        type: "invoice",
        amount: toNumber(invoiceData.rest),
        description: "فاتورة #" + invoiceId,
        created_at: new Date().toISOString()
      });

      const customer = await db.collection("customers").findOne({ id: customerId });
     const currentDue = toNumber(customer?.dueBalance);
const newDue = currentDue + toNumber(invoiceData.rest);

await db.collection("customers").updateOne(
  { id: customerId },
  {
    $set: {
      dueBalance: newDue,
      status: "عليه فلوس",
      unpaidInvoices: 1,
      lastOperation: new Date().toISOString().slice(0, 10)
    }
  }
);
    }
   console.log("invoice saved:", invoiceId);
   console.log("rest =", invoiceData.rest, "customerId =", invoiceData.customerId);
    res.json({ success: true, data: { invoiceId } });
 } catch (e) {
  console.error("invoices:add error:", e);
  console.error("invoiceData =", JSON.stringify(req.body, null, 2));
  res.status(500).json({
    success: false,
    message: "فشل إنشاء الفاتورة",
    error: e.message || String(e)
  });
}
});
    
app.post("/api/invoices/return-items", async (req, res) => {
  try {
    const db = await getDb();
    const { invoiceId, items } = req.body;

    for (const item of items || []) {
      const qty = toNumber(item.qty);
      const price = toNumber(item.price);
      const cost = toNumber(item.cost);

      const soldDocs = await db.collection("invoice_items")
        .find({ invoice_id: toNumber(invoiceId), product_id: item.productId })
        .toArray();

      const soldQty = soldDocs.reduce((s, r) => s + toNumber(r.quantity), 0);

      const returnedDocs = await db.collection("returns")
        .find({ invoice_id: toNumber(invoiceId), product_id: item.productId })
        .toArray();

      const returnedQty = returnedDocs.reduce((s, r) => s + toNumber(r.qty), 0);

      const available = soldQty - returnedQty;

      if (qty > available) {
        return res.status(400).json({
          success: false,
          message: "الكمية أكبر من المسموح"
        });
      }

      const returnId = await nextSequence("returns");

      await db.collection("returns").insertOne({
        id: returnId,
        invoice_id: toNumber(invoiceId),
        product_id: item.productId,
        product_name: item.name || "",
        qty,
        unit_price: price,
        total: qty * price,
        reason: item.reason || "",
        cashier: "admin",
        created_at: new Date().toISOString()
      });

      const product = await db.collection("products").findOne({ id: item.productId });
      const newStock = toNumber(product?.stock) + qty;

      await db.collection("products").updateOne(
        { id: item.productId },
        { $set: { stock: newStock } }
      );
    }

    res.json({ success: true });

  } catch (e) {
    console.error("returns error:", e);
    res.status(500).json({ success: false });
  }
});

/* =========================
   STATIC + START
========================= */
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});