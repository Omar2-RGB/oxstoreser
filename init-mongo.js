const { connectMongo } = require("./mongo");

async function initMongo() {
  const db = await connectMongo();

  const collections = [
    "products",
    "categories",
    "users",
    "customers",
    "suppliers",
    "invoices",
    "invoice_items",
    "returns",
    "expenses",
    "settings",
    "stock_movements",
    "customer_transactions",
    "role_permissions"
  ];

  const existing = await db.listCollections().toArray();
  const existingNames = existing.map(c => c.name);

  for (const name of collections) {
    if (!existingNames.includes(name)) {
      await db.createCollection(name);
      console.log(`✅ Created collection: ${name}`);
    } else {
      console.log(`ℹ️ Already exists: ${name}`);
    }
  }

  console.log("🎉 Mongo collections are ready");
  process.exit(0);
}

initMongo().catch(err => {
  console.error("❌ Init error:", err);
  process.exit(1);
});