const { MongoClient } = require("mongodb");

// ⚠️ حط كلمة المرور بدل <db_password>
const uri = "mongodb://admin:omarAziz123@ac-uk5jinj-shard-00-00.cyzwk6g.mongodb.net:27017,ac-uk5jinj-shard-00-01.cyzwk6g.mongodb.net:27017,ac-uk5jinj-shard-00-02.cyzwk6g.mongodb.net:27017/oxstore?ssl=true&replicaSet=atlas-we7pem-shard-0&authSource=admin&retryWrites=true&w=majority&appName=admin";

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 10000
});

let db;

async function getDb() {
  try {
    if (db) return db;

    await client.connect();
    db = client.db("oxstore");

    console.log("✅ Connected to MongoDB Atlas");
    return db;
  } catch (error) {
    console.error("❌ Mongo Atlas connection failed:", error);
    throw error;
  }
}

module.exports = { getDb };