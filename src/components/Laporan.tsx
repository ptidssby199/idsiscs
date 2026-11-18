import React, { useState, useEffect } from 'react';
import {
  apiGetBuyingList,
  apiGetReclassList,
  apiGetShippingList,
  getLocal,
  setLocal,
  getPriceForGrade,
  apiGetMasterPrice,
  apiSavePrice,
  apiEnsureReclassHistoricalPrices
} from '../db';
import { BuyingRow, ReclassRow, ShippingRow, InvoiceRow } from '../types';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Search, Calendar, RefreshCw, Layers, TrendingUp, Inbox, AlertTriangle, DollarSign, Sparkles, CheckCircle2, X, HelpCircle } from 'lucide-react';
import { DailyBuyingReport } from './DailyBuyingReport';

interface LaporanProps {
  currentUser: any;
  permittedTabs?: string[];
  initialTab?: string;
}

export const Laporan: React.FC<LaporanProps> = ({ currentUser, permittedTabs = [], initialTab }) => {
  const [activeTab, setActiveTab] = useState(initialTab || 'lapDailyBuying');

  // Core datasets
  const [buyingList, setBuyingList] = useState<BuyingRow[]>([]);
  const [reclassList, setReclassList] = useState<ReclassRow[]>([]);
  const [shippingList, setShippingList] = useState<ShippingRow[]>([]);
  const [invoiceList, setInvoiceList] = useState<InvoiceRow[]>([]);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [stokSearchQuery, setStokSearchQuery] = useState('');
  const [stokFilterMode, setStokFilterMode] = useState<'toDate' | 'range'>('toDate');

  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  const showToast = (text: string, type: 'ok' | 'err') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncList, setSyncList] = useState<{
    grade: string;
    harga: number;
    sourceGrade: string;
    isNew: boolean;
    type: string;
    subType: string;
    cropYear: string;
  }[]>([]);

  const handleOpenSyncModal = (unpricedGrades: string[]) => {
    const masterPrices = apiGetMasterPrice();
    const reclassPrices = masterPrices.filter(p => p.Tipe === 'RECLASS');

    const items = unpricedGrades.map(g => {
      // Find candidate transaction to extract type, subType, cropYear
      const rcRow = reclassList.find(r => r.GradeReclass.toUpperCase() === g.toUpperCase());
      const buyRow = rcRow ? buyingList.find(b => b.NoBarcode.toUpperCase() === rcRow.NoBarcode.toUpperCase()) : undefined;
      const type = (rcRow?.Type || buyRow?.Type || 'SC').trim().toUpperCase();
      const subType = (rcRow?.SubType || buyRow?.SubType || 'RKS').trim().toUpperCase();
      const cropYear = (rcRow?.CropYear || buyRow?.CropYear || '2026').trim().toUpperCase();

      // 1. Try finding by counterpart (replace NSPS with NSRS)
      const counterpartGrade = g.toUpperCase().replace(/NSPS/g, 'NSRS');
      let matched = reclassPrices.find(p => p.GradeBuying.toUpperCase() === counterpartGrade);

      // 2. Try normalized fuzzy
      if (!matched) {
        const cleanG = g.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/5/g, 'S').replace(/O/g, '0').replace(/NSPS/g, 'NSRS');
        matched = reclassPrices.find(p => {
          const cleanP = p.GradeBuying.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/5/g, 'S').replace(/O/g, '0').replace(/NSPS/g, 'NSRS');
          return cleanG === cleanP;
        });
      }

      // 3. Try core parts (first 2 segments e.g. 6RKS + S3M)
      if (!matched) {
        const partsG = g.toUpperCase().split(/[\/\-\s_]+/).filter(Boolean).map(p => p.replace(/5/g, 'S').replace(/O/g, '0'));
        if (partsG.length >= 2) {
          matched = reclassPrices.find(p => {
            const partsP = p.GradeBuying.toUpperCase().split(/[\/\-\s_]+/).filter(Boolean).map(x => x.replace(/5/g, 'S').replace(/O/g, '0'));
            return partsP.length >= 2 && partsG[0] === partsP[0] && partsG[1] === partsP[1];
          });
        }
      }

      return {
        grade: g,
        harga: matched ? matched.Harga : 0,
        sourceGrade: matched ? matched.GradeBuying : '',
        isNew: !matched,
        type,
        subType,
        cropYear
      };
    });

    setSyncList(items);
    setIsSyncModalOpen(true);
  };

  const handleSaveSyncPrices = () => {
    let savedCount = 0;
    syncList.forEach(item => {
      if (item.harga > 0) {
        apiSavePrice(item.grade, item.harga, 'RECLASS', item.type, item.subType, item.cropYear);
        savedCount++;
      }
    });

    setIsSyncModalOpen(false);
    apiEnsureReclassHistoricalPrices();
    loadData();
    showToast(`Berhasil menyimpan ${savedCount} harga grade Reclass ke Master Data!`, 'ok');
  };


  const loadData = () => {
    // Lock historical prices for any previously unpriced (Rp 0) reclass rows that now have master prices
    apiEnsureReclassHistoricalPrices();

    setBuyingList(apiGetBuyingList());
    setReclassList(apiGetReclassList());
    setShippingList(apiGetShippingList());
    
    // Fetch invoices and match farmer name
    const invs = getLocal<InvoiceRow[]>('iscs_invoice', []);
    const buys = apiGetBuyingList();
    const supMap: Record<string, string> = {};
    buys.forEach(b => { supMap[b.NoBuying] = b.NamaSupplier; });
    
    const mappedInvs = invs.map(i => ({
      ...i,
      NamaSupplier: supMap[i.NoBuying] || '-'
    }));
    setInvoiceList(mappedInvs);
  };

  useEffect(() => {
    loadData();
    
    // Set default dates to current month range (1st to last day of month so mid-month transactions are never clipped)
    const now = new Date();
    const y = now.getFullYear();
    const m = ('0' + (now.getMonth() + 1)).slice(-2);
    setStartDate(`${y}-${m}-01`);
    
    const lastDayNum = new Date(y, now.getMonth() + 1, 0).getDate();
    const lastDayStr = ('0' + lastDayNum).slice(-2);
    setEndDate(`${y}-${m}-${lastDayStr}`);

    const handleUpdate = () => {
      loadData();
    };

    window.addEventListener('iscs-db-update', handleUpdate);
    return () => {
      window.removeEventListener('iscs-db-update', handleUpdate);
    };
  }, []);

  // Filter checker helper
  const isInDateRange = (timestampStr: string) => {
    if (!timestampStr) return true;
    const datePart = timestampStr.split(' ')[0]; // YYYY-MM-DD
    if (!datePart) return true;

    if (startDate && datePart < startDate) return false;
    if (endDate && datePart > endDate) return false;
    return true;
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setGradeFilter('');
  };

  // ---------------------------------------------------------------------------
  // TAB 1: LAPORAN BUYING
  // ---------------------------------------------------------------------------
  const getFilteredBuying = () => {
    return buyingList.filter(r => {
      if (!isInDateRange(r.Timestamp)) return false;
      if (gradeFilter && r.GradeBuying !== gradeFilter) return false;
      
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        return (
          r.NoBuying?.toLowerCase().includes(q) ||
          r.NoBarcode.toLowerCase().includes(q) ||
          r.NamaSupplier.toLowerCase().includes(q)
        );
      }
      return true;
    });
  };

  const exportBuyingToExcel = () => {
    const list = getFilteredBuying();
    if (!list.length) {
      showToast('Tidak ada data untuk diexport.', 'err');
      return;
    }
    const rows = list.map((r, idx) => ({
      'No': idx + 1,
      'No Buying': r.NoBuying || '-',
      'Tanggal': r.Timestamp,
      'No Barcode': r.NoBarcode,
      'Nama Supplier / Petani': r.NamaSupplier,
      'Grade Buying': r.GradeBuying,
      'Bruto (kg)': r.BeratBruto,
      'Tare (kg)': r.Tare,
      'Netto (kg)': r.BeratNetto,
      'Harga (Rp)': r.HargaBuying,
      'Total Harga (Rp)': r.TotalHarga,
      'Status Reclass': r.StatusReclass || 'BELUM',
      'Input By': r.InputBy
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan Buying');
    XLSX.writeFile(wb, `Laporan_Buying_${startDate || 'All'}_to_${endDate || 'All'}.xlsx`);
    showToast('Laporan Buying terdownload.', 'ok');
  };

  // ---------------------------------------------------------------------------
  // TAB 2: LAPORAN RECLASS
  // ---------------------------------------------------------------------------
  const getFilteredReclass = () => {
    return reclassList.filter(r => {
      if (!isInDateRange(r.Timestamp)) return false;
      if (gradeFilter && r.GradeReclass !== gradeFilter) return false;

      const q = searchQuery.toLowerCase().trim();
      if (q) {
        return (
          r.NoReclass.toLowerCase().includes(q) ||
          r.NoBarcode.toLowerCase().includes(q) ||
          r.GradeBuying.toLowerCase().includes(q) ||
          r.GradeReclass.toLowerCase().includes(q)
        );
      }
      return true;
    });
  };

  const exportReclassToExcel = () => {
    const list = getFilteredReclass();
    if (!list.length) {
      showToast('Tidak ada data untuk diexport.', 'err');
      return;
    }
    const rows = list.map((r, idx) => ({
      'No': idx + 1,
      'No Reclass': r.NoReclass,
      'Tanggal': r.Timestamp,
      'No Barcode': r.NoBarcode,
      'Grade Asal': r.GradeBuying,
      'Grade Reclass': r.GradeReclass,
      'Berat Netto (kg)': r.BeratNetto,
      'Input By': r.InputBy,
      'Status Shipping': r.StatusShipping || 'BELUM',
      'Status Invoice': r.StatusInvoice || 'BELUM',
      'Type': r.Type || '',
      'Sub Type': r.SubType || '',
      'Crop Year': r.CropYear || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan Reclass');
    XLSX.writeFile(wb, `Laporan_Reclass_${startDate || 'All'}_to_${endDate || 'All'}.xlsx`);
    showToast('Laporan Reclass terdownload.', 'ok');
  };

  // ---------------------------------------------------------------------------
  // TAB 3: LAPORAN SHIPPING
  // ---------------------------------------------------------------------------
  const getFilteredShipping = () => {
    return shippingList.filter(r => {
      if (!isInDateRange(r.Timestamp)) return false;

      const q = searchQuery.toLowerCase().trim();
      if (q) {
        return (
          r.NoShipping?.toLowerCase().includes(q) ||
          r.NoBarcodeAsal?.toLowerCase().includes(q) ||
          r.Destination?.toLowerCase().includes(q) ||
          r.GradeReclass?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  };

  const exportShippingToExcel = () => {
    const list = getFilteredShipping();
    if (!list.length) {
      showToast('Tidak ada data untuk diexport.', 'err');
      return;
    }
    const rows = list.map((r, idx) => ({
      'No': idx + 1,
      'No Shipping': r.NoShipping || '-',
      'Tanggal': r.Timestamp,
      'No Barcode Asal': r.NoBarcodeAsal,
      'Grade Reclass': r.GradeReclass,
      'Netto (kg)': r.BeratNetto,
      'Tare (kg)': r.Tare || 0,
      'Destination': r.Destination || '',
      'Type': r.Type || '',
      'Sub Type': r.SubType || '',
      'Crop Year': r.CropYear || '',
      'Input By': r.InputBy
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan Shipping');
    XLSX.writeFile(wb, `Laporan_Shipping_${startDate || 'All'}_to_${endDate || 'All'}.xlsx`);
    showToast('Laporan Shipping terdownload.', 'ok');
  };

  // ---------------------------------------------------------------------------
  // TAB 4: LAPORAN INVOICE
  // ---------------------------------------------------------------------------
  const getFilteredInvoice = () => {
    return invoiceList.filter(r => {
      if (!isInDateRange(r.Timestamp)) return false;

      const q = searchQuery.toLowerCase().trim();
      if (q) {
        return (
          r.NoInvoice.toLowerCase().includes(q) ||
          r.NoBuying.toLowerCase().includes(q) ||
          r.NamaSupplier.toLowerCase().includes(q)
        );
      }
      return true;
    });
  };

  const exportInvoiceToExcel = () => {
    const list = getFilteredInvoice();
    if (!list.length) {
      showToast('Tidak ada data untuk diexport.', 'err');
      return;
    }
    const rows = list.map((r, idx) => ({
      'No': idx + 1,
      'No Invoice': r.NoInvoice,
      'No Buying': r.NoBuying,
      'Tanggal': r.Timestamp,
      'Supplier / Petani': r.NamaSupplier,
      'Total Netto (kg)': r.TotalNetto,
      'Jumlah Bales': r.JumlahBal,
      'Gross Amount (Rp)': r.TotalPembelian,
      'PPh 22 (Rp)': r.BiayaPPh,
      'Bea Materai (Rp)': r.BiayaMaterai,
      'Pembulatan (Rp)': r.Roundup || 0,
      'Jumlah Bersih (Rp)': r.UangSebesar,
      'Lokasi': r.Lokasi,
      'Status': r.IsVoid ? 'VOID' : 'AKTIF',
      'Input By': r.InputBy
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan Invoice');
    XLSX.writeFile(wb, `Laporan_Invoice_${startDate || 'All'}_to_${endDate || 'All'}.xlsx`);
    showToast('Laporan Invoice terdownload.', 'ok');
  };

  // ---------------------------------------------------------------------------
  // TAB 5: LAPORAN BUYING VS RECLASS
  // ---------------------------------------------------------------------------
  const getBuyingVsReclassRows = () => {
    // We map Buying and matching Reclass row for each barcode
    const reclassMap: Record<string, ReclassRow> = {};
    reclassList.forEach(r => {
      reclassMap[r.NoBarcode.toUpperCase()] = r;
    });

    const out = buyingList.map(b => {
      const rc = reclassMap[b.NoBarcode.toUpperCase()];
      const selisihNetto = rc ? (Number(rc.BeratNetto) - Number(b.BeratNetto)) : 0;
      const warningGrade = rc ? (b.GradeBuying !== rc.GradeReclass) : false;

      // Calculate totals
      // Historical buying total & price are locked from the time Buying was entered
      const hargaBuying = Number(b.HargaBuying) || 0;
      const totalBuying = (typeof b.TotalHarga === 'number' && b.TotalHarga > 0)
        ? b.TotalHarga
        : Number(((Number(b.BeratNetto) || 0) * hargaBuying).toFixed(2));

      let totalReclass = 0;
      let hargaReclass = 0;
      if (rc) {
        // Historical reclass price & total:
        // Priority 1: Use the price recorded at the time of Reclass transaction (locked/frozen historical price)
        if (typeof rc.HargaReclass === 'number' && rc.HargaReclass > 0) {
          hargaReclass = rc.HargaReclass;
          totalReclass = (typeof rc.TotalHargaReclass === 'number' && rc.TotalHargaReclass > 0)
            ? rc.TotalHargaReclass
            : Number((Number(rc.BeratNetto) * hargaReclass).toFixed(2));
        } else {
          // Priority 2: If the transaction did not have a price at entry time (e.g. entered before Master Harga was set),
          // resolve the price from Master Harga:
          const rcType = (rc.Type || b.Type || '').trim();
          const rcSubType = (rc.SubType || b.SubType || '').trim();
          const rcCropYear = (rc.CropYear || b.CropYear || '').trim();
          hargaReclass = getPriceForGrade(rc.GradeReclass, 'RECLASS', rcType, rcSubType, rcCropYear);
          totalReclass = Number((Number(rc.BeratNetto) * hargaReclass).toFixed(2));
        }
      }

      // Upgrade / Downgrade check based on values
      let gradeStatus = '-';
      if (rc) {
        if (hargaReclass <= 0) {
          gradeStatus = 'Harga Belum Diset';
        } else if (totalReclass > totalBuying) {
          gradeStatus = 'UP Grade';
        } else if (totalReclass < totalBuying) {
          gradeStatus = 'Down Grade';
        } else {
          gradeStatus = 'Sama';
        }
      }

      return {
        noBarcode: b.NoBarcode,
        noBuying: b.NoBuying || '-',
        supplier: b.NamaSupplier,
        gradeBuying: b.GradeBuying,
        nettoBuying: Number(b.BeratNetto) || 0,
        hargaBuying: Number(b.HargaBuying) || 0,
        totalBuying,
        noReclass: rc ? rc.NoReclass : '-',
        gradeReclass: rc ? rc.GradeReclass : '-',
        nettoReclass: rc ? Number(rc.BeratNetto) : 0,
        hargaReclass: rc ? hargaReclass : 0,
        totalReclass,
        selisihNetto,
        warningGrade,
        gradeStatus,
        isReclassed: !!rc,
        timestamp: b.Timestamp
      };
    });

    // Filter
    return out.filter(r => {
      if (!isInDateRange(r.timestamp)) return false;

      const q = searchQuery.toLowerCase().trim();
      if (q) {
        return (
          r.noBarcode.toLowerCase().includes(q) ||
          r.supplier.toLowerCase().includes(q) ||
          r.gradeBuying.toLowerCase().includes(q) ||
          r.gradeReclass.toLowerCase().includes(q)
        );
      }
      return true;
    });
  };

  const exportBvRToExcel = () => {
    const list = getBuyingVsReclassRows();
    if (!list.length) {
      showToast('Tidak ada data untuk diexport.', 'err');
      return;
    }
    const rows = list.map((r, idx) => ({
      'No': idx + 1,
      'No Barcode': r.noBarcode,
      'Grade Buying': r.gradeBuying,
      'Netto Buying (kg)': r.nettoBuying,
      'Total Buying (Rp)': r.totalBuying,
      'Grade Reclass': r.gradeReclass,
      'Netto Reclass (kg)': r.isReclassed ? r.nettoReclass : 0,
      'Harga Reclass (Rp/kg)': r.isReclassed ? r.hargaReclass : 0,
      'Total Reclass (Rp)': r.isReclassed ? r.totalReclass : 0,
      'Selisih Netto (kg)': r.isReclassed ? r.selisihNetto : 0,
      'UP/Down Grade': r.isReclassed ? r.gradeStatus : 'BELUM RC'
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Buying vs Reclass');
    XLSX.writeFile(wb, `Laporan_Buying_vs_Reclass_${startDate || 'All'}_to_${endDate || 'All'}.xlsx`);
    showToast('Laporan Buying vs Reclass terdownload.', 'ok');
  };

  // ---------------------------------------------------------------------------
  // TAB 6: LAPORAN STOK GUDANG (INVENTORY)
  // ---------------------------------------------------------------------------
  const getIndividualStockBales = () => {
    const reclassByBarcode: Record<string, ReclassRow> = {};
    reclassList.forEach(r => {
      reclassByBarcode[r.NoBarcode.toUpperCase()] = r;
    });

    const shippingByBarcode: Record<string, ShippingRow> = {};
    shippingList.forEach(s => {
      if (s.NoBarcodeAsal) {
        shippingByBarcode[s.NoBarcodeAsal.toUpperCase()] = s;
      }
    });

    const stockBales: { barcode: string; grade: string; netto: number; statusSource: string; entryDate: string }[] = [];

    buyingList.forEach(b => {
      const bc = b.NoBarcode.toUpperCase();
      const rc = reclassByBarcode[bc];
      const sh = shippingByBarcode[bc];

      // Extract date string YYYY-MM-DD
      const bDate = b.Timestamp.split(' ')[0] || '';
      const rcDate = rc ? (rc.Timestamp.split(' ')[0] || '') : '';
      const shDate = sh ? (sh.Timestamp.split(' ')[0] || '') : '';

      const targetEnd = endDate || new Date().toISOString().split('T')[0];
      const targetStart = startDate || '';

      // Check entry
      let isEntered = bDate <= targetEnd;
      if (stokFilterMode === 'range' && targetStart) {
        isEntered = isEntered && (bDate >= targetStart);
      }

      // Check if shipped on or before targetEnd
      const isShipped = shDate && shDate <= targetEnd;

      if (isEntered && !isShipped) {
        // It is currently in stock!
        // What is its grade and netto as of targetEnd?
        const hasReclassed = rc && rcDate && rcDate <= targetEnd;

        if (!hasReclassed) {
          stockBales.push({
            barcode: b.NoBarcode,
            grade: b.GradeBuying,
            netto: Number(Number(b.BeratBruto) - Number(b.Tare)) || 0,
            statusSource: 'Buying',
            entryDate: b.Timestamp
          });
        } else {
          stockBales.push({
            barcode: b.NoBarcode,
            grade: rc.GradeReclass,
            netto: Number(rc.BeratNetto) || 0,
            statusSource: 'Reclassed',
            entryDate: rc.Timestamp
          });
        }
      }
    });

    return stockBales;
  };

  const getStokBreakdown = () => {
    const stockBales = getIndividualStockBales();

    // Group by Grade
    const groupMap: Record<string, { grade: string; jumlahBale: number; totalNetto: number; bales: typeof stockBales }> = {};
    stockBales.forEach(b => {
      if (!groupMap[b.grade]) {
        groupMap[b.grade] = { grade: b.grade, jumlahBale: 0, totalNetto: 0, bales: [] };
      }
      groupMap[b.grade].jumlahBale++;
      groupMap[b.grade].totalNetto += b.netto;
      groupMap[b.grade].bales.push(b);
    });

    return Object.keys(groupMap).sort().map(g => groupMap[g]);
  };

  const exportStokToExcel = () => {
    const list = getStokBreakdown();
    if (!list.length) {
      showToast('Tidak ada data stok.', 'err');
      return;
    }
    const rows = list.map((r, idx) => ({
      'No': idx + 1,
      'Grade': r.grade,
      'Jumlah Bale di Gudang': r.jumlahBale,
      'Total Netto Stok (kg)': r.totalNetto
    }));

    const detailBales = getIndividualStockBales();
    const detailRows = detailBales.map((b, idx) => ({
      'No': idx + 1,
      'No Barcode': b.barcode,
      'Grade': b.grade,
      'Netto (kg)': b.netto,
      'Sumber Status': b.statusSource,
      'Tanggal Masuk': b.entryDate
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan Stok Grade');
    
    const ws2 = XLSX.utils.json_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, ws2, 'Detail Barcode Stok');

    XLSX.writeFile(wb, `Laporan_Stok_Gudang_${stokFilterMode === 'toDate' ? 'ToDate' : 'Range'}_${startDate || 'All'}_to_${endDate || 'All'}.xlsx`);
    showToast('Laporan Stok Gudang terdownload (Ringkasan & Detail Barcode).', 'ok');
  };

  // Check permitted tabs (if configured on Operator)
  const isTabPermitted = (tabId: string) => {
    if (currentUser && currentUser.role === 'admin') return true;
    return permittedTabs.includes(tabId);
  };

  // Get available tab list
  const tabList = [
    { id: 'lapDailyBuying', label: 'Daily Buying' },
    { id: 'lapBuying', label: 'Detail Buying' },
    { id: 'lapReclass', label: 'Reclass' },
    { id: 'lapShipping', label: 'Shipping' },
    { id: 'lapInvoice', label: 'Invoice' },
    { id: 'lapBvR', label: 'Buying vs Reclass' },
    { id: 'lapStok', label: 'Stok Gudang' }
  ].filter(t => isTabPermitted(t.id));

  useEffect(() => {
    if (tabList.length > 0 && !tabList.some(t => t.id === activeTab)) {
      setActiveTab(tabList[0].id);
    }
  }, [tabList, activeTab]);

  // Determine grade unique options for filter
  const uniqueGrades = Array.from(new Set([
    ...buyingList.map(b => b.GradeBuying),
    ...reclassList.map(r => r.GradeReclass)
  ])).sort();

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-4 rounded-xl shadow-xl font-bold flex items-center gap-3 text-sm text-white ${toastMsg.type === 'ok' ? 'bg-emerald-600 border-l-4 border-emerald-300' : 'bg-rose-600 border-l-4 border-rose-300'}`}>
          {toastMsg.text}
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-3">
        {tabList.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); clearFilters(); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${activeTab === tab.id ? 'bg-slate-900 text-amber-500 shadow-sm' : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Global Filter Bar (Hidden for Daily Buying since DailyBuying has its own comprehensive controls) */}
      {activeTab !== 'lapDailyBuying' && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {activeTab === 'lapStok' ? (
            <>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Mode Filter Stok</label>
                <select
                  value={stokFilterMode}
                  onChange={e => setStokFilterMode(e.target.value as 'toDate' | 'range')}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-700"
                >
                  <option value="toDate">To Date (Stok s/d Tanggal)</option>
                  <option value="range">Date Range (Masuk s/d Tanggal)</option>
                </select>
              </div>

              <div>
                <label className={`block text-[10px] font-bold uppercase mb-1.5 ${stokFilterMode === 'toDate' ? 'text-slate-300' : 'text-slate-400'}`}>
                  Tanggal Mulai
                </label>
                <div className="relative">
                  <Calendar size={14} className={`absolute left-3 top-2.5 ${stokFilterMode === 'toDate' ? 'text-slate-300' : 'text-slate-400'}`} />
                  <input
                    type="date"
                    value={startDate}
                    disabled={stokFilterMode === 'toDate'}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50 disabled:bg-slate-100/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Tanggal Selesai / To Date</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Cari di Detail Stok</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={stokSearchQuery}
                    onChange={e => setStokSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="Cari barcode / grade / status..."
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Tanggal Mulai</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Tanggal Selesai</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              {(activeTab === 'lapBuying' || activeTab === 'lapReclass') && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Grade</label>
                  <select
                    value={gradeFilter}
                    onChange={e => setGradeFilter(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-700"
                  >
                    <option value="">Semua Grade</option>
                    {uniqueGrades.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className={activeTab === 'lapShipping' || activeTab === 'lapInvoice' || activeTab === 'lapBvR' ? 'md:col-span-2' : ''}>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Cari Kata Kunci</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="Cari barcode / no / nama..."
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB CONTENT RENDERERS */}

      {/* ======================= LAPORAN DAILY BUYING ======================= */}
      {activeTab === 'lapDailyBuying' && (
        <DailyBuyingReport buyingList={buyingList} onRefresh={loadData} />
      )}

      {/* ======================= LAPORAN BUYING ======================= */}
      {activeTab === 'lapBuying' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-amber-50 rounded-lg text-amber-500"><Layers size={18} /></div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Bale Timbang</span>
                <span className="text-lg font-extrabold text-slate-800">{getFilteredBuying().length} bal</span>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-teal-50 rounded-lg text-teal-500"><TrendingUp size={18} /></div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Berat Netto</span>
                <span className="text-lg font-extrabold text-slate-800 font-mono">{getFilteredBuying().reduce((acc, r) => acc + Number(r.BeratNetto || 0), 0).toFixed(2)} Kg</span>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 rounded-lg text-blue-500"><Inbox size={18} /></div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Nilai Pembelian</span>
                <span className="text-lg font-extrabold text-slate-800 font-mono">Rp {getFilteredBuying().reduce((acc, r) => acc + Number(r.TotalHarga || 0), 0).toLocaleString('id-ID')}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-md font-extrabold text-slate-800">Tabel Transaksi Buying</h3>
              <button
                onClick={exportBuyingToExcel}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow transition"
              >
                <FileSpreadsheet size={13} /> Export ke Excel
              </button>
            </div>

            <div className="border border-slate-100 rounded-xl overflow-x-auto max-h-[500px]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                    <th className="px-4 py-2.5">No Buying</th>
                    <th className="px-4 py-2.5">Tanggal</th>
                    <th className="px-4 py-2.5">Barcode</th>
                    <th className="px-4 py-2.5">Supplier / Petani</th>
                    <th className="px-4 py-2.5">Grade</th>
                    <th className="px-4 py-2.5 text-right">Bruto (kg)</th>
                    <th className="px-4 py-2.5 text-right">Tare (kg)</th>
                    <th className="px-4 py-2.5 text-right">Netto (kg)</th>
                    <th className="px-4 py-2.5 text-right">Harga (Rp)</th>
                    <th className="px-4 py-2.5 text-right">Total (Rp)</th>
                    <th className="px-4 py-2.5 text-center">Status RC</th>
                    <th className="px-4 py-2.5">Operator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {getFilteredBuying().length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-slate-400">Tidak ada data.</td>
                    </tr>
                  ) : (
                    getFilteredBuying().map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 text-[11px]">
                        <td className="px-4 py-2.5 font-semibold text-slate-500 font-mono">{r.NoBuying || '-'}</td>
                        <td className="px-4 py-2.5 text-slate-500 font-mono">{r.Timestamp}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-bold bg-slate-900 text-amber-500 px-1.5 py-0.5 rounded text-[10px]">{r.NoBarcode}</span>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{r.NamaSupplier}</td>
                        <td className="px-4 py-2.5 font-bold font-mono text-slate-700">{r.GradeBuying}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-600">{r.BeratBruto.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-600">{r.Tare.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-800 font-bold">{r.BeratNetto.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{r.HargaBuying.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-600">{r.TotalHarga.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${r.StatusReclass === 'SUDAH' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {r.StatusReclass === 'SUDAH' ? 'SUDAH' : 'BELUM'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{r.InputBy}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================= LAPORAN RECLASS ======================= */}
      {activeTab === 'lapReclass' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-amber-50 rounded-lg text-amber-500"><Layers size={18} /></div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Bale Reclass</span>
                <span className="text-lg font-extrabold text-slate-800">{getFilteredReclass().length} bal</span>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-teal-50 rounded-lg text-teal-500"><TrendingUp size={18} /></div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Netto Reclass</span>
                <span className="text-lg font-extrabold text-slate-800 font-mono">{getFilteredReclass().reduce((acc, r) => acc + Number(r.BeratNetto || 0), 0).toFixed(2)} Kg</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-md font-extrabold text-slate-800">Tabel Transaksi Reclass</h3>
              <button
                onClick={exportReclassToExcel}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow transition"
              >
                <FileSpreadsheet size={13} /> Export ke Excel
              </button>
            </div>

            <div className="border border-slate-100 rounded-xl overflow-x-auto max-h-[500px]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                    <th className="px-4 py-2.5">No Reclass</th>
                    <th className="px-4 py-2.5">Tanggal</th>
                    <th className="px-4 py-2.5">No Barcode</th>
                    <th className="px-4 py-2.5">Grade Asal</th>
                    <th className="px-4 py-2.5">Grade Reclass</th>
                    <th className="px-4 py-2.5 text-right">Berat Netto (kg)</th>
                    <th className="px-4 py-2.5 text-center">Status Ship</th>
                    <th className="px-4 py-2.5 text-center">Status Inv</th>
                    <th className="px-4 py-2.5">Operator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {getFilteredReclass().length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-400">Tidak ada data.</td>
                    </tr>
                  ) : (
                    getFilteredReclass().map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 text-[11px]">
                        <td className="px-4 py-2.5 font-semibold text-slate-500 font-mono">{r.NoReclass}</td>
                        <td className="px-4 py-2.5 text-slate-500 font-mono">{r.Timestamp}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-bold bg-slate-900 text-amber-500 px-1.5 py-0.5 rounded text-[10px]">{r.NoBarcode}</span>
                        </td>
                        <td className="px-4 py-2.5 font-bold font-mono text-slate-400">{r.GradeBuying}</td>
                        <td className="px-4 py-2.5 font-black font-mono text-slate-800">{r.GradeReclass}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-800 font-bold">{Number(r.BeratNetto).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${r.StatusShipping === 'SUDAH' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {r.StatusShipping || 'BELUM'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${r.StatusInvoice === 'SUDAH' ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700'}`}>
                            {r.StatusInvoice || 'BELUM'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{r.InputBy}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================= LAPORAN SHIPPING ======================= */}
      {activeTab === 'lapShipping' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-amber-50 rounded-lg text-amber-500"><Layers size={18} /></div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Bale Shipped</span>
                <span className="text-lg font-extrabold text-slate-800">{getFilteredShipping().length} bal</span>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-teal-50 rounded-lg text-teal-500"><TrendingUp size={18} /></div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Netto Shipped</span>
                <span className="text-lg font-extrabold text-slate-800 font-mono">{getFilteredShipping().reduce((acc, r) => acc + Number(r.BeratNetto || 0), 0).toFixed(2)} Kg</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-md font-extrabold text-slate-800">Tabel Transaksi Shipping</h3>
              <button
                onClick={exportShippingToExcel}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow transition"
              >
                <FileSpreadsheet size={13} /> Export ke Excel
              </button>
            </div>

            <div className="border border-slate-100 rounded-xl overflow-x-auto max-h-[500px]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                    <th className="px-4 py-2.5">No Shipping</th>
                    <th className="px-4 py-2.5">Tanggal</th>
                    <th className="px-4 py-2.5">No Barcode</th>
                    <th className="px-4 py-2.5">Grade Reclass</th>
                    <th className="px-4 py-2.5 text-right">Netto (kg)</th>
                    <th className="px-4 py-2.5 text-right">Tare (kg)</th>
                    <th className="px-4 py-2.5">Destination</th>
                    <th className="px-4 py-2.5">Header (Type/Sub/Year)</th>
                    <th className="px-4 py-2.5">Operator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {getFilteredShipping().length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-400">Tidak ada data.</td>
                    </tr>
                  ) : (
                    getFilteredShipping().map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 text-[11px]">
                        <td className="px-4 py-2.5 font-semibold text-slate-500 font-mono">{r.NoShipping || '-'}</td>
                        <td className="px-4 py-2.5 text-slate-500 font-mono">{r.Timestamp}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-bold bg-slate-900 text-amber-500 px-1.5 py-0.5 rounded text-[10px]">{r.NoBarcodeAsal || r.NoBarcode}</span>
                        </td>
                        <td className="px-4 py-2.5 font-bold font-mono text-slate-800">{r.GradeReclass}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-800 font-bold">{Number(r.BeratNetto).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-500">{Number(r.Tare || 0).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-slate-700 font-medium">{r.Destination}</td>
                        <td className="px-4 py-2.5 text-slate-400 font-mono">
                          {[r.Type, r.SubType, r.CropYear].filter(Boolean).join(' / ') || '-'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{r.InputBy}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================= LAPORAN INVOICE ======================= */}
      {activeTab === 'lapInvoice' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-amber-50 rounded-lg text-amber-500"><Layers size={18} /></div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Invoice</span>
                <span className="text-lg font-extrabold text-slate-800">{getFilteredInvoice().filter(r => !r.IsVoid).length} invoice</span>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 rounded-lg text-blue-500"><Inbox size={18} /></div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Bale</span>
                <span className="text-lg font-extrabold text-slate-800 font-mono">{getFilteredInvoice().filter(r => !r.IsVoid).reduce((acc, r) => acc + (r.JumlahBal || 0), 0)} bal</span>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-teal-50 rounded-lg text-teal-500"><TrendingUp size={18} /></div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Berat Netto</span>
                <span className="text-lg font-extrabold text-slate-800 font-mono">{getFilteredInvoice().filter(r => !r.IsVoid).reduce((acc, r) => acc + Number(r.TotalNetto || 0), 0).toFixed(2)} Kg</span>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-500"><TrendingUp size={18} /></div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Bersih Dibayar</span>
                <span className="text-lg font-extrabold text-slate-800 font-mono">Rp {getFilteredInvoice().filter(r => !r.IsVoid).reduce((acc, r) => acc + Number(r.UangSebesar || 0), 0).toLocaleString('id-ID')}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-md font-extrabold text-slate-800">Buying Payment</h3>
              <button
                onClick={exportInvoiceToExcel}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow transition"
              >
                <FileSpreadsheet size={13} /> Export ke Excel
              </button>
            </div>

            <div className="border border-slate-100 rounded-xl overflow-x-auto max-h-[500px]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                    <th className="px-4 py-2.5">No Invoice</th>
                    <th className="px-4 py-2.5">No Buying</th>
                    <th className="px-4 py-2.5">Tanggal</th>
                    <th className="px-4 py-2.5">Supplier / Petani</th>
                    <th className="px-4 py-2.5 text-right">Bale</th>
                    <th className="px-4 py-2.5 text-right">Netto (kg)</th>
                    <th className="px-4 py-2.5 text-right">Gross (Rp)</th>
                    <th className="px-4 py-2.5 text-right">PPh 22 (Rp)</th>
                    <th className="px-4 py-2.5 text-right">Materai (Rp)</th>
                    <th className="px-4 py-2.5 text-right">Pembulatan (Rp)</th>
                    <th className="px-4 py-2.5 text-right">Bersih (Rp)</th>
                    <th className="px-4 py-2.5">Lokasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {getFilteredInvoice().length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-slate-400">Tidak ada data.</td>
                    </tr>
                  ) : (
                    getFilteredInvoice().map((r, idx) => (
                      <tr key={idx} className={`hover:bg-slate-50/50 text-[11px] ${r.IsVoid ? 'bg-rose-50/10 text-slate-400' : ''}`}>
                        <td className="px-4 py-2.5 font-semibold text-slate-500 font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className={r.IsVoid ? 'line-through text-slate-300' : ''}>{r.NoInvoice}</span>
                            {r.IsVoid && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-600 font-extrabold text-[8px] uppercase tracking-wider font-sans">
                                VOID
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`px-4 py-2.5 font-semibold text-slate-500 font-mono ${r.IsVoid ? 'line-through text-slate-300' : ''}`}>{r.NoBuying}</td>
                        <td className={`px-4 py-2.5 text-slate-500 font-mono ${r.IsVoid ? 'line-through text-slate-300' : ''}`}>{r.Timestamp}</td>
                        <td className={`px-4 py-2.5 font-medium text-slate-800 ${r.IsVoid ? 'line-through text-slate-300' : ''}`}>{r.NamaSupplier}</td>
                        <td className={`px-4 py-2.5 text-right font-mono ${r.IsVoid ? 'line-through text-slate-300' : ''}`}>{r.JumlahBal}</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${r.IsVoid ? 'line-through text-slate-300' : ''}`}>{r.TotalNetto.toFixed(2)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono ${r.IsVoid ? 'line-through text-slate-300' : ''}`}>{r.TotalPembelian.toLocaleString('id-ID')}</td>
                        <td className={`px-4 py-2.5 text-right font-mono text-slate-500 ${r.IsVoid ? 'line-through text-slate-300' : ''}`}>{r.BiayaPPh.toLocaleString('id-ID')}</td>
                        <td className={`px-4 py-2.5 text-right font-mono text-slate-500 ${r.IsVoid ? 'line-through text-slate-300' : ''}`}>{r.BiayaMaterai.toLocaleString('id-ID')}</td>
                        <td className={`px-4 py-2.5 text-right font-mono text-slate-400 ${r.IsVoid ? 'line-through text-slate-300' : ''}`}>{r.Roundup || 0}</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-black ${r.IsVoid ? 'text-slate-300 line-through' : 'text-amber-600'}`}>{r.UangSebesar.toLocaleString('id-ID')}</td>
                        <td className={`px-4 py-2.5 text-slate-500 ${r.IsVoid ? 'line-through text-slate-300' : ''}`}>{r.Lokasi}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================= LAPORAN BUYING VS RECLASS ======================= */}
      {activeTab === 'lapBvR' && (() => {
        const rows = getBuyingVsReclassRows();
        const upCount = rows.filter(r => r.isReclassed && r.gradeStatus === 'UP Grade').length;
        const downCount = rows.filter(r => r.isReclassed && r.gradeStatus === 'Down Grade').length;
        const sameCount = rows.filter(r => r.isReclassed && r.gradeStatus === 'Sama').length;
        const unpricedRows = rows.filter(r => r.isReclassed && r.gradeStatus === 'Harga Belum Diset');
        const unpricedCount = unpricedRows.length;
        const totalReclassed = rows.filter(r => r.isReclassed).length;

        const upPct = totalReclassed > 0 ? (upCount / totalReclassed) * 100 : 0;
        const downPct = totalReclassed > 0 ? (downCount / totalReclassed) * 100 : 0;
        const samePct = totalReclassed > 0 ? (sameCount / totalReclassed) * 100 : 0;
        const reclassedPct = rows.length > 0 ? (totalReclassed / rows.length) * 100 : 0;

        const missingGrades = Array.from(new Set(unpricedRows.map(r => r.gradeReclass).filter(Boolean))) as string[];

        return (
          <div className="space-y-4">
            {/* Warning Banner when Reclass grades have no price in Master Harga */}
            {unpricedCount > 0 && (
              <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-amber-900 shadow-xs">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-100 rounded-xl text-amber-700 mt-0.5 flex-shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wide text-amber-900 flex items-center gap-2">
                      <span>Perhatian: {unpricedCount} Bal Reclass Belum Memiliki Harga ({missingGrades.length} Grade)</span>
                      <span className="text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-bold">Harga Rp 0</span>
                    </h4>
                    <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                      Nilai Total Reclass (Rp) bernilai Rp 0 karena grade reclass berikut belum didaftarkan di menu <b>Master Data Harga (Tipe: Reclass)</b>:
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {missingGrades.slice(0, 10).map((g, idx) => (
                        <span key={idx} className="px-2.5 py-1 bg-white border border-amber-300 rounded-lg font-mono font-extrabold text-[11px] text-amber-950 shadow-2xs">
                          {g}
                        </span>
                      ))}
                      {missingGrades.length > 10 && (
                        <span className="text-xs text-amber-800 font-bold self-center">
                          +{missingGrades.length - 10} grade lainnya
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 self-end md:self-center flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenSyncModal(missingGrades)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    <Sparkles size={14} />
                    Sinkronkan Harga Otomatis (NSPS ↔ NSRS)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('iscs-navigate', { detail: { page: 'pageMaster' } }));
                    }}
                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    <DollarSign size={14} />
                    Buka Master Harga
                  </button>
                </div>
              </div>
            )}

            {/* Summary Header */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600"><TrendingUp size={18} /></div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Total UP Grade</span>
                  <span className="text-lg font-extrabold text-slate-800 font-mono">
                    {upCount} bal <span className="text-xs font-semibold text-emerald-600">({upPct.toFixed(1)}%)</span>
                  </span>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
                <div className="p-2.5 bg-rose-50 rounded-lg text-rose-600"><TrendingUp size={18} className="transform rotate-180" /></div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Down Grade</span>
                  <span className="text-lg font-extrabold text-slate-800 font-mono">
                    {downCount} bal <span className="text-xs font-semibold text-rose-600">({downPct.toFixed(1)}%)</span>
                  </span>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
                <div className="p-2.5 bg-slate-50 rounded-lg text-slate-600"><Layers size={18} /></div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Grade Sama / Tetap</span>
                  <span className="text-lg font-extrabold text-slate-800 font-mono">
                    {sameCount} bal <span className="text-xs font-semibold text-slate-500">({samePct.toFixed(1)}%)</span>
                  </span>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
                <div className="p-2.5 bg-amber-50 rounded-lg text-amber-600"><Layers size={18} /></div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Reclassed (RC)</span>
                  <span className="text-lg font-extrabold text-slate-800 font-mono">
                    {totalReclassed} / {rows.length} <span className="text-xs font-semibold text-amber-600">({reclassedPct.toFixed(1)}%)</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-md font-extrabold text-slate-800">Tabel Rekonsiliasi Buying vs Reclass</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Membandingkan grade, berat, dan total nilai awal (Buying) dengan hasil setelah digrading ulang (Reclass).</p>
                </div>
                <button
                  onClick={exportBvRToExcel}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow transition flex-shrink-0"
                >
                  <FileSpreadsheet size={13} /> Export ke Excel
                </button>
              </div>

              <div className="border border-slate-100 rounded-xl overflow-x-auto max-h-[500px]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100 text-[10px] uppercase tracking-wider">
                      <th className="px-4 py-2.5">No Barcode</th>
                      <th className="px-4 py-2.5 text-center">Grade Buying</th>
                      <th className="px-4 py-2.5 text-right">Netto Buying (kg)</th>
                      <th className="px-4 py-2.5 text-right">Total Buying (Rp)</th>
                      <th className="px-4 py-2.5 text-center">Grade Reclass</th>
                      <th className="px-4 py-2.5 text-right">Netto Reclass (kg)</th>
                      <th className="px-4 py-2.5 text-right">Harga RC (Rp/kg)</th>
                      <th className="px-4 py-2.5 text-right">Total Reclass (Rp)</th>
                      <th className="px-4 py-2.5 text-right">Selisih Netto (kg)</th>
                      <th className="px-4 py-2.5 text-center">UP/Down Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-slate-400">Tidak ada data.</td>
                      </tr>
                    ) : (
                      rows.map((r, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 text-[11px]">
                          <td className="px-4 py-2.5">
                            <span className="font-mono font-bold bg-slate-900 text-amber-500 px-1.5 py-0.5 rounded text-[10px]">{r.noBarcode}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center font-bold font-mono text-slate-500">{r.gradeBuying}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-500">{r.nettoBuying.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-700">Rp {r.totalBuying.toLocaleString('id-ID')}</td>
                          <td className="px-4 py-2.5 text-center font-black font-mono text-slate-800">{r.isReclassed ? r.gradeReclass : '-'}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-800">
                            {r.isReclassed ? r.nettoReclass.toFixed(2) : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-800">
                            {r.isReclassed ? (
                              r.hargaReclass > 0 ? (
                                <span className="text-emerald-700">Rp {r.hargaReclass.toLocaleString('id-ID')}</span>
                              ) : (
                                <span className="text-amber-600 font-semibold text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Belum Diset</span>
                              )
                            ) : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-800">
                            {r.isReclassed ? (
                              r.hargaReclass > 0 ? (
                                `Rp ${r.totalReclass.toLocaleString('id-ID')}`
                              ) : (
                                <span className="text-amber-600 font-bold">Rp 0</span>
                              )
                            ) : '-'}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono font-bold ${r.selisihNetto > 0 ? 'text-emerald-600' : r.selisihNetto < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                            {r.isReclassed ? (r.selisihNetto > 0 ? `+${r.selisihNetto.toFixed(2)}` : r.selisihNetto.toFixed(2)) : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {r.isReclassed ? (
                              r.gradeStatus === 'UP Grade' ? (
                                <span className="text-emerald-800 font-extrabold bg-emerald-100 px-2.5 py-1 rounded-full text-[9px] uppercase tracking-wide">UP Grade</span>
                              ) : r.gradeStatus === 'Down Grade' ? (
                                <span className="text-rose-800 font-extrabold bg-rose-100 px-2.5 py-1 rounded-full text-[9px] uppercase tracking-wide">Down Grade</span>
                              ) : r.gradeStatus === 'Sama' ? (
                                <span className="text-slate-700 font-medium bg-slate-100 px-2.5 py-1 rounded-full text-[9px]">Sama</span>
                              ) : (
                                <span className="text-amber-800 font-extrabold bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wide" title="Harga per kg belum diatur di Master Harga">
                                  Harga Belum Diset
                                </span>
                              )
                            ) : (
                              <span className="text-slate-400 italic">Belum RC</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ======================= LAPORAN STOK GUDANG ======================= */}
      {activeTab === 'lapStok' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-amber-50 rounded-lg text-amber-500"><Layers size={18} /></div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Bales di Gudang</span>
                <span className="text-lg font-extrabold text-slate-800">
                  {getStokBreakdown().reduce((acc, r) => acc + r.jumlahBale, 0)} bal
                </span>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-xs flex items-center gap-3">
              <div className="p-2.5 bg-teal-50 rounded-lg text-teal-500"><TrendingUp size={18} /></div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Berat Netto Stok</span>
                <span className="text-lg font-extrabold text-slate-800 font-mono">
                  {getStokBreakdown().reduce((acc, r) => acc + r.totalNetto, 0).toFixed(2)} Kg
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-md font-extrabold text-slate-800">Stok Inventory Real-Time (By Grade)</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Daftar tembakau yang saat ini berada di dalam gudang (Sudah ditimbang masuk namun belum dikirim keluar).
                </p>
              </div>
              <button
                onClick={exportStokToExcel}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow transition flex-shrink-0"
              >
                <FileSpreadsheet size={13} /> Export ke Excel
              </button>
            </div>

            <div className="border border-slate-100 rounded-xl overflow-x-auto max-h-[500px]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                    <th className="px-4 py-2.5">No</th>
                    <th className="px-4 py-2.5">Nama Grade</th>
                    <th className="px-4 py-2.5 text-center w-28">Jumlah Bale</th>
                    <th className="px-4 py-2.5 text-right w-36">Total Netto (kg)</th>
                    <th className="px-4 py-2.5">Detail No Barcode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {getStokBreakdown().length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Gudang kosong (Tidak ada stok).</td>
                    </tr>
                  ) : (
                    getStokBreakdown().map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 text-[11px]">
                        <td className="px-4 py-2.5 text-slate-400 font-bold">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-bold font-mono text-slate-800">{r.grade}</td>
                        <td className="px-4 py-2.5 text-center font-semibold text-slate-600">{r.jumlahBale} bal</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-800">{r.totalNetto.toFixed(2)} Kg</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1 max-w-lg">
                            {r.bales.map(b => (
                              <span key={b.barcode} className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded font-mono text-[9px]" title={`Status Asal: ${b.statusSource}`}>
                                {b.barcode}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-md font-extrabold text-slate-800 font-sans">Detail Nomor Barcode Stok Gudang</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Daftar nomor barcode masing-masing bale yang saat ini tersimpan di dalam gudang.
              </p>
            </div>

            <div className="flex max-w-xs relative items-center">
              <Search className="absolute left-3 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Cari nomor barcode / grade / status..."
                value={stokSearchQuery}
                onChange={(e) => setStokSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500 font-medium"
              />
            </div>

            <div className="border border-slate-100 rounded-xl overflow-x-auto max-h-[400px]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                    <th className="px-4 py-2.5">No</th>
                    <th className="px-4 py-2.5">No Barcode</th>
                    <th className="px-4 py-2.5">Grade</th>
                    <th className="px-4 py-2.5 text-right">Netto (Kg)</th>
                    <th className="px-4 py-2.5 text-center">Status Asal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {getIndividualStockBales().filter(b => 
                    b.barcode.toLowerCase().includes(stokSearchQuery.toLowerCase()) ||
                    b.grade.toLowerCase().includes(stokSearchQuery.toLowerCase()) ||
                    b.statusSource.toLowerCase().includes(stokSearchQuery.toLowerCase())
                  ).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nomor barcode tidak ditemukan.</td>
                    </tr>
                  ) : (
                    getIndividualStockBales()
                      .filter(b => 
                        b.barcode.toLowerCase().includes(stokSearchQuery.toLowerCase()) ||
                        b.grade.toLowerCase().includes(stokSearchQuery.toLowerCase()) ||
                        b.statusSource.toLowerCase().includes(stokSearchQuery.toLowerCase())
                      )
                      .map((b, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 text-[11px]">
                          <td className="px-4 py-2.5 text-slate-400 font-bold">{idx + 1}</td>
                          <td className="px-4 py-2.5 font-bold font-mono text-slate-700 select-all">{b.barcode}</td>
                          <td className="px-4 py-2.5 font-bold font-mono text-slate-800">{b.grade}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-800">{b.netto.toFixed(2)} Kg</td>
                          <td className="px-4 py-2.5 text-center">
                            {b.statusSource === 'Buying' ? (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] font-bold">BUYING</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[9px] font-bold">RECLASS (RC)</span>
                            )}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sinkronisasi Harga Reclass */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Sinkronisasi & Penetapan Harga Reclass
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sistem mendeteksi padanan harga antara kode <b>NSPS</b> (transaksi bal) dengan <b>NSRS</b> (Master Harga).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSyncModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="text-xs bg-amber-50 text-amber-900 p-3 rounded-xl border border-amber-200 leading-relaxed">
              💡 <b>Catatan Penyesuaian:</b> Di Master Harga, grade tersimpan berakhiran <b>NSRS</b> (mis. <code>6RKS/S3M/NSRS</code>), sedangkan hasil grading reclass memakai <b>NSPS</b> (mis. <code>6RKS/S3M/NSPS</code>).
              Periksa harga di bawah dan klik <b>Simpan & Terapkan</b> agar harga otomatis terdaftar di Master Data Harga!
            </div>

            <div className="overflow-y-auto flex-1 border border-slate-100 rounded-2xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-500 font-bold sticky top-0 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-2.5">Grade Reclass (Transaksi)</th>
                    <th className="px-4 py-2.5">Padanan di Master Harga</th>
                    <th className="px-4 py-2.5 w-44 text-right">Harga (Rp/kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {syncList.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-bold font-mono text-slate-800">
                        {item.grade}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {item.sourceGrade ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                            <CheckCircle2 size={12} />
                            {item.sourceGrade}
                          </span>
                        ) : (
                          <span className="text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                            Belum Ada (Wajib Isi)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-slate-400 font-mono text-xs">Rp</span>
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={item.harga || ''}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setSyncList(prev => prev.map((it, i) => i === idx ? { ...it, harga: val } : it));
                            }}
                            placeholder="0"
                            className="w-32 px-2.5 py-1 text-right font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                Total <b>{syncList.length}</b> grade Reclass terdeteksi
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsSyncModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveSyncPrices}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles size={14} />
                  Simpan & Terapkan ke Master Harga
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
