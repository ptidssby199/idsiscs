import React, { useState, useEffect } from 'react';
import {
  apiGetBuyingGroups,
  apiGetReclassForInvoiceByNoBuying,
  apiSaveInvoice,
  getLocal,
  getSettingValue,
  apiGetInvoiceForReprint,
  apiVoidInvoice
} from '../db';
import { InvoiceRow } from '../types';
import { Printer, Search, RefreshCw, Landmark, Receipt, Calculator, CheckSquare, ShieldCheck, Eye, Trash2, AlertTriangle } from 'lucide-react';
import { AdminPinModal } from './AdminPinModal';

interface CetakInvoiceProps {
  currentUser: any;
  onInvoiceCreated?: () => void;
}

// Indonesian spelling helper function (Terbilang)
export function terbilang(nilai: number): string {
  const bilangan = [
    '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima',
    'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'
  ];
  const angka = Math.floor(Math.abs(nilai));
  let temp = '';

  if (angka < 12) {
    temp = ' ' + bilangan[angka];
  } else if (angka < 20) {
    temp = terbilang(angka - 10) + ' Belas';
  } else if (angka < 100) {
    temp = terbilang(angka / 10) + ' Puluh' + terbilang(angka % 10);
  } else if (angka < 200) {
    temp = ' Seratus' + terbilang(angka - 100);
  } else if (angka < 1000) {
    temp = terbilang(angka / 100) + ' Ratus' + terbilang(angka % 100);
  } else if (angka < 2000) {
    temp = ' Seribu' + terbilang(angka - 1000);
  } else if (angka < 1000000) {
    temp = terbilang(angka / 1000) + ' Ribu' + terbilang(angka % 1000);
  } else if (angka < 1000000000) {
    temp = terbilang(angka / 1000000) + ' Juta' + terbilang(angka % 1000000);
  } else if (angka < 1000000000000) {
    temp = terbilang(angka / 1000000000) + ' Milyar' + terbilang(angka % 1000000000);
  }

  return temp.trim().replace(/\s+/g, ' ');
}

