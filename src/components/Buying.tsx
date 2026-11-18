import React, { useState, useEffect, useMemo } from 'react';
import {
  apiGetMasterPrice,
  generateBuyingBarcode,
  apiGenerateNoBuyingFunc,
  apiSaveBuyingBatch,
  apiGetBuyingList,
  apiGetBuyingGroups,
  apiGetBuyingSlip,
  apiGetPrePrintHistory,
  apiUpdateBuyingBatch,
  apiVoidBuyingBatch,
  apiIsBuyingShipped,
  getSettingValue,
  getTodayDateString
} from '../db';
import { MasterPrice, BuyingRow } from '../types';
import { BarcodeSvg } from './BarcodeSvg';
import { AdminPinModal } from './AdminPinModal';
import { ShoppingCart, Plus, Minus, Printer, CheckSquare, ListOrdered, Calendar, Search, Trash2, FileSpreadsheet, X } from 'lucide-react';
import { ImportBuyingModal } from './ImportBuyingModal';
import { DailyBuyingReport } from './DailyBuyingReport';

interface BuyingProps {
  currentUser: any;
  onBuyingSaved?: () => void;
}

interface GridItem {
  id: string;
  autoBarcode: boolean;
  noBarcode: string;
  gradeBuying: string;
  beratBruto: string;
  tare: string;
  beratNetto: number;
  isDuplicate?: boolean;
}

