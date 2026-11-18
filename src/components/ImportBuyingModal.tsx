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
  Layers,
  ArrowRight
} from 'lucide-react';
import { MasterPrice, User } from '../types';
import { 
  readUploadedSpreadsheet, 
  parseExcelDate, 
  downloadBuyingImportTemplate 
} from '../utils/excelImport';
import { apiGetBuyingList, apiImportBuying, ImportBuyingItem, getSettingValue } from '../db';

interface ImportBuyingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
  currentUser?: User | null;
  masterPrices: MasterPrice[];
}

interface ParsedBuyingRow {
  rowNum: number;
  tanggal: string;
  noBarcode: string;
  berat: number;
  gradeBuying: string;
  supplier: string;
  type: string;
  subType: string;
  cropYear: string;
  isValid: boolean;
  validationError?: string;
}

export const ImportBuyingModal: React.FC<ImportBuyingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
  masterPrices
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedBuyingRow[]>([]);
  
  // Default batch fallbacks
  const [defaultSupplier, setDefaultSupplier] = useState('PETANI LOKAL');
  const [defaultType, setDefaultType] = useState('VIRGINIA');
  const [defaultSubType, setDefaultSubType] = useState('LOKAL');
  const [defaultCropYear, setDefaultCropYear] = useState('2026');
  
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

      // Existing barcodes from database
      const existingBuying = apiGetBuyingList();
      const existingSet = new Set(existingBuying.map(b => b.NoBarcode.trim().toUpperCase()));
      const seenInFile = new Set<string>();

      const rows: ParsedBuyingRow[] = [];

      rawRows.forEach((r, idx) => {
        const rowNum = idx + 2; // considering header is row 1
        
        // Find key regardless of casing or spacing
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

        const rawDate = findVal(['tanggalbuying', 'tanggal', 'tglbuying', 'tgl', 'date', 'buyingdate']);
        const rawBarcode = String(findVal(['nobarcode', 'barcode', 'kodebarcode', 'kode']) || '').trim().toUpperCase();
        const rawBerat = findVal(['beratkg', 'berat', 'beratnetto', 'netto', 'weight', 'berattimbang']);
        const rawGrade = String(findVal(['gradebuying', 'grade', 'gradebeli']) || '').trim().toUpperCase();
        
        const rawSupplier = String(findVal(['supplier', 'namasupplier', 'petani']) || '').trim().toUpperCase();
        const rawType = String(findVal(['type', 'tipe']) || '').trim().toUpperCase();
        const rawSubType = String(findVal(['subtype', 'subtipe']) || '').trim().toUpperCase();
        const rawCropYear = String(findVal(['cropyear', 'tahun', 'tahunpanen']) || '').trim().toUpperCase();

        const tanggal = parseExcelDate(rawDate);
        const berat = Number(rawBerat) || 0;

        let isValid = true;
        let validationError: string | undefined = undefined;

        if (!rawBarcode) {
          isValid = false;
          validationError = 'No Barcode kosong';
        } else if (existingSet.has(rawBarcode)) {
          isValid = false;
          validationError = 'Barcode sudah ada di DB';
        } else if (seenInFile.has(rawBarcode)) {
          isValid = false;
          validationError = 'Barcode duplikat di file';
        } else if (!rawGrade) {
          isValid = false;
          validationError = 'Grade Buying kosong';
        } else if (berat <= 0) {
          isValid = false;
          validationError = 'Berat harus > 0 kg';
        }

        if (rawBarcode) {
          seenInFile.add(rawBarcode);
        }

        rows.push({
          rowNum,
          tanggal,
          noBarcode: rawBarcode,
          berat,
          gradeBuying: rawGrade,
          supplier: rawSupplier || defaultSupplier,
          type: rawType || defaultType,
          subType: rawSubType || defaultSubType,
          cropYear: rawCropYear || defaultCropYear,
          isValid,
          validationError
        });
      });

      setParsedRows(rows);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Gagal membaca file Excel: ${err.message || 'Format tidak didukung'}`);
    } finally {
      setLoadingFile(false);
      // reset file input value to allow re-selecting the same file
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const validRows = parsedRows.filter(r => r.isValid);
  const totalWeight = validRows.reduce((acc, r) => acc + r.berat, 0);

  const handleExecuteImport = () => {
    if (validRows.length === 0) {
      setErrorMsg('Tidak ada baris data valid yang siap diimpor.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const itemsToImport: ImportBuyingItem[] = validRows.map(r => ({
        tanggal: r.tanggal,
        noBarcode: r.noBarcode,
        berat: r.berat,
        gradeBuying: r.gradeBuying,
        namaSupplier: r.supplier || defaultSupplier,
        type: r.type || defaultType,
        subType: r.subType || defaultSubType,
        cropYear: r.cropYear || defaultCropYear,
        tare: 0 // Netto imported directly as specified
      }));

      const res = apiImportBuying({
        items: itemsToImport,
        defaultSupplier,
        defaultType,
        defaultSubType,
        defaultCropYear,
        defaultTare: 0,
        inputBy: currentUser ? (currentUser.nama || currentUser.username) : 'admin'
      });

      if (res.success) {
        window.dispatchEvent(new Event('iscs-db-update'));
        onSuccess(res.totalImported);
        onClose();
      } else {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat memproses impor data.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setParsedRows([]);
    setFileName('');
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-600 rounded-xl">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">
                Import Data Timbang Buying
              </h3>
              <p className="text-xs text-slate-500">
                Impor banyak transaksi timbang sekaligus melalui file Excel (.xlsx) atau CSV
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Quick Info & Download Template */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <p className="font-bold text-amber-900">
                Kolom Wajib: <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 text-amber-800">Tanggal Buying</span>, <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 text-amber-800">No Barcode</span>, <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 text-amber-800">Berat (kg)</span>, <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 text-amber-800">Grade Buying</span>
              </p>
              <p className="text-amber-700">
                Kolom opsional: <span className="font-mono">Supplier</span>, <span className="font-mono">Type</span>, <span className="font-mono">SubType</span>, <span className="font-mono">CropYear</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadBuyingImportTemplate}
              className="px-3.5 py-2 bg-white hover:bg-amber-100/50 text-amber-800 font-bold rounded-lg border border-amber-300 flex items-center gap-1.5 transition shrink-0 shadow-2xs"
            >
              <Download size={14} className="text-amber-600" />
              Download Template Excel
            </button>
          </div>

          {/* Default Header Settings if missing in Excel */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <h4 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2.5">
              Nilai Bawaan (Default jika baris di Excel kosong)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Default Supplier</label>
                <input
                  type="text"
                  value={defaultSupplier}
                  onChange={e => setDefaultSupplier(e.target.value)}
                  placeholder="Nama Supplier / Petani"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Default Type</label>
                <select
                  value={defaultType}
                  onChange={e => setDefaultType(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {availableTypes.length > 0 ? (
                    availableTypes.map(t => <option key={t} value={t}>{t}</option>)
                  ) : (
                    <option value="VIRGINIA">VIRGINIA</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Default Sub Type</label>
                <select
                  value={defaultSubType}
                  onChange={e => setDefaultSubType(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {availableSubTypes.length > 0 ? (
                    availableSubTypes.map(s => <option key={s} value={s}>{s}</option>)
                  ) : (
                    <option value="LOKAL">LOKAL</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Default Crop Year</label>
                <select
                  value={defaultCropYear}
                  onChange={e => setDefaultCropYear(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {availableCropYears.length > 0 ? (
                    availableCropYears.map(c => <option key={c} value={c}>{c}</option>)
                  ) : (
                    <option value="2026">2026</option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Upload Drop Area */}
          {parsedRows.length === 0 ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-amber-500 bg-slate-50/50 hover:bg-amber-50/20 rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3"
            >
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-xs border border-slate-200 text-amber-500">
                <Upload size={22} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">
                  {loadingFile ? 'Membaca file...' : 'Klik untuk memilih file Excel (.xlsx / .xls / .csv)'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Format didukung: Microsoft Excel (.xlsx, .xls) atau Comma Separated (.csv)
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
                  <span>File: <b className="text-slate-900">{fileName}</b> ({parsedRows.length} baris)</span>
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
                  <span className="text-emerald-600 font-bold block text-[10px] uppercase">Siap Di-import</span>
                  <span className="text-lg font-black text-emerald-700">{validRows.length} bale</span>
                </div>
                <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl">
                  <span className="text-rose-600 font-bold block text-[10px] uppercase">Tidak Valid / Skip</span>
                  <span className="text-lg font-black text-rose-700">{parsedRows.length - validRows.length}</span>
                </div>
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
                  <span className="text-amber-700 font-bold block text-[10px] uppercase">Total Berat Netto</span>
                  <span className="text-lg font-black text-amber-800 font-mono">{totalWeight.toFixed(2)} kg</span>
                </div>
              </div>

              {/* Table Preview */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 text-slate-500 font-bold">
                    <tr>
                      <th className="px-3 py-2 text-center w-12">No</th>
                      <th className="px-3 py-2 w-28">Tgl Buying</th>
                      <th className="px-3 py-2 min-w-[140px]">No Barcode</th>
                      <th className="px-3 py-2 min-w-[120px]">Grade</th>
                      <th className="px-3 py-2 w-24 text-right">Berat (kg)</th>
                      <th className="px-3 py-2 min-w-[140px]">Supplier</th>
                      <th className="px-3 py-2 text-center w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((r, i) => (
                      <tr key={i} className={r.isValid ? 'hover:bg-slate-50/50' : 'bg-rose-50/40 text-rose-900'}>
                        <td className="px-3 py-2 text-center font-mono text-slate-400">{r.rowNum}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{r.tanggal}</td>
                        <td className="px-3 py-2 font-mono font-bold">{r.noBarcode || '-'}</td>
                        <td className="px-3 py-2 font-bold">{r.gradeBuying || '-'}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold">{r.berat.toFixed(2)}</td>
                        <td className="px-3 py-2 truncate max-w-[150px]">{r.supplier}</td>
                        <td className="px-3 py-2 text-center">
                          {r.isValid ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full">
                              <CheckCircle2 size={11} /> Valid
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
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold rounded-xl text-xs transition"
          >
            Batal
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={isSubmitting || validRows.length === 0}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-slate-900 font-extrabold rounded-xl text-xs shadow-sm transition flex items-center gap-1.5"
            >
              {isSubmitting ? (
                'Menyimpan Data...'
              ) : (
                <>
                  <span>Import Sekarang ({validRows.length} Bale)</span>
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
