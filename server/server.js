const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

let db;

async function connectDB() {
  await client.connect();
  db = client.db("oxstore");
  console.log("MongoDB connected");
}

app.use(express.static("public"));

app.get("/product", async (req, res) => {
  const code = String(req.query.code || "").trim();

  const product = await db.collection("products").findOne({ barcode: code });

  if (!product) {
    return res.send(`
      <div>
        <h2 style="color:red;">المنتج غير موجود</h2>
        <p>${code}</p>
      </div>
    `);
  }

  res.send(`
    <div>
      <h1>${product.name || ""}</h1>
      <h2>السعر: ${product.price || 0}</h2>
      <h3>الكمية: ${product.stock || 0}</h3>
    </div>
  `);
});

connectDB().then(() => {
  app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
  });
});