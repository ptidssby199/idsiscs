import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// DB file setup
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "server_db.dat");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory version tracker
let dbVersion = Date.now();

// Default values for server-side database
const defaultDb = {
  iscs_users: [
    { Username: "admin", PIN: "1234", Nama: "Administrator", Role: "admin", MenuAccess: "ALL" },
    { Username: "petugas1", PIN: "1111", Nama: "Ahmad Timbang", Role: "user", MenuAccess: "pageDashboard,pageCreateBale,pageBuying,pageReclass,pageShipping,pagePrePrint,pageLaporan,pageInvoice" }
  ],
  iscs_prices: [
    { GradeBuying: "A", Harga: 55000, Tipe: "BUYING", Type: "VIRGINIA", SubType: "LOKAL", CropYear: "2026" },
    { GradeBuying: "B", Harga: 45000, Tipe: "BUYING", Type: "VIRGINIA", SubType: "LOKAL", CropYear: "2026" },
    { GradeBuying: "C", Harga: 35000, Tipe: "BUYING", Type: "VIRGINIA", SubType: "LOKAL", CropYear: "2026" },
    { GradeBuying: "A", Harga: 58000, Tipe: "RECLASS", Type: "VIRGINIA", SubType: "LOKAL", CropYear: "2026" },
    { GradeBuying: "B", Harga: 48000, Tipe: "RECLASS", Type: "VIRGINIA", SubType: "LOKAL", CropYear: "2026" },
    { GradeBuying: "C", Harga: 38000, Tipe: "RECLASS", Type: "VIRGINIA", SubType: "LOKAL", CropYear: "2026" }
  ],
  iscs_settings: [
    { Key: "BarcodeCompany", Value: "IDS" },
    { Key: "BarcodeTipe", Value: "SC25" },
    { Key: "BarcodeSumber", Value: "LB" },
    { Key: "BarcodeDigitCounter", Value: "5" },
    { Key: "ShippingKode", Value: "PG" },
    { Key: "ShippingSource", Value: "LJ" },
    { Key: "PrePrintCompanyName", Value: "PT INDO DEWATA SEMESTA" },
    { Key: "NamaPerusahaan", Value: "PT INDO DEWATA SEMESTA" },
    { Key: "LokasiInvoice", Value: "Lumajang" },
    { Key: "KonstantaValue", Value: "0.50" }
  ],
  iscs_counters: {},
  iscs_buying: [],
  iscs_reclass: [],
  iscs_reclass_log: [],
  iscs_preprint: [],
  iscs_shipping: [],
  iscs_invoice: [],
  iscs_synced_ids: {},
  iscs_sync_logs: []
};

// Ensure db file exists
const initDbFile = () => {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), "utf8");
    dbVersion = Date.now();
  } else {
    try {
      const data = fs.readFileSync(DB_FILE, "utf8");
      JSON.parse(data); // Validate it's proper JSON
    } catch (e) {
      console.error("Corrupted database file. Resetting to default...", e);
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), "utf8");
      dbVersion = Date.now();
    }
  }
};
initDbFile();

// API: Health / status
app.get("/api/lan/status", (req, res) => {
  const interfaces = os.networkInterfaces();
  let localIp = "localhost";
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
  }
  res.json({ status: "ok", mode: "lan", isServer: true, localIp, port: PORT });
});

// API: Get current database version
app.get("/api/lan/version", (req, res) => {
  res.json({ version: dbVersion });
});

// API: Get entire DB
app.get("/api/lan/db", (req, res) => {
  try {
    initDbFile();
    const data = fs.readFileSync(DB_FILE, "utf8");
    res.json({
      version: dbVersion,
      data: JSON.parse(data)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to read database" });
  }
});

// API: Write/Update complete DB or partial keys
app.post("/api/lan/db", (req, res) => {
  try {
    const { data } = req.body;
    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Invalid data payload" });
    }

    // Keep some values in sync or perform validation
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
    dbVersion = Date.now();

    res.json({ success: true, version: dbVersion });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to write database" });
  }
});

// Boot the main server flow
async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
