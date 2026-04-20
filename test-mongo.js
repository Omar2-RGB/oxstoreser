const { connectMongo } = require("./mongo");

async function run() {
  try {
    console.log("⏳ Connecting...");

    const db = await connectMongo();

    console.log("✅ Connected to DB:", db.databaseName);

  } catch (err) {
    console.error("❌ Mongo error:", err);
  }
}

run();