export const CetakInvoice: React.FC<CetakInvoiceProps> = ({ currentUser, onInvoiceCreated }) => {
  const prName = getSettingValue('ActivePrinterName', 'Zebra GK420t Thermal Label Printer');
  const customPrName = getSettingValue('CustomPrinterName', '');
  const activePrinterName = prName === 'CUSTOM' ? (customPrName || 'Printer Kustom') : prName;

  const [buyingGroups, setBuyingGroups] = useState<any[]>([]);
  const [selectedNoBuying, setSelectedNoBuying] = useState('');
  const [reclassItems, setReclassItems] = useState<any[]>([]);
  const [selectedReclassCodes, setSelectedReclassCodes] = useState<string[]>([]);

  // Form Fields
  const [telahTerimaDari, setTelahTerimaDari] = useState('PT INDO DEWATA SEMESTA');
  const [keteranganManual, setKeteranganManual] = useState('Pembelian Tembakau');
  const [lokasi, setLokasi] = useState('Lombok');

  // History Invoices
  const [invoiceHistory, setInvoiceHistory] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState('');

  // Active print preview state
  const [activeKwitansi, setActiveKwitansi] = useState<any | null>(null);
  const [printFont, setPrintFont] = useState<'sans' | 'mono' | 'courier'>('courier');
  const [invoiceToVoid, setInvoiceToVoid] = useState<any | null>(null);
  const [isAdminPinOpen, setIsAdminPinOpen] = useState(false);

  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  const showToast = (text: string, type: 'ok' | 'err') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadBuyingGroupsList = () => {
    const grps = apiGetBuyingGroups();
    const invoices = getLocal<InvoiceRow[]>('iscs_invoice', []);
    const activeInvoicedNoBuyings = new Set(
      invoices.filter(inv => !inv.IsVoid).map(inv => inv.NoBuying)
    );
    const availableGrps = grps.filter(g => !activeInvoicedNoBuyings.has(g.noBuying));
    setBuyingGroups(availableGrps);
  };

  const loadInitialData = () => {
    loadBuyingGroupsList();

    const company = getSettingValue('PrePrintCompanyName', 'PT INDO DEWATA SEMESTA');
    setTelahTerimaDari(company);

    const defaultLoc = getSettingValue('BarcodeSumber', 'Lombok');
    setLokasi(defaultLoc === 'LB' ? 'Lombok' : defaultLoc);

    loadHistory();
  };

  const loadHistory = () => {
    const list = getLocal<InvoiceRow[]>('iscs_invoice', []);
    // Map with name
    const buyingRows = getLocal<any[]>('iscs_buying', []);
    const supplierMap: Record<string, string> = {};
    buyingRows.forEach(b => {
      supplierMap[b.NoBuying] = b.NamaSupplier;
    });

    const mapped = list.map(inv => ({
      ...inv,
      NamaSupplier: supplierMap[inv.NoBuying] || '-'
    }));

    setInvoiceHistory(mapped.reverse());
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const handleDbUpdate = () => {
      loadInitialData();
    };
    window.addEventListener('iscs-db-update', handleDbUpdate);
    return () => {
      window.removeEventListener('iscs-db-update', handleDbUpdate);
    };
  }, []);

  // Fetch items when No Buying is selected
  useEffect(() => {
    if (!selectedNoBuying) {
      setReclassItems([]);
      setSelectedReclassCodes([]);
      return;
    }
    const list = apiGetReclassForInvoiceByNoBuying(selectedNoBuying);
    setReclassItems(list);
    
    // Auto-select all pending reclasses by default
    const pending = list.filter(it => it.statusInvoice === 'BELUM').map(it => it.noReclass);
    setSelectedReclassCodes(pending);
  }, [selectedNoBuying]);

  const handleToggleSelectAll = () => {
    const pending = reclassItems.filter(it => it.statusInvoice === 'BELUM');
    if (selectedReclassCodes.length === pending.length) {
      setSelectedReclassCodes([]);
    } else {
      setSelectedReclassCodes(pending.map(it => it.noReclass));
    }
  };

  const handleToggleRow = (code: string) => {
    setSelectedReclassCodes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  // Live calculation based on selection
  const computeLiveCalculations = () => {
    let totalBales = 0;
    let totalNetto = 0;
    let grossAmount = 0;
    let namaSupplier = '';

    reclassItems.forEach(it => {
      if (selectedReclassCodes.includes(it.noReclass)) {
        totalBales++;
        totalNetto += Number(it.beratNettoBuying) || 0;
        grossAmount += Number(it.totalHargaBuying) || 0;
        if (!namaSupplier) namaSupplier = it.namaSupplier;
      }
    });

    const PPH_RATE = 0.0025;
    const biayaPPh = Math.round(grossAmount * PPH_RATE);
    const biayaMaterai = grossAmount >= 5000000 ? 10000 : 0;
    const uangSebelumRound = grossAmount - biayaPPh - biayaMaterai;
    const uangSebesar = Math.floor(uangSebelumRound / 100) * 100;
    const roundup = uangSebesar - uangSebelumRound;

    return {
      namaSupplier,
      totalBales,
      totalNetto,
      grossAmount,
      biayaPPh,
      biayaMaterai,
      roundup,
      uangSebesar
    };
  };

  const handleSaveInvoiceAction = () => {
    if (!selectedNoBuying) {
      showToast('Pilih No Buying terlebih dahulu.', 'err');
      return;
    }
    if (!selectedReclassCodes.length) {
      showToast('Pilih minimal satu baris bale reclass untuk ditagihkan.', 'err');
      return;
    }
    if (!telahTerimaDari.trim()) {
      showToast('"Telah Terima Dari" wajib diisi.', 'err');
      return;
    }
    if (!keteranganManual.trim()) {
      showToast('"Untuk Pembayaran" wajib diisi.', 'err');
      return;
    }

    const payload = {
      noReclassList: selectedReclassCodes,
      noBuying: selectedNoBuying,
      inputBy: currentUser ? currentUser.username : '',
      telahTerimaDari: telahTerimaDari.trim(),
      keteranganManual: keteranganManual.trim(),
      lokasi: lokasi.trim()
    };

    const res = apiSaveInvoice(payload);
    if (res.success && res.invoice) {
      showToast(res.message || 'Invoice berhasil disimpan.', 'ok');
      window.dispatchEvent(new Event('iscs-db-update'));
      
      setSelectedNoBuying('');
      setReclassItems([]);
      setSelectedReclassCodes([]);
      loadBuyingGroupsList();
      loadHistory();

      if (onInvoiceCreated) onInvoiceCreated();

      // Trigger preview popup
      handleReprintInvoice(res.invoice.noInvoice);
    } else {
      showToast(res.message || 'Gagal menyimpan invoice.', 'err');
    }
  };

  const handleExecuteVoid = () => {
    if (!invoiceToVoid) return;
    const res = apiVoidInvoice(invoiceToVoid.NoInvoice, currentUser?.username || '');
    if (res.success) {
      showToast(res.message || 'Invoice berhasil divoid (dibatalkan).', 'ok');
      window.dispatchEvent(new Event('iscs-db-update'));
      loadBuyingGroupsList();
      loadHistory();
      setInvoiceToVoid(null);
      if (onInvoiceCreated) onInvoiceCreated();
    } else {
      showToast(res.message || 'Gagal membatalkan invoice.', 'err');
    }
  };

  const handleReprintInvoice = (noInvoice: string) => {
    const res = apiGetInvoiceForReprint(noInvoice);
    if (res.success && res.invoice) {
      setActiveKwitansi(res.invoice);
    } else {
      showToast(res.message || 'Gagal memuat invoice.', 'err');
    }
  };

   const printActiveKwitansi = () => {
    document.body.classList.add('invoice-print-mode');
    document.body.classList.add(`print-font-${printFont}`);
    window.print();
    setTimeout(() => {
      document.body.classList.remove('invoice-print-mode');
      document.body.classList.remove('print-font-sans', 'print-font-mono', 'print-font-courier');
    }, 500);
  };

  const getDraftInvoiceObject = () => {
    const liveCalcs = computeLiveCalculations();
    const now = new Date();
    const formatTime = (d: Date) => {
      const yy = d.getFullYear();
      const mm = ('0' + (d.getMonth() + 1)).slice(-2);
      const dd = ('0' + d.getDate()).slice(-2);
      const hh = ('0' + d.getHours()).slice(-2);
      const min = ('0' + d.getMinutes()).slice(-2);
      const ss = ('0' + d.getSeconds()).slice(-2);
      return `${yy}-${mm}-${dd} ${hh}:${min}:${ss}`;
    };
    const timestamp = formatTime(now);

    return {
      noInvoice: 'DRAFT INVOICE (Otomatis saat disimpan)',
      noBuying: selectedNoBuying,
      tanggal: timestamp,
      namaPetani: liveCalcs.namaSupplier || '-',
      jumlahBale: liveCalcs.totalBales,
      totalNetto: liveCalcs.totalNetto,
      telahTerimaDari: telahTerimaDari.trim() || 'PT INDO DEWATA SEMESTA',
      untukPembayaran: `${keteranganManual.trim()} ${liveCalcs.totalBales} Bal = ${liveCalcs.totalNetto.toFixed(2)} Kg`,
      lokasi: lokasi.trim() || 'Lombok',
      totalPembelian: liveCalcs.grossAmount,
      biayaPPh: liveCalcs.biayaPPh,
      biayaMaterai: liveCalcs.biayaMaterai,
      uangSebesar: liveCalcs.uangSebesar,
      roundup: liveCalcs.roundup,
      isDraft: true
    };
  };

  const filteredHistory = invoiceHistory.filter(r => {
    const q = historySearch.toLowerCase().trim();
    if (!q) return true;
    return r.NoInvoice.toLowerCase().includes(q) || r.NamaSupplier.toLowerCase().includes(q) || r.NoBuying.toLowerCase().includes(q);
  });

  const calcs = computeLiveCalculations();
  const formatRp = (num: number) => {
    return 'Rp ' + Number(num).toLocaleString('id-ID');
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-4 rounded-xl shadow-xl font-bold flex items-center gap-3 text-sm text-white ${toastMsg.type === 'ok' ? 'bg-emerald-600 border-l-4 border-emerald-300' : 'bg-rose-600 border-l-4 border-rose-300'}`}>
          {toastMsg.text}
        </div>
      )}

      {/* Invoice Modal Print Preview */}
      {activeKwitansi && (
        <div className="fixed inset-0 z-[999] bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-md font-extrabold text-slate-800">
                {activeKwitansi.isDraft ? 'Pratinjau Draft Invoice Pembayaran' : 'Preview Invoice Pembayaran'}
              </h3>
              <button onClick={() => setActiveKwitansi(null)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">&times;</button>
            </div>

            {activeKwitansi.isDraft && (
              <div className="bg-amber-50 border-b border-amber-100 px-6 py-3 flex items-center gap-2.5 text-xs text-amber-800 font-bold">
                <ShieldCheck size={16} className="text-amber-500 animate-pulse shrink-0" />
                <span>
                  Mode Pratinjau: Ini adalah draft invoice sebelum disimpan. Nomor invoice akan digenerate otomatis saat Anda menekan tombol "Simpan &amp; Cetak Sekarang".
                </span>
              </div>
            )}

            <div className="p-8 overflow-y-auto flex-1 bg-slate-50">
              {/* Font selector bar directly above the preview */}
              <div className="max-w-2xl mx-auto mb-4 bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap gap-4 justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500">Pilih Font Cetakan (NCR 4-Ply):</span>
                  <select
                    value={printFont}
                    onChange={(e) => setPrintFont(e.target.value as any)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="sans">Clean Sans (Arial - Jelas &amp; Terbaca)</option>
                    <option value="mono">Developer Mono (JetBrains Mono - Rapi)</option>
                    <option value="courier">Dot Matrix Standard (Courier New - Rekomendasi NCR 4-Ply)</option>
                  </select>
                </div>
                <div className="text-[10px] text-amber-600 font-semibold bg-amber-50 px-2 py-1 rounded">
                  * Rekomendasi: <strong>Courier New / Monospace</strong> agar tulisan di ply 2, 3, &amp; 4 tetap tajam dan sejajar.
                </div>
              </div>

              <div 
                id="printArea" 
                className={`relative print-doc space-y-6 text-slate-900 max-w-2xl mx-auto border border-slate-200 p-8 rounded-xl bg-white shadow-sm transition-all duration-200 ${
                  printFont === 'courier' ? 'font-print-courier' : printFont === 'mono' ? 'font-print-mono' : 'font-print-sans'
                }`}
              >
                {activeKwitansi.IsVoid && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-[99]">
                    <div className="text-rose-500 font-black border-[12px] border-rose-500 rounded-2xl px-8 py-4 text-6xl tracking-widest uppercase rotate-[-25deg] bg-white/90 shadow-lg">
                      VOID / BATAL
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-start border-b border-slate-300 pb-4">
                  <div className="space-y-1">
                    <h1 className="text-2xl font-black tracking-tight uppercase text-slate-800">
                      I N V O I C E
                    </h1>
                    <p className="text-[10px] font-mono font-bold text-slate-400">
                      NO. INVOICE: {activeKwitansi.isDraft ? (
                        <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs tracking-wider font-bold uppercase">
                          DRAFT (Akan dibuat saat disimpan)
                        </span>
                      ) : (
                        <span className="text-slate-800 text-xs tracking-wider font-bold">{activeKwitansi.noInvoice}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-bold text-slate-700">{activeKwitansi.lokasi || 'Lombok'}</p>
                    <p className="font-mono text-slate-500 mt-0.5">{activeKwitansi.tanggal}</p>
                  </div>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-4 gap-2 items-start">
                    <span className="font-bold text-slate-400 uppercase tracking-wider col-span-1">Telah Terima Dari:</span>
                    <span className="col-span-3 text-slate-800 font-bold">{activeKwitansi.telahTerimaDari || activeKwitansi.namaPerusahaan}</span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 items-start">
                    <span className="font-bold text-slate-400 uppercase tracking-wider col-span-1">Uang Sebesar:</span>
                    <span className="col-span-3 text-slate-800 font-bold italic bg-slate-100 px-3 py-1.5 rounded leading-relaxed">
                      {terbilang(activeKwitansi.uangSebesar)} Rupiah
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 items-start">
                    <span className="font-bold text-slate-400 uppercase tracking-wider col-span-1">Untuk Pembayaran:</span>
                    <span className="col-span-3 text-slate-800 font-bold">{activeKwitansi.untukPembayaran || activeKwitansi.deskripsiPembayaran}</span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 items-start border-b border-dashed border-slate-200 pb-3">
                    <span className="font-bold text-slate-400 uppercase tracking-wider col-span-1">Nama Petani:</span>
                    <span className="col-span-3 text-slate-800 font-bold">{activeKwitansi.namaPetani}</span>
                  </div>
                </div>

                {/* Calculation breakdown list */}
                <div className="space-y-1.5 border-b border-slate-200 pb-4 text-xs font-semibold">
                  <div className="flex justify-between text-slate-600">
                    <span>Jumlah Total Pembelian (Gross)</span>
                    <span className="font-mono">{formatRp(activeKwitansi.totalPembelian)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Pajak Penghasilan PPh Pasal 22 (0.25%)</span>
                    <span className="font-mono">- {formatRp(activeKwitansi.biayaPPh)}</span>
                  </div>
                  {activeKwitansi.biayaMaterai > 0 && (
                    <div className="flex justify-between text-slate-500">
                      <span>Bea Materai</span>
                      <span className="font-mono">- {formatRp(activeKwitansi.biayaMaterai)}</span>
                    </div>
                  )}
                  {activeKwitansi.roundup !== 0 && (
                    <div className="flex justify-between text-slate-400 text-[11px] italic">
                      <span>Penyesuaian (Pembulatan)</span>
                      <span className="font-mono">{activeKwitansi.roundup > 0 ? '+' : ''}{formatRp(activeKwitansi.roundup)}</span>
                    </div>
                  )}
                </div>

                <div className="invoice-total-box flex justify-between items-center border-2 border-slate-900 text-slate-900 bg-white p-4 rounded-xl">
                  <span className="text-xs uppercase font-extrabold tracking-wider">Jumlah Bersih Dibayarkan:</span>
                  <span className="text-xl font-black font-mono tracking-tight">{formatRp(activeKwitansi.uangSebesar)}</span>
                </div>

                <div className="grid grid-cols-2 gap-12 pt-8 text-center text-xs">
                  <div className="space-y-14">
                    <p className="text-slate-400 font-bold uppercase tracking-wider">Yang Menerima</p>
                    <p className="font-black text-slate-800 border-t border-slate-300 pt-2 inline-block px-12">{activeKwitansi.namaPetani}</p>
                  </div>
                  <div className="space-y-14">
                    <p className="text-slate-400 font-bold uppercase tracking-wider">Pembayar / Kasir</p>
                    <p className="font-black text-slate-800 border-t border-slate-300 pt-2 inline-block px-12">{currentUser ? (currentUser.nama || currentUser.username) : ''}</p>
                  </div>
                </div>
              </div>
            </div>

             <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center gap-2">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold font-sans">
                <Printer size={12} className="text-amber-500 shrink-0" />
                <span className="truncate max-w-[150px]" title={activePrinterName}>Printer: {activePrinterName}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setActiveKwitansi(null)} className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl border border-slate-200">
                  {activeKwitansi.isDraft ? 'Batal / Tutup' : 'Tutup'}
                </button>
                {activeKwitansi.isDraft ? (
                  <button
                    onClick={handleSaveInvoiceAction}
                    className="px-4.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow"
                  >
                    <Receipt size={13} /> Simpan &amp; Cetak Sekarang
                  </button>
                ) : (
                  <button
                    onClick={printActiveKwitansi}
                    className={`px-4.5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow ${
                      activeKwitansi.IsVoid 
                        ? 'bg-rose-600 hover:bg-rose-700 text-white' 
                        : 'bg-amber-500 hover:bg-amber-600 text-slate-900'
                    }`}
                  >
                    <Printer size={13} /> {activeKwitansi.IsVoid ? 'Cetak Invoice (VOID)' : 'Cetak Invoice'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Void Confirmation Modal */}
      {invoiceToVoid && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-lg shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-slate-800">
                  Konfirmasi Pembatalan (Void)
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Apakah Anda yakin ingin membatalkan/void invoice <span className="font-mono font-bold text-slate-700">{invoiceToVoid.NoInvoice}</span>?
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Status item reclass yang bersangkutan akan dikembalikan menjadi <span className="font-bold text-amber-600">BELUM DI-INVOICE</span> sehingga transaksi <span className="font-bold text-slate-700">{invoiceToVoid.NoBuying}</span> dapat ditagihkan kembali.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setInvoiceToVoid(null)}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl border border-slate-200 transition"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={() => setIsAdminPinOpen(true)}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1 shadow"
              >
                <Trash2 size={12} /> Ya, Void Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin PIN verification modal */}
      <AdminPinModal
        isOpen={isAdminPinOpen}
        onClose={() => setIsAdminPinOpen(false)}
        onSuccess={() => {
          setIsAdminPinOpen(false);
          handleExecuteVoid();
        }}
        title="Otorisasi Void Invoice"
        description={`Masukkan PIN Admin untuk menyetujui void invoice ${invoiceToVoid?.NoInvoice || ''}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Selection & Calc panel */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-6">
          <h3 className="text-md font-extrabold text-slate-800 flex items-center gap-1.5">
            <Calculator size={16} className="text-amber-500" />
            Parameter Pembayaran
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Pilih No Buying</label>
              <select
                value={selectedNoBuying}
                onChange={e => setSelectedNoBuying(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="">- Pilih Transaksi -</option>
                {buyingGroups.map(g => (
                  <option key={g.noBuying} value={g.noBuying}>
                    {g.noBuying} - {g.namaSupplier} ({g.jumlahItem} bales)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Telah Terima Dari</label>
              <input
                type="text"
                value={telahTerimaDari}
                onChange={e => setTelahTerimaDari(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                placeholder="mis. PT INDO DEWATA SEMESTA"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Keterangan / Pembayaran</label>
              <input
                type="text"
                value={keteranganManual}
                onChange={e => setKeteranganManual(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                placeholder="mis. Pembelian Tembakau"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Lokasi Transaksi</label>
              <input
                type="text"
                value={lokasi}
                onChange={e => setLokasi(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                placeholder="mis. Lombok"
              />
            </div>
          </div>

          {selectedNoBuying && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Kalkulasi Tagihan (Live)</h4>
              
              <div className="space-y-2 text-xs font-semibold text-slate-600">
                <div className="flex justify-between">
                  <span>Petani</span>
                  <span className="text-slate-800 font-bold">{calcs.namaSupplier || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bale Dipilih</span>
                  <span className="text-slate-800 font-mono font-bold">{calcs.totalBales} bal</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Netto</span>
                  <span className="text-slate-800 font-mono font-bold">{calcs.totalNetto.toFixed(2)} Kg</span>
                </div>
                <div className="flex justify-between">
                  <span>Gross (Total)</span>
                  <span className="text-slate-800 font-mono font-bold">{formatRp(calcs.grossAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>PPh 22 (0.25%)</span>
                  <span className="font-mono font-bold">- {formatRp(calcs.biayaPPh)}</span>
                </div>
                {calcs.biayaMaterai > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Bea Materai</span>
                    <span className="font-mono font-bold">- {formatRp(calcs.biayaMaterai)}</span>
                  </div>
                )}
                {calcs.roundup !== 0 && (
                  <div className="flex justify-between text-slate-400 italic text-[11px]">
                    <span>Pembulatan</span>
                    <span className="font-mono font-bold">{calcs.roundup > 0 ? '+' : ''}{formatRp(calcs.roundup)}</span>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex justify-between items-center mt-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Bersih</span>
                <span className="text-base font-black text-amber-600 font-mono">{formatRp(calcs.uangSebesar)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setActiveKwitansi(getDraftInvoiceObject())}
                  disabled={!selectedReclassCodes.length}
                  className="py-2.5 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 border border-slate-200 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Eye size={14} className="text-amber-500" />
                  Pratinjau (Preview)
                </button>
                <button
                  type="button"
                  onClick={handleSaveInvoiceAction}
                  disabled={!selectedReclassCodes.length}
                  className="py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-100 disabled:text-slate-400 text-slate-900 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Receipt size={14} />
                  Simpan Invoice
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Reclass list selector */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-slate-50 pb-3">
            <h3 className="text-md font-extrabold text-slate-800">Pilih Item Tembakau (Reclass)</h3>
            {reclassItems.length > 0 && (
              <button
                onClick={handleToggleSelectAll}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded transition"
              >
                {selectedReclassCodes.length === reclassItems.filter(it => it.statusInvoice === 'BELUM').length ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          {!selectedNoBuying ? (
            <div className="bg-slate-50 border border-slate-100 p-8 text-center text-xs font-semibold text-slate-400 rounded-xl">
              Harap pilih <b>No Buying</b> di sebelah kiri terlebih dahulu untuk melihat daftar bale yang siap dibayarkan.
            </div>
          ) : reclassItems.length === 0 ? (
            <div className="bg-slate-50 border border-slate-100 p-8 text-center text-xs font-semibold text-slate-400 rounded-xl">
              Tidak ada data bale reclass yang terdaftar untuk No Buying ini.
            </div>
          ) : (
            <div className="border border-slate-100 rounded-xl overflow-x-auto max-h-[400px]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                    <th className="px-4 py-2 text-center w-12">Pilih</th>
                    <th className="px-4 py-2">No Reclass</th>
                    <th className="px-4 py-2">Barcode Asal</th>
                    <th className="px-4 py-2 text-center">Grade</th>
                    <th className="px-4 py-2 text-right">Netto (Kg)</th>
                    <th className="px-4 py-2 text-right">Harga (Rp)</th>
                    <th className="px-4 py-2 text-right">Jumlah (Rp)</th>
                    <th className="px-4 py-2 text-center w-16">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reclassItems.map(item => {
                    const isAlreadyInvoiced = item.statusInvoice === 'SUDAH';
                    return (
                      <tr key={item.noReclass} className={`${isAlreadyInvoiced ? 'bg-slate-50/50 text-slate-400' : ''}`}>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            disabled={isAlreadyInvoiced}
                            checked={selectedReclassCodes.includes(item.noReclass)}
                            onChange={() => handleToggleRow(item.noReclass)}
                            className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-500 cursor-pointer disabled:opacity-50"
                          />
                        </td>
                        <td className="px-4 py-2 font-semibold font-mono">{item.noReclass}</td>
                        <td className="px-4 py-2 font-mono">{item.noBarcodeAsal}</td>
                        <td className="px-4 py-2 text-center font-bold font-mono text-slate-700">{item.gradeBuying}</td>
                        <td className="px-4 py-2 text-right font-mono">{Number(item.beratNettoBuying).toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-mono">{Number(item.hargaBuying).toLocaleString('id-ID')}</td>
                        <td className="px-4 py-2 text-right font-mono font-bold text-slate-800">
                          {Number(item.totalHargaBuying).toLocaleString('id-ID')}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {isAlreadyInvoiced ? (
                            <span className="text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded text-[9px]" title={`Invoice: ${item.noInvoiceExisting}`}>INVOICED</span>
                          ) : (
                            <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded text-[9px]">WAITING</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Invoice list history */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
        <h3 className="text-md font-extrabold text-slate-800">Riwayat Pembayaran &amp; Invoice</h3>
        <div className="flex max-w-sm gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
              placeholder="Cari no invoice / petani / no buying..."
            />
          </div>
          <button
            type="button"
            onClick={loadHistory}
            className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-600 transition"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="max-h-[500px] overflow-y-auto border border-slate-100 rounded-xl">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                <th className="px-4 py-2.5 text-xs uppercase">No Invoice</th>
                <th className="px-4 py-2.5 text-xs uppercase">No Buying</th>
                <th className="px-4 py-2.5 text-xs uppercase">Supplier / Petani</th>
                <th className="px-4 py-2.5 text-xs uppercase text-right">Bale</th>
                <th className="px-4 py-2.5 text-xs uppercase text-right">Netto (Kg)</th>
                <th className="px-4 py-2.5 text-xs uppercase text-right">Total Buying</th>
                <th className="px-4 py-2.5 text-xs uppercase text-right">PPh</th>
                <th className="px-4 py-2.5 text-xs uppercase text-right">Materai</th>
                <th className="px-4 py-2.5 text-xs uppercase text-right">Pembulatan</th>
                <th className="px-4 py-2.5 text-xs uppercase text-right">Jumlah Bayar</th>
                <th className="px-4 py-2.5 text-xs uppercase">Tanggal Cetak</th>
                <th className="px-4 py-2.5 text-xs uppercase w-20 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-slate-400 text-xs">
                    Belum ada invoice pembayaran terdaftar.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((r, idx) => (
                  <tr key={idx} className={`hover:bg-slate-50/50 text-xs ${r.IsVoid ? 'bg-rose-50/10 text-slate-400' : ''}`}>
                    <td className="px-4 py-3 font-semibold text-slate-500 font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className={r.IsVoid ? 'line-through text-slate-350' : ''}>{r.NoInvoice}</span>
                        {r.IsVoid && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-600 font-extrabold text-[8px] uppercase tracking-wider">
                            VOID
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`px-4 py-3 font-mono font-bold ${r.IsVoid ? 'text-slate-300 line-through' : 'text-slate-500'}`}>{r.NoBuying}</td>
                    <td className={`px-4 py-3 font-medium ${r.IsVoid ? 'text-slate-350' : 'text-slate-700'}`}>{r.NamaSupplier || '-'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{r.JumlahBal}</td>
                    <td className="px-4 py-3 text-right font-mono">{Number(r.TotalNetto).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{formatRp(r.TotalPembelian)}</td>
                    <td className="px-4 py-3 text-right font-mono text-rose-600">{r.BiayaPPh > 0 ? `-${formatRp(r.BiayaPPh)}` : '-'}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{r.BiayaMaterai > 0 ? `-${formatRp(r.BiayaMaterai)}` : '-'}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">
                      {r.Roundup !== 0 ? `${r.Roundup > 0 ? '+' : ''}${formatRp(r.Roundup)}` : '0'}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-black ${r.IsVoid ? 'text-slate-350 line-through' : 'text-amber-600'}`}>{formatRp(r.UangSebesar)}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono">{r.Timestamp}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleReprintInvoice(r.NoInvoice)}
                          className="px-2 py-1 border border-slate-200 hover:bg-slate-50 text-[10px] font-bold text-slate-700 rounded transition inline-flex items-center gap-1 shrink-0"
                        >
                          <Printer size={10} /> {r.IsVoid ? 'Pratinjau Void' : 'Cetak'}
                        </button>
                        {!r.IsVoid && (
                          <button
                            onClick={() => setInvoiceToVoid(r)}
                            className="px-2 py-1 border border-rose-200 hover:bg-rose-50 text-[10px] font-bold text-rose-600 hover:text-rose-700 rounded transition inline-flex items-center gap-1 shrink-0"
                          >
                            <Trash2 size={10} /> Void
                          </button>
                        )}
                      </div>
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
