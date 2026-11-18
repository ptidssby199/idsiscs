import React, { useState, useEffect, useRef } from 'react';
import {
  apiGetReclassOperators,
  apiGetMasterPrice,
  apiGetAvailableBarcodesForReclass,
  apiAddReclass,
  apiGetReclassList,
  getSettingValue,
  getTodayDateString
} from '../db';
import { ReclassRow, MasterPrice } from '../types';
import { BarcodeSvg } from './BarcodeSvg';
import { RefreshCw, Search, Layers, CheckSquare, Plus, ArrowLeft, ArrowRight, Printer, X, Calendar, FileSpreadsheet } from 'lucide-react';
import { ImportReclassModal } from './ImportReclassModal';

interface ReclassProps {
  currentUser: any;
  onReclassSaved?: () => void;
}

interface ReclassGridItem {
  id: string;
  noBarcode: string;
  gradeBuying: string;
  beratNetto: string;
  gradeReclass: string;
  isMatched: boolean;
  isSaved: boolean;
  statusText: string;
  isError: boolean;
}

const PAGE_SIZE = 9;

export const Reclass: React.FC<ReclassProps> = ({ currentUser, onReclassSaved }) => {
  const prName = getSettingValue('ActivePrinterName', 'Zebra GK420t Thermal Label Printer');
  const customPrName = getSettingValue('CustomPrinterName', '');
  const activePrinterName = prName === 'CUSTOM' ? (customPrName || 'Printer Kustom') : prName;

  const [operators, setOperators] = useState<any[]>([]);
  const [prices, setPrices] = useState<MasterPrice[]>([]);
  const [availableBarcodes, setAvailableBarcodes] = useState<any[]>([]);
  const [reclassHistory, setReclassHistory] = useState<ReclassRow[]>([]);

  // Header fields
  const [operator, setOperator] = useState('');
  const [tanggalReclass, setTanggalReclass] = useState<string>(() => getTodayDateString());
  const [type, setType] = useState('');
  const [subType, setSubType] = useState('');
  const [cropYear, setCropYear] = useState('');

  // Grid scan lists
  const [gridItems, setGridItems] = useState<ReclassGridItem[]>([]);
  const [rowCounter, setGridRowCounter] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [gridSearch, setGridSearch] = useState('');

  // Print Label state
  const [printItems, setPrintItems] = useState<any[]>([]);
  const [previewItems, setPreviewItems] = useState<any[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const handleOpenPreview = (items: any[]) => {
    const compName = getSettingValue('PrePrintCompanyName', 'PT INDO DEWATA SEMESTA');
    const formatted = items.map(it => ({
      ...it,
      companyName: compName,
      kodeSumber: it.kodeSumber || getSettingValue('BarcodeSumber', 'LB')
    }));
    setPreviewItems(formatted);
    setShowPreviewModal(true);
  };

  // Search History
  const [historySearch, setHistorySearch] = useState('');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  // Import Modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // References to focus elements
  const barcodeRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const gradeRefs = useRef<Record<string, HTMLSelectElement | null>>({});

  const showToast = (text: string, type: 'ok' | 'err') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadInitialData = () => {
    // Operators
    const resOps = apiGetReclassOperators();
    if (resOps.success && resOps.operators) {
      setOperators(resOps.operators);
      if (currentUser && resOps.operators.some((o: any) => o.username === currentUser.username)) {
        setOperator(currentUser.username);
      }
    }

    // Master prices
    const prs = apiGetMasterPrice().filter(p => p.Tipe === 'RECLASS');
    setPrices(prs);

    // Initializing options
    const types = Array.from(new Set(prs.map(p => p.Type || '')));
    if (types.length > 0) {
      const initialType = types[0];
      setType(initialType);
      
      const subTypes = Array.from(new Set(prs.filter(p => p.Type === initialType).map(p => p.SubType || '')));
      if (subTypes.length > 0) {
        const initialSubType = subTypes[0];
        setSubType(initialSubType);

        const cropYears = Array.from(new Set(prs.filter(p => p.Type === initialType && p.SubType === initialSubType).map(p => p.CropYear || '')));
        if (cropYears.length > 0) {
          setCropYear(cropYears[0]);
        }
      }
    }
  };

  const loadSourcesAndHistory = () => {
    const list = apiGetAvailableBarcodesForReclass();
    setAvailableBarcodes(list);

    const hist = apiGetReclassList();
    setReclassHistory(hist);
  };

  useEffect(() => {
    loadInitialData();
    loadSourcesAndHistory();
  }, []);

  useEffect(() => {
    const handleDbUpdate = () => {
      loadInitialData();
      loadSourcesAndHistory();
    };
    window.addEventListener('iscs-db-update', handleDbUpdate);
    return () => {
      window.removeEventListener('iscs-db-update', handleDbUpdate);
    };
  }, []);

  // Header change cascade logic
  const handleTypeChange = (newVal: string) => {
    setType(newVal);
    const subTypes = Array.from(new Set(prices.filter(p => p.Type === newVal).map(p => p.SubType || '')));
    if (subTypes.length > 0) {
      const firstSub = subTypes[0];
      setSubType(firstSub);
      const cropYears = Array.from(new Set(prices.filter(p => p.Type === newVal && p.SubType === firstSub).map(p => p.CropYear || '')));
      if (cropYears.length > 0) {
        setCropYear(cropYears[0]);
      } else {
        setCropYear('');
      }
    } else {
      setSubType('');
      setCropYear('');
    }
  };

  const handleSubTypeChange = (newVal: string) => {
    setSubType(newVal);
    const cropYears = Array.from(new Set(prices.filter(p => p.Type === type && p.SubType === newVal).map(p => p.CropYear || '')));
    if (cropYears.length > 0) {
      setCropYear(cropYears[0]);
    } else {
      setCropYear('');
    }
  };

  // Header completion trigger
  const isHeaderFilled = () => {
    return !!(operator && type && subType && cropYear);
  };

  useEffect(() => {
    if (isHeaderFilled() && gridItems.length === 0) {
      addGridRow();
    }
  }, [operator, type, subType, cropYear]);

  // Grid mechanics
  const addGridRow = () => {
    if (!isHeaderFilled()) return;
    const nextId = rowCounter + 1;
    setGridRowCounter(nextId);
    const rowId = `rcrow-${nextId}`;

    const newRow: ReclassGridItem = {
      id: rowId,
      noBarcode: '',
      gradeBuying: '',
      beratNetto: '',
      gradeReclass: '',
      isMatched: false,
      isSaved: false,
      statusText: 'Menunggu',
      isError: false
    };

    setGridItems(prev => [...prev, newRow]);
    
    // Auto jump to the last page where the new row is added
    setTimeout(() => {
      const filteredCount = getFilteredGridRows().length + 1;
      const totalPages = Math.ceil(filteredCount / PAGE_SIZE);
      setCurrentPage(Math.max(0, totalPages - 1));
      
      // Auto focus on the new barcode input
      setTimeout(() => {
        barcodeRefs.current[rowId]?.focus();
      }, 50);
    }, 10);
  };

  const removeGridRow = (rowId: string) => {
    const item = gridItems.find(it => it.id === rowId);
    if (item?.isSaved) {
      showToast('Baris yang sudah tersimpan tidak bisa dihapus dari sini.', 'err');
      return;
    }
    if (gridItems.length <= 1) {
      showToast('Minimal harus ada satu baris.', 'err');
      return;
    }
    setGridItems(prev => prev.filter(it => it.id !== rowId));
  };

  const handleBarcodeChange = (rowId: string, val: string) => {
    setGridItems(prev =>
      prev.map(it => {
        if (it.id === rowId) {
          return {
            ...it,
            noBarcode: val,
            gradeBuying: '',
            beratNetto: '',
            gradeReclass: '',
            isMatched: false,
            isError: false
          };
        }
        return it;
      })
    );
  };

  const triggerMatchBarcode = (rowId: string) => {
    const item = gridItems.find(it => it.id === rowId);
    if (!item) return;

    const code = item.noBarcode.trim().toUpperCase();
    if (!code) return;

    // Search available barcodes from buying list
    const matched = availableBarcodes.find(r => r.noBarcode.toUpperCase() === code);

    if (!matched) {
      setGridItems(prev =>
        prev.map(it => {
          if (it.id === rowId) {
            return { ...it, isError: true, gradeBuying: '', beratNetto: '' };
          }
          return it;
        })
      );
      showToast(`Barcode "${code}" tidak ditemukan di stock buying.`, 'err');
      return;
    }

    setGridItems(prev =>
      prev.map(it => {
        if (it.id === rowId) {
          const matchWarning = (matched.type !== type || matched.subType !== subType || matched.cropYear !== cropYear);
          return {
            ...it,
            noBarcode: matched.noBarcode,
            gradeBuying: matched.gradeBuying + (matchWarning ? ' *(beda header)' : ''),
            beratNetto: Number(matched.beratNetto).toFixed(2),
            isMatched: true,
            isError: false
          };
        }
        return it;
      })
    );

    // Auto shift focus to the Grade Reclass dropdown
    setTimeout(() => {
      gradeRefs.current[rowId]?.focus();
    }, 50);
  };

  const handleGradeReclassChange = (rowId: string, gradeReclass: string) => {
    if (!gradeReclass) return;

    const item = gridItems.find(it => it.id === rowId);
    if (!item) return;

    const noBarcode = item.noBarcode.trim().toUpperCase();
    const beratNetto = Number(item.beratNetto) || 0;

    // Mark as saving
    setGridItems(prev =>
      prev.map(it => {
        if (it.id === rowId) {
          return { ...it, gradeReclass, statusText: 'Menyimpan...' };
        }
        return it;
      })
    );

    // Synchronous execution on DB
    const res = apiAddReclass({
      noBarcode,
      gradeReclass,
      beratNetto,
      inputBy: operator,
      customDate: tanggalReclass
    });

    if (res.success && res.data) {
      setGridItems(prev =>
        prev.map(it => {
          if (it.id === rowId) {
            return { ...it, isSaved: true, statusText: 'Tersimpan' };
          }
          return it;
        })
      );
      showToast(res.message || 'Reclass tersimpan.', 'ok');

      // Auto-trigger printing label
      handleOpenPreview([{
        noBarcode: res.data.noBarcode,
        gradeReclass: res.data.gradeReclass,
        beratNetto: res.data.beratNetto,
        type: res.data.type,
        subType: res.data.subType,
        kodeSumber: res.data.kodeSumber,
        tanggal: res.data.tanggal || res.data.timestamp || tanggalReclass
      }]);

      // Reload
      loadSourcesAndHistory();
      if (onReclassSaved) onReclassSaved();

      // Automatically append a new row
      addGridRow();
    } else {
      showToast(res.message || 'Gagal menyimpan reclass.', 'err');
      setGridItems(prev =>
        prev.map(it => {
          if (it.id === rowId) {
            return { ...it, statusText: 'Menunggu', gradeReclass: '' };
          }
          return it;
        })
      );
    }
  };

  // Label Printing triggers
  const triggerPrint = (items: any[]) => {
    const compName = getSettingValue('PrePrintCompanyName', 'PT INDO DEWATA SEMESTA');
    const formatted = items.map(it => ({
      ...it,
      companyName: compName,
      kodeSumber: it.kodeSumber || getSettingValue('BarcodeSumber', 'LB')
    }));

    setPrintItems(formatted);
    document.body.classList.add('label-print-mode');

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('label-print-mode');
        setPrintItems([]);
      }, 500);
    }, 250);
  };

  const handleReprintHistory = (row: ReclassRow) => {
    handleOpenPreview([{
      noBarcode: row.NoBarcode,
      gradeReclass: row.GradeReclass,
      beratNetto: row.BeratNetto,
      type: row.Type,
      subType: row.SubType,
      kodeSumber: row.KodeSumber,
      tanggal: row.Timestamp
    }]);
  };

  // Searching grid rows
  const getFilteredGridRows = () => {
    const q = gridSearch.trim().toLowerCase();
    if (!q) return gridItems;
    return gridItems.filter(it => it.noBarcode.toLowerCase().includes(q));
  };

  const getPaginatedGridRows = () => {
    const filtered = getFilteredGridRows();
    const startIdx = currentPage * PAGE_SIZE;
    return filtered.slice(startIdx, startIdx + PAGE_SIZE);
  };

  const totalGridPages = Math.max(1, Math.ceil(getFilteredGridRows().length / PAGE_SIZE));

  // Search History List
  const filteredHistory = reclassHistory.filter(r => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return true;
    return r.NoBarcode.toLowerCase().includes(q) || r.NoReclass.toLowerCase().includes(q);
  });

  // Available grades
  const availableSubTypes = Array.from(new Set(prices.filter(p => p.Type === type).map(p => p.SubType || '')));
  const availableCropYears = Array.from(new Set(prices.filter(p => p.Type === type && p.SubType === subType).map(p => p.CropYear || '')));

  const availableGrades = prices.filter(
    p => p.Type === type && p.SubType === subType && p.CropYear === cropYear
  );

  const formatTanggal = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    } catch (e) {}
    return isoStr;
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-4 rounded-xl shadow-xl font-bold flex items-center gap-3 text-sm text-white ${toastMsg.type === 'ok' ? 'bg-emerald-600 border-l-4 border-emerald-300' : 'bg-rose-600 border-l-4 border-rose-300'}`}>
          {toastMsg.text}
        </div>
      )}

      {/* Interactive Print Preview Modal */}
      {showPreviewModal && previewItems.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 flex flex-col transform transition-all duration-300 scale-100">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <Printer className="text-amber-500" size={18} />
                  Preview Cetak Label
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Silakan cek detail label barcode sebelum dicetak.
                </p>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-200/60 rounded-full transition"
                title="Tutup"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body: Custom styled virtual label */}
            <div className="p-6 bg-slate-100/60 flex flex-col items-center justify-center gap-4">
              {previewItems.map((it, i) => (
                <div
                  key={i}
                  className="bg-white shadow-lg border border-slate-200 rounded-xl p-5 w-[360px] h-[235px] flex flex-col justify-between font-sans text-slate-800 select-none relative overflow-hidden"
                >
                  {/* Subtle paper texture overlay */}
                  <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]" />

                  <div className="relative">
                    {/* Top Barcode */}
                    <div className="flex justify-center mb-1">
                      <BarcodeSvg value={it.noBarcode} height={45} fontSize={10} displayValue={false} margin={0} width={1.8} />
                    </div>
                    {/* Barcode Text */}
                    <div className="font-mono text-[11px] font-bold text-center tracking-widest text-slate-900 leading-none">
                      {it.noBarcode}
                    </div>

                    {/* Source & Date Info */}
                    <div className="mt-3 flex justify-between text-[11px] border-b border-dashed border-slate-200 pb-1.5">
                      <div>
                        <span className="text-slate-400">Source:</span>{' '}
                        <span className="font-bold text-slate-800">{it.kodeSumber || '-'}</span>
                      </div>
                      <div className="text-slate-500 font-medium">
                        {formatTanggal(it.tanggal)}
                      </div>
                    </div>
                  </div>

                  {/* Weight and Grade Row */}
                  <div className="relative flex items-end justify-between mt-2">
                    {/* Weight Label */}
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Berat Netto</span>
                      <div className="font-black text-xl text-slate-900 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded leading-none flex items-baseline gap-1 mt-0.5 shadow-sm">
                        {Number(it.beratNetto || 0).toFixed(1)}{' '}
                        <span className="text-[10px] font-extrabold text-amber-600">KG</span>
                      </div>
                    </div>

                    {/* Grade Reclass & Barcode */}
                    <div className="flex flex-col items-end w-1/2">
                      <div className="flex justify-center w-full">
                        <BarcodeSvg value={it.gradeReclass} height={30} fontSize={9} displayValue={false} margin={0} width={1.5} />
                      </div>
                      <div className="text-sm font-black text-slate-900 tracking-wider uppercase mt-1 leading-none text-right w-full truncate">
                        {it.gradeReclass}
                      </div>
                    </div>
                  </div>

                  {/* Company Name footer */}
                  <div className="relative border-t border-slate-100 pt-2 flex items-center justify-between text-[9px] font-bold text-slate-400 tracking-wider font-mono">
                    <span className="uppercase truncate">{it.companyName || ''}</span>
                    <span className="text-slate-300 font-light">THERMAL LABEL</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold font-sans">
                <Printer size={12} className="text-amber-500 shrink-0" />
                <span className="truncate max-w-[150px]" title={activePrinterName}>Printer: {activePrinterName}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-600 font-bold rounded-xl text-xs border border-slate-200 shadow-sm transition"
                >
                  Tutup / Selesai
                </button>
                <button
                  type="button"
                  onClick={() => triggerPrint(previewItems)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold rounded-xl text-xs shadow-sm transition flex items-center gap-1.5"
                >
                  <Printer size={14} />
                  Cetak ke Printer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Print Container for thermal Zebra printer reclass labels */}
      {printItems.length > 0 && (
        <div id="labelPrintArea" className="block absolute left-0 top-0 z-[9999] bg-white">
          {printItems.map((it, i) => (
            <div key={i} className="rc-label w-[10cm] h-[6.5cm] box-sizing-border-box px-[6mm] py-[2mm] flex flex-col page-break-after border border-transparent">
              <div className="rl-barcode-wrap mb-1">
                <BarcodeSvg value={it.noBarcode} height={60} fontSize={12} displayValue={false} margin={0} width={2} />
              </div>
              <div className="rl-nobarcode font-mono text-[11px] font-bold text-black tracking-wider leading-none">
                {it.noBarcode}
              </div>
              <div className="rl-source text-[11px] mt-1 font-semibold text-black">
                Source: <b>{it.kodeSumber || '-'}</b>
              </div>
              <div className="rl-date text-[11px] mt-1 font-medium text-slate-500">
                {it.tanggal}
              </div>
              
              <div className="rl-second-row flex items-end gap-2.5 mt-2">
                <div className="rl-netto font-black text-lg text-black bg-slate-100 border border-slate-300 px-2 py-0.5 rounded leading-none">
                  {Number(it.beratNetto || 0).toFixed(1)} <span className="text-[10px] font-bold">KG</span>
                </div>
                <div className="rl-barcode2-wrap flex-1 min-w-0">
                  <BarcodeSvg value={it.gradeReclass} height={40} fontSize={11} displayValue={false} margin={0} width={2} />
                  <div className="rl-grade-text text-lg font-black text-black tracking-wider uppercase mt-1">
                    {it.gradeReclass}
                  </div>
                </div>
              </div>
              <div className="border-t border-black my-2" />
              <div className="rl-company font-mono text-[11px] font-bold text-black uppercase tracking-wider">
                {it.companyName || ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reclass Form */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <Layers size={18} className="text-amber-500" />
            Form Reclass
          </h3>
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition self-start sm:self-auto shadow-2xs cursor-pointer active:scale-95"
            title="Import data perubahan grade reclass dari Excel / CSV"
          >
            <FileSpreadsheet size={15} className="text-amber-600" />
            Import Excel / CSV
          </button>
        </div>

        {/* Info Session Box */}
        <div className="p-4 rounded-xl text-xs flex gap-3 items-start bg-slate-50 border border-slate-100 text-slate-500">
          <CheckSquare size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
          <p className="leading-relaxed">
            Pilihlah <b>User yang Reclass</b> dan <b>Type/Sub-Type/CropYear</b> terlebih dahulu. 
            Setelah header lengkap, Anda dapat memindai (scan) No Barcode di baris. Setelah barcode dicocokkan, tentukan <b>Grade Reclass</b> &mdash; data otomatis disimpan ke DB, label dicetak, dan baris pemindaian baru ditambahkan.
          </p>
        </div>

        {/* Header selections */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">User yang Reclass</label>
            <select
              value={operator}
              onChange={e => setOperator(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
            >
              <option value="">- Pilih User -</option>
              {operators.map(o => (
                <option key={o.username} value={o.username}>{o.nama}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase">
                Tgl Reclass
              </label>
              {tanggalReclass !== getTodayDateString() ? (
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
                value={tanggalReclass}
                onChange={e => setTanggalReclass(e.target.value)}
                className="w-full pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-700"
              />
              <Calendar size={13} className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
            </div>
            {tanggalReclass !== getTodayDateString() && (
              <button
                type="button"
                onClick={() => setTanggalReclass(getTodayDateString())}
                className="text-[10px] text-amber-700 hover:underline font-bold mt-1 inline-block"
              >
                Reset ke Hari ini
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Type</label>
            <select
              value={type}
              onChange={e => handleTypeChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="">- Pilih Type -</option>
              {Array.from(new Set(prices.map(p => p.Type || ''))).map(t => (
                <option key={t} value={t}>{t || '(Umum)'}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Sub Type</label>
            <select
              value={subType}
              onChange={e => handleSubTypeChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="">- Pilih Sub Type -</option>
              {availableSubTypes.map(s => (
                <option key={s} value={s}>{s || '(Umum)'}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Crop Year</label>
            <select
              value={cropYear}
              onChange={e => setCropYear(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="">- Pilih Crop Year -</option>
              {availableCropYears.map(c => (
                <option key={c} value={c}>{c || '(Umum)'}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Access lock state */}
        {!isHeaderFilled() ? (
          <div className="bg-slate-100 border border-slate-200 p-6 text-center text-xs font-medium text-slate-500 rounded-xl">
            Harap isi <b>User yang Reclass</b>, <b>Type</b>, <b>Sub Type</b>, dan <b>Crop Year</b> di atas terlebih dahulu untuk membuka form scan barcode.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pindai / Masukkan Barcode</h4>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={gridSearch}
                  onChange={e => { setGridSearch(e.target.value); setCurrentPage(0); }}
                  placeholder="Cari barcode di baris ini..."
                  className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={addGridRow}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition"
                >
                  <Plus size={12} /> Tambah Baris
                </button>
              </div>
            </div>

            <div className="border border-slate-100 rounded-xl overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                    <th className="px-4 py-2.5 min-w-[220px]">No Barcode</th>
                    <th className="px-4 py-2.5 min-w-[150px]">Grade Buying (Asal)</th>
                    <th className="px-4 py-2.5 w-32">Netto (kg)</th>
                    <th className="px-4 py-2.5 min-w-[180px]">Grade Reclass</th>
                    <th className="px-4 py-2.5 w-24 text-center">Status</th>
                    <th className="px-4 py-2.5 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {getPaginatedGridRows().length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">
                        Tidak ada data yang cocok dengan pencarian.
                      </td>
                    </tr>
                  ) : (
                    getPaginatedGridRows().map(item => (
                      <tr key={item.id} className={`${item.isSaved ? 'bg-slate-50/50' : ''}`}>
                        {/* Barcode scan input */}
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            ref={el => (barcodeRefs.current[item.id] = el)}
                            disabled={item.isSaved}
                            value={item.noBarcode}
                            onChange={e => handleBarcodeChange(item.id, e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                triggerMatchBarcode(item.id);
                              }
                            }}
                            placeholder="Ketik/Scan No Barcode, lalu Enter"
                            className={`w-full px-2.5 py-1.5 bg-white border ${item.isError ? 'border-rose-400 bg-rose-50' : 'border-slate-200'} rounded focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold uppercase text-[11px]`}
                          />
                        </td>

                        {/* Grade Buying Display */}
                        <td className="px-4 py-2 font-bold text-slate-500 text-[11px]">
                          {item.gradeBuying || '-'}
                        </td>

                        {/* Netto Display */}
                        <td className="px-4 py-2 font-mono font-bold text-slate-500">
                          {item.beratNetto || '-'}
                        </td>

                        {/* Grade Reclass Selection */}
                        <td className="px-4 py-2">
                          <select
                            ref={el => (gradeRefs.current[item.id] = el)}
                            disabled={!item.isMatched || item.isSaved}
                            value={item.gradeReclass}
                            onChange={e => handleGradeReclassChange(item.id, e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            <option value="">- Pilih Grade Reclass -</option>
                            {availableGrades.map(g => (
                              <option key={g.GradeBuying} value={g.GradeBuying}>{g.GradeBuying}</option>
                            ))}
                          </select>
                        </td>

                        {/* Status Label */}
                        <td className="px-4 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${item.isSaved ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                            {item.statusText}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-2 text-center">
                          {!item.isSaved && (
                            <button
                              type="button"
                              onClick={() => removeGridRow(item.id)}
                              className="text-slate-400 hover:text-rose-500 p-1 hover:bg-slate-50 rounded transition"
                            >
                              &times;
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <button
                type="button"
                disabled={currentPage <= 0}
                onClick={() => setCurrentPage(p => p - 1)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition disabled:opacity-50"
              >
                <ArrowLeft size={12} /> Sebelumnya
              </button>
              <span className="text-[11px] font-semibold text-slate-500">
                Halaman {currentPage + 1} dari {totalGridPages} ({getFilteredGridRows().length} baris)
              </span>
              <button
                type="button"
                disabled={currentPage >= totalGridPages - 1}
                onClick={() => setCurrentPage(p => p + 1)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition disabled:opacity-50"
              >
                Berikutnya <ArrowRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* History table list */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
        <h3 className="text-md font-extrabold text-slate-800">Riwayat Reclass</h3>
        <div className="flex max-w-sm gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
              placeholder="Cari barcode / no reclass..."
            />
          </div>
          <button
            type="button"
            onClick={loadSourcesAndHistory}
            className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-600 transition"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="max-h-[500px] overflow-y-auto border border-slate-100 rounded-xl">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                <th className="px-4 py-2.5 text-xs uppercase">No Reclass</th>
                <th className="px-4 py-2.5 text-xs uppercase">No Barcode Asal</th>
                <th className="px-4 py-2.5 text-xs uppercase">Grade Asal</th>
                <th className="px-4 py-2.5 text-xs uppercase">Grade Reclass</th>
                <th className="px-4 py-2.5 text-xs uppercase text-right">Netto (kg)</th>
                <th className="px-4 py-2.5 text-xs uppercase text-center w-20">Status</th>
                <th className="px-4 py-2.5 text-xs uppercase w-24 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-xs">
                    Belum ada data reclass terdaftar.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 text-xs">
                    <td className="px-4 py-3 font-semibold text-slate-500 font-mono">{r.NoReclass}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold bg-slate-900 text-amber-500 px-2 py-0.5 rounded text-[10px] tracking-wider">
                        {r.NoBarcode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-bold font-mono">{r.GradeBuying}</td>
                    <td className="px-4 py-3 text-slate-800 font-black font-mono">{r.GradeReclass}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{Number(r.BeratNetto).toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${r.StatusShipping === 'SUDAH' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {r.StatusShipping === 'SUDAH' ? 'Shipped' : 'Belum'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleReprintHistory(r)}
                        className="px-2 py-1 border border-slate-200 hover:bg-slate-50 text-[10px] font-bold text-slate-700 rounded transition inline-flex items-center gap-1"
                      >
                        <Printer size={10} /> Cetak Ulang
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Reclass Modal */}
      <ImportReclassModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={(count) => {
          showToast(`Berhasil mengimpor ${count} data reclass!`, 'ok');
          loadSourcesAndHistory();
          if (onReclassSaved) onReclassSaved();
        }}
        currentUser={currentUser}
        masterPrices={prices}
      />
    </div>
  );
};
