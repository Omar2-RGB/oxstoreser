const { MongoClient } = require("mongodb");

const uri = "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);

let dbInstance = null;

async function connectMongo() {
  if (dbInstance) return dbInstance;

  await client.connect();
  dbInstance = client.db("oxstore");
  console.log("MongoDB connected");
  return dbInstance;
}

module.exports = { connectMongo };