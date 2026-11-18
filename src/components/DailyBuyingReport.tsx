import React, { useState, useMemo, useRef } from 'react';
import { BuyingRow } from '../types';
import * as XLSX from 'xlsx';
import {
  Calendar,
  Layers,
  TrendingUp,
  Inbox,
  FileSpreadsheet,
  Printer,
  ChevronLeft,
  ChevronRight,
  Search,
  ChevronDown,
  ChevronUp,
  Scale,
  Award,
  RefreshCw,
  CheckCircle2,
  SlidersHorizontal,
  X
} from 'lucide-react';

interface DailyBuyingReportProps {
  buyingList: BuyingRow[];
  onRefresh?: () => void;
}

export interface GradeDailySummary {
  grade: string;
  bales: number;
  balePct: number;
  netto: number;
  nettoPct: number;
  tare: number;
  bruto: number;
  avgNettoPerBale: number;
  avgPricePerKg: number;
  totalHarga: number;
  totalHargaPct: number;
  items: BuyingRow[];
}

export const DailyBuyingReport: React.FC<DailyBuyingReportProps> = ({ buyingList, onRefresh }) => {
  // Extract all unique dates from buying list, sorted descending
  const availableDates = useMemo(() => {
    const map: Record<string, { count: number; netto: number; totalHarga: number }> = {};
    buyingList.forEach(b => {
      const d = b.Timestamp ? b.Timestamp.split(' ')[0] : '';
      if (!d) return;
      if (!map[d]) {
        map[d] = { count: 0, netto: 0, totalHarga: 0 };
      }
      map[d].count += 1;
      map[d].netto += Number(b.BeratNetto || 0);
      map[d].totalHarga += Number(b.TotalHarga || 0);
    });

    return Object.entries(map)
      .map(([date, val]) => ({
        date,
        count: val.count,
        netto: val.netto,
        totalHarga: val.totalHarga
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [buyingList]);

  // Selected date defaults to latest available date in buying records, or today's date
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (availableDates.length > 0) {
      return availableDates[0].date;
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [activeViewMode, setActiveViewMode] = useState<'summary' | 'detail'>('summary');
  const [expandedGrade, setExpandedGrade] = useState<string | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Filter buying data for the selected date
  const dailyRows = useMemo(() => {
    return buyingList.filter(b => {
      const d = b.Timestamp ? b.Timestamp.split(' ')[0] : '';
      if (d !== selectedDate) return false;

      if (gradeFilter && b.GradeBuying !== gradeFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const bc = b.NoBarcode?.toLowerCase() || '';
        const sup = b.NamaSupplier?.toLowerCase() || '';
        const noB = b.NoBuying?.toLowerCase() || '';
        const gr = b.GradeBuying?.toLowerCase() || '';
        if (!bc.includes(q) && !sup.includes(q) && !noB.includes(q) && !gr.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [buyingList, selectedDate, gradeFilter, searchQuery]);

  // Summary totals for the day
  const totals = useMemo(() => {
    const totalBales = dailyRows.length;
    const totalNetto = dailyRows.reduce((acc, r) => acc + Number(r.BeratNetto || 0), 0);
    const totalTare = dailyRows.reduce((acc, r) => acc + Number(r.Tare || 0), 0);
    const totalBruto = dailyRows.reduce((acc, r) => acc + Number(r.BeratBruto || 0), 0);
    const totalHarga = dailyRows.reduce((acc, r) => acc + Number(r.TotalHarga || 0), 0);
    const avgNettoPerBale = totalBales > 0 ? totalNetto / totalBales : 0;
    const avgPricePerKg = totalNetto > 0 ? totalHarga / totalNetto : 0;

    return {
      totalBales,
      totalNetto,
      totalTare,
      totalBruto,
      totalHarga,
      avgNettoPerBale,
      avgPricePerKg
    };
  }, [dailyRows]);

  // Summary per Grade
  const gradeSummaries = useMemo<GradeDailySummary[]>(() => {
    const map: Record<string, BuyingRow[]> = {};
    dailyRows.forEach(r => {
      const g = (r.GradeBuying || 'NON-GRADE').trim().toUpperCase();
      if (!map[g]) map[g] = [];
      map[g].push(r);
    });

    const entries = Object.entries(map).map(([grade, items]) => {
      const bales = items.length;
      const netto = items.reduce((acc, i) => acc + Number(i.BeratNetto || 0), 0);
      const tare = items.reduce((acc, i) => acc + Number(i.Tare || 0), 0);
      const bruto = items.reduce((acc, i) => acc + Number(i.BeratBruto || 0), 0);
      const totalHarga = items.reduce((acc, i) => acc + Number(i.TotalHarga || 0), 0);
      const balePct = totals.totalBales > 0 ? (bales / totals.totalBales) * 100 : 0;
      const nettoPct = totals.totalNetto > 0 ? (netto / totals.totalNetto) * 100 : 0;
      const totalHargaPct = totals.totalHarga > 0 ? (totalHarga / totals.totalHarga) * 100 : 0;
      const avgNettoPerBale = bales > 0 ? netto / bales : 0;
      const avgPricePerKg = netto > 0 ? totalHarga / netto : 0;

      return {
        grade,
        bales,
        balePct,
        netto,
        nettoPct,
        tare,
        bruto,
        avgNettoPerBale,
        avgPricePerKg,
        totalHarga,
        totalHargaPct,
        items
      };
    });

    // Sort by Grade name alphabetically or by bale count descending
    return entries.sort((a, b) => a.grade.localeCompare(b.grade));
  }, [dailyRows, totals]);

  // Unique grades on selected date for filter
  const uniqueDailyGrades = useMemo(() => {
    const set = new Set<string>();
    buyingList
      .filter(b => b.Timestamp && b.Timestamp.split(' ')[0] === selectedDate)
      .forEach(b => {
        if (b.GradeBuying) set.add(b.GradeBuying.trim().toUpperCase());
      });
    return Array.from(set).sort();
  }, [buyingList, selectedDate]);

  // Date Navigation Helpers
  const handlePrevDay = () => {
    if (!selectedDate) return;
    const current = new Date(selectedDate);
    current.setDate(current.getDate() - 1);
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${d}`);
  };

  const handleNextDay = () => {
    if (!selectedDate) return;
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + 1);
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${d}`);
  };

  const handleSetToday = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${d}`);
  };

  // Formatted date string in Indonesian (e.g. "Kamis, 02 Oktober 2026")
  const formattedSelectedDate = useMemo(() => {
    if (!selectedDate) return '-';
    try {
      const parts = selectedDate.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Export Daily Buying to Excel
  const exportDailyBuyingToExcel = () => {
    if (dailyRows.length === 0) {
      alert('Tidak ada transaksi buying pada tanggal ini untuk diexport.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary Grade (Format seperti screenshot laporan)
    const summaryRows = gradeSummaries.map((s, idx) => ({
      'No': idx + 1,
      'Grade': s.grade,
      'Bale (Bal)': s.bales,
      '% Bale': `${s.balePct.toFixed(1)}%`,
      'Netto (Kg)': Number(s.netto.toFixed(2)),
      '% Netto': `${s.nettoPct.toFixed(1)}%`,
      'Tare (Kg)': Number(s.tare.toFixed(2)),
      'Bruto (Kg)': Number(s.bruto.toFixed(2)),
      'Avg Kg/Bal': Number(s.avgNettoPerBale.toFixed(2)),
      'Harga Rata-rata (Rp/Kg)': Math.round(s.avgPricePerKg),
      'Total Pembelian (Rp)': s.totalHarga,
      '% Nilai': `${s.totalHargaPct.toFixed(1)}%`
    }));

    // Add Grand Total row to summary
    summaryRows.push({
      'No': 'TOTAL' as any,
      'Grade': 'GRAND TOTAL',
      'Bale (Bal)': totals.totalBales,
      '% Bale': '100.0%',
      'Netto (Kg)': Number(totals.totalNetto.toFixed(2)),
      '% Netto': '100.0%',
      'Tare (Kg)': Number(totals.totalTare.toFixed(2)),
      'Bruto (Kg)': Number(totals.totalBruto.toFixed(2)),
      'Avg Kg/Bal': Number(totals.avgNettoPerBale.toFixed(2)),
      'Harga Rata-rata (Rp/Kg)': Math.round(totals.avgPricePerKg),
      'Total Pembelian (Rp)': totals.totalHarga,
      '% Nilai': '100.0%'
    });

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Daily Buying Summary');

    // Sheet 2: Detail Barcode Transaksi Hari Ini
    const detailRows = dailyRows.map((r, idx) => ({
      'No': idx + 1,
      'Tanggal': r.Timestamp,
      'No Buying': r.NoBuying || '-',
      'No Barcode': r.NoBarcode,
      'Nama Supplier / Petani': r.NamaSupplier,
      'Grade Buying': r.GradeBuying,
      'Bruto (Kg)': Number(r.BeratBruto.toFixed(2)),
      'Tare (Kg)': Number(r.Tare.toFixed(2)),
      'Netto (Kg)': Number(r.BeratNetto.toFixed(2)),
      'Harga (Rp/Kg)': r.HargaBuying,
      'Total Nilai (Rp)': r.TotalHarga,
      'Status Reclass': r.StatusReclass || 'BELUM',
      'Petugas Timbang': r.InputBy
    }));

    const wsDetail = XLSX.utils.json_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail Barcode Buying');

    XLSX.writeFile(wb, `Report_Daily_Buying_${selectedDate}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* =========================================================================
          CONTROL BAR: DATE SELECTOR & ACTIONS
          ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Date Picker Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-1 rounded-xl">
              <button
                type="button"
                onClick={handlePrevDay}
                className="p-1.5 hover:bg-white text-slate-600 rounded-lg transition hover:shadow-xs active:scale-95"
                title="Hari Sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="flex items-center gap-2 px-2">
                <Calendar size={15} className="text-amber-500" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs font-black text-slate-800 focus:outline-none cursor-pointer"
                />
              </div>

              <button
                type="button"
                onClick={handleNextDay}
                className="p-1.5 hover:bg-white text-slate-600 rounded-lg transition hover:shadow-xs active:scale-95"
                title="Hari Berikutnya"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <button
              type="button"
              onClick={handleSetToday}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition active:scale-95"
            >
              Hari Ini
            </button>

            {/* Quick selector of dates with buying records */}
            {availableDates.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400 font-medium hidden sm:inline">Pilih Cepat:</span>
                <select
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="px-3 py-1.5 bg-amber-50/70 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="" disabled>-- Riwayat Tanggal Buying --</option>
                  {availableDates.map(d => (
                    <option key={d.date} value={d.date}>
                      {d.date} ({d.count} bal - {d.netto.toFixed(0)} kg)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Action Buttons: Export Excel & Cetak / Print */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl transition active:scale-95"
                title="Segarkan Data"
              >
                <RefreshCw size={15} />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              disabled={dailyRows.length === 0}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition active:scale-95 disabled:opacity-50"
            >
              <Printer size={15} className="text-slate-600" />
              Cetak Laporan
            </button>

            <button
              type="button"
              onClick={exportDailyBuyingToExcel}
              disabled={dailyRows.length === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <FileSpreadsheet size={15} />
              Export ke Excel (.xlsx)
            </button>
          </div>
        </div>

        {/* Filters and search inside selected day */}
        <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Filter Grade */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Filter Grade:</span>
              <select
                value={gradeFilter}
                onChange={e => setGradeFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="">Semua Grade ({uniqueDailyGrades.length})</option>
                {uniqueDailyGrades.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            {/* Search Bar */}
            <div className="relative flex-1 sm:w-64">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cari barcode / petani..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Toggle View Mode: Summary vs Detail */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl self-end md:self-auto text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveViewMode('summary')}
              className={`px-3 py-1 rounded-lg transition ${
                activeViewMode === 'summary'
                  ? 'bg-white text-slate-800 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Ringkasan Grade
            </button>
            <button
              type="button"
              onClick={() => setActiveViewMode('detail')}
              className={`px-3 py-1 rounded-lg transition ${
                activeViewMode === 'detail'
                  ? 'bg-white text-slate-800 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Semua Barcode ({dailyRows.length})
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          TOP KPI CARDS (DAILY BUYING SUMMARY)
          ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Tanggal Buying */}
        <div className="bg-white rounded-xl border border-slate-100 p-3.5 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Calendar size={13} className="text-amber-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Tanggal Buying</span>
          </div>
          <span className="text-sm font-extrabold text-slate-800 block truncate" title={formattedSelectedDate}>
            {selectedDate}
          </span>
          <span className="text-[10px] text-slate-400 block truncate">{formattedSelectedDate}</span>
        </div>

        {/* Total Bales */}
        <div className="bg-white rounded-xl border border-slate-100 p-3.5 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Layers size={13} className="text-amber-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Bale</span>
          </div>
          <span className="text-lg font-black text-slate-800">{totals.totalBales} <span className="text-xs font-normal text-slate-400">bal</span></span>
          <span className="text-[10px] text-slate-400 block">{gradeSummaries.length} Variasi Grade</span>
        </div>

        {/* Total Netto */}
        <div className="bg-white rounded-xl border border-slate-100 p-3.5 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Scale size={13} className="text-teal-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Netto</span>
          </div>
          <span className="text-lg font-black text-slate-800 font-mono">
            {totals.totalNetto.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">Kg</span>
          </span>
          <span className="text-[10px] text-slate-400 block">Bruto: {totals.totalBruto.toFixed(1)} Kg</span>
        </div>

        {/* Rata-rata Kg/Bal */}
        <div className="bg-white rounded-xl border border-slate-100 p-3.5 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <TrendingUp size={13} className="text-blue-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Avg Berat / Bal</span>
          </div>
          <span className="text-lg font-black text-slate-800 font-mono">
            {totals.avgNettoPerBale.toFixed(2)} <span className="text-xs font-normal text-slate-400">Kg/Bal</span>
          </span>
          <span className="text-[10px] text-slate-400 block">Tare: {totals.totalTare.toFixed(1)} Kg</span>
        </div>

        {/* Rata-rata Harga / Kg */}
        <div className="bg-white rounded-xl border border-slate-100 p-3.5 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Award size={13} className="text-indigo-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Avg Harga / Kg</span>
          </div>
          <span className="text-lg font-black text-slate-800 font-mono">
            Rp {Math.round(totals.avgPricePerKg).toLocaleString('id-ID')}
          </span>
          <span className="text-[10px] text-slate-400 block">per Kg Tembakau</span>
        </div>

        {/* Total Nilai Pembelian */}
        <div className="bg-white rounded-xl border border-slate-100 p-3.5 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Inbox size={13} className="text-emerald-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Pembelian</span>
          </div>
          <span className="text-base font-black text-amber-600 font-mono block truncate" title={`Rp ${totals.totalHarga.toLocaleString('id-ID')}`}>
            Rp {totals.totalHarga.toLocaleString('id-ID')}
          </span>
          <span className="text-[10px] text-emerald-600 font-bold block">Gross Amount</span>
        </div>
      </div>

      {/* =========================================================================
          MAIN TABLE SECTION: SUMMARY GRADE vs DETAIL BARCODE
          ========================================================================= */}
      {dailyRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center space-y-3">
          <div className="w-12 h-12 mx-auto bg-amber-50 text-amber-500 rounded-full flex items-center justify-center">
            <Calendar size={24} />
          </div>
          <h4 className="text-base font-bold text-slate-800">Tidak Ada Transaksi Buying</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Tidak ditemukan data timbang buying pada tanggal <b>{selectedDate}</b> ({formattedSelectedDate}).
            Silakan pilih tanggal lain atau beralih ke riwayat tanggal yang tersedia pada menu di atas.
          </p>
          {availableDates.length > 0 && (
            <div className="pt-3 space-y-2">
              <span className="text-[11px] font-bold text-slate-500 block">Pilih tanggal transaksi yang tersedia:</span>
              <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
                {availableDates.map(d => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setSelectedDate(d.date)}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
                  >
                    <Calendar size={13} />
                    {d.date} ({d.count} bal - {d.netto.toFixed(0)} kg)
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : activeViewMode === 'summary' ? (
        /* ======================== TABEL SUMMARY GRADE ======================== */
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                <Layers size={18} className="text-amber-500" />
                Laporan Daily Buying &mdash; Summary per Grade
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Rekapitulasi total bale, berat netto, tara, bruto, harga rata-rata, dan total rupiah pembelian per grade untuk tanggal <b>{formattedSelectedDate}</b>.
              </p>
            </div>
            <span className="text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-xl self-start sm:self-auto">
              {gradeSummaries.length} Grade &bull; {totals.totalBales} Bales
            </span>
          </div>

          <div className="border border-slate-100 rounded-xl overflow-x-auto shadow-2xs">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-900 text-slate-200 font-bold uppercase tracking-wider text-[10px]">
                  <th className="px-3.5 py-3 text-center w-12">No</th>
                  <th className="px-4 py-3">Grade Buying</th>
                  <th className="px-4 py-3 text-right">Bale (Bal)</th>
                  <th className="px-3 py-3 text-right">% Bale</th>
                  <th className="px-4 py-3 text-right">Netto (Kg)</th>
                  <th className="px-3 py-3 text-right">% Netto</th>
                  <th className="px-3 py-3 text-right">Tare (Kg)</th>
                  <th className="px-3 py-3 text-right">Bruto (Kg)</th>
                  <th className="px-3.5 py-3 text-right">Avg Kg/Bal</th>
                  <th className="px-4 py-3 text-right">Avg Rp/Kg</th>
                  <th className="px-4 py-3 text-right">Total Pembelian (Rp)</th>
                  <th className="px-3 py-3 text-right">% Nilai</th>
                  <th className="px-3 py-3 text-center w-20">Rincian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gradeSummaries.map((s, idx) => {
                  const isExpanded = expandedGrade === s.grade;
                  return (
                    <React.Fragment key={s.grade}>
                      <tr className="hover:bg-amber-50/40 transition text-[11px] group">
                        {/* No */}
                        <td className="px-3.5 py-3 text-center text-slate-400 font-bold">{idx + 1}</td>

                        {/* Grade */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-slate-800 text-xs px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200">
                              {s.grade}
                            </span>
                          </div>
                        </td>

                        {/* Bale */}
                        <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono">
                          {s.bales}
                        </td>

                        {/* % Bale */}
                        <td className="px-3 py-3 text-right text-slate-500 font-mono text-[10px]">
                          {s.balePct.toFixed(1)}%
                        </td>

                        {/* Netto */}
                        <td className="px-4 py-3 text-right font-black text-slate-900 font-mono">
                          {s.netto.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* % Netto */}
                        <td className="px-3 py-3 text-right text-slate-500 font-mono text-[10px]">
                          {s.nettoPct.toFixed(1)}%
                        </td>

                        {/* Tare */}
                        <td className="px-3 py-3 text-right text-slate-500 font-mono">
                          {s.tare.toFixed(2)}
                        </td>

                        {/* Bruto */}
                        <td className="px-3 py-3 text-right text-slate-600 font-mono">
                          {s.bruto.toFixed(2)}
                        </td>

                        {/* Avg Kg/Bal */}
                        <td className="px-3.5 py-3 text-right font-semibold text-slate-700 font-mono">
                          {s.avgNettoPerBale.toFixed(2)}
                        </td>

                        {/* Avg Rp/Kg */}
                        <td className="px-4 py-3 text-right font-medium text-slate-700 font-mono">
                          Rp {Math.round(s.avgPricePerKg).toLocaleString('id-ID')}
                        </td>

                        {/* Total Pembelian */}
                        <td className="px-4 py-3 text-right font-black text-amber-700 font-mono">
                          Rp {s.totalHarga.toLocaleString('id-ID')}
                        </td>

                        {/* % Nilai */}
                        <td className="px-3 py-3 text-right font-bold text-amber-600 font-mono text-[10px]">
                          {s.totalHargaPct.toFixed(1)}%
                        </td>

                        {/* Action: Expand Detail */}
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setExpandedGrade(isExpanded ? null : s.grade)}
                            className="p-1 rounded hover:bg-slate-200 text-slate-500 transition"
                            title={isExpanded ? 'Tutup Rincian Barcode' : 'Lihat Rincian Barcode'}
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable row: Sub-list of barcodes for this grade */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-y border-amber-200">
                          <td colSpan={13} className="p-4">
                            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
                              <div className="flex items-center justify-between">
                                <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                  <span>Daftar Barcode Grade</span>
                                  <span className="font-mono bg-slate-900 text-amber-400 px-1.5 py-0.5 rounded text-[10px]">
                                    {s.grade}
                                  </span>
                                  <span className="text-slate-400 font-normal">({s.items.length} bale)</span>
                                </h5>
                                <button
                                  type="button"
                                  onClick={() => setExpandedGrade(null)}
                                  className="text-xs text-slate-400 hover:text-slate-600"
                                >
                                  Tutup &times;
                                </button>
                              </div>

                              <div className="overflow-x-auto max-h-60 border border-slate-100 rounded-lg">
                                <table className="w-full text-left text-[11px]">
                                  <thead>
                                    <tr className="bg-slate-100 text-slate-500 font-bold text-[10px]">
                                      <th className="px-3 py-2">No</th>
                                      <th className="px-3 py-2">Barcode</th>
                                      <th className="px-3 py-2">No Buying</th>
                                      <th className="px-3 py-2">Supplier / Petani</th>
                                      <th className="px-3 py-2 text-right">Bruto (Kg)</th>
                                      <th className="px-3 py-2 text-right">Tare (Kg)</th>
                                      <th className="px-3 py-2 text-right">Netto (Kg)</th>
                                      <th className="px-3 py-2 text-right">Harga (Rp)</th>
                                      <th className="px-3 py-2 text-right">Total (Rp)</th>
                                      <th className="px-3 py-2 text-center">Status RC</th>
                                      <th className="px-3 py-2">Operator</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {s.items.map((it, iIdx) => (
                                      <tr key={it.NoBarcode} className="hover:bg-slate-50">
                                        <td className="px-3 py-1.5 text-slate-400">{iIdx + 1}</td>
                                        <td className="px-3 py-1.5 font-mono font-bold text-slate-900">{it.NoBarcode}</td>
                                        <td className="px-3 py-1.5 font-mono text-slate-500">{it.NoBuying || '-'}</td>
                                        <td className="px-3 py-1.5 text-slate-700">{it.NamaSupplier}</td>
                                        <td className="px-3 py-1.5 text-right font-mono text-slate-600">{it.BeratBruto.toFixed(2)}</td>
                                        <td className="px-3 py-1.5 text-right font-mono text-slate-600">{it.Tare.toFixed(2)}</td>
                                        <td className="px-3 py-1.5 text-right font-mono font-bold text-slate-800">{it.BeratNetto.toFixed(2)}</td>
                                        <td className="px-3 py-1.5 text-right font-mono">{it.HargaBuying.toLocaleString('id-ID')}</td>
                                        <td className="px-3 py-1.5 text-right font-mono font-bold text-amber-700">{it.TotalHarga.toLocaleString('id-ID')}</td>
                                        <td className="px-3 py-1.5 text-center">
                                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                            it.StatusReclass === 'SUDAH'
                                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                                          }`}>
                                            {it.StatusReclass === 'SUDAH' ? 'SUDAH' : 'BELUM'}
                                          </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-slate-500">{it.InputBy}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>

              {/* SUMMARY / GRAND TOTAL ROW */}
              <tfoot>
                <tr className="bg-slate-900 text-white font-black text-xs border-t-2 border-amber-500">
                  <td className="px-3.5 py-3.5 text-center text-amber-400">&Sigma;</td>
                  <td className="px-4 py-3.5 uppercase tracking-wider text-amber-400">
                    TOTAL / GRAND TOTAL
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-amber-400">
                    {totals.totalBales} Bal
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono text-slate-300 text-[10px]">
                    100.0%
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-amber-400">
                    {totals.totalNetto.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kg
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono text-slate-300 text-[10px]">
                    100.0%
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono text-slate-300">
                    {totals.totalTare.toFixed(2)}
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono text-slate-300">
                    {totals.totalBruto.toFixed(2)}
                  </td>
                  <td className="px-3.5 py-3.5 text-right font-mono text-slate-200">
                    {totals.avgNettoPerBale.toFixed(2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-200">
                    Rp {Math.round(totals.avgPricePerKg).toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-amber-300 text-sm">
                    Rp {totals.totalHarga.toLocaleString('id-ID')}
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono text-amber-400 text-[10px]">
                    100.0%
                  </td>
                  <td className="px-3 py-3.5 text-center">&mdash;</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        /* ======================== TABEL DETAIL SEMUA BARCODE ======================== */
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-amber-500" />
                Daftar Detail Transaksi Barcode ({dailyRows.length} Barcode)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Rincian setiap lembar barcode tembakau yang ditimbang pada <b>{formattedSelectedDate}</b>.
              </p>
            </div>
          </div>

          <div className="border border-slate-100 rounded-xl overflow-x-auto max-h-[550px] shadow-2xs">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[10px] uppercase">
                  <th className="px-3 py-2.5">No</th>
                  <th className="px-3 py-2.5">Waktu Timbang</th>
                  <th className="px-3.5 py-2.5">No Buying</th>
                  <th className="px-3.5 py-2.5">No Barcode</th>
                  <th className="px-4 py-2.5">Nama Supplier / Petani</th>
                  <th className="px-3 py-2.5 text-center">Grade</th>
                  <th className="px-3 py-2.5 text-right">Bruto (Kg)</th>
                  <th className="px-3 py-2.5 text-right">Tare (Kg)</th>
                  <th className="px-3.5 py-2.5 text-right">Netto (Kg)</th>
                  <th className="px-3.5 py-2.5 text-right">Harga (Rp)</th>
                  <th className="px-4 py-2.5 text-right">Total (Rp)</th>
                  <th className="px-3 py-2.5 text-center">Status RC</th>
                  <th className="px-3.5 py-2.5">Petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyRows.map((r, idx) => (
                  <tr key={r.NoBarcode || idx} className="hover:bg-slate-50/70 text-[11px]">
                    <td className="px-3 py-2 text-slate-400 font-bold">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">
                      {r.Timestamp ? r.Timestamp.split(' ')[1] || r.Timestamp : '-'}
                    </td>
                    <td className="px-3.5 py-2 font-mono text-slate-600 font-semibold">{r.NoBuying || '-'}</td>
                    <td className="px-3.5 py-2">
                      <span className="font-mono font-bold bg-slate-900 text-amber-400 px-1.5 py-0.5 rounded text-[10px]">
                        {r.NoBarcode}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium text-slate-800">{r.NamaSupplier}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="font-mono font-black text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                        {r.GradeBuying}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">{r.BeratBruto.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">{r.Tare.toFixed(2)}</td>
                    <td className="px-3.5 py-2 text-right font-mono font-black text-slate-900">{r.BeratNetto.toFixed(2)}</td>
                    <td className="px-3.5 py-2 text-right font-mono text-slate-700">{r.HargaBuying.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-2 text-right font-mono font-black text-amber-700">{r.TotalHarga.toLocaleString('id-ID')}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        r.StatusReclass === 'SUDAH'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {r.StatusReclass === 'SUDAH' ? 'SUDAH' : 'BELUM'}
                      </span>
                    </td>
                    <td className="px-3.5 py-2 text-slate-500">{r.InputBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          PRINT PREVIEW MODAL
          ========================================================================= */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Printer size={20} className="text-amber-500" />
                <h3 className="text-base font-extrabold text-slate-900">
                  Pratinjau Cetak Laporan Daily Buying
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {/* Printable Content Area */}
            <div id="printable-daily-buying" className="bg-white p-6 border border-slate-200 rounded-xl space-y-4 text-slate-900 font-sans">
              {/* Header Surat */}
              <div className="border-b-2 border-slate-800 pb-3 flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-black tracking-tight uppercase">ISCS STOCK CONTROL &amp; WAREHOUSE</h2>
                  <h3 className="text-sm font-bold text-slate-700">LAPORAN HARIAN TIMBANG BUYING (DAILY BUYING REPORT)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Tanggal Operasional: <span className="font-bold text-slate-800">{formattedSelectedDate} ({selectedDate})</span></p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>Dicetak: {new Date().toLocaleString('id-ID')}</p>
                  <p className="font-bold text-slate-700">Gudang Utama (Purchasing)</p>
                </div>
              </div>

              {/* Ringkasan Angka Kunci */}
              <div className="grid grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Bale</span>
                  <span className="font-black text-sm">{totals.totalBales} Bal</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Netto</span>
                  <span className="font-black text-sm">{totals.totalNetto.toFixed(2)} Kg</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Rata-rata Kg/Bal</span>
                  <span className="font-black text-sm">{totals.avgNettoPerBale.toFixed(2)} Kg</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Nilai Pembelian</span>
                  <span className="font-black text-sm">Rp {totals.totalHarga.toLocaleString('id-ID')}</span>
                </div>
              </div>

              {/* Tabel Cetak */}
              <table className="w-full border-collapse text-[11px] border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 font-bold border-b border-slate-300 text-slate-700">
                    <th className="border border-slate-300 px-2 py-1.5 text-center">No</th>
                    <th className="border border-slate-300 px-3 py-1.5 text-left">Grade</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-right">Bale</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-right">% Bale</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-right">Netto (Kg)</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-right">% Netto</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-right">Tare (Kg)</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-right">Bruto (Kg)</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-right">Avg Kg/Bal</th>
                    <th className="border border-slate-300 px-3 py-1.5 text-right">Avg Rp/Kg</th>
                    <th className="border border-slate-300 px-3 py-1.5 text-right">Total Nilai (Rp)</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-right">% Nilai</th>
                  </tr>
                </thead>
                <tbody>
                  {gradeSummaries.map((s, idx) => (
                    <tr key={s.grade} className="border-b border-slate-200">
                      <td className="border border-slate-300 px-2 py-1 text-center">{idx + 1}</td>
                      <td className="border border-slate-300 px-3 py-1 font-bold font-mono">{s.grade}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono">{s.bales}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono">{s.balePct.toFixed(1)}%</td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono font-bold">{s.netto.toFixed(2)}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono">{s.nettoPct.toFixed(1)}%</td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono">{s.tare.toFixed(2)}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono">{s.bruto.toFixed(2)}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono">{s.avgNettoPerBale.toFixed(2)}</td>
                      <td className="border border-slate-300 px-3 py-1 text-right font-mono">Rp {Math.round(s.avgPricePerKg).toLocaleString('id-ID')}</td>
                      <td className="border border-slate-300 px-3 py-1 text-right font-mono font-bold">Rp {s.totalHarga.toLocaleString('id-ID')}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono">{s.totalHargaPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-black border-t-2 border-slate-800">
                    <td colSpan={2} className="border border-slate-300 px-3 py-2 uppercase">GRAND TOTAL</td>
                    <td className="border border-slate-300 px-2 py-2 text-right font-mono">{totals.totalBales}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right font-mono">100.0%</td>
                    <td className="border border-slate-300 px-2 py-2 text-right font-mono">{totals.totalNetto.toFixed(2)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right font-mono">100.0%</td>
                    <td className="border border-slate-300 px-2 py-2 text-right font-mono">{totals.totalTare.toFixed(2)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right font-mono">{totals.totalBruto.toFixed(2)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right font-mono">{totals.avgNettoPerBale.toFixed(2)}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right font-mono">Rp {Math.round(totals.avgPricePerKg).toLocaleString('id-ID')}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right font-mono">Rp {totals.totalHarga.toLocaleString('id-ID')}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right font-mono">100.0%</td>
                  </tr>
                </tfoot>
              </table>

              {/* Tanda Tangan */}
              <div className="pt-8 grid grid-cols-3 gap-6 text-center text-xs">
                <div>
                  <p className="font-semibold text-slate-600 mb-14">Petugas Timbang,</p>
                  <div className="border-b border-slate-400 w-36 mx-auto"></div>
                  <p className="text-[10px] text-slate-400 mt-1">( Timbangan Buying )</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-600 mb-14">Checker / QC Grading,</p>
                  <div className="border-b border-slate-400 w-36 mx-auto"></div>
                  <p className="text-[10px] text-slate-400 mt-1">( Quality Control )</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-600 mb-14">Kepala Gudang / Admin,</p>
                  <div className="border-b border-slate-400 w-36 mx-auto"></div>
                  <p className="text-[10px] text-slate-400 mt-1">( Supervisor Purchasing )</p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="px-5 py-2 bg-slate-900 text-amber-400 hover:bg-black rounded-xl text-xs font-bold flex items-center gap-2 shadow transition"
              >
                <Printer size={15} /> Cetak Sekarang (Print)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
