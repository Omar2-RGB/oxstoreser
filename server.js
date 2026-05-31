const express = require("express");
const cors = require("cors");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/* =========================
   SUPABASE SETUP
========================= */
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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

/* =========================
   AUTH
========================= */
app.post("/api/auth/login", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "").trim();

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .eq("is_active", 1)
      .single();

    if (error || !user || user.password !== password) {
      return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
    }

    const { data: roleRow } = await supabase
      .from("role_permissions")
      .select("permissions")
      .eq("role", user.role)
      .single();

    const permissions = user.role === "admin" ? ["all"] : (roleRow ? JSON.parse(roleRow.permissions || "[]") : []);

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
    return res.status(500).json({ success: false, message: "login error" });
  }
});

/* =========================
   USERS
========================= */
app.get("/api/users", async (_req, res) => {
  const { data, error } = await supabase.from("users").select("*").order("id", { ascending: false });
  if (error) return res.status(500).json({ success: false });
  res.json({ success: true, data });
});

app.post("/api/users", async (req, res) => {
  const user = req.body;
  const { data, error } = await supabase.from("users").insert([{
    full_name: user.fullName || "",
    username: user.username || "",
    password: user.password || "",
    role: user.role || "cashier",
    is_active: user.isActive ? 1 : 0
  }]).select().single();
  if (error) return res.status(500).json({ success: false });
  res.json({ success: true, data: { id: data.id } });
});

app.put("/api/users/:id", async (req, res) => {
  const id = toNumber(req.params.id);
  const { error } = await supabase.from("users").update({
    full_name: req.body.fullName || "",
    username: req.body.username || "",
    password: req.body.password || "",
    role: req.body.role || "cashier",
    is_active: req.body.isActive ? 1 : 0
  }).eq("id", id);
  if (error) return res.status(500).json({ success: false });
  res.json({ success: true, data: true });
});

app.delete("/api/users/:id", async (req, res) => {
  const id = toNumber(req.params.id);
  const { data: user } = await supabase.from("users").select("username").eq("id", id).single();
  if (user?.username === "admin") return res.status(400).json({ success: false, message: "لا يمكن حذف المسؤول" });
  
  await supabase.from("users").delete().eq("id", id);
  res.json({ success: true, data: true });
});

/* =========================
   CATEGORIES & PRODUCTS
========================= */
app.get("/api/categories", async (_req, res) => {
  const { data, error } = await supabase.from("categories").select("id, name").order("id", { ascending: false });
  res.json({ success: !error, data: data || [] });
});

app.post("/api/categories", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const { data, error } = await supabase.from("categories").insert([{ name }]).select().single();
  res.json({ success: !error, data: { id: data?.id, name } });
});

app.get("/api/products", async (_req, res) => {
  // جلب المنتجات مع اسم الفئة من جدول الفئات
  const { data, error } = await supabase.from("products").select(`*, categories (name)`).order("id", { ascending: false });
  const formattedData = (data || []).map(p => ({
    ...p,
    category_name: p.categories?.name || null
  }));
  res.json({ success: !error, data: formattedData });
});

app.post("/api/products", async (req, res) => {
  const p = req.body;
  const { data, error } = await supabase.from("products").insert([{
    barcode: p.barcode,
    barcode_type: p.barcodeType || "CODE128",
    name: p.name,
    category_id: p.categoryId,
    sale_type: p.saleType || "قطعة",
    price: toNumber(p.price),
    cost: toNumber(p.cost),
    stock: toNumber(p.stock),
    alert_limit: toNumber(p.alertLimit),
    image: p.image || ""
  }]).select().single();
  res.json({ success: !error, data: { id: data?.id } });
});

app.put("/api/products/:id", async (req, res) => {
  const id = toNumber(req.params.id);
  const p = req.body;
  const { error } = await supabase.from("products").update({
    barcode: p.barcode,
    barcode_type: p.barcodeType,
    name: p.name,
    category_id: p.categoryId,
    sale_type: p.saleType,
    price: toNumber(p.price),
    cost: toNumber(p.cost),
    stock: toNumber(p.stock),
    alert_limit: toNumber(p.alertLimit),
    image: p.image
  }).eq("id", id);
  res.json({ success: !error, data: true });
});

app.delete("/api/products/:id", async (req, res) => {
  await supabase.from("products").delete().eq("id", toNumber(req.params.id));
  res.json({ success: true, data: true });
});

app.get("/api/products/barcode/:code", async (req, res) => {
  const { data, error } = await supabase.from("products").select("*").eq("barcode", req.params.code).single();
  if (error || !data) return res.status(404).json({ success: false, message: "المنتج غير موجود" });
  res.json({ success: true, data });
});

