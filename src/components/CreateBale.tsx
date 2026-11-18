import React, { useState, useEffect } from 'react';
import {
  apiCreateSingleBale,
  apiGetMasterPrice,
  apiGetBuyingList,
  getTodayDateString,
  getBarcodeSettings,
  generateBuyingBarcode,
  getSettingValue
} from '../db';
import { MasterPrice, BuyingRow } from '../types';
import { BarcodeSvg } from './BarcodeSvg';
import {
  PackagePlus,
  Barcode,
  CheckCircle2,
  Printer,
  Scale,
  Sparkles,
  RefreshCw,
  Search,
  Calendar,
  Layers,
  ArrowRight,
  Plus
} from 'lucide-react';

interface CreateBaleProps {
  currentUser: any;
  onBaleCreated?: () => void;
}

export const CreateBale: React.FC<CreateBaleProps> = ({ currentUser, onBaleCreated }) => {
  // Form states
  const [useAutoBarcode, setUseAutoBarcode] = useState(true);
  const [manualBarcode, setManualBarcode] = useState('');
  const [grade, setGrade] = useState('');
  const [beratNetto, setBeratNetto] = useState('');
  const [tare, setTare] = useState('0');
  const [namaSupplier, setNamaSupplier] = useState('STOK LANGSUNG');
  const [tanggal, setTanggal] = useState<string>(() => getTodayDateString());

  // Cascading Type / SubType / CropYear
  const [type, setType] = useState('VIRGINIA');
  const [subType, setSubType] = useState('LOKAL');
  const [cropYear, setCropYear] = useState(() => String(new Date().getFullYear()));

  // Available master prices
  const [prices, setPrices] = useState<MasterPrice[]>([]);
  const [availableGrades, setAvailableGrades] = useState<string[]>([]);
  const [previewAutoBarcode, setPreviewAutoBarcode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // History / Recent Created Bales
  const [recentBales, setRecentBales] = useState<BuyingRow[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  // Print thermal preview modal / state
  const [lastCreatedBale, setLastCreatedBale] = useState<BuyingRow | null>(null);
  const [companyName, setCompanyName] = useState('PT INDO DEWATA SEMESTA');

  const showToast = (text: string, type: 'ok' | 'err') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const fetchMasterData = () => {
    const allPrices = apiGetMasterPrice();
    const buyingPrices = allPrices.filter(p => p.Tipe === 'BUYING');
    setPrices(buyingPrices.length > 0 ? buyingPrices : allPrices);

    // Types
    const types = Array.from(new Set(allPrices.map(p => p.Type || '').filter(Boolean)));
    if (types.length > 0 && !types.includes(type)) {
      setType(types[0]);
    }

    const cName = getSettingValue('PrePrintCompanyName', 'PT INDO DEWATA SEMESTA');
    setCompanyName(cName);
  };

  const fetchRecentBales = () => {
    const all = apiGetBuyingList();
    // Get latest 15 bales created
    setRecentBales([...all].reverse().slice(0, 15));
  };

  // Sync available grades when type/subType/cropYear change
  useEffect(() => {
    const filtered = prices.filter(p => {
      let match = true;
      if (type && p.Type) match = match && p.Type === type;
      if (subType && p.SubType) match = match && p.SubType === subType;
      if (cropYear && p.CropYear) match = match && p.CropYear === cropYear;
      return match;
    });

    const grades = Array.from(new Set(filtered.map(p => p.GradeBuying).filter(Boolean)));
    if (grades.length === 0) {
      // Fallback to all grades in prices
      const allGrades = Array.from(new Set(prices.map(p => p.GradeBuying).filter(Boolean)));
      setAvailableGrades(allGrades);
    } else {
      setAvailableGrades(grades);
    }
  }, [prices, type, subType, cropYear]);

  // Update preview barcode
  const refreshAutoBarcodePreview = () => {
    try {
      const sample = generateBuyingBarcode(tanggal);
      setPreviewAutoBarcode(sample);
    } catch {
      const s = getBarcodeSettings();
      setPreviewAutoBarcode(`${s.company}${s.tipe}${s.sumber}...`);
    }
  };

  useEffect(() => {
    fetchMasterData();
    fetchRecentBales();
    refreshAutoBarcodePreview();
  }, []);

  useEffect(() => {
    refreshAutoBarcodePreview();
  }, [tanggal]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanGrade = grade.trim().toUpperCase();
    const cleanNetto = parseFloat(beratNetto);
    const cleanTare = parseFloat(tare) || 0;

    if (!cleanGrade) {
      showToast('Harap pilih atau ketik Grade tembakau.', 'err');
      return;
    }

    if (isNaN(cleanNetto) || cleanNetto <= 0) {
      showToast('Berat Netto harus diisi dengan angka lebih dari 0 kg.', 'err');
      return;
    }

    if (!useAutoBarcode && !manualBarcode.trim()) {
      showToast('No Barcode wajib diisi jika tidak mencentang Auto Barcode.', 'err');
      return;
    }

    setIsSubmitting(true);
    const res = apiCreateSingleBale({
      autoBarcode: useAutoBarcode,
      noBarcode: useAutoBarcode ? undefined : manualBarcode.trim().toUpperCase(),
      gradeBuying: cleanGrade,
      beratNetto: cleanNetto,
      tare: cleanTare,
      namaSupplier: namaSupplier.trim() || 'STOK LANGSUNG',
      type: type || 'VIRGINIA',
      subType: subType || 'LOKAL',
      cropYear: cropYear || String(new Date().getFullYear()),
      inputBy: currentUser?.nama || currentUser?.username || 'Operator',
      customDate: tanggal
    });

    setIsSubmitting(false);

    if (res.success && res.bale) {
      showToast(res.message, 'ok');
      setLastCreatedBale(res.bale);
      fetchRecentBales();
      refreshAutoBarcodePreview();

      // Reset specific fields for rapid next entry
      setBeratNetto('');
      if (!useAutoBarcode) {
        setManualBarcode('');
      }

      window.dispatchEvent(new Event('iscs-db-update'));
      if (onBaleCreated) onBaleCreated();
    } else {
      showToast(res.message || 'Gagal membuat bale baru.', 'err');
    }
  };

  const handlePrintLabel = () => {
    window.print();
  };

  const filteredHistory = recentBales.filter(b => {
    const q = historySearch.toLowerCase();
    return (
      (b.NoBarcode || '').toLowerCase().includes(q) ||
      (b.GradeBuying || '').toLowerCase().includes(q) ||
      (b.NamaSupplier || '').toLowerCase().includes(q) ||
      (b.NoBuying || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-xs font-bold text-white transition-all flex items-center gap-2 ${
            toastMsg.type === 'ok' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          {toastMsg.type === 'ok' ? <CheckCircle2 size={16} /> : <Sparkles size={16} />}
          {toastMsg.text}
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-full text-[11px] font-extrabold uppercase tracking-wider mb-2">
            <PackagePlus size={14} className="text-amber-600" />
            Entri Bale Baru ke Stok
          </div>
          <h2 className="text-xl font-extrabold text-slate-800">Buat Bale Baru (Langsung Masuk Stok)</h2>
          <p className="text-xs text-slate-400 mt-1">
            Form khusus untuk mendaftarkan bale tembakau baru secara cepat dengan <b>No Barcode</b>, <b>Grade</b>, dan <b>Berat Netto</b>. Bale yang dibuat langsung tercatat di stok gudang dan siap diproses ke Reclass atau Shipping.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              fetchMasterData();
              fetchRecentBales();
              refreshAutoBarcodePreview();
              showToast('Data master & riwayat diperbarui.', 'ok');
            }}
            className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Buat Bale Baru */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <Plus size={16} className="text-amber-500" />
              Form Input Bale Baru
            </h3>
            <span className="text-[11px] font-semibold text-slate-400">
              Operator: <b className="text-slate-700">{currentUser?.nama || currentUser?.username || 'Admin'}</b>
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 1. Barcode Selector */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Barcode size={15} className="text-amber-600" />
                  1. Nomor Barcode
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useAutoBarcode}
                    onChange={e => setUseAutoBarcode(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                  />
                  <span>Auto Barcode (Otomatis dari Sistem)</span>
                </label>
              </div>

              {useAutoBarcode ? (
                <div className="bg-white p-3 rounded-lg border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                  <div>
                    <span className="text-[10px] font-bold text-amber-800 uppercase block">Nomor Barcode yang Akan Dibuat:</span>
                    <span className="font-mono text-base font-black text-slate-900 tracking-wider">
                      {previewAutoBarcode || 'MEMUAT...'}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-300 self-start sm:self-auto">
                    ✓ Format Resmi Auto-Increment
                  </span>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    value={manualBarcode}
                    onChange={e => setManualBarcode(e.target.value.toUpperCase())}
                    placeholder="Ketik atau Scan Barcode Manual..."
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 placeholder:font-sans placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Pastikan barcode manual belum pernah digunakan pada data transaksi manapun.
                  </p>
                </div>
              )}
            </div>

            {/* 2. Grade & Berat Netto (The Core User Request) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Grade */}
              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>2. Grade Tembakau *</span>
                  <span className="text-[10px] text-slate-400 font-normal">Pilih / Ketik</span>
                </label>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={grade}
                    onChange={e => setGrade(e.target.value.toUpperCase())}
                    list="grade-list-bale"
                    placeholder="Contoh: A, B, C, D..."
                    required
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <datalist id="grade-list-bale">
                    {availableGrades.map(g => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>

                  {/* Quick Click Badges for Grades */}
                  {availableGrades.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {availableGrades.slice(0, 8).map(g => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setGrade(g)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                            grade === g
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Berat Netto */}
              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Scale size={14} className="text-amber-600" />
                  <span>3. Berat Netto (kg) *</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    value={beratNetto}
                    onChange={e => setBeratNetto(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full pl-3.5 pr-12 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-black text-slate-900 text-right focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="absolute right-3.5 top-3 text-xs font-extrabold text-slate-400 pointer-events-none">
                    KG
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                  <span>Berat bersih tembakau</span>
                  <span className="font-mono">
                    Tare: {tare} kg (Opsional)
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Detail Opsional: Tanggal, Type, SubType, CropYear, Petani */}
            <div className="pt-2 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2.5">
                Detail Klasifikasi &amp; Asal Bale (Opsional)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Tanggal */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Tanggal Masuk
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={tanggal}
                      onChange={e => setTanggal(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                    />
                  </div>
                </div>

                {/* Type */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Type Tembakau
                  </label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none"
                  >
                    <option value="VIRGINIA">VIRGINIA</option>
                    <option value="VO">VO</option>
                    <option value="BURLEY">BURLEY</option>
                    {Array.from(new Set(prices.map(p => p.Type).filter(Boolean) as string[]))
                      .filter(t => !['VIRGINIA', 'VO', 'BURLEY'].includes(t))
                      .map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                  </select>
                </div>

                {/* SubType */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Sub Type
                  </label>
                  <input
                    type="text"
                    value={subType}
                    onChange={e => setSubType(e.target.value.toUpperCase())}
                    placeholder="LOKAL / IMPORT"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 uppercase focus:outline-none"
                  />
                </div>

                {/* CropYear */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Crop Year
                  </label>
                  <input
                    type="text"
                    value={cropYear}
                    onChange={e => setCropYear(e.target.value)}
                    placeholder="2026"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none"
                  />
                </div>
              </div>

              {/* Asal Petani / Keterangan Sumber */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Nama Petani / Supplier / Sumber Bale
                  </label>
                  <input
                    type="text"
                    value={namaSupplier}
                    onChange={e => setNamaSupplier(e.target.value)}
                    placeholder="STOK LANGSUNG / Nama Petani"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Tare Potongan (kg)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tare}
                    onChange={e => setTare(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-7 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-black rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 size={16} />
                <span>Simpan Bale &amp; Masukkan ke Stok</span>
              </button>
              <span className="text-[11px] text-slate-400">
                Data langsung aktif di Laporan Stok &amp; menu Reclass.
              </span>
            </div>
          </form>
        </div>

        {/* Right Panel: Label Barcode Preview & Recent Created */}
        <div className="lg:col-span-5 space-y-6">
          {/* Label Thermal Preview Card */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Printer size={16} className="text-amber-500" />
                Preview Label Barcode Bale
              </h3>
              {lastCreatedBale && (
                <button
                  type="button"
                  onClick={handlePrintLabel}
                  className="px-3 py-1 bg-slate-900 hover:bg-black text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition active:scale-95"
                >
                  <Printer size={12} />
                  Cetak Label
                </button>
              )}
            </div>

            {/* Thermal Label Box Mockup */}
            <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-center">
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs w-full max-w-xs space-y-2">
                <div className="text-[10px] font-black tracking-wider text-slate-800 uppercase border-b border-slate-200 pb-1">
                  {companyName}
                </div>

                <div className="py-1">
                  <BarcodeSvg
                    value={lastCreatedBale?.NoBarcode || previewAutoBarcode || 'SAMPLE12345'}
                    height={55}
                    fontSize={11}
                    displayValue={true}
                    margin={0}
                    width={1.7}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-left pt-1 border-t border-slate-100">
                  <div className="bg-slate-50 p-1.5 rounded">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">Grade:</span>
                    <span className="text-base font-black text-amber-600 block">
                      {lastCreatedBale?.GradeBuying || grade || '-'}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-1.5 rounded">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">Netto:</span>
                    <span className="text-base font-black text-slate-900 font-mono block">
                      {lastCreatedBale ? Number(lastCreatedBale.BeratNetto).toFixed(2) : beratNetto ? parseFloat(beratNetto).toFixed(2) : '0.00'} <span className="text-[10px]">kg</span>
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[9px] text-slate-400 pt-1">
                  <span>Sumber: <b>{lastCreatedBale?.NamaSupplier || namaSupplier || 'STOK LANGSUNG'}</b></span>
                  <span>{lastCreatedBale?.Timestamp ? lastCreatedBale.Timestamp.slice(0, 10) : tanggal}</span>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 mt-2">
                {lastCreatedBale ? '✓ Label bale siap ditempelkan fisik pada karung tembakau.' : 'Label di atas akan ter-update otomatis saat Anda mengisi form.'}
              </p>
            </div>
          </div>

          {/* Quick Info Stok Box */}
          <div className="bg-emerald-50/70 rounded-2xl border border-emerald-200 p-5 space-y-2">
            <h4 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5 uppercase tracking-wider">
              <CheckCircle2 size={15} className="text-emerald-600" />
              Bagaimana Bale Ini Masuk ke Sistem?
            </h4>
            <p className="text-xs text-emerald-900 leading-relaxed">
              1. Bale yang diinput di sini akan berstatus <b>Tersedia di Stok</b> (bisa langsung dicek di menu <b>Laporan &gt; Stok Gudang</b>).
            </p>
            <p className="text-xs text-emerald-900 leading-relaxed">
              2. Bale ini langsung bisa di-scan di menu <b>Grading Reclass</b> apabila ingin mengubah grade atau langsung di-<b>Shipping</b> setelah proses reclass.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Table: Bale yang Baru Saja Dibuat */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <Layers size={16} className="text-amber-500" />
              Daftar Bale yang Baru Didaftarkan
            </h3>
            <p className="text-xs text-slate-400">15 transaksi bale terbaru yang masuk ke database stok.</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              placeholder="Cari barcode / grade / sumber..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-2.5">No</th>
                <th className="px-4 py-2.5">Tanggal</th>
                <th className="px-4 py-2.5">No Barcode</th>
                <th className="px-4 py-2.5">Grade</th>
                <th className="px-4 py-2.5 text-right">Berat Netto (kg)</th>
                <th className="px-4 py-2.5">Sumber / Petani</th>
                <th className="px-4 py-2.5">Status Reclass</th>
                <th className="px-4 py-2.5">Input By</th>
                <th className="px-4 py-2.5 text-center">Cetak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-xs">
                    Belum ada data bale baru yang didaftarkan.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((b, idx) => (
                  <tr key={b.NoBarcode || idx} className="hover:bg-slate-50/70 transition">
                    <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                      {b.Timestamp ? b.Timestamp.slice(0, 16) : '-'}
                    </td>
                    <td className="px-4 py-2 font-mono font-bold text-slate-900">
                      {b.NoBarcode}
                    </td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 rounded font-black text-amber-900 bg-amber-100 text-[11px]">
                        {b.GradeBuying}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono font-black text-right text-slate-900">
                      {Number(b.BeratNetto || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {b.NamaSupplier || 'STOK LANGSUNG'}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          b.StatusReclass === 'SUDAH'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {b.StatusReclass === 'SUDAH' ? 'Sudah Reclass' : 'Di Stok (Belum Reclass)'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {b.InputBy || '-'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setLastCreatedBale(b);
                          showToast(`Label "${b.NoBarcode}" dipilih untuk cetak.`, 'ok');
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold inline-flex items-center gap-1 transition"
                        title="Pilih dan Cetak Label"
                      >
                        <Printer size={12} />
                        Label
                      </button>
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
};
