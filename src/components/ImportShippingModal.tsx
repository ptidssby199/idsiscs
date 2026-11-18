import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  FileSpreadsheet, 
  Trash2,
  Calendar,
  Truck,
  ArrowRight,
  UserCheck,
  PackageCheck,
  Layers,
  MapPin
} from 'lucide-react';
import { MasterPrice, User, BuyingRow, ReclassRow, ShippingRow } from '../types';
import { 
  readUploadedSpreadsheet, 
  parseExcelDate, 
  downloadShippingImportTemplate 
} from '../utils/excelImport';
import { 
  apiGetBuyingList, 
  apiGetReclassList, 
  apiImportShipping, 
  ImportShippingItem,
  apiGetUsers,
  getLocal
} from '../db';

interface ImportShippingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
  currentUser?: User | null;
  masterPrices?: MasterPrice[];
}

interface ParsedShippingRow {
  rowNum: number;
  tanggal: string;
  tujuan: string;
  noBarcode: string;
  grade: string;
  berat: number;
  noShipping?: string;
  // Looked up source & stock information
  stockSource: 'Reclass' | 'Buying' | 'Sudah Shipped' | 'Baru/Manual';
  existingWeight?: number;
  existingGrade?: string;
  isAlreadyShipped: boolean;
  isValid: boolean;
  validationError?: string;
}