/* =========================
   CUSTOMERS
========================= */
app.get("/api/customers", async (_req, res) => {
  const { data } = await supabase.from("customers").select("*").order("id", { ascending: false });
  res.json({ success: true, data: data || [] });
});

app.post("/api/customers", async (req, res) => {
  const c = req.body;
  const { data, error } = await supabase.from("customers").insert([{
    name: c.name, phone: c.phone, notes: c.notes,
    status: c.status || "مسدد",
    due_balance: toNumber(c.dueBalance),
    unpaid_invoices: toNumber(c.unpaidInvoices),
    total_purchases: toNumber(c.totalPurchases),
    last_operation: todayDate()
  }]).select().single();
  res.json({ success: !error, data: { id: data?.id } });
});

app.put("/api/customers/:id", async (req, res) => {
  const id = toNumber(req.params.id);
  const c = req.body;
  await supabase.from("customers").update({
    name: c.name, phone: c.phone, notes: c.notes, status: c.status,
    due_balance: toNumber(c.dueBalance),
    unpaid_invoices: toNumber(c.unpaidInvoices),
    total_purchases: toNumber(c.totalPurchases),
    last_operation: todayDate()
  }).eq("id", id);
  res.json({ success: true, data: true });
});

/* =========================
   INVOICES (عمليات مترابطة)
========================= */
app.get("/api/invoices", async (_req, res) => {
  const { data } = await supabase.from("invoices").select("*").order("id", { ascending: false });
  res.json({ success: true, data: data || [] });
});

app.post("/api/invoices", async (req, res) => {
  try {
    const inv = req.body;
    let totalProfit = 0;

    for (const item of (inv.items || [])) {
      totalProfit += (toNumber(item.price) - toNumber(item.cost)) * toNumber(item.qty);
    }

    // 1. إنشاء الفاتورة
    const { data: newInvoice, error: invError } = await supabase.from("invoices").insert([{
      customer_id: inv.customerId ? toNumber(inv.customerId) : null,
      customer_name: inv.customerName || "عميل نقدي",
      payment_method: inv.paymentMethod || "نقدي",
      subtotal: toNumber(inv.subtotal),
      discount_value: toNumber(inv.discount),
      net_total: toNumber(inv.net),
      paid_amount: toNumber(inv.paid),
      rest_amount: toNumber(inv.rest),
      profit_total: totalProfit,
      cashier_name: inv.cashierName || "admin"
    }]).select().single();

    if (invError) throw invError;
    const invoiceId = newInvoice.id;

    // 2. إدراج عناصر الفاتورة وتحديث المخزون
    for (const item of (inv.items || [])) {
      const qty = toNumber(item.qty);
      const price = toNumber(item.price);
      
      await supabase.from("invoice_items").insert([{
        invoice_id: invoiceId,
        product_id: item.productId,
        product_name: item.name,
        quantity: qty,
        unit_price: price,
        line_total: qty * price,
        line_profit: (price - toNumber(item.cost)) * qty,
        cost: toNumber(item.cost)
      }]);

      if (item.productId) {
        // تحديث المخزون
        const { data: prod } = await supabase.from("products").select("stock").eq("id", item.productId).single();
        const newStock = toNumber(prod?.stock) - qty;
        await supabase.from("products").update({ stock: newStock }).eq("id", item.productId);

        // حركة المخزون
        await supabase.from("stock_movements").insert([{
          product_id: item.productId,
          type: "بيع",
          qty: -qty,
          balance: newStock,
          reason: "فاتورة #" + invoiceId
        }]);
      }
    }

    // 3. تسجيل دين العميل (إن وُجد)
    if (toNumber(inv.rest) > 0 && inv.customerId) {
      await supabase.from("customer_transactions").insert([{
        customer_id: toNumber(inv.customerId),
        type: "invoice",
        amount: toNumber(inv.rest),
        description: "فاتورة #" + invoiceId
      }]);

      const { data: cust } = await supabase.from("customers").select("due_balance").eq("id", inv.customerId).single();
      await supabase.from("customers").update({
        due_balance: toNumber(cust?.due_balance) + toNumber(inv.rest),
        status: "عليه فلوس",
        last_operation: todayDate()
      }).eq("id", inv.customerId);
    }

    res.json({ success: true, data: { invoiceId } });
  } catch (e) {
    console.error("invoices:add error:", e);
    res.status(500).json({ success: false, message: "فشل إنشاء الفاتورة" });
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
  console.log("Server running on port " + PORT + " with Supabase ✅");
});
