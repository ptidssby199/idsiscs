import React, { useState, useEffect } from 'react';
import { getBarcodeSettings, apiSaveBarcodeSettings, getSettingValue, setSettingValue } from '../db';
import { Settings, CheckSquare, Eye, Printer, Sliders, Check, Terminal, FileText, AlertTriangle, Truck } from 'lucide-react';
import { BarcodeSvg } from './BarcodeSvg';

export const PengaturanBarcode: React.FC = () => {
  // Navigation tab
  const [activeTab, setActiveTab] = useState<'barcode' | 'printer'>('barcode');

  // Barcode state
  const [company, setCompany] = useState('IDS');
  const [tipe, setTipe] = useState('SC25');
  const [sumber, setSumber] = useState('LB');
  const [digitCounter, setDigitCounter] = useState(5);
  const [previewBarcode, setPreviewBarcode] = useState('');

  // Shipping format state
  const [shippingKode, setShippingKode] = useState('PG');
  const [shippingSource, setShippingSource] = useState('LJ');

  // Printer state
  const [printerName, setPrinterName] = useState('Zebra GK420t Thermal Label Printer');
  const [customPrinterName, setCustomPrinterName] = useState('');
  const [printerConnection, setPrinterConnection] = useState('Browser Default Dialog (Rekomendasi - Kompatibel Semua OS)');
  const [paperSize, setPaperSize] = useState('10cm x 6.5cm (Standar Barcode Tembakau)');
  const [printerDPI, setPrinterDPI] = useState('203 DPI (Standar Thermal)');

  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const [testPrintItems, setTestPrintItems] = useState<any[]>([]);

  const fetchSettings = () => {
    // Barcode settings
    const s = getBarcodeSettings();
    setCompany(s.company);
    setTipe(s.tipe);
    setSumber(s.sumber);
    setDigitCounter(s.digitCounter);

    // Shipping format settings
    const shipKode = getSettingValue('ShippingKode', 'PG');
    const shipSource = getSettingValue('ShippingSource', 'LJ');
    setShippingKode(shipKode);
    setShippingSource(shipSource);

    // Printer settings
    const name = getSettingValue('ActivePrinterName', 'Zebra GK420t Thermal Label Printer');
    const customName = getSettingValue('CustomPrinterName', '');
    const conn = getSettingValue('ActivePrinterConnection', 'Browser Default Dialog (Rekomendasi - Kompatibel Semua OS)');
    const size = getSettingValue('ActivePrinterPaperSize', '10cm x 6.5cm (Standar Barcode Tembakau)');
    const dpi = getSettingValue('ActivePrinterDPI', '203 DPI (Standar Thermal)');

    setPrinterName(name);
    setCustomPrinterName(customName);
    setPrinterConnection(conn);
    setPaperSize(size);
    setPrinterDPI(dpi);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updatePreview = (co: string, ti: string, su: string, dig: number) => {
    const today = new Date();
    const dd = ('0' + today.getDate()).slice(-2);
    const mm = ('0' + (today.getMonth() + 1)).slice(-2);
    const yy = String(today.getFullYear()).slice(-2);
    const todayKey = `${dd}${mm}${yy}`;
    const counterStr = ('0000000' + 1).slice(-dig);
    setPreviewBarcode(`${co}${ti}${su}${todayKey}${counterStr}`);
  };

  useEffect(() => {
    updatePreview(
      company.trim().toUpperCase(),
      tipe.trim().toUpperCase(),
      sumber.trim().toUpperCase(),
      digitCounter
    );
  }, [company, tipe, sumber, digitCounter]);

  const showToast = (text: string, type: 'ok' | 'err') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCompany = company.trim().toUpperCase();
    const cleanTipe = tipe.trim().toUpperCase();
    const cleanSumber = sumber.trim().toUpperCase();

    if (!cleanCompany || !cleanTipe || !cleanSumber) {
      showToast('Kode Perusahaan, Jenis Tembakau, dan Sumber wajib diisi.', 'err');
      return;
    }

    const res = apiSaveBarcodeSettings({
      company: cleanCompany,
      tipe: cleanTipe,
      sumber: cleanSumber,
      digitCounter
    });

    setSettingValue('ShippingKode', (shippingKode.trim() || 'PG').toUpperCase());
    setSettingValue('ShippingSource', (shippingSource.trim() || 'LJ').toUpperCase());

    if (res.success) {
      showToast('Pengaturan format barcode & No Shipping berhasil disimpan.', 'ok');
    } else {
      showToast(res.message || 'Gagal menyimpan pengaturan barcode.', 'err');
    }
  };

  const handlePrinterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSettingValue('ActivePrinterName', printerName);
    setSettingValue('CustomPrinterName', customPrinterName.trim());
    setSettingValue('ActivePrinterConnection', printerConnection);
    setSettingValue('ActivePrinterPaperSize', paperSize);
    setSettingValue('ActivePrinterDPI', printerDPI);
    showToast('Pengaturan printer aktif berhasil diperbarui.', 'ok');
  };

  const handleTestPrint = () => {
    const finalPrinterName = printerName === 'CUSTOM' ? (customPrinterName || 'Printer Kustom') : printerName;
    showToast(`Mengirim halaman uji cetak ke printer '${finalPrinterName}'...`, 'ok');

    const sampleItems = [{
      noBarcode: 'TEST-999999',
      namaPetani: 'SAMPEL PETANI UJI COBA',
      kodeSumber: 'TEST',
      tanggal: new Date().toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      companyName: getSettingValue('PrePrintCompanyName', 'PT INDO DEWATA SEMESTA'),
      printerName: finalPrinterName,
      paperSize: paperSize,
      dpi: printerDPI,
      connection: printerConnection
    }];

    setTestPrintItems(sampleItems);

    // Apply class print mode
    document.body.classList.add('label-print-mode');

    // Trigger window.print
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('label-print-mode');
        setTestPrintItems([]);
      }, 500);
    }, 250);
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-4 rounded-xl shadow-xl font-bold flex items-center gap-3 text-sm text-white ${toastMsg.type === 'ok' ? 'bg-emerald-600 border-l-4 border-emerald-300' : 'bg-rose-600 border-l-4 border-rose-300'}`}>
          {toastMsg.text}
        </div>
      )}

      {/* Hidden Print Area for Printer Test label */}
      {testPrintItems.length > 0 && (
        <div id="labelPrintArea" className="block absolute left-0 top-0 z-[9999] bg-white">
          {testPrintItems.map((l, i) => (
            <div key={i} className="pre-label w-[10cm] h-[6.5cm] box-sizing-border-box px-[6mm] py-[4mm] flex flex-col justify-between page-break-after border border-transparent font-sans">
              <div>
                <div className="pl-barcode-wrap mb-1 text-center">
                  <BarcodeSvg value={l.noBarcode} height={60} fontSize={12} displayValue={true} margin={0} width={2} />
                </div>
                <div className="border-t border-dashed border-black my-2" />
                <div className="grid grid-cols-2 gap-2 text-[10px] text-black">
                  <div>
                    <span className="font-bold uppercase tracking-wider block text-slate-500">Keterangan</span>
                    <b>UJI COBA PRINTER OK</b>
                  </div>
                  <div>
                    <span className="font-bold uppercase tracking-wider block text-slate-500">Printer Aktif</span>
                    <b>{l.printerName}</b>
                  </div>
                  <div>
                    <span className="font-bold uppercase tracking-wider block text-slate-500">Koneksi Driver</span>
                    <b>{l.connection}</b>
                  </div>
                  <div>
                    <span className="font-bold uppercase tracking-wider block text-slate-500">Ukuran / Kerapatan</span>
                    <b>{l.paperSize} ({l.dpi})</b>
                  </div>
                </div>
              </div>
              <div>
                <div className="border-t border-black my-1.5" />
                <div className="flex justify-between items-center text-[10px] font-mono font-bold text-black uppercase">
                  <span>{l.companyName || 'PT INDO DEWATA SEMESTA'}</span>
                  <span>{l.tanggal}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sub tabs navigation */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('barcode')}
          className={`px-5 py-3 font-bold text-sm flex items-center gap-2 border-b-2 transition ${activeTab === 'barcode' ? 'border-amber-500 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          <Settings size={16} />
          Pengaturan Format Barcode
        </button>
        <button
          onClick={() => setActiveTab('printer')}
          className={`px-5 py-3 font-bold text-sm flex items-center gap-2 border-b-2 transition ${activeTab === 'printer' ? 'border-amber-500 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          <Printer size={16} />
          Pengaturan Printer &amp; Cetak
        </button>
      </div>

      {activeTab === 'barcode' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Barcode Form */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <h3 className="text-lg font-extrabold text-slate-800 mb-4 flex items-center gap-2">
              <Settings size={18} className="text-amber-500" />
              Format Barcode Buying (Auto Generate)
            </h3>
            <p className="text-xs text-slate-400 mt-[-8px] mb-6 leading-relaxed">
              Barcode akan dibuat otomatis dengan susunan:<br />
              <b>Kode Perusahaan + Kode Jenis Tembakau + Kode Sumber + Tanggal (DDMMYY) + Nomor Urut</b>
            </p>

            <form onSubmit={handleBarcodeSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Kode Perusahaan
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-bold"
                  placeholder="mis. IDS"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Kode Jenis Tembakau
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={tipe}
                  onChange={e => setTipe(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-bold"
                  placeholder="mis. SC25"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Kode Sumber
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={sumber}
                  onChange={e => setSumber(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-bold"
                  placeholder="mis. LB"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Jumlah Digit Nomor Urut
                </label>
                <input
                  type="number"
                  min={3}
                  max={8}
                  step={1}
                  value={digitCounter}
                  onChange={e => setDigitCounter(Number(e.target.value) || 5)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-bold"
                />
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Nomor urut otomatis kembali ke 1 setiap hari (berdasarkan tanggal generate).
                </p>
              </div>

              {/* Shipping Number Format Settings */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <Truck size={16} className="text-amber-500" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Pengaturan No Shipping (Surat Jalan)
                  </h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                      Kode Shipping
                    </label>
                    <input
                      type="text"
                      maxLength={8}
                      value={shippingKode}
                      onChange={e => setShippingKode(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold"
                      placeholder="mis. PG"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                      Source / Lokasi
                    </label>
                    <input
                      type="text"
                      maxLength={8}
                      value={shippingSource}
                      onChange={e => setShippingSource(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold"
                      placeholder="mis. LJ"
                    />
                  </div>
                </div>

                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-widest block mb-0.5">
                    Contoh Generate No Shipping:
                  </span>
                  <span className="font-mono font-black text-amber-950 text-sm tracking-wider">
                    {(shippingKode || 'PG')}-{(shippingSource || 'LJ')}-01XII23-0015
                  </span>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    Format: <b>[Kode]-[Source]-[Tanggal: DD + Bulan Romawi + YY]-[Nomor Urut 4 digit, reset bulanan]</b>
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-4 mt-6">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                  <Eye size={12} /> Barcode Preview
                </span>
                <p className="text-md font-mono font-bold text-amber-600 tracking-wider">
                  {previewBarcode}
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold rounded-xl text-sm transition flex items-center justify-center gap-2 cursor-pointer"
              >
                Simpan Pengaturan
              </button>
            </form>
          </div>

          {/* Barcode Legend */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
            <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
              <CheckSquare size={18} className="text-teal-500" />
              Contoh Format Penomoran
            </h3>
            <div className="text-sm text-slate-600 space-y-4 leading-relaxed">
              <p>
                Contoh: <b className="font-mono bg-slate-100 px-2 py-0.5 rounded text-amber-600 font-bold">IDSSC25LB08072600001</b>
              </p>
              <ul className="space-y-2 text-xs">
                <li className="flex gap-2">
                  <b className="w-16 font-mono text-slate-800">IDS</b>
                  <span>= Kode Perusahaan (Prefix)</span>
                </li>
                <li className="flex gap-2">
                  <b className="w-16 font-mono text-slate-800">SC25</b>
                  <span>= Kode Jenis Tembakau</span>
                </li>
                <li className="flex gap-2">
                  <b className="w-16 font-mono text-slate-800">LB</b>
                  <span>= Kode Sumber / Area</span>
                </li>
                <li className="flex gap-2">
                  <b className="w-16 font-mono text-slate-800">080726</b>
                  <span>= Tanggal generate dalam format DDMMYY (8 Juli 2026)</span>
                </li>
                <li className="flex gap-2">
                  <b className="w-16 font-mono text-slate-800">00001</b>
                  <span>= Nomor urut sequence (panjang 5 digit, reset setiap hari)</span>
                </li>
              </ul>
              <p className="text-xs text-slate-400 mt-4 leading-relaxed border-t border-slate-50 pt-4">
                Perubahan pengaturan ini hanya berlaku untuk barcode <b>Buying</b> yang dibuat setelah disimpan; barcode yang sudah ada di database tidak akan berubah formatnya.
              </p>
            </div>

            {/* Shipping Legend */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2.5 text-xs">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                <Truck size={15} className="text-amber-500" />
                Format No Shipping (Surat Jalan)
              </h4>
              <p className="font-mono text-amber-700 font-black bg-white px-2.5 py-1.5 rounded border border-slate-200 text-xs">
                {(shippingKode || 'PG')}-{(shippingSource || 'LJ')}-01XII23-0015
              </p>
              <ul className="space-y-1.5 text-[11px] text-slate-600">
                <li className="flex gap-2">
                  <b className="w-14 font-mono text-slate-800 font-bold">PG</b>
                  <span>= Kode Shipping</span>
                </li>
                <li className="flex gap-2">
                  <b className="w-14 font-mono text-slate-800 font-bold">LJ</b>
                  <span>= Source / Lokasi Pengirim</span>
                </li>
                <li className="flex gap-2">
                  <b className="w-14 font-mono text-slate-800 font-bold">01XII23</b>
                  <span>= Tanggal (01), Bulan Romawi (XII = Des), Tahun (23 = 2023)</span>
                </li>
                <li className="flex gap-2">
                  <b className="w-14 font-mono text-slate-800 font-bold">0015</b>
                  <span>= Sequence 4 digit (otomatis reset ke 0001 setiap awal bulan baru)</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Printer Form */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <h3 className="text-lg font-extrabold text-slate-800 mb-4 flex items-center gap-2">
              <Printer size={18} className="text-amber-500" />
              Konfigurasi Hardware Printer Aktif
            </h3>
            <p className="text-xs text-slate-400 mt-[-8px] mb-6 leading-relaxed">
              Pilih printer label thermal atau printer umum yang akan Anda gunakan untuk mencetak label barcode.
              Nama printer terpilih akan dimunculkan di halaman cetak label untuk memudahkan verifikasi operator.
            </p>

            <form onSubmit={handlePrinterSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Pilih Printer Target
                </label>
                <select
                  value={printerName}
                  onChange={e => setPrinterName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold text-slate-700"
                >
                  <option value="Zebra GK420t Thermal Label Printer">Zebra GK420t Thermal Label Printer</option>
                  <option value="Zebra S4M Industrial Printer">Zebra S4M Industrial Printer</option>
                  <option value="GP-1324D Barcode Printer">GP-1324D Barcode Printer</option>
                  <option value="Xprinter XP-365B Thermal Printer">Xprinter XP-365B Thermal Printer</option>
                  <option value="Epson TM-T82 Receipt Thermal Printer">Epson TM-T82 Receipt Thermal Printer</option>
                  <option value="Sistem Cetak Default Browser (Tanya Setiap Kali)">Sistem Cetak Default Browser (Tanya Setiap Kali)</option>
                  <option value="CUSTOM">Tambah Printer Kustom...</option>
                </select>
              </div>

              {printerName === 'CUSTOM' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                    Nama Printer Kustom
                  </label>
                  <input
                    type="text"
                    value={customPrinterName}
                    onChange={e => setCustomPrinterName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                    placeholder="mis. TSC TTP-244 Pro atau GP-2120T"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Koneksi / Driver Mode
                </label>
                <select
                  value={printerConnection}
                  onChange={e => setPrinterConnection(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-700"
                >
                  <option value="Browser Default Dialog (Rekomendasi - Kompatibel Semua OS)">Browser Default Dialog (Rekomendasi - Kompatibel Semua OS)</option>
                  <option value="Raw USB Print Client (Direct WebUSB)">Raw USB Print Client (Direct WebUSB)</option>
                  <option value="QZ Tray Integration Server (WebSocket localhost:8182)">QZ Tray Integration Server (WebSocket localhost:8182)</option>
                  <option value="Virtual Zebra Network Server (LPT1 / LAN)">Virtual Zebra Network Server (LPT1 / LAN)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                    Ukuran Kertas Label
                  </label>
                  <select
                    value={paperSize}
                    onChange={e => setPaperSize(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-700"
                  >
                    <option value="10cm x 6.5cm (Standar Barcode Tembakau)">10cm x 6.5cm (Standar)</option>
                    <option value="75mm x 50mm (Zebra Medium Label)">75mm x 50mm (Medium)</option>
                    <option value="50mm x 30mm (Mini Barcode Label)">50mm x 30mm (Mini)</option>
                    <option value="80mm Continuous Roll (Thermal Kertas Struk)">80mm Continuous (Receipt)</option>
                    <option value="A4 / Letter Standard Size (Kertas Kantor)">A4 / Letter (Invoice)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                    Resolusi Cetak (DPI)
                  </label>
                  <select
                    value={printerDPI}
                    onChange={e => setPrinterDPI(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-700"
                  >
                    <option value="203 DPI (Standar Thermal)">203 DPI (Standar)</option>
                    <option value="300 DPI (Presisi Tinggi)">300 DPI (Presisi)</option>
                    <option value="600 DPI (Sangat Detail)">600 DPI (Detil)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold rounded-xl text-sm transition flex items-center justify-center gap-2"
              >
                <Check size={16} />
                Simpan Konfigurasi Printer
              </button>
            </form>
          </div>

          {/* Diagnostics and test page */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
              <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                <Sliders size={18} className="text-teal-500" />
                Status Konektivitas Printer
              </h3>

              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping mt-1.5 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">Status Koneksi: Online &amp; Siap</span>
                  <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                    Sistem dapat terhubung ke hardware lokal Anda menggunakan driver <b>{printerConnection.split(' (')[0]}</b>.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Spesifikasi Aktif Cetak:</span>
                <ul className="text-xs text-slate-600 space-y-1.5 font-medium">
                  <li className="flex justify-between border-b border-slate-200/60 pb-1">
                    <span className="text-slate-400">Target Printer:</span>
                    <span className="font-bold text-slate-800 font-mono">
                      {printerName === 'CUSTOM' ? (customPrinterName || 'Printer Kustom') : printerName}
                    </span>
                  </li>
                  <li className="flex justify-between border-b border-slate-200/60 pb-1">
                    <span className="text-slate-400">Ukuran Label:</span>
                    <span className="font-bold text-slate-800">{paperSize.split(' (')[0]}</span>
                  </li>
                  <li className="flex justify-between border-b border-slate-200/60 pb-1">
                    <span className="text-slate-400">Driver Komunikasi:</span>
                    <span className="font-bold text-slate-800">{printerConnection.split(' (')[0]}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-400">Kepadatan Cetakan:</span>
                    <span className="font-bold text-slate-800">{printerDPI}</span>
                  </li>
                </ul>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTestPrint}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-sm"
                >
                  <Terminal size={14} />
                  Cetak Label Uji Coba (Test Print)
                </button>
                <p className="text-[10px] text-slate-400 text-center mt-2 leading-relaxed">
                  Gunakan tombol ini untuk memverifikasi bahwa barcode tercetak dengan proporsi seimbang pada kertas thermal Anda.
                </p>
              </div>
            </div>

            <div className="bg-amber-50/50 border border-amber-200/70 rounded-2xl p-5 flex items-start gap-3">
              <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Tips Konfigurasi Cetak</h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Untuk mendapatkan hasil cetakan barcode yang terbaca sempurna oleh Scanner Handheld, 
                  pastikan margin halaman di dialog cetak browser diatur ke <b>None (Tanpa Margin)</b>, 
                  dan hilangkan centang pada opsi <b>Headers and Footers (Header dan Footer)</b>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