export const ImportShippingModal: React.FC<ImportShippingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
  masterPrices = []
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedShippingRow[]>([]);
  
  // Operator / User who executes shipping
  const users = apiGetUsers();
  const [operator, setOperator] = useState(currentUser?.nama || currentUser?.username || 'admin');

  // Default fallback values
  const [defaultDestination, setDefaultDestination] = useState('GUDANG PUSAT SURABAYA');
  const [defaultType, setDefaultType] = useState('VIRGINIA');
  const [defaultSubType, setDefaultSubType] = useState('LOKAL');
  const [defaultCropYear, setDefaultCropYear] = useState('2026');

  // Filter view state
  const [filterView, setFilterView] = useState<'all' | 'valid' | 'invalid'>('all');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const availableTypes = Array.from(new Set(masterPrices.map(p => p.Type || 'VIRGINIA'))).filter(Boolean);
  const availableSubTypes = Array.from(new Set(masterPrices.map(p => p.SubType || 'LOKAL'))).filter(Boolean);
  const availableCropYears = Array.from(new Set(masterPrices.map(p => p.CropYear || '2026'))).filter(Boolean);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoadingFile(true);
    setErrorMsg(null);

    try {
      const rawRows = await readUploadedSpreadsheet(file);
      if (!rawRows || rawRows.length === 0) {
        setErrorMsg('File Excel kosong atau tidak memiliki data baris yang valid.');
        setParsedRows([]);
        setLoadingFile(false);
        return;
      }

      // Existing database maps for stock verification
      const buyingList = apiGetBuyingList();
      const buyingMap = new Map<string, BuyingRow>();
      buyingList.forEach(b => {
        buyingMap.set(b.NoBarcode.trim().toUpperCase(), b);
      });

      const reclassList = apiGetReclassList();
      const reclassMap = new Map<string, ReclassRow>();
      reclassList.forEach(r => {
        reclassMap.set(r.NoBarcode.trim().toUpperCase(), r);
        if (r.NoReclass) {
          reclassMap.set(r.NoReclass.trim().toUpperCase(), r);
        }
      });

      const shippingList = getLocal<ShippingRow[]>('iscs_shipping', []);
      const shippedSet = new Set<string>();
      shippingList.forEach(s => {
        if (s.NoBarcodeAsal) shippedSet.add(s.NoBarcodeAsal.trim().toUpperCase());
        if (s.NoBarcode) shippedSet.add(s.NoBarcode.trim().toUpperCase());
      });
      reclassList.forEach(r => {
        if (r.StatusShipping === 'SUDAH') {
          shippedSet.add(r.NoBarcode.trim().toUpperCase());
          if (r.NoReclass) shippedSet.add(r.NoReclass.trim().toUpperCase());
        }
      });

      const seenInFile = new Set<string>();
      const rows: ParsedShippingRow[] = [];

      rawRows.forEach((r, idx) => {
        const rowNum = idx + 2;

        const findVal = (possibleKeys: string[]): any => {
          for (const key of Object.keys(r)) {
            const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const pk of possibleKeys) {
              if (cleanKey === pk.replace(/[^a-z0-9]/g, '')) {
                return r[key];
              }
            }
          }
          return undefined;
        };

        const rawDate = findVal(['tanggalshipping', 'tglshipping', 'tanggal', 'tgl', 'date', 'shippingdate']);
        const rawTujuan = String(findVal(['tujuan', 'destination', 'destinasi', 'alamat', 'pembeli', 'customer', 'tujuanpengiriman']) || '').trim().toUpperCase();
        const rawBarcode = String(findVal(['nobarcode', 'barcode', 'kodebarcode', 'kode', 'nobale']) || '').trim().toUpperCase();
        const rawGrade = String(findVal(['grade', 'gradereclass', 'gradeshipping', 'gradebarang']) || '').trim().toUpperCase();
        const rawBerat = findVal(['berat', 'beratkg', 'beratnetto', 'netto', 'weight', 'kg', 'berattimbang']);
        const rawNoShipping = String(findVal(['noshipping', 'shippingno', 'nomorshipping', 'suratjalan']) || '').trim().toUpperCase();

        const tanggal = parseExcelDate(rawDate);
        const tujuan = rawTujuan || defaultDestination;
        let berat = Number(rawBerat) || 0;
        let grade = rawGrade;

        let isValid = true;
        let validationError: string | undefined = undefined;
        let stockSource: 'Reclass' | 'Buying' | 'Sudah Shipped' | 'Baru/Manual' = 'Baru/Manual';
        let existingWeight: number | undefined = undefined;
        let existingGrade: string | undefined = undefined;
        const isAlreadyShipped = shippedSet.has(rawBarcode);

        if (isAlreadyShipped) {
          stockSource = 'Sudah Shipped';
          isValid = false;
          validationError = 'Barcode sudah pernah dishipping';
        } else if (reclassMap.has(rawBarcode)) {
          stockSource = 'Reclass';
          const rc = reclassMap.get(rawBarcode)!;
          existingGrade = rc.GradeReclass;
          existingWeight = Number(rc.BeratNetto) || 0;
          if (!grade) grade = rc.GradeReclass;
          if (berat <= 0) berat = existingWeight;
        } else if (buyingMap.has(rawBarcode)) {
          stockSource = 'Buying';
          const b = buyingMap.get(rawBarcode)!;
          existingGrade = b.GradeBuying;
          existingWeight = Number(b.BeratNetto) || (Number(b.BeratBruto) - Number(b.Tare)) || 0;
          if (!grade) grade = b.GradeBuying;
          if (berat <= 0) berat = existingWeight;
          // Rule requirement: Barcode must be reclassed before shipping!
          isValid = false;
          validationError = 'Belum di-reclass (Wajib reclass dahulu)';
        } else {
          stockSource = 'Baru/Manual';
          // Rule requirement: Barcode not in reclass cannot be shipped!
          isValid = false;
          validationError = 'Belum di-reclass / Barcode tidak valid';
        }

        if (!rawBarcode) {
          isValid = false;
          validationError = 'No Barcode kosong';
        } else if (seenInFile.has(rawBarcode)) {
          isValid = false;
          validationError = 'Barcode duplikat di file';
        } else if (berat <= 0) {
          isValid = false;
          validationError = 'Berat harus > 0 kg';
        } else if (!tujuan) {
          isValid = false;
          validationError = 'Tujuan pengiriman kosong';
        }

        if (rawBarcode) {
          seenInFile.add(rawBarcode);
        }

        rows.push({
          rowNum,
          tanggal,
          tujuan,
          noBarcode: rawBarcode,
          grade: grade || 'UNKNOWN',
          berat: Number(berat.toFixed(2)),
          noShipping: rawNoShipping,
          stockSource,
          existingWeight,
          existingGrade,
          isAlreadyShipped,
          isValid,
          validationError
        });
      });

      setParsedRows(rows);
      setLoadingFile(false);
    } catch (err: any) {
      console.error('Error reading shipping file:', err);
      setErrorMsg('Gagal membaca file: ' + (err.message || 'Format spreadsheet tidak sesuai'));
      setParsedRows([]);
      setLoadingFile(false);
    }
  };

  const handleReset = () => {
    setFileName('');
    setParsedRows([]);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validRows = parsedRows.filter(r => r.isValid);
  const totalWeight = validRows.reduce((a, b) => a + (b.berat || 0), 0);

  const displayedRows = parsedRows.filter(r => {
    if (filterView === 'valid') return r.isValid;
    if (filterView === 'invalid') return !r.isValid;
    return true;
  });

  const handleExecuteImport = async () => {
    if (validRows.length === 0) {
      setErrorMsg('Tidak ada baris valid untuk diimpor.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const itemsToImport: ImportShippingItem[] = validRows.map(r => ({
        tanggal: r.tanggal,
        tujuan: r.tujuan || defaultDestination,
        noBarcode: r.noBarcode,
        grade: r.grade,
        berat: r.berat,
        noShipping: r.noShipping,
        type: defaultType,
        subType: defaultSubType,
        cropYear: defaultCropYear
      }));

      const res = apiImportShipping({
        items: itemsToImport,
        defaultDestination,
        defaultType,
        defaultSubType,
        defaultCropYear,
        inputBy: operator
      });

      if (res.success) {
        onSuccess(res.totalImported);
        onClose();
      } else {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg('Terjadi kesalahan saat menyimpan data shipping: ' + (err.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-white to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-sm">
              <Truck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-800">Import Shipping (Pengiriman)</h3>
                <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <PackageCheck size={11} /> Otomatis Kurangi Stok Gudang
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload Excel / CSV data pengiriman tembakau (Tanggal, Tujuan, No Barcode, Grade, Berat).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          
          {/* Info Banner */}
          <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-950 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <PackageCheck size={15} className="text-amber-600" />
              <span>Ketentuan Validasi & Pengurangan Stok Gudang Otomatis:</span>
            </div>
            <ul className="text-amber-900/90 leading-relaxed pl-5 list-disc space-y-1">
              <li><b>Syarat Mutlak:</b> Barcode yang bisa di-shipping <b>harus sudah melalui proses Reclass</b>. Jika belum direclass atau barcode baru, sistem akan menolak dan memberi peringatan.</li>
              <li>Setiap barcode yang valid akan langsung berstatus <b>SUDAH SHIPPING</b> dan <b>otomatis mengurangi stok aktif di gudang</b> (pada Dashboard & Laporan Stok).</li>
            </ul>
          </div>

          {/* Options / Fallbacks Header Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 flex items-center gap-1">
                <UserCheck size={12} className="text-amber-600" />
                User Yang Shipping
              </label>
              <select
                value={operator}
                onChange={e => setOperator(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 text-xs focus:ring-1 focus:ring-amber-500"
              >
                {users.map(u => (
                  <option key={u.Username} value={u.Username}>
                    {u.Nama} ({u.Username})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 flex items-center gap-1">
                <MapPin size={12} className="text-amber-600" />
                Default Tujuan (Jika Kosong)
              </label>
              <input
                type="text"
                value={defaultDestination}
                onChange={e => setDefaultDestination(e.target.value)}
                placeholder="Contoh: GUDANG SURABAYA"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 text-xs focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 flex items-center gap-1">
                <Layers size={12} className="text-amber-600" />
                Default Type &amp; SubType
              </label>
              <div className="flex gap-1.5">
                <select
                  value={defaultType}
                  onChange={e => setDefaultType(e.target.value)}
                  className="w-1/2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 text-xs"
                >
                  {availableTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  value={defaultSubType}
                  onChange={e => setDefaultSubType(e.target.value)}
                  className="w-1/2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 text-xs"
                >
                  {availableSubTypes.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 flex items-center gap-1">
                <Calendar size={12} className="text-amber-600" />
                Default Crop Year
              </label>
              <select
                value={defaultCropYear}
                onChange={e => setDefaultCropYear(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 text-xs"
              >
                {availableCropYears.map(cy => (
                  <option key={cy} value={cy}>{cy}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Template Download Prompt */}
          <div className="flex flex-col sm:flex-row items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 text-amber-700 rounded-lg">
                <FileSpreadsheet size={18} />
              </div>
              <div>
                <span className="font-bold text-slate-800 block">Belum punya format Excel yang sesuai?</span>
                <span className="text-slate-500 text-[11px]">Download template resmi dengan kolom: Tanggal Shipping, Tujuan, No Barcode, Grade, Berat (kg).</span>
              </div>
            </div>
            <button
              type="button"
              onClick={downloadShippingImportTemplate}
              className="px-3 py-1.5 bg-slate-800 hover:bg-black text-white font-bold rounded-lg flex items-center gap-1.5 transition text-xs shrink-0 cursor-pointer active:scale-95 shadow-sm"
            >
              <Download size={13} />
              <span>Download Template Excel</span>
            </button>
          </div>

          {/* Upload Dropzone or Parsed View */}
          {parsedRows.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition bg-slate-50/50 hover:bg-amber-50/20 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <Upload size={26} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {loadingFile ? 'Membaca file spreadsheet...' : 'Pilih File Excel / CSV Shipping'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Format yang didukung: <b>.xlsx</b>, <b>.xls</b>, atau <b>.csv</b>
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* File Info Bar */}
              <div className="flex items-center justify-between p-3 bg-slate-100 rounded-xl text-xs font-semibold text-slate-700">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet size={16} className="text-amber-600" />
                  <span>File: <b className="text-slate-900">{fileName}</b> ({parsedRows.length} baris terbaca)</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-amber-700 hover:underline font-bold px-2 py-1"
                  >
                    Ganti File
                  </button>
                  <button
                    onClick={handleReset}
                    className="text-rose-600 hover:text-rose-700 font-bold px-2 py-1 flex items-center gap-1"
                  >
                    <Trash2 size={13} /> Reset
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Total Baris</span>
                  <span className="text-lg font-black text-slate-800">{parsedRows.length}</span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                  <span className="text-emerald-600 font-bold block text-[10px] uppercase">Siap Shipped (Valid)</span>
                  <span className="text-lg font-black text-emerald-700">{validRows.length} bale</span>
                </div>
                <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl">
                  <span className="text-rose-600 font-bold block text-[10px] uppercase">Sudah Shipped / Skip</span>
                  <span className="text-lg font-black text-rose-700">{parsedRows.length - validRows.length}</span>
                </div>
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
                  <span className="text-amber-700 font-bold block text-[10px] uppercase">Total Berat Shipped</span>
                  <span className="text-lg font-black text-amber-800 font-mono">{totalWeight.toFixed(2)} kg</span>
                </div>
              </div>

              {/* Table Filter Tabs */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setFilterView('all')}
                    className={`px-2.5 py-1 rounded-md font-bold text-[11px] transition ${filterView === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
                  >
                    Semua ({parsedRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterView('valid')}
                    className={`px-2.5 py-1 rounded-md font-bold text-[11px] transition ${filterView === 'valid' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
                  >
                    Siap Shipped ({validRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterView('invalid')}
                    className={`px-2.5 py-1 rounded-md font-bold text-[11px] transition ${filterView === 'invalid' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
                  >
                    Bermasalah ({parsedRows.length - validRows.length})
                  </button>
                </div>
                <span className="text-slate-400 text-[11px]">
                  Menampilkan {displayedRows.length} baris
                </span>
              </div>

              {/* Table Preview */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[320px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 text-slate-500 font-bold">
                    <tr>
                      <th className="px-3 py-2 text-center w-12">No</th>
                      <th className="px-3 py-2 w-28">Tgl Shipping</th>
                      <th className="px-3 py-2 min-w-[140px]">Tujuan</th>
                      <th className="px-3 py-2 min-w-[130px]">No Barcode</th>
                      <th className="px-3 py-2 min-w-[100px]">Grade</th>
                      <th className="px-3 py-2 w-24 text-right">Berat (kg)</th>
                      <th className="px-3 py-2 min-w-[120px]">Sumber Stok</th>
                      <th className="px-3 py-2 text-center w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedRows.map((r, i) => (
                      <tr key={i} className={r.isValid ? 'hover:bg-slate-50/50' : 'bg-rose-50/40 text-rose-900'}>
                        <td className="px-3 py-2 text-center font-mono text-slate-400">{r.rowNum}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{r.tanggal}</td>
                        <td className="px-3 py-2 font-semibold truncate max-w-[150px]">{r.tujuan}</td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-900">{r.noBarcode}</td>
                        <td className="px-3 py-2 font-bold text-amber-700">{r.grade}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold">{r.berat.toFixed(2)}</td>
                        <td className="px-3 py-2 text-[11px]">
                          {r.stockSource === 'Reclass' && (
                            <span className="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              Stok Reclass
                            </span>
                          )}
                          {r.stockSource === 'Buying' && (
                            <span className="text-teal-700 font-semibold bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                              Stok Buying
                            </span>
                          )}
                          {r.stockSource === 'Sudah Shipped' && (
                            <span className="text-rose-700 font-semibold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                              Sudah Shipped
                            </span>
                          )}
                          {r.stockSource === 'Baru/Manual' && (
                            <span className="text-slate-600 font-medium bg-slate-100 px-1.5 py-0.5 rounded">
                              Direct / Baru
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.isValid ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full">
                              <CheckCircle2 size={11} /> Siap Shipped
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full" title={r.validationError}>
                              <AlertTriangle size={11} /> {r.validationError || 'Invalid'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
          >
            Batal
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={isSubmitting || validRows.length === 0}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-slate-900 font-extrabold rounded-xl text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              {isSubmitting ? (
                'Memproses & Mengurangi Stok...'
              ) : (
                <>
                  <Truck size={14} />
                  <span>Import Sekarang ({validRows.length} Bale &mdash; Kurangi Stok)</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
