var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_os = __toESM(require("os"), 1);
var import_vite = require("vite");
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json({ limit: "50mb" }));
var DATA_DIR = import_path.default.join(process.cwd(), "data");
var DB_FILE = import_path.default.join(DATA_DIR, "server_db.dat");
if (!import_fs.default.existsSync(DATA_DIR)) {
  import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
}
var dbVersion = Date.now();
var defaultDb = {
  iscs_users: [
    { Username: "admin", PIN: "1234", Nama: "Administrator", Role: "admin", MenuAccess: "ALL" },
    { Username: "petugas1", PIN: "1111", Nama: "Ahmad Timbang", Role: "user", MenuAccess: "pageDashboard,pageCreateBale,pageBuying,pageReclass,pageShipping,pagePrePrint,pageLaporan,pageInvoice" }
  ],
  iscs_prices: [
    { GradeBuying: "A", Harga: 55e3, Tipe: "BUYING", Type: "VIRGINIA", SubType: "LOKAL", CropYear: "2026" },
    { GradeBuying: "B", Harga: 45e3, Tipe: "BUYING", Type: "VIRGINIA", SubType: "LOKAL", CropYear: "2026" },
    { GradeBuying: "C", Harga: 35e3, Tipe: "BUYING", Type: "VIRGINIA", SubType: "LOKAL", CropYear: "2026" },
    { GradeBuying: "A", Harga: 58e3, Tipe: "RECLASS", Type: "VIRGINIA", SubType: "LOKAL", CropYear: "2026" },
    { GradeBuying: "B", Harga: 48e3, Tipe: "RECLASS", Type: "VIRGINIA", SubType: "LOKAL", CropYear: "2026" },
    { GradeBuying: "C", Harga: 38e3, Tipe: "RECLASS", Type: "VIRGINIA", SubType: "LOKAL", CropYear: "2026" }
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
var initDbFile = () => {
  if (!import_fs.default.existsSync(DB_FILE)) {
    import_fs.default.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), "utf8");
    dbVersion = Date.now();
  } else {
    try {
      const data = import_fs.default.readFileSync(DB_FILE, "utf8");
      JSON.parse(data);
    } catch (e) {
      console.error("Corrupted database file. Resetting to default...", e);
      import_fs.default.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), "utf8");
      dbVersion = Date.now();
    }
  }
};
initDbFile();
app.get("/api/lan/status", (req, res) => {
  const interfaces = import_os.default.networkInterfaces();
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
app.get("/api/lan/version", (req, res) => {
  res.json({ version: dbVersion });
});
app.get("/api/lan/db", (req, res) => {
  try {
    initDbFile();
    const data = import_fs.default.readFileSync(DB_FILE, "utf8");
    res.json({
      version: dbVersion,
      data: JSON.parse(data)
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to read database" });
  }
});
app.post("/api/lan/db", (req, res) => {
  try {
    const { data } = req.body;
    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Invalid data payload" });
    }
    import_fs.default.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
    dbVersion = Date.now();
    res.json({ success: true, version: dbVersion });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to write database" });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
