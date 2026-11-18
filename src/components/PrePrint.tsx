import React, { useState, useEffect } from 'react';
import { 
  apiGeneratePrePrintBarcodes, 
  apiGetPrePrintHistory, 
  getSettingValue, 
  setSettingValue, 
  getTodayDateString,
  getBarcodeSettings,
  getDatePartsFromDateString
} from '../db';
import { PrePrintRow } from '../types';
import { BarcodeSvg } from './BarcodeSvg';
import { Printer, Settings, Search, RefreshCw, Landmark, Calendar, Tag, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface PrePrintProps {
  onPrePrintChanged?: () => void;
  currentUser: any;
}

export const PrePrint: React.FC<PrePrintProps> = ({ onPrePrintChanged, currentUser }) => {
  const [namaPetani, setNamaPetani] = useState('');
  const [kodeSumber, setKodeSumber] = useState('LB');
  const [tanggalCetak, setTanggalCetak] = useState<string>(() => getTodayDateString());
  const [jumlah, setJumlah] = useState(1);
  const [companyName, setCompanyName] = useState('');
  const [activePrinter, setActivePrinter] = useState('');
  
  const [history, setHistory] = useState<PrePrintRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  // Hidden print state
  const [printItems, setPrintItems] = useState<any[]>([]);

  // Last generated barcodes info
  const [lastGenerated, setLastGenerated] = useState<{ count: number; date: string; petani: string; codes: string[] } | null>(null);

  const fetchHistory = () => {
    const list = apiGetPrePrintHistory();
    setHistory([...list].reverse());
  };

  const fetchSettings = () => {
    const name = getSettingValue('PrePrintCompanyName', 'PT INDO DEWATA SEMESTA');
    setCompanyName(name);
    const s = getSettingValue('BarcodeSumber', 'LB');
    setKodeSumber(s);

    const prName = getSettingValue('ActivePrinterName', 'Zebra GK420t Thermal Label Printer');
    const customPrName = getSettingValue('CustomPrinterName', '');
    const finalPrName = prName === 'CUSTOM' ? (customPrName || 'Printer Kustom') : prName;
    setActivePrinter(finalPrName);
  };

  useEffect(() => {
    fetchHistory();
    fetchSettings();
  }, []);

  useEffect(() => {
    const handleDbUpdate = () => {
      fetchHistory();
      fetchSettings();
    };
    window.addEventListener('iscs-db-update', handleDbUpdate);
    return () => {
      window.removeEventListener('iscs-db-update', handleDbUpdate);
    };
  }, []);

  const showToast = (text: string, type: 'ok' | 'err') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleSaveCompany = () => {
    setSettingValue('PrePrintCompanyName', companyName.trim());
    showToast('Nama perusahaan untuk label berhasil disimpan.', 'ok');
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaPetani.trim()) {
      showToast('Nama petani wajib diisi.', 'err');
      return;
    }
    if (!kodeSumber.trim()) {
      showToast('Kode sumber wajib diisi.', 'err');
      return;
    }
    const valJumlah = Math.max(1, Math.min(50, Number(jumlah) || 1));

    const payload = {
      namaPetani: namaPetani.trim(),
      kodeSumber: kodeSumber.trim().toUpperCase(),
      jumlah: valJumlah,
      printedBy: currentUser ? currentUser.username : '',
      customDate: tanggalCetak
    };

    const res = apiGeneratePrePrintBarcodes(payload);
    if (res.success && res.labels) {
      const generatedCodes = res.labels.map((l: any) => l.noBarcode);
      setLastGenerated({
        count: res.labels.length,
        date: tanggalCetak,
        petani: payload.namaPetani,
        codes: generatedCodes
      });
      showToast(res.message || `${res.labels.length} barcode berhasil dibuat!`, 'ok');
      setNamaPetani('');
      fetchHistory();
      if (onPrePrintChanged) onPrePrintChanged();

      // Trigger printing safely
      triggerPrint(res.labels);
    } else {
      showToast(res.message || 'Gagal generate barcode.', 'err');
    }
  };

  const triggerPrint = (items: any[]) => {
    setPrintItems(items);
    // Add print mode class
    document.body.classList.add('label-print-mode');
    
    // We delay slightly to let React render the SVG barcodes before printing
    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.warn('Browser print dialog could not be opened automatically:', err);
      }
      // Remove class after printing completes or is cancelled
      setTimeout(() => {
        document.body.classList.remove('label-print-mode');
        setPrintItems([]);
      }, 600);
    }, 300);
  };

  const handleReprint = (row: PrePrintRow) => {
    const compName = getSettingValue('PrePrintCompanyName', 'PT INDO DEWATA SEMESTA');
    const items = [{
      noBarcode: row.NoBarcode,
      namaPetani: row.NamaPetani,
      kodeSumber: row.KodeSumber,
      tanggal: row.Timestamp,
      companyName: compName
    }];
    triggerPrint(items);
  };

  const filteredHistory = history.filter(r => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return r.NoBarcode.toLowerCase().includes(q) || r.NamaPetani.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-4 rounded-xl shadow-xl font-bold flex items-center gap-3 text-sm text-white ${toastMsg.type === 'ok' ? 'bg-emerald-600 border-l-4 border-emerald-300' : 'bg-rose-600 border-l-4 border-rose-300'}`}>
          {toastMsg.text}
        </div>
      )}

      {/* Hidden Print Container specifically formatted for thermal Zebra printers */}
      {printItems.length > 0 && (
        <div id="labelPrintArea" className="block absolute left-0 top-0 z-[9999] bg-white">
          {printItems.map((l, i) => (
            <div key={i} className="pre-label w-[10cm] h-[6.5cm] box-sizing-border-box px-[6mm] py-[2mm] flex flex-col page-break-after border border-transparent">
              <div className="pl-barcode-wrap mb-1">
                <BarcodeSvg value={l.noBarcode} height={80} fontSize={14} displayValue={true} margin={0} width={2} />
              </div>
              <div className="pl-field text-xs mt-1.5 font-bold text-black leading-tight">
                <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider block">Nama Petani</span>
                {l.namaPetani || '-'}
              </div>
              <div className="pl-field text-xs mt-1.5 font-bold text-black leading-tight">
                <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider block">Source</span>
                {l.kodeSumber || '-'}
              </div>
              <div className="pl-field text-[11px] mt-1.5 font-medium text-slate-400">
                {l.tanggal}
              </div>
              <div className="border-t border-black my-2" />
              <div className="pl-company font-mono text-[11px] font-bold text-black uppercase tracking-wider">
                {l.companyName || ''}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Generate Panel */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <h3 className="text-lg font-extrabold text-slate-800 mb-4 flex items-center gap-2">
            <Printer size={18} className="text-amber-500" />
            Cetak Label Barcode Petani
          </h3>
          <p className="text-xs text-slate-400 mt-[-8px] mb-6 leading-relaxed">
            Cetak label barcode untuk ditempel di bale petani <b>sebelum</b> transaksi Buying dibuat.
            Nomor barcode memakai penomoran yang sama dengan Pengaturan Barcode, sehingga nanti tinggal
            discan / diketik manual saat input Buying.
          </p>

          {/* Workflow explanation notice */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs leading-relaxed space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-blue-800">
              <span>💡 Alur Kerja Barcode Petani:</span>
            </div>
            <p className="text-[11px] text-blue-800/90">
              1. Menu ini mencetak <b>label fisik</b> (nomor barcode) untuk ditempel di keranjang/bale petani.<br />
              2. Transaksi baru akan tercatat di sistem saat bale tersebut <b>ditimbang di menu "Timbang Buying"</b> (masukkan/scan barcode ini atau gunakan Auto Barcode).
            </p>
          </div>

          {/* Active Printer Badge */}
          <div className="mb-5 p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Printer className="text-amber-500" size={15} />
              <div>
                <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Printer Aktif:</span>
                <span className="font-extrabold text-slate-700">{activePrinter || 'Sistem Cetak Default Browser'}</span>
              </div>
            </div>
            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase rounded border border-emerald-200">
              ● Ready
            </span>
          </div>

          {/* Last Generated Feedback */}
          {lastGenerated && (
            <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5">
              <div className="flex items-center justify-between font-bold text-amber-800">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-emerald-600" />
                  Berhasil Dibuat: {lastGenerated.count} Barcode untuk Petani {lastGenerated.petani}
                </span>
                <span className="text-[10px] bg-white px-2 py-0.5 rounded border border-amber-300 font-mono">
                  Tgl: {lastGenerated.date}
                </span>
              </div>
              <p className="text-[11px] text-amber-800 font-mono truncate">
                Barcode: {lastGenerated.codes.join(', ')}
              </p>
              <p className="text-[10px] text-amber-700 italic">
                * Nomor barcode di atas sudah tersimpan di sistem &amp; siap digunakan saat timbang di menu Buying.
              </p>
            </div>
          )}

          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                Nama Petani
              </label>
              <input
                type="text"
                value={namaPetani}
                onChange={e => setNamaPetani(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Nama supplier / petani"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Kode Sumber / Area
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={kodeSumber}
                  onChange={e => setKodeSumber(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-bold"
                  placeholder="mis. LB"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase">
                    Tanggal Cetak
                  </label>
                  {tanggalCetak !== getTodayDateString() ? (
                    <span className="text-[9px] font-extrabold text-amber-700 bg-amber-100/90 px-1 rounded uppercase tracking-wider">
                      Backdate
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-400">
                      Hari ini
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="date"
                    value={tanggalCetak}
                    onChange={e => setTanggalCetak(e.target.value)}
                    className="w-full pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-slate-700"
                  />
                  <Calendar size={14} className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
                </div>
                {tanggalCetak !== getTodayDateString() && (
                  <button
                    type="button"
                    onClick={() => setTanggalCetak(getTodayDateString())}
                    className="text-[10px] text-amber-700 hover:underline font-bold mt-1 inline-block"
                  >
                    Reset ke Hari ini
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                Jumlah Label
              </label>
              <input
                type="number"
                min={1}
                max={50}
                step={1}
                value={jumlah}
                onChange={e => setJumlah(Number(e.target.value) || 1)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-bold"
              />
            </div>
            <p className="text-[10px] text-slate-400">
              Maksimal 50 label sekaligus per cetakan.
            </p>

            {/* Live Barcode Format Preview */}
            {(() => {
              const bSettings = getBarcodeSettings();
              const dateParts = getDatePartsFromDateString(tanggalCetak);
              const activeSumber = (kodeSumber.trim() || bSettings.sumber).toUpperCase();
              const sampleCounter = ('00000000' + 1).slice(-bSettings.digitCounter);
              const sampleBarcode = `${bSettings.company}${bSettings.tipe}${activeSumber}${dateParts.dateKey}${sampleCounter}`;
              const isBackdate = tanggalCetak !== getTodayDateString();

              return (
                <div className={`p-3.5 rounded-xl border space-y-2.5 transition ${isBackdate ? 'bg-amber-50/80 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <Tag size={13} className={isBackdate ? 'text-amber-600' : 'text-slate-500'} />
                      <span>Format Barcode Petani</span>
                    </div>
                    <span className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-md ${isBackdate ? 'bg-amber-200 text-amber-900 border border-amber-300' : 'bg-slate-200 text-slate-700'}`}>
                      Kode Tgl: {dateParts.dateKey}
                    </span>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-xs flex items-center justify-between font-mono">
                    <div>
                      <span className="text-sm font-black text-slate-900 tracking-wider">
                        {sampleBarcode}
                      </span>
                      <div className="flex gap-1.5 text-[9px] text-slate-400 mt-0.5 font-sans">
                        <span title="Kode Perusahaan">{bSettings.company}</span>•
                        <span title="Tipe Tembakau">{bSettings.tipe}</span>•
                        <span title="Kode Sumber">{activeSumber}</span>•
                        <span title="Tanggal Barcode (DDMMYY)" className="text-amber-600 font-bold">{dateParts.dateKey}</span>•
                        <span title="Nomor Urut">{sampleCounter}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-sans italic shrink-0">
                      Contoh urut #1
                    </span>
                  </div>

                  <div className="text-[11px] leading-relaxed">
                    {isBackdate ? (
                      <div className="flex items-start gap-1.5 text-amber-900 font-medium bg-amber-100/60 p-2 rounded-lg border border-amber-200/70">
                        <AlertTriangle size={14} className="text-amber-700 shrink-0 mt-0.5" />
                        <div>
                          <b>Tanggal Cetak Terpilih: {tanggalCetak}</b><br />
                          Nomor barcode otomatis menggunakan tanggal cetak ini (<b>{dateParts.dateKey}</b>), bukan tanggal hari ini.
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
                        <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                        <span>
                          Digit tanggal barcode (<b>{dateParts.dateKey}</b>) mengikuti tanggal cetak hari ini (<b>{tanggalCetak}</b>).
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <button
              type="submit"
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold rounded-xl text-sm transition flex items-center justify-center gap-2"
            >
              <Printer size={16} />
              Generate &amp; Cetak Label
            </button>
          </form>
        </div>

        {/* Company Settings & Zebra Label Info */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-md font-extrabold text-slate-800 mb-2 flex items-center gap-2">
              <Landmark size={16} className="text-teal-500" />
              Nama Perusahaan (untuk label)
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Teks ini akan dicetak di bagian bawah label preprint, di bawah garis pemisah.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="mis. PT INDO DEWATA SEMESTA"
              />
              <button
                type="button"
                onClick={handleSaveCompany}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition"
              >
                Simpan
              </button>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-2">
            <h3 className="text-md font-extrabold text-slate-800 flex items-center gap-2">
              <Settings size={16} className="text-slate-400" />
              Informasi Dimensi &amp; Printer
            </h3>
            <div className="text-xs text-slate-500 space-y-2 leading-relaxed font-sans">
              <p>Printer Thermal: <b>Zebra S4M</b> atau printer label sejenis.</p>
              <p>Ukuran Label Fisik: <b>10cm x 6.5cm</b> (4 x 2.5 inch).</p>
              <p>
                Saat Anda mengklik cetak, dialog bawaan browser akan terbuka. 
                Pilihlah printer Zebra atau thermal yang tepat dan atur margin ke <b>None</b> 
                serta skala ke <b>100%</b> atau <b>Fit to area</b> untuk cetakan maksimal.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Preprint Logs History Table */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
        <h3 className="text-md font-extrabold text-slate-800">Riwayat PrePrint</h3>
        <div className="flex max-w-sm gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800"
              placeholder="Cari barcode / petani..."
            />
          </div>
          <button
            type="button"
            onClick={fetchHistory}
            className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-600 transition"
            title="Refresh Data"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto border border-slate-100 rounded-xl">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                <th className="px-4 py-2.5 text-xs uppercase">No Barcode</th>
                <th className="px-4 py-2.5 text-xs uppercase">Nama Petani</th>
                <th className="px-4 py-2.5 text-xs uppercase">Kode Sumber</th>
                <th className="px-4 py-2.5 text-xs uppercase">Tanggal Cetak</th>
                <th className="px-4 py-2.5 text-xs uppercase">Dicetak Oleh</th>
                <th className="px-4 py-2.5 text-xs uppercase w-20 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">
                    Tidak ada riwayat cetak preprint.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 text-xs">
                    <td className="px-4 py-2">
                      <span className="font-mono font-bold bg-slate-900 text-amber-500 px-2 py-0.5 rounded text-[10px] tracking-wider">
                        {r.NoBarcode}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-700 font-medium">{r.NamaPetani}</td>
                    <td className="px-4 py-2 text-slate-600 font-mono font-semibold">{r.KodeSumber}</td>
                    <td className="px-4 py-2 text-slate-500 font-mono">{r.Timestamp}</td>
                    <td className="px-4 py-2 text-slate-500">{r.PrintedBy || '-'}</td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => handleReprint(r)}
                        className="px-2 py-1 border border-slate-200 hover:bg-slate-50 text-[10px] font-bold text-slate-700 rounded transition"
                      >
                        Cetak Ulang
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
