function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function wakeServer() {
  try {
    await fetch("https://oxstore-server.onrender.com/health", {
      method: "GET"
    });
  } catch (err) {
    console.error("Wake server failed:", err.message);
  }
}
async function syncToServer(product) {
  const url = "https://oxstore-server.onrender.com/api/products";

  for (let i = 0; i < 5; i++) {
    try {
      console.log("Sync attempt", i + 1);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(product)
      });

      if (res.ok) {
        console.log("✅ Sync success");
        return;
      }

    } catch (err) {
      console.log("❌ attempt failed");
    }

    // 👇 مهم: استنى شوي ليصحى السيرفر
    await new Promise(r => setTimeout(r, 5000));
  }

  console.log("❌ All sync attempts failed");
}

async function deleteProductFromAtlas(barcode) {
  try {
    await wakeServer();
    await sleep(2000);

    await fetch(
      "https://oxstore-server.onrender.com/api/products/" +
        encodeURIComponent(barcode),
      { method: "DELETE" }
    );
  } catch (err) {
    console.error("Delete sync failed:", err.message);
  }
}

module.exports = {
  syncToServer,
  deleteProductFromAtlas
};