import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  X, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  FileSpreadsheet, 
  Trash2,
  DollarSign,
  ArrowRight,
  Layers,
  HelpCircle,
  RefreshCw
} from 'lucide-react';
import { MasterPrice } from '../types';
import { readUploadedSpreadsheet, downloadMasterPriceImportTemplate, parseCleanPrice } from '../utils/excelImport';
import { apiImportMasterPrice, ImportMasterPriceItem } from '../db';

interface ImportMasterHargaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
  currentPrices: MasterPrice[];
}

interface ParsedPriceRow {
  rowNum: number;
  tipe: 'BUYING' | 'RECLASS';
  type: string;
  subType: string;
  cropYear: string;
  grade: string;
  harga: number;
  isExisting: boolean;
  isValid: boolean;
  validationError?: string;
}

export const ImportMasterHargaModal: React.FC<ImportMasterHargaModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentPrices
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedPriceRow[]>([]);
  const [importMode, setImportMode] = useState<'update_or_insert' | 'replace_all'>('update_or_insert');
  const [filterTab, setFilterTab] = useState<'all' | 'BUYING' | 'RECLASS' | 'invalid'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setFileName('');
      setParsedRows([]);
      setErrorMsg(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoadingFile(true);
    setErrorMsg(null);

    try {
      const rawRows = await readUploadedSpreadsheet(file);
      if (!rawRows || rawRows.length === 0) {
        setErrorMsg('File Excel kosong atau tidak memiliki baris data.');
        setParsedRows([]);
        setLoadingFile(false);
        return;
      }

      // Build existing map: key = TIPE_TYPE_SUBTYPE_CROPYEAR_GRADE
      const existingKeySet = new Set(
        currentPrices.map(p => 
          `${p.Tipe.toUpperCase()}_${(p.Type || '').toUpperCase()}_${(p.SubType || '').toUpperCase()}_${(p.CropYear || '').toUpperCase()}_${p.GradeBuying.toUpperCase()}`
        )
      );

      const rows: ParsedPriceRow[] = [];

      rawRows.forEach((r, idx) => {
        const rowNum = idx + 2; // header is row 1

        // Match keys with exact clean check first, then partial fallback
        const findVal = (possibleKeys: string[]): any => {
          for (const key of Object.keys(r)) {
            const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const pk of possibleKeys) {
              if (cleanKey === pk.replace(/[^a-z0-9]/g, '')) {
                return r[key];
              }
            }
          }
          for (const key of Object.keys(r)) {
            const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const pk of possibleKeys) {
              const cleanPk = pk.replace(/[^a-z0-9]/g, '');
              if (cleanPk.length >= 3 && cleanKey.includes(cleanPk)) {
                return r[key];
              }
            }
          }
          return undefined;
        };

        // 1. Tipe (BUYING vs RECLASS)
        let rawTipeVal = findVal(['tipe', 'jenisharga', 'typeharga', 'kategori', 'jenis', 'mastertipe']);
        if (rawTipeVal === undefined) {
          for (const key of Object.keys(r)) {
            const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanKey.includes('buying') || cleanKey.includes('reclass') || (cleanKey.startsWith('tipe') && !cleanKey.includes('tembakau'))) {
              rawTipeVal = r[key];
              break;
            }
          }
        }
        const rawTipe = String(rawTipeVal || '').trim().toUpperCase();
        let tipe: 'BUYING' | 'RECLASS' = 'BUYING';
        if (rawTipe.includes('RECLASS') || rawTipe.includes('RC') || rawTipe === 'GRADING') {
          tipe = 'RECLASS';
        }

        // 2. Type (Tobacco Type, e.g. VIRGINIA, BURLEY, SC)
        const rawTypeVal = findVal(['type', 'jenistembakau', 'tipetembakau', 'tembakau']);
        const rawType = String(rawTypeVal || 'VIRGINIA').trim().toUpperCase() || 'VIRGINIA';

        // 3. Sub Type (e.g. LOKAL, RKS, etc.)
        const rawSubTypeVal = findVal(['subtype', 'sub_type', 'subtipe', 'varietas', 'asal']);
        const rawSubType = String(rawSubTypeVal || 'LOKAL').trim().toUpperCase() || 'LOKAL';

        // 4. Crop Year (e.g. 2026)
        const rawCropYearVal = findVal(['cropyear', 'crop_year', 'tahun', 'musim', 'tahunpanen']);
        const rawCropYear = String(rawCropYearVal || '2026').trim().toUpperCase() || '2026';

        // 5. Grade
        const rawGradeVal = findVal(['grade', 'gradebuying', 'gradereclass', 'mutu', 'kualitas']);
        const rawGrade = String(rawGradeVal || '').trim().toUpperCase();

        // 6. Harga (e.g. 'Harga (Rp/kg)', 'Harga', 'Price', 'Tarif', etc.)
        let rawHargaVal = findVal([
          'hargarpkg', 'hargaperkg', 'hargakg', 'hargarp', 'harga', 
          'hargabeli', 'hargareclass', 'hargagrade', 'hargatembakau',
          'priceperkg', 'pricerpkg', 'pricekg', 'pricerp', 'price', 
          'tarifperkg', 'tarifkg', 'tarif', 'nilaiperkg', 'nilaikg', 'nilai',
          'rpkg', 'rp'
        ]);

        if (rawHargaVal === undefined) {
          for (const key of Object.keys(r)) {
            const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            if (
              cleanKey.includes('harga') || 
              cleanKey.includes('price') || 
              cleanKey.includes('tarif') || 
              cleanKey.includes('nilai') || 
              cleanKey.startsWith('rp') ||
              cleanKey.includes('rpkg')
            ) {
              rawHargaVal = r[key];
              break;
            }
          }
        }

        const numericHarga = parseCleanPrice(rawHargaVal);

        let isValid = true;
        let validationError = '';

        if (!rawGrade) {
          isValid = false;
          validationError = 'Grade tidak boleh kosong';
        } else if (numericHarga <= 0) {
          isValid = false;
          validationError = 'Harga harus angka > 0';
        }

        const itemKey = `${tipe}_${rawType}_${rawSubType}_${rawCropYear}_${rawGrade}`;
        const isExisting = existingKeySet.has(itemKey);

        rows.push({
          rowNum,
          tipe,
          type: rawType,
          subType: rawSubType,
          cropYear: rawCropYear,
          grade: rawGrade,
          harga: numericHarga,
          isExisting,
          isValid,
          validationError: validationError || undefined
        });
      });

      setParsedRows(rows);
    } catch (err: any) {
      setErrorMsg(`Gagal membaca file: ${err.message || 'Format tidak didukung'}`);
      setParsedRows([]);
    } finally {
      setLoadingFile(false);
    }
  };

  const handleResetFile = () => {
    setFileName('');
    setParsedRows([]);
    setErrorMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const validRows = useMemo(() => parsedRows.filter(r => r.isValid), [parsedRows]);
  const invalidRows = useMemo(() => parsedRows.filter(r => !r.isValid), [parsedRows]);
  const newRowsCount = useMemo(() => validRows.filter(r => !r.isExisting).length, [validRows]);
  const updateRowsCount = useMemo(() => validRows.filter(r => r.isExisting).length, [validRows]);

  const buyingCount = useMemo(() => validRows.filter(r => r.tipe === 'BUYING').length, [validRows]);
  const reclassCount = useMemo(() => validRows.filter(r => r.tipe === 'RECLASS').length, [validRows]);

  const displayedRows = useMemo(() => {
    if (filterTab === 'BUYING') return parsedRows.filter(r => r.tipe === 'BUYING');
    if (filterTab === 'RECLASS') return parsedRows.filter(r => r.tipe === 'RECLASS');
    if (filterTab === 'invalid') return parsedRows.filter(r => !r.isValid);
    return parsedRows;
  }, [parsedRows, filterTab]);

  const handleExecuteImport = () => {
    if (validRows.length === 0) {
      setErrorMsg('Tidak ada baris valid untuk diimpor.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const itemsToImport: ImportMasterPriceItem[] = validRows.map(r => ({
        tipe: r.tipe,
        type: r.type,
        subType: r.subType,
        cropYear: r.cropYear,
        grade: r.grade,
        harga: r.harga
      }));

      const res = apiImportMasterPrice(itemsToImport, importMode);
      if (res.success) {
        onSuccess(res.total);
        onClose();
      } else {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg(`Terjadi kesalahan saat menyimpan data: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center font-bold">
              <DollarSign size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">
                Import Master Harga (Buying &amp; Reclass)
              </h3>
              <p className="text-xs text-slate-400">
                Upload data harga tembakau massal via Excel (.xlsx / .xls) atau CSV
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Action Header: Download Template & Info */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="font-extrabold text-amber-900 flex items-center gap-1.5">
                <FileSpreadsheet size={16} className="text-amber-600" />
                Format Kolom Excel:
              </div>
              <p className="text-amber-800 text-[11px] leading-relaxed">
                <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 font-bold">Tipe</span> (BUYING / RECLASS), <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 font-bold">Type</span> (VIRGINIA), <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 font-bold">Sub Type</span> (LOKAL), <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 font-bold">Crop Year</span> (2026), <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 font-bold">Grade</span>, <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 font-bold">Harga (Rp/kg)</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadMasterPriceImportTemplate}
              className="px-3.5 py-2 bg-white hover:bg-amber-100/60 border border-amber-300 text-amber-900 font-bold rounded-xl flex items-center gap-1.5 transition shadow-2xs whitespace-nowrap active:scale-95 cursor-pointer text-xs"
            >
              <Download size={14} className="text-amber-700" />
              Download Template
            </button>
          </div>

          {/* Upload Area */}
          {!fileName ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 hover:border-amber-400 bg-slate-50/50 hover:bg-amber-50/20 rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-amber-500 group-hover:border-amber-200 transition">
                <Upload size={22} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700 group-hover:text-amber-700">
                  Klik untuk memilih file Excel / CSV, atau seret file ke sini
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Mendukung file .xlsx, .xls, atau .csv (Bisa memuat ribuan baris harga sekaligus)
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center font-bold">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block truncate max-w-sm sm:max-w-md">
                    {fileName}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {parsedRows.length} baris terdeteksi ({validRows.length} valid, {invalidRows.length} invalid)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetFile}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                title="Ganti File"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2 font-medium">
              <AlertTriangle size={15} className="text-rose-500 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Import Mode Settings */}
          {parsedRows.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-2 text-xs">
              <span className="font-extrabold text-slate-700 block">Metode Penyimpanan Import:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${importMode === 'update_or_insert' ? 'bg-white border-amber-400 shadow-2xs' : 'border-slate-200 opacity-70'}`}>
                  <input
                    type="radio"
                    name="importMode"
                    value="update_or_insert"
                    checked={importMode === 'update_or_insert'}
                    onChange={() => setImportMode('update_or_insert')}
                    className="mt-0.5 text-amber-500 focus:ring-amber-400"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Update &amp; Tambah Baru (Rekomendasi)</span>
                    <span className="text-[11px] text-slate-500 block leading-tight">
                      Perbarui harga untuk grade yang sudah ada, dan tambahkan grade baru jika belum terdaftar.
                    </span>
                  </div>
                </label>

                <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${importMode === 'replace_all' ? 'bg-white border-rose-400 shadow-2xs' : 'border-slate-200 opacity-70'}`}>
                  <input
                    type="radio"
                    name="importMode"
                    value="replace_all"
                    checked={importMode === 'replace_all'}
                    onChange={() => setImportMode('replace_all')}
                    className="mt-0.5 text-rose-500 focus:ring-rose-400"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Ganti Semua (Replace All)</span>
                    <span className="text-[11px] text-slate-500 block leading-tight">
                      Hapus seluruh daftar harga master sebelumnya, ganti 100% dengan data dari file ini.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Parsed Rows Preview */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              {/* Tab Filters and Statistics */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setFilterTab('all')}
                    className={`px-3 py-1 rounded-lg font-bold transition ${filterTab === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Semua ({parsedRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('BUYING')}
                    className={`px-3 py-1 rounded-lg font-bold transition ${filterTab === 'BUYING' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Buying ({buyingCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('RECLASS')}
                    className={`px-3 py-1 rounded-lg font-bold transition ${filterTab === 'RECLASS' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Reclass ({reclassCount})
                  </button>
                  {invalidRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterTab('invalid')}
                      className={`px-3 py-1 rounded-lg font-bold transition ${filterTab === 'invalid' ? 'bg-rose-600 text-white' : 'text-rose-600 hover:bg-rose-50'}`}
                    >
                      Bermasalah ({invalidRows.length})
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <b>{newRowsCount}</b> Baru
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <b>{updateRowsCount}</b> Update
                  </span>
                  {invalidRows.length > 0 && (
                    <span className="flex items-center gap-1 text-rose-600 font-bold">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      {invalidRows.length} Invalid
                    </span>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="border border-slate-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-50 text-slate-400 font-bold sticky top-0 border-b border-slate-100">
                    <tr>
                      <th className="px-3 py-2 w-12 text-center">Baris</th>
                      <th className="px-3 py-2">Tipe</th>
                      <th className="px-3 py-2">Type / Sub / Crop</th>
                      <th className="px-3 py-2">Grade</th>
                      <th className="px-3 py-2 text-right">Harga (Rp/kg)</th>
                      <th className="px-3 py-2 text-center w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedRows.map((r, i) => (
                      <tr 
                        key={i} 
                        className={`hover:bg-slate-50/50 ${!r.isValid ? 'bg-rose-50/40 text-rose-900' : ''}`}
                      >
                        <td className="px-3 py-2 text-center font-mono text-slate-400">{r.rowNum}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${r.tipe === 'RECLASS' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-teal-100 text-teal-800 border border-teal-200'}`}>
                            {r.tipe}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-600">
                          {r.type} / {r.subType} ({r.cropYear})
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-800">
                          {r.grade || <span className="text-rose-500 italic">Kosong</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">
                          {r.harga > 0 ? (
                            `Rp ${r.harga.toLocaleString('id-ID')}`
                          ) : (
                            <span className="text-rose-500 italic">0 / Invalid</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {!r.isValid ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700" title={r.validationError}>
                              {r.validationError || 'Invalid'}
                            </span>
                          ) : r.isExisting ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              Update Harga
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Grade Baru
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
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {validRows.length > 0 ? (
              <span>
                Siap memproses <b>{validRows.length} grade</b> ({newRowsCount} baru, {updateRowsCount} update)
              </span>
            ) : (
              <span>Pilih file Excel untuk melihat preview data harga</span>
            )}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 sm:flex-none px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs transition"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={validRows.length === 0 || isSubmitting}
              className="flex-1 sm:flex-none px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  Menyimpan ke Master...
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  Import {validRows.length} Harga
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
