export interface User {
  Username: string;
  PIN: string;
  Nama: string;
  Role: 'admin' | 'user';
  MenuAccess: string; // 'ALL' or comma-separated list of page IDs like 'pageDashboard,pageBuying'
}

export interface MasterPrice {
  GradeBuying: string;
  Harga: number;
  Tipe: 'BUYING' | 'RECLASS';
  Type: string;
  SubType: string;
  CropYear: string;
}

export interface BuyingRow {
  _row?: number;
  Timestamp: string; // yyyy-MM-dd HH:mm:ss
  NoBarcode: string;
  NamaSupplier: string;
  GradeBuying: string;
  BeratBruto: number;
  Tare: number;
  BeratNetto: number;
  HargaBuying: number;
  TotalHarga: number;
  InputBy: string;
  StatusReclass: 'BELUM' | 'SUDAH';
  NoBuying: string;
  Type: string;
  SubType: string;
  CropYear: string;
}

export interface ReclassRow {
  _row?: number;
  Timestamp: string;
  NoBarcode: string;
  GradeBuying: string;
  GradeReclass: string;
  BeratNetto: number;
  InputBy: string;
  StatusShipping: 'BELUM' | 'SUDAH';
  NoReclass: string;
  StatusInvoice: 'BELUM' | 'SUDAH';
  Type: string;
  SubType: string;
  CropYear: string;
  KodeSumber?: string;
  HargaReclass?: number;
  TotalHargaReclass?: number;
}

export interface ReclassLogRow extends ReclassRow {}

export interface ShippingRow {
  _row?: number;
  Timestamp: string;
  NoBarcode: string; // actually NoReclass
  NoBarcodeAsal: string; // the physical scanned barcode
  GradeReclass: string;
  BeratNetto: number;
  InputBy: string;
  NoShipping: string;
  Tare: number;
  Type: string;
  SubType: string;
  CropYear: string;
  Destination: string;
}

export interface InvoiceRow {
  _row?: number;
  Timestamp: string;
  NoInvoice: string;
  DaftarNoReclass: string; // comma-separated NoReclass IDs
  TotalNetto: number;
  InputBy: string;
  NoBuying: string;
  TotalPembelian: number;
  BiayaPPh: number;
  BiayaMaterai: number;
  UangSebesar: number;
  NamaPerusahaan: string;
  DeskripsiPembayaran: string;
  CaraPembayaran: string;
  JumlahBal: number;
  Lokasi: string;
  Roundup: number;
  IsVoid?: boolean;
  VoidedAt?: string;
  VoidedBy?: string;
}

export interface SettingItem {
  Key: string;
  Value: string;
}

export interface PrePrintRow {
  _row?: number;
  Timestamp: string;
  NoBarcode: string;
  NamaPetani: string;
  KodeSumber: string;
  PrintedBy: string;
}

export interface BarcodeSettings {
  company: string;
  tipe: string;
  sumber: string;
  digitCounter: number;
}

export interface DashboardSummary {
  totalBuying: number;
  totalBeratBuying: number;
  totalReclass: number;
  totalBeratReclass: number;
  totalShipping: number;
  totalBeratShipping: number;
  sisaStok: number;
  totalInvoice: number;
  totalInvoiceAkhir: number;
}