export const Buying: React.FC<BuyingProps> = ({ currentUser, onBuyingSaved }) => {
  const [prices, setPrices] = useState<MasterPrice[]>([]);
  const [buyingHistory, setBuyingHistory] = useState<BuyingRow[]>([]);
  const [buyingGroups, setBuyingGroups] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState('');

  // Header fields
  const [noBuyingDisplay, setNoBuyingDisplay] = useState('');
  const [namaPetani, setNamaPetani] = useState('');
  const [tanggalBuying, setTanggalBuying] = useState<string>(() => getTodayDateString());
  const [type, setType] = useState('');
  const [subType, setSubType] = useState('');
  const [cropYear, setCropYear] = useState('');

  // Grid list of bales
  const [gridItems, setGridItems] = useState<GridItem[]>([]);
  const [gridRowCounter, setGridRowCounter] = useState(0);

  // Print Slip state
  const [selectedNoBuying, setSelectedNoBuying] = useState('');
  const [activeSlip, setActiveSlip] = useState<any | null>(null);

  // Form Locking state
  const [isLocked, setIsFormLocked] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  // Import Modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDailyReportOpen, setIsDailyReportOpen] = useState(false);

  // Lookup, Editing, and Admin PIN states
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [adminPinOpen, setAdminPinOpen] = useState(false);
  const [lookupNoBuying, setLookupNoBuying] = useState('');
  const [adminActionType, setAdminActionType] = useState<'open' | 'void'>('open');

  // Konstanta Feature States
  const [isKonstantaActive, setIsKonstantaActive] = useState<boolean>(() => {
    const saved = localStorage.getItem('iscs_konstanta_active');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleKonstanta = () => {
    setIsKonstantaActive(prev => {
      const newVal = !prev;
      localStorage.setItem('iscs_konstanta_active', String(newVal));
      showToast(`Konstanta ${newVal ? 'DIHIDUPKAN' : 'DIMATIKAN'}`, 'ok');
      return newVal;
    });
  };

  // Listen to F6 Hotkey
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F6') {
        e.preventDefault();
        toggleKonstanta();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Recalculate weights when constant state changes
  useEffect(() => {
    const constantVal = Number(getSettingValue('KonstantaValue', '0.80')) || 0;
    setGridItems(prev => {
      return prev.map(item => {
        const bruto = Number(item.beratBruto) || 0;
        const tare = Number(item.tare) || 0;
        if (bruto === 0 && tare === 0) return item;
        const netto = isKonstantaActive ? Math.max(0, bruto - tare - constantVal) : Math.max(0, bruto - tare);
        return {
          ...item,
          beratNetto: Number(netto.toFixed(2))
        };
      });
    });
  }, [isKonstantaActive]);

  const fetchMasterData = () => {
    const prs = apiGetMasterPrice().filter(p => p.Tipe === 'BUYING');
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

  const fetchHistoryAndGroups = () => {
    const hist = apiGetBuyingList();
    setBuyingHistory([...hist].reverse()); // Newest first without mutating cache

    const grps = apiGetBuyingGroups();
    setBuyingGroups(grps);
    if (grps.length > 0) {
      setSelectedNoBuying(grps[0].noBuying);
    }
  };

  const showToast = (text: string, type: 'ok' | 'err') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  useEffect(() => {
    fetchMasterData();
    fetchHistoryAndGroups();
    startNewSession(false);
  }, []);

  useEffect(() => {
    const handleDbUpdate = () => {
      fetchMasterData();
      fetchHistoryAndGroups();
    };
    window.addEventListener('iscs-db-update', handleDbUpdate);
    return () => {
      window.removeEventListener('iscs-db-update', handleDbUpdate);
    };
  }, []);

  // Cascading dropdown logic
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

  // Grid actions
  const startNewSession = (manual = false) => {
    setNoBuyingDisplay('');
    setNamaPetani('');
    setTanggalBuying(getTodayDateString());
    setIsFormLocked(false);
    setIsEditingMode(false);
    setLookupNoBuying('');
    
    // Add first row
    const firstRowId = `byrow-1-${Math.random().toString(36).substring(2, 6)}`;
    setGridItems([
      {
        id: firstRowId,
        autoBarcode: true,
        noBarcode: '',
        gradeBuying: '',
        beratBruto: '',
        tare: '',
        beratNetto: 0
      }
    ]);
    setGridRowCounter(1);

    if (manual) showToast('Siap untuk transaksi buying baru.', 'ok');
  };

  const triggerOpenLookup = () => {
    const code = lookupNoBuying.trim().toUpperCase();
    if (!code) {
      showToast('Ketik No Buying terlebih dahulu.', 'err');
      return;
    }

    const buyingRows = getLocal<BuyingRow[]>('iscs_buying', []);
    const match = buyingRows.filter(b => b.NoBuying.toUpperCase() === code);
    if (match.length === 0) {
      showToast(`Transaksi Buying ${code} tidak ditemukan.`, 'err');
      return;
    }

    if (apiIsBuyingShipped(code)) {
      showToast(`Transaksi ini tidak bisa dibuka karena detailnya sudah di-shipping!`, 'err');
      return;
    }

    const invoiceRows = getLocal<any[]>('iscs_invoice', []);
    const activeInv = invoiceRows.find(inv => !inv.IsVoid && inv.NoBuying.toUpperCase() === code);
    if (activeInv) {
      showToast(`Transaksi ini tidak bisa dibuka karena sudah terbit Invoice: ${activeInv.NoInvoice}!`, 'err');
      return;
    }

    setAdminActionType('open');
    setAdminPinOpen(true);
  };

  const handleAdminPinSuccess = () => {
    setAdminPinOpen(false);
    
    if (adminActionType === 'open') {
      const code = lookupNoBuying.trim().toUpperCase();
      const buyingRows = getLocal<BuyingRow[]>('iscs_buying', []);
      const match = buyingRows.filter(b => b.NoBuying.toUpperCase() === code);
      if (match.length > 0) {
        setNoBuyingDisplay(code);
        setNamaPetani(match[0].NamaSupplier);
        if (match[0].Timestamp) {
          setTanggalBuying(match[0].Timestamp.slice(0, 10));
        }
        setType(match[0].Type || '');
        setSubType(match[0].SubType || '');
        setCropYear(match[0].CropYear || '');
        setIsFormLocked(false);
        setIsEditingMode(true);

        const loadedGrid: GridItem[] = match.map(b => ({
          id: `byrow-edit-${b.NoBarcode}`,
          autoBarcode: false,
          noBarcode: b.NoBarcode,
          gradeBuying: b.GradeBuying,
          beratBruto: String(b.BeratBruto),
          tare: String(b.Tare),
          beratNetto: b.BeratNetto
        }));
        setGridItems(loadedGrid);
        setGridRowCounter(loadedGrid.length + 1);
        showToast(`Transaksi ${code} berhasil dimuat untuk diedit.`, 'ok');
      }
    } else if (adminActionType === 'void') {
      const res = apiVoidBuyingBatch(noBuyingDisplay, currentUser?.username || '');
      if (res.success) {
        showToast(res.message, 'ok');
        startNewSession(false);
        fetchHistoryAndGroups();
        if (onBuyingSaved) onBuyingSaved();
      } else {
        showToast(res.message, 'err');
      }
    }
  };

  const getLocal = <T,>(key: string, fallback: T): T => {
    try {
      const data = localStorage.getItem(key);
      if (!data) return fallback;
      return JSON.parse(data) as T;
    } catch {
      return fallback;
    }
  };

  const addGridRow = (focusRowId?: string) => {
    if (isLocked) return;
    setGridRowCounter(prev => {
      const nextId = prev + 1;
      const rowId = focusRowId || `byrow-${nextId}-${Math.random().toString(36).substring(2, 6)}`;
      setGridItems(items => {
        // Prevent duplicate blank rows from being added
        const last = items[items.length - 1];
        if (last && last.beratBruto === '' && last.tare === '') {
          return items;
        }
        return [
          ...items,
          {
            id: rowId,
            autoBarcode: true,
            noBarcode: '',
            gradeBuying: '',
            beratBruto: '',
            tare: '',
            beratNetto: 0
          }
        ];
      });
      return nextId;
    });
  };

  const removeGridRow = (rowId: string) => {
    if (isLocked) return;
    if (gridItems.length <= 1) {
      showToast('Minimal harus ada satu baris bale.', 'err');
      return;
    }
    setGridItems(prev => prev.filter(it => it.id !== rowId));
  };

  const handleGridRowChange = (rowId: string, field: keyof GridItem, val: any) => {
    if (isLocked) return;
    
    setGridItems(prev => {
      return prev.map(item => {
        if (item.id === rowId) {
          const updatedItem = { ...item, [field]: val };
          
          // Re-calculate netto
          if (field === 'beratBruto' || field === 'tare') {
            const bruto = Number(updatedItem.beratBruto) || 0;
            const tare = Number(updatedItem.tare) || 0;
            const constantVal = Number(getSettingValue('KonstantaValue', '0.50')) || 0;
            const netto = isKonstantaActive ? Math.max(0, bruto - tare - constantVal) : Math.max(0, bruto - tare);
            updatedItem.beratNetto = Number(netto.toFixed(2));
          }

          // Auto-detect farmer name from PrePrint record if not already filled
          if (field === 'noBarcode' && typeof val === 'string' && val.trim().length >= 6) {
            const trimmed = val.trim().toUpperCase();
            const preprints = apiGetPrePrintHistory();
            const foundPre = preprints.find(p => p.NoBarcode && p.NoBarcode.toUpperCase() === trimmed);
            if (foundPre && !namaPetani.trim()) {
              setNamaPetani(foundPre.NamaPetani);
            }
          }

          return updatedItem;
        }
        return item;
      });
    });
  };

  // Re-validate barcodes for manual entries
  useEffect(() => {
    if (isLocked) return;
    const filteredHistory = isEditingMode && noBuyingDisplay
      ? buyingHistory.filter(b => b.NoBuying !== noBuyingDisplay)
      : buyingHistory;
    const historyBarcodes = new Set(filteredHistory.map(b => b.NoBarcode.toUpperCase()));
    
    setGridItems(prev => {
      const manualCounts: Record<string, number> = {};
      prev.forEach(it => {
        if (!it.autoBarcode && it.noBarcode.trim()) {
          const code = it.noBarcode.trim().toUpperCase();
          manualCounts[code] = (manualCounts[code] || 0) + 1;
        }
      });

      return prev.map(it => {
        if (!it.autoBarcode && it.noBarcode.trim()) {
          const code = it.noBarcode.trim().toUpperCase();
          const duplicate = historyBarcodes.has(code) || manualCounts[code] > 1;
          return { ...it, isDuplicate: duplicate };
        }
        return { ...it, isDuplicate: false };
      });
    });
  }, [buyingHistory, isLocked, gridItems.map(it => it.noBarcode).join(','), isEditingMode, noBuyingDisplay]);

  const handleSubmitBatch = () => {
    if (isLocked) {
      showToast('Sesi ini sudah tersimpan. Klik "Transaksi Baru" untuk petani berikutnya.', 'err');
      return;
    }
    if (!namaPetani.trim()) {
      showToast('Nama petani wajib diisi.', 'err');
      return;
    }
    if (!type || !subType || !cropYear) {
      showToast('Type, Sub Type, dan Crop Year wajib dipilih.', 'err');
      return;
    }

    // Filter empty trailing auto-added rows
    const activeItems = gridItems.filter((it, idx) => {
      // If it's the last row, and both bruto/tare are empty, skip it.
      if (idx === gridItems.length - 1 && it.beratBruto === '' && it.tare === '') {
        return false;
      }
      return true;
    });

    if (!activeItems.length) {
      showToast('Tambahkan minimal satu baris bale.', 'err');
      return;
    }

    // Check validation
    for (let i = 0; i < activeItems.length; i++) {
      const it = activeItems[i];
      const rowNo = i + 1;
      if (!it.gradeBuying) {
        showToast(`Baris ${rowNo}: Grade Buying wajib dipilih.`, 'err');
        return;
      }
      const bruto = Number(it.beratBruto) || 0;
      const tare = Number(it.tare) || 0;
      if (bruto <= 0) {
        showToast(`Baris ${rowNo}: Berat bruto harus lebih dari 0.`, 'err');
        return;
      }
      if (tare < 0 || tare >= bruto) {
        showToast(`Baris ${rowNo}: Tare tidak valid (harus lebih kecil dari bruto).`, 'err');
        return;
      }
      if (!it.autoBarcode && !it.noBarcode.trim()) {
        showToast(`Baris ${rowNo}: ketik No Barcode, atau centang Auto Barcode.`, 'err');
        return;
      }
      if (it.isDuplicate) {
        showToast(`Baris ${rowNo}: No Barcode manual sudah terdaftar/duplikat.`, 'err');
        return;
      }
    }

    const payload = {
      noBuying: noBuyingDisplay,
      namaSupplier: namaPetani.trim(),
      type,
      subType,
      cropYear,
      customDate: tanggalBuying,
      inputBy: currentUser ? currentUser.username : '',
      items: activeItems.map(it => ({
        autoBarcode: it.autoBarcode,
        noBarcode: it.noBarcode.trim().toUpperCase(),
        gradeBuying: it.gradeBuying,
        beratBruto: Number(it.beratBruto) || 0,
        tare: Number(it.tare) || 0,
        beratNetto: Number(it.beratNetto) || 0
      }))
    };

    if (isEditingMode) {
      const res = apiUpdateBuyingBatch(payload);
      if (res.success) {
        setIsFormLocked(true);
        showToast(res.message || 'Perubahan Buying berhasil disimpan.', 'ok');
        fetchHistoryAndGroups();
        if (onBuyingSaved) onBuyingSaved();
      } else {
        showToast(res.message || 'Gagal menyimpan perubahan.', 'err');
      }
    } else {
      const res = apiSaveBuyingBatch(payload);
      if (res.success) {
        setNoBuyingDisplay(res.noBuying);
        setIsFormLocked(true);
        showToast(res.message || 'Transaksi Buying tersimpan.', 'ok');
        fetchHistoryAndGroups();
        if (onBuyingSaved) onBuyingSaved();
      } else {
        showToast(res.message || 'Gagal menyimpan.', 'err');
      }
    }
  };

  const handlePreviewSlip = (noBuyingCode: string) => {
    if (!noBuyingCode) {
      showToast('Pilih No Buying terlebih dahulu.', 'err');
      return;
    }
    const res = apiGetBuyingSlip(noBuyingCode);
    if (res.success && res.slip) {
      setActiveSlip(res.slip);
    } else {
      showToast(res.message || 'Gagal mengambil detail slip.', 'err');
    }
  };

  const printActiveSlip = () => {
    document.body.classList.add('invoice-print-mode');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('invoice-print-mode');
    }, 500);
  };

  const closeSlipModal = () => {
    setActiveSlip(null);
  };

  // Header available values
  const availableTypes = Array.from(new Set(prices.map(p => p.Type || '')));
  const availableSubTypes = Array.from(new Set(prices.filter(p => p.Type === type).map(p => p.SubType || '')));
  const availableCropYears = Array.from(new Set(prices.filter(p => p.Type === type && p.SubType === subType).map(p => p.CropYear || '')));

  // Selected grade list matching header
  const availableGrades = prices.filter(
    p => p.Type === type && p.SubType === subType && p.CropYear === cropYear
  );

  const totalBales = gridItems.filter(it => it.beratBruto !== '' || it.tare !== '').length;
  const totalNetto = gridItems.reduce((acc, it) => acc + (it.beratNetto || 0), 0);

  return (
    <div className="space-y-6">
      {/* Toast alert */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-4 rounded-xl shadow-xl font-bold flex items-center gap-3 text-sm text-white ${toastMsg.type === 'ok' ? 'bg-emerald-600 border-l-4 border-emerald-300' : 'bg-rose-600 border-l-4 border-rose-300'}`}>
          {toastMsg.text}
        </div>
      )}

      {/* Slip Modal Preview */}
      {activeSlip && (
        <div className="fixed inset-0 z-[999] bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-md font-extrabold text-slate-800">Preview Slip Timbang</h3>
              <button onClick={closeSlipModal} className="text-slate-400 hover:text-slate-600 text-lg font-bold">&times;</button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1">
              <div id="printArea" className="print-doc space-y-6 font-sans text-slate-800">
                <div className="text-center border-b border-slate-200 pb-4">
                  <h1 className="text-2xl font-black tracking-tight text-slate-800 uppercase">
                    Slip Timbang Buying
                  </h1>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    No Buying: <b className="text-slate-800 text-sm tracking-wider font-bold font-mono">{activeSlip.noBuying}</b>
                  </p>
                </div>

                <div className="grid grid-cols-2 text-xs leading-relaxed">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Petani / Supplier</span>
                    <span className="text-sm font-bold text-slate-800">{activeSlip.namaSupplier}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Tanggal Transaksi</span>
                    <span className="text-xs font-mono font-bold text-slate-700">{activeSlip.tanggal}</span>
                  </div>
                </div>

                <table className="w-full border-collapse border border-slate-200 text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <th className="border border-slate-200 px-3 py-2 text-center w-12">No</th>
                      <th className="border border-slate-200 px-3 py-2">No Barcode</th>
                      <th className="border border-slate-200 px-3 py-2 text-center">Grade</th>
                      <th className="border border-slate-200 px-3 py-2 text-right">Bruto (kg)</th>
                      <th className="border border-slate-200 px-3 py-2 text-right">Tare (kg)</th>
                      <th className="border border-slate-200 px-3 py-2 text-right">Netto (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSlip.items.map((it: any) => (
                      <tr key={it.no} className="border-b border-slate-200">
                        <td className="border border-slate-200 px-3 py-1.5 text-center font-semibold text-slate-400">{it.no}</td>
                        <td className="border border-slate-200 px-3 py-1.5 font-mono text-xs font-bold tracking-wider">{it.noBarcode}</td>
                        <td className="border border-slate-200 px-3 py-1.5 text-center font-bold font-mono">{it.gradeBuying}</td>
                        <td className="border border-slate-200 px-3 py-1.5 text-right font-mono">{it.beratBruto.toFixed(2)}</td>
                        <td className="border border-slate-200 px-3 py-1.5 text-right font-mono">{it.tare.toFixed(2)}</td>
                        <td className="border border-slate-200 px-3 py-1.5 text-right font-mono font-bold text-slate-900">{it.beratNetto.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex justify-end pt-2">
                  <div className="text-right space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Total Netto</span>
                    <span className="text-2xl font-black text-slate-800 font-mono tracking-tight">{activeSlip.totalNetto.toFixed(2)} kg</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-12 pt-8 text-center text-xs">
                  <div className="space-y-14">
                    <p className="text-slate-400 font-semibold uppercase tracking-wider">Supplier / Petani</p>
                    <p className="font-bold text-slate-800 border-t border-slate-300 pt-2 inline-block px-8">{activeSlip.namaSupplier}</p>
                  </div>
                  <div className="space-y-14">
                    <p className="text-slate-400 font-semibold uppercase tracking-wider">Petugas Timbang</p>
                    <p className="font-bold text-slate-800 border-t border-slate-300 pt-2 inline-block px-8">{currentUser ? (currentUser.nama || currentUser.username) : ''}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button onClick={closeSlipModal} className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl border border-slate-200">
                Tutup
              </button>
              <button onClick={printActiveSlip} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow">
                <Printer size={13} /> Cetak
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Box Konstanta Indicator */}
      <div 
        id="konstanta-indicator-box"
        onClick={toggleKonstanta}
        className={`cursor-pointer select-none p-3.5 rounded-xl flex flex-row items-center justify-between font-bold text-xs transition duration-150 active:scale-[0.995] border shadow-xs ${
          isKonstantaActive 
            ? 'bg-emerald-600 border-emerald-500 text-white' 
            : 'bg-rose-600 border-rose-500 text-white'
        }`}
        title="Klik atau Tekan F6 untuk mengaktifkan/mematikan"
      >
        <div className="flex items-center gap-3">
          <div className={`px-4 py-1.5 rounded-lg text-base font-black shadow ${isKonstantaActive ? 'bg-white text-emerald-600' : 'bg-white text-rose-600'}`}>
            {isKonstantaActive ? 'ON' : 'OFF'}
          </div>
        </div>
        <div className="px-3 py-1.5 bg-black/20 text-white hover:bg-black/30 text-[10px] font-black uppercase tracking-wider rounded-xl transition duration-100 shadow-sm border border-white/10">
          TEKAN F6 UNTUK MENGUBAH
        </div>
      </div>

      {/* Form Timbang Masuk */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <ShoppingCart size={18} className="text-amber-500" />
            Form Timbang Masuk (Buying)
          </h3>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setIsDailyReportOpen(true)}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-amber-400 border border-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-2xs cursor-pointer active:scale-95"
              title="Lihat Report Daily Buying (Ringkasan Grade, Bale, Kgs)"
            >
              <Calendar size={15} />
              Report Daily Buying
            </button>
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-2xs cursor-pointer active:scale-95"
              title="Import data timbang buying dari Excel / CSV"
            >
              <FileSpreadsheet size={15} className="text-amber-600" />
              Import Excel / CSV
            </button>
          </div>
        </div>

        {/* Info Session Box */}
        <div className={`p-4 rounded-xl text-xs flex gap-3 items-start ${isLocked ? 'bg-amber-50 border border-amber-200 text-slate-700' : 'bg-slate-50 border border-slate-100 text-slate-500'}`}>
          <CheckSquare size={16} className={`${isLocked ? 'text-amber-600' : 'text-slate-400'} mt-0.5 flex-shrink-0`} />
          <div>
            {isLocked ? (
              <p className="leading-relaxed">
                Tersimpan &mdash; No Buying: <span className="font-mono font-bold text-amber-600 text-sm">{noBuyingDisplay}</span>. Klik tombol <b>Transaksi Baru</b> untuk beralih ke petani / supplier berikutnya.
              </p>
            ) : (
              <p className="leading-relaxed">
                Masukkan informasi petani dan bale di bawah. Tekan enter atau tambah baris jika perlu, lalu klik <b>Simpan &amp; Buat No Buying</b>.
              </p>
            )}
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 flex justify-between">
              <span>No Buying</span>
              {isEditingMode && <span className="text-amber-600 font-extrabold animate-pulse text-[9px]">MODE EDIT</span>}
            </label>
            <div className="relative">
              <input
                type="text"
                value={isEditingMode ? noBuyingDisplay : lookupNoBuying}
                onChange={e => {
                  if (!isEditingMode) {
                    setLookupNoBuying(e.target.value);
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    triggerOpenLookup();
                  }
                }}
                placeholder={isEditingMode ? noBuyingDisplay : "Ketik No Buying & Enter"}
                disabled={isEditingMode}
                className={`w-full pl-3 pr-12 py-2 ${isEditingMode ? 'bg-amber-50 border-amber-300 text-amber-950 font-black' : 'bg-white border-slate-200 text-slate-800'} border rounded-lg text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500`}
              />
              {!isEditingMode && (
                <button
                  type="button"
                  onClick={triggerOpenLookup}
                  className="absolute right-1 top-1 px-1.5 py-1 bg-slate-800 hover:bg-slate-700 text-white font-bold text-[9px] rounded uppercase tracking-wider"
                >
                  Open
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase">
                Tgl Buying
              </label>
              {tanggalBuying !== getTodayDateString() ? (
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
                disabled={isLocked}
                value={tanggalBuying}
                onChange={e => setTanggalBuying(e.target.value)}
                className="w-full pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-700"
              />
              <Calendar size={13} className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
            </div>
            {tanggalBuying !== getTodayDateString() && !isLocked && (
              <button
                type="button"
                onClick={() => setTanggalBuying(getTodayDateString())}
                className="text-[10px] text-amber-700 hover:underline font-bold mt-1 inline-block"
              >
                Reset ke Hari ini
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Nama Petani / Supplier</label>
            <input
              type="text"
              disabled={isLocked}
              value={namaPetani}
              onChange={e => setNamaPetani(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Nama supplier / petani"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Type</label>
            <select
              disabled={isLocked}
              value={type}
              onChange={e => handleTypeChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none"
            >
              {availableTypes.map(t => (
                <option key={t} value={t}>{t || '(Umum)'}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Sub Type</label>
            <select
              disabled={isLocked}
              value={subType}
              onChange={e => handleSubTypeChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none"
            >
              {availableSubTypes.map(s => (
                <option key={s} value={s}>{s || '(Umum)'}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Crop Year</label>
            <select
              disabled={isLocked}
              value={cropYear}
              onChange={e => setCropYear(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none"
            >
              {availableCropYears.map(c => (
                <option key={c} value={c}>{c || '(Umum)'}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic Bales Table Grid */}
        <div className="space-y-3">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Daftar Bale</h4>
            <button
              type="button"
              disabled={isLocked}
              onClick={addGridRow}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition"
            >
              <Plus size={12} /> Tambah Baris
            </button>
          </div>

          <div className="border border-slate-100 rounded-xl overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                  <th className="px-4 py-2 w-16 text-center">Auto Barcode</th>
                  <th className="px-4 py-2 min-w-[200px]">No Barcode</th>
                  <th className="px-4 py-2 min-w-[150px]">Grade Buying</th>
                  <th className="px-4 py-2 w-28">Bruto (kg)</th>
                  <th className="px-4 py-2 w-28">Tare (kg)</th>
                  <th className="px-4 py-2 w-28 text-right">Netto (kg)</th>
                  <th className="px-4 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gridItems.map((item, index) => (
                  <tr key={item.id} className={`${isLocked ? 'bg-slate-50/50' : ''}`}>
                    {/* Auto Barcode Checkbox */}
                    <td className="px-4 py-1.5 text-center">
                      <input
                        type="checkbox"
                        disabled={isLocked}
                        checked={item.autoBarcode}
                        onChange={e => handleGridRowChange(item.id, 'autoBarcode', e.target.checked)}
                        className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                      />
                    </td>

                    {/* Barcode input */}
                    <td className="px-4 py-1.5">
                      {item.autoBarcode ? (
                        <span className="text-slate-400 italic">(Otomatis saat disimpan)</span>
                      ) : (
                        <div className="space-y-1">
                          <input
                            id={`barcode-input-${item.id}`}
                            type="text"
                            disabled={isLocked}
                            value={item.noBarcode}
                            onChange={e => handleGridRowChange(item.id, 'noBarcode', e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const gradeSelect = document.getElementById(`grade-select-${item.id}`);
                                if (gradeSelect) (gradeSelect as HTMLElement).focus();
                              }
                            }}
                            placeholder="Ketik No Barcode manual"
                            className={`w-full px-2.5 py-1 bg-white border ${item.isDuplicate ? 'border-rose-400 bg-rose-50' : 'border-slate-200'} rounded focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold uppercase text-[11px]`}
                          />
                          {item.isDuplicate && (
                            <span className="text-[10px] text-rose-500 font-bold block">No Barcode ini sudah dipakai!</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Grade Buying Dropdown */}
                    <td className="px-4 py-1.5">
                      <select
                        id={`grade-select-${item.id}`}
                        disabled={isLocked}
                        value={item.gradeBuying}
                        onChange={e => handleGridRowChange(item.id, 'gradeBuying', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const brutoInput = document.getElementById(`bruto-input-${item.id}`);
                            if (brutoInput) (brutoInput as HTMLElement).focus();
                          }
                        }}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="">- Pilih Grade -</option>
                        {availableGrades.map(g => (
                          <option key={g.GradeBuying} value={g.GradeBuying}>{g.GradeBuying}</option>
                        ))}
                      </select>
                    </td>

                    {/* Bruto */}
                    <td className="px-4 py-1.5">
                      <input
                        id={`bruto-input-${item.id}`}
                        type="number"
                        disabled={isLocked}
                        value={item.beratBruto}
                        onChange={e => handleGridRowChange(item.id, 'beratBruto', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const tareInput = document.getElementById(`tare-input-${item.id}`);
                            if (tareInput) (tareInput as HTMLElement).focus();
                          }
                        }}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold text-right"
                      />
                    </td>

                    {/* Tare */}
                    <td className="px-4 py-1.5">
                      <input
                        id={`tare-input-${item.id}`}
                        type="number"
                        disabled={isLocked}
                        value={item.tare}
                        onChange={e => handleGridRowChange(item.id, 'tare', e.target.value)}
                        onKeyDown={e => {
                          if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') {
                            const isLastRow = index === gridItems.length - 1;
                            if (isLastRow) {
                              e.preventDefault();
                              const nextId = gridRowCounter + 1;
                              const newRowId = `byrow-${nextId}-${Math.random().toString(36).substring(2, 6)}`;
                              addGridRow(newRowId);
                              setTimeout(() => {
                                const elementToFocus = document.getElementById(`grade-select-${newRowId}`) || document.getElementById(`barcode-input-${newRowId}`);
                                if (elementToFocus) {
                                  (elementToFocus as HTMLElement).focus();
                                }
                              }, 100);
                            }
                          }
                        }}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold text-right"
                      />
                    </td>

                    {/* Netto */}
                    <td className="px-4 py-1.5 text-right font-mono font-bold text-slate-800 text-[12px]">
                      {item.beratNetto.toFixed(2)}
                    </td>

                    {/* Remove Action Button */}
                    <td className="px-4 py-1.5 text-center">
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => removeGridRow(item.id)}
                        className="text-slate-400 hover:text-rose-500 p-1 hover:bg-slate-50 disabled:opacity-50 rounded transition"
                      >
                        <Minus size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-slate-700 text-xs flex justify-between items-center font-semibold">
            <div>
              Bale Timbang: <b className="text-slate-900">{totalBales} bale</b>
            </div>
            <div>
              Total Berat Netto: <b className="text-slate-900 font-mono text-sm">{totalNetto.toFixed(2)} kg</b>
            </div>
          </div>
        </div>

        {/* Form CTA buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSubmitBatch}
            disabled={isLocked}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-100 disabled:text-slate-400 text-slate-900 font-bold rounded-xl text-xs transition active:scale-98 flex items-center gap-1.5"
          >
            {isEditingMode ? 'Simpan Perubahan (Edit)' : 'Simpan & Buat No Buying'}
          </button>
          {isEditingMode && !isLocked && (
            <button
              onClick={() => {
                setAdminActionType('void');
                setAdminPinOpen(true);
              }}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition active:scale-98 flex items-center gap-1.5"
            >
              <Trash2 size={13} /> Void Transaksi (Batal)
            </button>
          )}
          <button
            onClick={() => startNewSession(true)}
            className="px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition active:scale-98"
          >
            Transaksi Baru (Ganti Petani)
          </button>
        </div>
      </div>

      {/* Slip Buying Reprinter section */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4 max-w-xl">
        <h3 className="text-md font-extrabold text-slate-800 flex items-center gap-1.5">
          <Printer size={16} className="text-amber-500" />
          Cetak Slip Buying
        </h3>
        <p className="text-xs text-slate-400 mt-[-8px]">
          Pilih No Buying untuk melihat preview slip sebelum dicetak. Dapat digunakan kapan saja untuk cetak ulang transaksi historis.
        </p>
        <div className="flex gap-2 max-w-sm">
          <select
            value={selectedNoBuying}
            onChange={e => setSelectedNoBuying(e.target.value)}
            className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
          >
            <option value="">- Pilih Transaksi -</option>
            {buyingGroups.map(g => (
              <option key={g.noBuying} value={g.noBuying}>
                {g.noBuying} - {g.namaSupplier} [{g.tanggal ? g.tanggal.slice(0, 10) : ''}] ({g.jumlahItem} bales)
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => handlePreviewSlip(selectedNoBuying)}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-lg transition"
          >
            Preview Slip
          </button>
        </div>
      </div>

      {/* Buying History Table */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-md font-extrabold text-slate-800">Riwayat Buying</h3>
            <p className="text-xs text-slate-400">Daftar semua transaksi timbang tembakau masuk (tersimpan aman di IndexedDB).</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                type="date"
                value={historyDateFilter}
                onChange={e => setHistoryDateFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
                title="Filter tanggal transaksi"
              />
            </div>
            <div className="relative w-40 sm:w-52">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Cari no buying / barcode..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
              />
            </div>
            {(historyDateFilter || historySearch) && (
              <button
                type="button"
                onClick={() => {
                  setHistoryDateFilter('');
                  setHistorySearch('');
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition"
              >
                Reset Filter
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[500px] overflow-y-auto border border-slate-100 rounded-xl">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                <th className="px-4 py-2.5 text-xs uppercase">No Buying</th>
                <th className="px-4 py-2.5 text-xs uppercase">Tanggal</th>
                <th className="px-4 py-2.5 text-xs uppercase">No Barcode</th>
                <th className="px-4 py-2.5 text-xs uppercase">Petani</th>
                <th className="px-4 py-2.5 text-xs uppercase">Grade</th>
                <th className="px-4 py-2.5 text-xs uppercase text-right">Bruto (kg)</th>
                <th className="px-4 py-2.5 text-xs uppercase text-right">Tare (kg)</th>
                <th className="px-4 py-2.5 text-xs uppercase text-right">Netto (kg)</th>
                <th className="px-4 py-2.5 text-xs uppercase text-center w-20">Status</th>
                <th className="px-4 py-2.5 text-xs uppercase w-24 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(() => {
                const listToRender = buyingHistory.filter(r => {
                  if (historyDateFilter && (!r.Timestamp || !r.Timestamp.startsWith(historyDateFilter))) return false;
                  if (!historySearch.trim()) return true;
                  const q = historySearch.toLowerCase().trim();
                  return (
                    (r.NoBuying && r.NoBuying.toLowerCase().includes(q)) ||
                    (r.NoBarcode && r.NoBarcode.toLowerCase().includes(q)) ||
                    (r.NamaSupplier && r.NamaSupplier.toLowerCase().includes(q)) ||
                    (r.GradeBuying && r.GradeBuying.toLowerCase().includes(q)) ||
                    (r.Timestamp && r.Timestamp.toLowerCase().includes(q))
                  );
                });

                if (listToRender.length === 0) {
                  return (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400 text-xs">
                        {buyingHistory.length === 0 
                          ? 'Belum ada data timbang masuk (Buying).' 
                          : 'Tidak ada data buying yang cocok dengan filter / tanggal terpilih.'}
                      </td>
                    </tr>
                  );
                }

                return listToRender.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 text-xs">
                    <td className="px-4 py-3 font-semibold text-slate-500 font-mono">{r.NoBuying || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">{r.Timestamp || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold bg-slate-900 text-amber-500 px-2 py-0.5 rounded text-[10px] tracking-wider">
                        {r.NoBarcode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{r.NamaSupplier}</td>
                    <td className="px-4 py-3 font-bold font-mono text-slate-700">{r.GradeBuying}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{r.BeratBruto.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{r.Tare.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">{r.BeratNetto.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${r.StatusReclass === 'SUDAH' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {r.StatusReclass === 'SUDAH' ? 'Reclassed' : 'Belum'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.NoBuying ? (
                        <button
                          onClick={() => handlePreviewSlip(r.NoBuying)}
                          className="px-2 py-1 border border-slate-200 hover:bg-slate-50 text-[10px] font-bold text-slate-700 rounded transition"
                        >
                          Cetak Ulang
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>
      {/* Admin PIN Verification Modal */}
      <AdminPinModal
        isOpen={adminPinOpen}
        onClose={() => setAdminPinOpen(false)}
        onSuccess={handleAdminPinSuccess}
        title={adminActionType === 'void' ? 'Otorisasi Void Transaksi' : 'Otorisasi Edit Transaksi'}
        description={adminActionType === 'void' 
          ? `Tindakan ini memerlukan verifikasi PIN Admin untuk membatalkan (void) transaksi ${noBuyingDisplay}.` 
          : `Tindakan ini memerlukan verifikasi PIN Admin untuk mengedit transaksi ${lookupNoBuying}.`
        }
      />

      {/* Import Buying Modal */}
      <ImportBuyingModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={(count) => {
          showToast(`Berhasil mengimpor ${count} bale ke transaksi Buying!`, 'ok');
          fetchHistoryAndGroups();
          if (onBuyingSaved) onBuyingSaved();
        }}
        currentUser={currentUser}
        masterPrices={prices}
      />

      {/* Daily Buying Report Modal Popup */}
      {isDailyReportOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn">
          <div className="bg-slate-50 rounded-2xl max-w-6xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-6 max-h-[94vh] overflow-y-auto border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 bg-white -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 p-4 sm:px-6 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-amber-500" />
                <h3 className="text-base font-black text-slate-800">
                  Laporan Daily Buying (Ringkasan Harian Timbang)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDailyReportOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            <DailyBuyingReport
              buyingList={buyingHistory}
              onRefresh={fetchHistoryAndGroups}
            />
          </div>
        </div>
      )}
    </div>
  );
};
