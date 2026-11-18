import React, { useState, useEffect, useRef } from 'react';
import {
  apiGetReclassOperators,
  apiGetMasterPrice,
  apiGetAvailableBarcodesForShipping,
  apiAddShipping,
  apiGetShippingList,
  apiGetShippingNoList,
  apiUpdateShippingHeader,
  apiUpdateShippingRow,
  apiDeleteShippingRow,
  apiVoidShippingBatch,
  apiGetBuyingList,
  apiGetReclassList,
  getTodayDateString,
  apiGenerateNoShippingFunc
} from '../db';
import { ShippingRow, MasterPrice } from '../types';
import XLSX from 'xlsx-js-style';
import ExcelJS from 'exceljs';
import { AdminPinModal } from './AdminPinModal';
import { ImportShippingModal } from './ImportShippingModal';
import { Truck, Search, RefreshCw, CheckSquare, Plus, ArrowLeft, ArrowRight, FileSpreadsheet, Upload, X, Image as ImageIcon, Trash2, Calendar, Edit2, Scale } from 'lucide-react';

interface ShippingProps {
  currentUser: any;
  onShippingSaved?: () => void;
}

interface ShippingGridItem {
  id: string;
  noBarcode: string;
  gradeReclass: string;
  beratNetto: string;
  tare: string;
  isMatched: boolean;
  isSaved: boolean;
  statusText: string;
  isError: boolean;
}

const PAGE_SIZE = 9;

export const Shipping: React.FC<ShippingProps> = ({ currentUser, onShippingSaved }) => {
  const [operators, setOperators] = useState<any[]>([]);
  const [prices, setPrices] = useState<MasterPrice[]>([]);
  const [availableBarcodes, setAvailableBarcodes] = useState<any[]>([]);
  const [shippingHistory, setShippingHistory] = useState<ShippingRow[]>([]);
  const [shippingNumbers, setShippingNoList] = useState<any[]>([]);

  // Header fields
  const [noShippingDisplay, setNoShippingDisplay] = useState('');
  const [customNoShippingInput, setCustomNoShippingInput] = useState('');
  const [isHeaderSaved, setIsHeaderSaved] = useState(false);
  const [operator, setOperator] = useState('');
  const [tanggalShipping, setTanggalShipping] = useState<string>(() => getTodayDateString());
  const [type, setType] = useState('');
  const [subType, setSubType] = useState('');
  const [cropYear, setCropYear] = useState('');
  const [destination, setDestination] = useState('');
  const [isDestinationDone, setIsDestinationDone] = useState(false);

  // Grid scan lists
  const [gridItems, setGridItems] = useState<ShippingGridItem[]>([]);
  const [rowCounter, setGridRowCounter] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [gridSearch, setGridSearch] = useState('');

  // Sesi Shipping state
  const [currentNoShipping, setCurrentNoShipping] = useState('');

  // Search History
  const [historySearch, setHistorySearch] = useState('');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  // Lookup, Editing, and Admin PIN states for Shipping
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [adminPinOpen, setAdminPinOpen] = useState(false);
  const [lookupNoShipping, setLookupNoShipping] = useState('');
  const [adminActionType, setAdminActionType] = useState<'open' | 'void'>('open');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Quick edit modal for re-weighing bale in shipping history
  const [editWeightItem, setEditWeightItem] = useState<{
    noShipping: string;
    noBarcodeAsal: string;
    gradeReclass: string;
    currentNetto: number;
    newNetto: string;
  } | null>(null);

  // Excel Export Metadata state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportNoShipping, setExportNoShipping] = useState('');
  const [excelMetadata, setExcelMetadata] = useState(() => {
    try {
      const saved = localStorage.getItem('iscs_shipping_excel_metadata');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {}
    return {
      fromCompany: 'INDONESIA DWI SEMBILAN, PT',
      gudangAsal: 'Central Warehouse',
      transporter: 'Darat',
      truckNo: 'DK 1234 AB',
      toCompany: 'CUSTOMER / BUYER',
      alamatTujuan: '-',
      senderName: 'Jatmiko',
      driverName: 'Rohman',
      remarks: '-'
    };
  });

  const saveExcelMetadata = (updated: any) => {
    setExcelMetadata(updated);
    localStorage.setItem('iscs_shipping_excel_metadata', JSON.stringify(updated));
  };

  const [companyLogo, setCompanyLogo] = useState<string | null>(() => {
    try {
      return localStorage.getItem('iscs_shipping_logo');
    } catch (e) {
      return null;
    }
  });
  const [isDragActive, setIsDragActive] = useState(false);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        showToast('Harap unggah file gambar (PNG, JPG, dll).', 'err');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        showToast('Ukuran logo maksimal 2MB.', 'err');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setCompanyLogo(base64);
        localStorage.setItem('iscs_shipping_logo', base64);
        showToast('Logo kustom berhasil disimpan.', 'ok');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setCompanyLogo(null);
    localStorage.removeItem('iscs_shipping_logo');
    showToast('Logo kustom dihapus. Kembali menggunakan teks logo default.', 'ok');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        showToast('Harap unggah file gambar (PNG, JPG, dll).', 'err');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        showToast('Ukuran logo maksimal 2MB.', 'err');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setCompanyLogo(base64);
        localStorage.setItem('iscs_shipping_logo', base64);
        showToast('Logo kustom berhasil disimpan.', 'ok');
      };
      reader.readAsDataURL(file);
    }
  };

  // References
  const barcodeRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const nettoRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const showToast = (text: string, type: 'ok' | 'err') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadInitialData = () => {
    const resOps = apiGetReclassOperators();
    if (resOps.success && resOps.operators) {
      setOperators(resOps.operators);
      if (currentUser && resOps.operators.some((o: any) => o.username === currentUser.username)) {
        setOperator(currentUser.username);
      }
    }

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
    const list = apiGetAvailableBarcodesForShipping();
    setAvailableBarcodes(list);

    const hist = apiGetShippingList();
    setShippingHistory(hist);

    const grps = apiGetShippingNoList();
    setShippingNoList(grps);
  };

  useEffect(() => {
    loadInitialData();
    loadSourcesAndHistory();
    startNewSession(false);
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

  const isHeaderFilled = () => {
    return !!(operator && type && subType && cropYear && destination.trim() && isDestinationDone);
  };

  // Grid actions
  const startNewSession = (confirmFirst = false) => {
    if (confirmFirst && !confirm('Mulai sesi shipping baru? No Shipping baru akan dibuat untuk transaksi berikutnya.')) return;
    setCurrentNoShipping('');
    setNoShippingDisplay('');
    setCustomNoShippingInput('');
    setIsHeaderSaved(false);
    setTanggalShipping(getTodayDateString());
    setDestination('');
    setIsDestinationDone(false);
    setGridItems([]);
    setGridRowCounter(0);
    setCurrentPage(0);
    setIsEditingMode(false);
    setLookupNoShipping('');
    
    if (confirmFirst) {
      showToast('Sesi shipping baru siap. Silakan isi header dan klik Simpan Header.', 'ok');
    }
  };

  const handleSaveHeader = () => {
    if (!operator) {
      showToast('Harap pilih User yang Shipping terlebih dahulu.', 'err');
      return;
    }
    if (!destination.trim()) {
      showToast('Harap isi Destination (Tujuan) pengiriman.', 'err');
      return;
    }
    if (!type || !subType || !cropYear) {
      showToast('Harap lengkapi Type, Sub Type, dan Crop Year.', 'err');
      return;
    }

    setIsDestinationDone(true);

    // Determine No Shipping
    let finalNoShipping = currentNoShipping.trim().toUpperCase();
    if (!finalNoShipping) {
      if (customNoShippingInput.trim()) {
        finalNoShipping = customNoShippingInput.trim().toUpperCase();
      } else {
        const res = apiGenerateNoShippingFunc(tanggalShipping);
        finalNoShipping = res.noShipping;
      }
    }

    // Check if customNoShippingInput already exists in shipping history
    if (customNoShippingInput.trim()) {
      const existing = shippingHistory.some(s => s.NoShipping?.toUpperCase() === finalNoShipping);
      if (existing) {
        showToast(`No Shipping "${finalNoShipping}" sudah pernah dipakai sebelumnya. Gunakan nomor lain.`, 'err');
        return;
      }
    }

    setCurrentNoShipping(finalNoShipping);
    setNoShippingDisplay(finalNoShipping);
    setIsHeaderSaved(true);
    setCustomNoShippingInput('');

    showToast(`Header Shipping berhasil disimpan! No Shipping: ${finalNoShipping}`, 'ok');

    // Ensure at least one grid row exists and focus barcode input
    if (gridItems.length === 0) {
      addGridRow();
    } else {
      setTimeout(() => {
        const firstUnsaved = gridItems.find(it => !it.isSaved);
        if (firstUnsaved) {
          barcodeRefs.current[firstUnsaved.id]?.focus();
        }
      }, 50);
    }
  };

  const triggerOpenLookup = () => {
    const code = lookupNoShipping.trim().toUpperCase();
    if (!code) {
      showToast('Ketik No Shipping terlebih dahulu.', 'err');
      return;
    }

    const shippingRows = getLocal<ShippingRow[]>('iscs_shipping', []);
    const match = shippingRows.filter(s => s.NoShipping.toUpperCase() === code);
    if (match.length === 0) {
      showToast(`Transaksi Shipping ${code} tidak ditemukan.`, 'err');
      return;
    }

    setAdminActionType('open');
    setAdminPinOpen(true);
  };

  const handleAdminPinSuccess = () => {
    setAdminPinOpen(false);
    
    if (adminActionType === 'open') {
      const code = lookupNoShipping.trim().toUpperCase();
      const shippingRows = getLocal<ShippingRow[]>('iscs_shipping', []);
      const match = shippingRows.filter(s => s.NoShipping.toUpperCase() === code);
      if (match.length > 0) {
        setNoShippingDisplay(code);
        setCurrentNoShipping(code);
        setIsHeaderSaved(true);
        setCustomNoShippingInput('');
        setOperator(match[0].InputBy);
        if (match[0].Timestamp) {
          setTanggalShipping(match[0].Timestamp.slice(0, 10));
        }
        setType(match[0].Type || '');
        setSubType(match[0].SubType || '');
        setCropYear(match[0].CropYear || '');
        setDestination(match[0].Destination || '');
        setIsDestinationDone(true);
        setIsEditingMode(true);

        const loadedGrid: ShippingGridItem[] = match.map((s, idx) => ({
          id: `sprow-edit-${idx}-${Math.random().toString(36).substring(2,6)}`,
          noBarcode: s.NoBarcodeAsal,
          gradeReclass: s.GradeReclass,
          beratNetto: String(s.BeratNetto),
          tare: String(s.Tare || 0),
          isMatched: true,
          isSaved: true,
          statusText: 'Tersimpan',
          isError: false
        }));
        setGridItems(loadedGrid);
        setGridRowCounter(loadedGrid.length + 1);
        showToast(`Transaksi ${code} berhasil dimuat untuk diedit.`, 'ok');
      }
    } else if (adminActionType === 'void') {
      const res = apiVoidShippingBatch(currentNoShipping);
      if (res.success) {
        showToast(res.message, 'ok');
        startNewSession(false);
        loadSourcesAndHistory();
        if (onShippingSaved) onShippingSaved();
        window.dispatchEvent(new Event('iscs-db-update'));
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

  const addGridRow = () => {
    if (!isHeaderFilled()) return;
    const nextId = rowCounter + 1;
    setGridRowCounter(nextId);
    const rowId = `sprow-${nextId}`;

    const newRow: ShippingGridItem = {
      id: rowId,
      noBarcode: '',
      gradeReclass: '',
      beratNetto: '',
      tare: '',
      isMatched: false,
      isSaved: false,
      statusText: 'Menunggu',
      isError: false
    };

    setGridItems(prev => [...prev, newRow]);

    setTimeout(() => {
      const filteredCount = getFilteredGridRows().length + 1;
      const totalPages = Math.ceil(filteredCount / PAGE_SIZE);
      setCurrentPage(Math.max(0, totalPages - 1));

      setTimeout(() => {
        barcodeRefs.current[rowId]?.focus();
      }, 50);
    }, 10);
  };

  const removeGridRow = (rowId: string) => {
    const item = gridItems.find(it => it.id === rowId);
    if (!item) return;

    if (item.isSaved) {
      if (isEditingMode) {
        if (confirm(`Hapus barcode ${item.noBarcode} dari shipping ini?`)) {
          const res = apiDeleteShippingRow(currentNoShipping, item.noBarcode);
          if (res.success) {
            showToast(res.message, 'ok');
            setGridItems(prev => prev.filter(it => it.id !== rowId));
            loadSourcesAndHistory();
            if (onShippingSaved) onShippingSaved();
            window.dispatchEvent(new Event('iscs-db-update'));
          } else {
            showToast(res.message, 'err');
          }
        }
      } else {
        showToast('Baris yang sudah tersimpan tidak bisa dihapus.', 'err');
      }
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
            gradeReclass: '',
            beratNetto: '',
            tare: '',
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

    // Search reclassed codes available for shipping
    const matched = availableBarcodes.find(r => r.noBarcode.toUpperCase() === code);

    if (!matched) {
      setGridItems(prev =>
        prev.map(it => {
          if (it.id === rowId) {
            return { ...it, isError: true, gradeReclass: '', beratNetto: '', tare: '' };
          }
          return it;
        })
      );

      // Check specific reason to give precise notification to user
      const reclassList = apiGetReclassList();
      const buyingList = apiGetBuyingList();
      const inReclass = reclassList.find(r => 
        r.NoBarcode?.toUpperCase() === code || 
        r.NoReclass?.toUpperCase() === code
      );
      const inBuying = buyingList.find(b => b.NoBarcode?.toUpperCase() === code);

      if (inReclass && inReclass.StatusShipping === 'SUDAH') {
        showToast(`Barcode "${code}" sudah pernah di-shipping sebelumnya (Status: SUDAH).`, 'err');
      } else if (!inReclass && inBuying) {
        showToast(`Barcode "${code}" BELUM DI-RECLASS! Barcode harus sudah direclass terlebih dahulu sebelum bisa di-shipping.`, 'err');
      } else if (!inReclass && !inBuying) {
        showToast(`Barcode "${code}" tidak ditemukan di data sistem & belum direclass!`, 'err');
      } else {
        showToast(`Barcode "${code}" belum direclass atau sudah pernah di-shipping!`, 'err');
      }
      return;
    }

    // Check duplicate inside currently editing grid
    const isDuplicate = gridItems.some(other => other.id !== rowId && other.noBarcode.trim().toUpperCase() === code);
    if (isDuplicate) {
      setGridItems(prev =>
        prev.map(it => {
          if (it.id === rowId) {
            return { ...it, isError: true, noBarcode: '' };
          }
          return it;
        })
      );
      showToast(`Barcode "${code}" sudah terdaftar di baris lain pada transaksi ini.`, 'err');
      return;
    }

    setGridItems(prev =>
      prev.map(it => {
        if (it.id === rowId) {
          const matchWarning = (matched.type !== type || matched.subType !== subType || matched.cropYear !== cropYear);
          return {
            ...it,
            noBarcode: matched.noBarcode,
            gradeReclass: matched.gradeReclass + (matchWarning ? ' *(beda header)' : ''),
            beratNetto: Number(matched.beratNetto).toFixed(2),
            tare: Number(matched.tare).toFixed(2),
            isMatched: true,
            isError: false
          };
        }
        return it;
      })
    );

    // Auto shift focus to Netto weight edit input
    setTimeout(() => {
      nettoRefs.current[rowId]?.focus();
      nettoRefs.current[rowId]?.select();
    }, 50);
  };

  const handleSaveShippingRow = (rowId: string) => {
    const item = gridItems.find(it => it.id === rowId);
    if (!item) return;

    const noBarcode = item.noBarcode.trim().toUpperCase();
    const beratNetto = Number(item.beratNetto) || 0;

    if (!noBarcode || !item.isMatched) {
      showToast('Scan / cari No Barcode yang valid terlebih dahulu.', 'err');
      return;
    }
    if (beratNetto <= 0) {
      showToast('Netto harus lebih dari 0.', 'err');
      nettoRefs.current[rowId]?.focus();
      return;
    }

    if (item.isSaved) {
      const activeNoShipping = currentNoShipping || item.statusText;
      const res = apiUpdateShippingRow(activeNoShipping, noBarcode, beratNetto);
      if (res.success) {
        showToast(res.message || `Berat bale ${noBarcode} berhasil diperbarui menjadi ${beratNetto} kg.`, 'ok');
        setGridItems(prev =>
          prev.map(it => {
            if (it.id === rowId) {
              return { ...it, beratNetto: String(beratNetto), statusText: 'Tersimpan' };
            }
            return it;
          })
        );
        loadSourcesAndHistory();
        if (onShippingSaved) onShippingSaved();
        window.dispatchEvent(new Event('iscs-db-update'));
      } else {
        showToast(res.message || 'Gagal memperbarui berat.', 'err');
      }
      return;
    }

    // Mark as saving
    setGridItems(prev =>
      prev.map(it => {
        if (it.id === rowId) {
          return { ...it, statusText: 'Menyimpan...' };
        }
        return it;
      })
    );

    const res = apiAddShipping({
      noBarcode,
      beratNetto,
      inputBy: operator,
      noShipping: currentNoShipping,
      destination: destination.trim(),
      customDate: tanggalShipping
    });

    if (res.success && res.data) {
      // Set the active session shipping id if newly generated
      if (!currentNoShipping && res.data.noShipping) {
        setCurrentNoShipping(res.data.noShipping);
        setNoShippingDisplay(res.data.noShipping);
      }

      setGridItems(prev =>
        prev.map(it => {
          if (it.id === rowId) {
            return { ...it, isSaved: true, statusText: 'Tersimpan' };
          }
          return it;
        })
      );
      showToast(res.message || 'Shipping tersimpan.', 'ok');

      // Reload
      loadSourcesAndHistory();
      if (onShippingSaved) onShippingSaved();
      window.dispatchEvent(new Event('iscs-db-update'));

      // Append new scanning row
      addGridRow();
    } else {
      showToast(res.message || 'Gagal menyimpan.', 'err');
      setGridItems(prev =>
        prev.map(it => {
          if (it.id === rowId) {
            return { ...it, statusText: 'Menunggu' };
          }
          return it;
        })
      );
    }
  };

  const handleUpdateHeader = () => {
    if (!currentNoShipping) return;
    const res = apiUpdateShippingHeader(currentNoShipping, {
      operator,
      type,
      subType,
      cropYear,
      destination: destination.trim(),
      customDate: tanggalShipping
    });
    if (res.success) {
      showToast(res.message || 'Header shipping berhasil diperbarui.', 'ok');
      loadSourcesAndHistory();
      window.dispatchEvent(new Event('iscs-db-update'));
    } else {
      showToast(res.message || 'Gagal memperbarui header.', 'err');
    }
  };

  const handleSaveQuickEditWeight = () => {
    if (!editWeightItem) return;
    const { noShipping, noBarcodeAsal, newNetto } = editWeightItem;
    const parsedNetto = Number(newNetto);

    if (isNaN(parsedNetto) || parsedNetto <= 0) {
      showToast('Berat Netto harus diisi dengan angka lebih dari 0 kg.', 'err');
      return;
    }

    const res = apiUpdateShippingRow(noShipping, noBarcodeAsal, parsedNetto);
    if (res.success) {
      showToast(`Berat bale ${noBarcodeAsal} berhasil diperbarui menjadi ${parsedNetto} kg.`, 'ok');
      setEditWeightItem(null);
      loadSourcesAndHistory();

      // Also update currently active grid if it is displayed
      setGridItems(prev =>
        prev.map(it => {
          if (it.noBarcode.toUpperCase() === noBarcodeAsal.toUpperCase()) {
            return { ...it, beratNetto: String(parsedNetto) };
          }
          return it;
        })
      );

      if (onShippingSaved) onShippingSaved();
      window.dispatchEvent(new Event('iscs-db-update'));
    } else {
      showToast(res.message || 'Gagal memperbarui berat shipping.', 'err');
    }
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
  const filteredHistory = shippingHistory.filter(r => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return true;
    return (r.NoShipping && r.NoShipping.toLowerCase().includes(q)) || r.NoBarcodeAsal.toLowerCase().includes(q);
  });

  // available cascading lists
  const availableSubTypes = Array.from(new Set(prices.filter(p => p.Type === type).map(p => p.SubType || '')));
  const availableCropYears = Array.from(new Set(prices.filter(p => p.Type === type && p.SubType === subType).map(p => p.CropYear || '')));

  /* =========================================================================
     OFFLINE EXCEL EXPORT (USING SHEETJS)
     Generates beautiful multi-sheet Excel files matching the user's screenshots!
     ========================================================================= */
  const decodeCell = (address: string) => {
    const match = address.match(/^([A-Z]+)([0-9]+)$/);
    if (!match) return { col: -1, row: -1 };
    const colStr = match[1];
    const rowStr = match[2];
    
    let col = 0;
    for (let i = 0; i < colStr.length; i++) {
      col = col * 26 + (colStr.charCodeAt(i) - 64);
    }
    return { col: col - 1, row: parseInt(rowStr, 10) - 1 };
  };

  const ensureSheetCells = (ws: any, maxRow: number, maxCol: number) => {
    for (let r = 0; r <= maxRow; r++) {
      for (let c = 0; c <= maxCol; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (!ws[cellRef]) {
          ws[cellRef] = { t: 's', v: '' };
        }
      }
    }
  };

  const applyBlockBorder = (ws: any, startRow: number, startCol: number, endRow: number, endCol: number) => {
    const borderThin = { style: 'thin', color: { rgb: '000000' } };
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
        const cell = ws[cellRef];
        if (!cell.s) cell.s = {};
        if (!cell.s.border) cell.s.border = {};
        
        if (r === startRow) cell.s.border.top = borderThin;
        if (r === endRow) cell.s.border.bottom = borderThin;
        if (c === startCol) cell.s.border.left = borderThin;
        if (c === endCol) cell.s.border.right = borderThin;
      }
    }
  };

  const applyStyleToSheet = (ws: any, dataLength: number, isDetail: boolean) => {
    const tableEndRow = 17 + dataLength; 
    
    // Ensure all cells exist in our target layout (Columns B to P, index 1 to 15)
    ensureSheetCells(ws, tableEndRow + 15, 15);

    const fontDefault = { name: 'Arial', sz: 9, color: { rgb: '000000' } };
    const fontBold = { name: 'Arial', sz: 9, bold: true, color: { rgb: '000000' } };
    const fontItalic = { name: 'Arial', sz: 9, italic: true, color: { rgb: '000000' } };
    
    const borderThin = { style: 'thin', color: { rgb: '000000' } };
    const borderDouble = { style: 'double', color: { rgb: '000000' } };
    
    const alignCenter = { horizontal: 'center', vertical: 'center' };
    const alignLeft = { horizontal: 'left', vertical: 'center' };
    const alignRight = { horizontal: 'right', vertical: 'center' };

    // Apply block outline borders to match template
    // 1. Title Block (D1:J5)
    applyBlockBorder(ws, 0, 3, 4, 9);
    // 2. Metadata Header block (K1:P5)
    applyBlockBorder(ws, 0, 10, 4, 15);
    // 3. Dari/Kepada Block (B7:P12)
    applyBlockBorder(ws, 6, 1, 11, 15);

    // 4. Table Header Block (B16:P17, index 15 and 16)
    applyBlockBorder(ws, 15, 1, 16, 15);

    // 5. Table Data Rows Block
    for (let r = 17; r < tableEndRow; r++) {
      applyBlockBorder(ws, r, 1, r, 15);
    }

    // 6. Table Total Row Block
    applyBlockBorder(ws, tableEndRow, 1, tableEndRow, 15);

    for (const key in ws) {
      if (key[0] === '!') continue;
      const cell = ws[key];
      const decoded = decodeCell(key);
      const col = decoded.col;
      const row = decoded.row;
      if (col < 0 || row < 0) continue;

      // Skip styling if cell is outside column B to P
      if (col < 1 || col > 15) continue;

      if (!cell.s) cell.s = {};
      cell.s.font = { ...fontDefault };

      // Logo text block B1 (Col 1, Row 0)
      if (col === 1 && row === 0) {
        cell.s.font = { name: 'Arial', sz: 10, bold: true };
        cell.s.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
      }

      // Title section (D1, index r: 0, c: 3)
      if (col === 3 && row === 0) { 
        cell.s.font = { name: 'Arial', sz: 14, bold: true };
        cell.s.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
      }

      // Metadata Header block (Col 10 to 15, Row 0 to 4)
      if (col >= 10 && col <= 15 && row >= 0 && row <= 4) {
        if (col === 10) {
          cell.s.font = fontBold;
          cell.s.alignment = alignLeft;
        } else if (col === 13) {
          cell.s.alignment = alignCenter;
        } else if (col >= 14) {
          cell.s.font = fontBold;
          cell.s.alignment = alignLeft;
        }
      }

      // Dari/Kepada Block Row 7 to 12 (Row 6 to 11)
      if (row === 6) { 
        if (col === 1 || col === 9) {
          cell.s.font = { name: 'Arial', sz: 10, bold: true };
        }
      }
      if (row >= 7 && row <= 11) { 
        if (col === 1 || col === 9) {
          cell.s.font = fontDefault;
          cell.s.alignment = alignLeft;
        }
        if (col === 4 || col === 11) {
          cell.s.alignment = alignCenter;
        }
        if (col === 5 || col === 12) {
          cell.s.font = fontBold;
          cell.s.alignment = alignLeft;
        }
      }

      // Table Header Rows 16 and 17 (index 15 and 16)
      if (col >= 1 && col <= 15 && (row === 15 || row === 16)) {
        cell.s.font = fontBold;
        cell.s.alignment = alignCenter;
        cell.s.fill = {
          fgColor: { rgb: 'F2F2F2' }
        };
      }

      // Table Data Rows (B to P, Row 18 to tableEndRow - 1)
      if (col >= 1 && col <= 15 && row >= 17 && row < tableEndRow) {
        if (col === 1) { 
          cell.s.alignment = alignCenter;
        } else if (col >= 2 && col <= 3) { 
          cell.s.alignment = isDetail ? alignCenter : alignLeft;
        } else if (col >= 4 && col <= 6) { 
          cell.s.alignment = isDetail ? alignCenter : alignRight;
          if (!isDetail) {
            cell.z = '#,##0';
          }
        } else if (col >= 7 && col <= 15) { 
          cell.s.alignment = alignRight;
          if (col >= 7 && col <= 9) {
            cell.z = '#,##0.00';
          } else if (col >= 10 && col <= 12) {
            cell.z = '#,##0.00';
          } else if (col >= 13 && col <= 15) {
            cell.z = '#,##0.00';
          }
        }
      }

      // Table Total Row (row === tableEndRow)
      if (col >= 1 && col <= 15 && row === tableEndRow) {
        cell.s.font = fontBold;
        cell.s.border = {
          top: borderThin,
          bottom: borderDouble, 
          left: borderThin,
          right: borderThin
        };

        if (col >= 2 && col <= 3) { 
          cell.s.alignment = alignLeft;
        } else if (col >= 4 && col <= 6) { 
          cell.s.alignment = isDetail ? alignCenter : alignRight;
          cell.z = '#,##0';
        } else if (col >= 7 && col <= 15) { 
          cell.s.alignment = alignRight;
          cell.z = '#,##0.00';
        }
      }

      // Signatures Section (row > tableEndRow)
      if (row > tableEndRow) {
        if (col === 1 || col === 6 || col === 10) {
          cell.s.alignment = alignCenter;
          
          if (row === tableEndRow + 2) { 
            cell.s.font = fontBold; // Date line
            cell.s.alignment = alignLeft;
          } else if (row === tableEndRow + 4) {
            cell.s.font = fontBold; // Indonesian label
          } else if (row === tableEndRow + 5) {
            cell.s.font = fontItalic; // English italicized label
          } else if (row === tableEndRow + 9) { 
            cell.s.font = fontBold; // Actual Name
          }
        }
      }
    }

    ws['!views'] = [{ showGridLines: true }];
  };

  const formatExcelDate = (timestampStr: string) => {
    try {
      if (!timestampStr) return '';
      const parts = timestampStr.split(' ')[0].split('-');
      if (parts.length === 3) {
        const year = parts[0];
        const monthNum = parseInt(parts[1], 10);
        const day = parts[2];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = months[monthNum - 1] || 'Oct';
        return `${day}-${monthName}-${year}`;
      }
    } catch (e) {}
    return '14-Jul-2026';
  };

  const exportToExcel = (noShip: string) => {
    const targetNo = noShip.trim();
    if (!targetNo || targetNo === '-') {
      showToast('Belum ada No Shipping yang dipilih / dibuat.', 'err');
      return;
    }

    const matchedRows = shippingHistory.filter(r => r.NoShipping === targetNo);
    if (!matchedRows.length) {
      showToast(`Data untuk No Shipping "${targetNo}" tidak ditemukan.`, 'err');
      return;
    }

    // Open metadata modal before executing actual export
    setExportNoShipping(targetNo);
    setShowExportModal(true);
  };

  const executeExcelExport = async (targetNo: string) => {
    const matchedRows = shippingHistory.filter(r => r.NoShipping === targetNo);
    if (!matchedRows.length) {
      showToast(`Data untuk No Shipping "${targetNo}" tidak ditemukan.`, 'err');
      return;
    }

    const head = matchedRows[0];
    const headerType = head.Type || '';
    const headerSubType = head.SubType || '';
    const headerCropYear = head.CropYear || '';
    const headerDestination = head.Destination || '';

    // Sheet 1: Detail Rows Data Processing
    const detailData = matchedRows.map((r, idx) => {
      const netto = Number(r.BeratNetto) || 0;
      const tare = Number(r.Tare || 0) || 0;
      const bruto = netto + tare;
      return {
        no: idx + 1,
        noBarcode: r.NoBarcodeAsal,
        grade: r.GradeReclass,
        bruto,
        tare,
        netto
      };
    });

    const totalBruto = detailData.reduce((acc, d) => acc + d.bruto, 0);
    const totalTare = detailData.reduce((acc, d) => acc + d.tare, 0);
    const totalNetto = detailData.reduce((acc, d) => acc + d.netto, 0);

    // 1. Build Sheet 1 (Detail) 2D array matrix (Columns B to P = Col indices 1 to 15)
    const detailRows: any[][] = [];
    const totalDetailRows = 17 + detailData.length + 15;
    for (let i = 0; i < totalDetailRows; i++) {
      detailRows.push(Array(16).fill(''));
    }

    // Company logo/info (B1)
    detailRows[0][1] = 'INDONESIA\nDWI SEMBILAN, PT';

    // Surat Jalan Title Section (merged D1:J5, index r: 0, c: 3)
    detailRows[0][3] = 'SURAT JALAN\n(Delivery Notes)\nDetail';

    // Metadata Header block on the right (Col index 10 is K, Col index 13 is N, Col index 14 is O)
    detailRows[0][10] = 'PTIDS Ref.';
    detailRows[0][13] = ':';
    detailRows[0][14] = targetNo;

    detailRows[1][10] = 'Shipment Date';
    detailRows[1][13] = ':';
    detailRows[1][14] = formatExcelDate(head.Timestamp);

    detailRows[2][10] = 'Tobacco Type';
    detailRows[2][13] = ':';
    detailRows[2][14] = headerType;

    detailRows[3][10] = 'Sub Type';
    detailRows[3][13] = ':';
    detailRows[3][14] = headerSubType;

    detailRows[4][10] = 'Sub Type (Year)';
    detailRows[4][13] = ':';
    detailRows[4][14] = headerCropYear;

    // Metadata Block Dari / Kepada (Row 7 to 12)
    detailRows[6][1] = 'Dari (From)';
    detailRows[6][9] = 'Kepada (To)'; // Col J (Col index 9)

    detailRows[7][1] = 'Perusahaan (Company)';
    detailRows[7][4] = ':'; // Col E
    detailRows[7][5] = excelMetadata.fromCompany; // Col F
    detailRows[7][9] = 'Perusahaan (Company)'; // Col J
    detailRows[7][11] = ':'; // Col L
    detailRows[7][12] = excelMetadata.toCompany; // Col M

    detailRows[8][1] = 'Gudang (Warehouse)';
    detailRows[8][4] = ':'; // Col E
    detailRows[8][5] = excelMetadata.gudangAsal; // Col F
    detailRows[8][9] = 'Tujuan (Destination)'; // Col J
    detailRows[8][11] = ':'; // Col L
    detailRows[8][12] = headerDestination; // Col M

    detailRows[9][1] = 'Transportasi  (Transporter)';
    detailRows[9][4] = ':'; // Col E
    detailRows[9][5] = excelMetadata.transporter; // Col F
    detailRows[9][9] = 'Alamat (Address)'; // Col J
    detailRows[9][11] = ':'; // Col L
    detailRows[9][12] = excelMetadata.alamatTujuan; // Col M

    detailRows[10][1] = 'No. Kendaraan  (Truck No.)';
    detailRows[10][4] = ':'; // Col E
    detailRows[10][5] = excelMetadata.truckNo; // Col F

    detailRows[11][1] = 'Keterangan (Remarks)';
    detailRows[11][4] = ':'; // Col E
    detailRows[11][5] = excelMetadata.remarks; // Col F

    // Table Headers (Excel Row 16 & 17, indices 15 & 16)
    detailRows[15][1] = 'No.';
    detailRows[15][2] = 'No. Bale';
    detailRows[15][4] = 'Grade';
    detailRows[15][7] = 'Bruto';
    detailRows[15][10] = 'Tara';
    detailRows[15][13] = 'Netto';

    detailRows[16][2] = '(Bale No.)';
    detailRows[16][4] = '(Grade)';
    detailRows[16][7] = '(Gross)';
    detailRows[16][10] = '(Tare)';
    detailRows[16][13] = '(Net)';

    // Items Data (starts at Row 18, index 17)
    detailData.forEach((d, idx) => {
      const rIdx = 17 + idx;
      detailRows[rIdx][1] = d.no;
      detailRows[rIdx][2] = d.noBarcode;
      detailRows[rIdx][4] = d.grade;
      detailRows[rIdx][7] = Number(d.bruto.toFixed(2));
      detailRows[rIdx][10] = Number(d.tare.toFixed(2));
      detailRows[rIdx][13] = Number(d.netto.toFixed(2));
    });

    // Total Row
    const totalRowIdx = 17 + detailData.length;
    detailRows[totalRowIdx][2] = 'Jumlah (Total)';
    detailRows[totalRowIdx][4] = detailData.length; // Bale Count Quantity
    detailRows[totalRowIdx][7] = Number(totalBruto.toFixed(2));
    detailRows[totalRowIdx][10] = Number(totalTare.toFixed(2));
    detailRows[totalRowIdx][13] = Number(totalNetto.toFixed(2));

    // Footer Signatures
    const fIdx = totalRowIdx + 2; // Row 22 in template for 2 data rows
    detailRows[fIdx][10] = `${excelMetadata.gudangAsal}, ${formatExcelDate(head.Timestamp)}`;

    detailRows[totalRowIdx + 4][1] = 'Penerima';
    detailRows[totalRowIdx + 4][6] = 'Pengemudi';
    detailRows[totalRowIdx + 4][10] = 'Pengirim';

    detailRows[totalRowIdx + 5][1] = '(Receiver)';
    detailRows[totalRowIdx + 5][6] = '(Driver)';
    detailRows[totalRowIdx + 5][10] = '(Sender)';

    detailRows[totalRowIdx + 9][1] = '(                                                                 )';
    detailRows[totalRowIdx + 9][6] = `( ${excelMetadata.driverName} )`;
    detailRows[totalRowIdx + 9][10] = `( ${excelMetadata.senderName} )`;


    // 2. Build Sheet 2: Summary aggregated per Grade
    const summaryMap: Record<string, { grade: string; jumlahBale: number; jumlahNetto: number; jumlahTare: number; jumlahBruto: number }> = {};
    detailData.forEach(d => {
      if (!summaryMap[d.grade]) {
        summaryMap[d.grade] = { grade: d.grade, jumlahBale: 0, jumlahNetto: 0, jumlahTare: 0, jumlahBruto: 0 };
      }
      summaryMap[d.grade].jumlahBale += 1;
      summaryMap[d.grade].jumlahNetto += d.netto;
      summaryMap[d.grade].jumlahTare += d.tare;
      summaryMap[d.grade].jumlahBruto += d.bruto;
    });

    const summaryData = Object.keys(summaryMap).sort().map(g => summaryMap[g]);

    const summaryRows: any[][] = [];
    const totalSumRows = 17 + summaryData.length + 15;
    for (let i = 0; i < totalSumRows; i++) {
      summaryRows.push(Array(16).fill(''));
    }

    // Company logo/info (B1)
    summaryRows[0][1] = 'INDONESIA\nDWI SEMBILAN, PT';

    // Surat Jalan Title Section (merged D1:J5)
    summaryRows[0][3] = 'SURAT JALAN\n(Delivery Notes)\nSummary';

    // Metadata Header block on the right (K1:P5)
    summaryRows[0][10] = 'PTIDS Ref.';
    summaryRows[0][13] = ':';
    summaryRows[0][14] = targetNo;

    summaryRows[1][10] = 'Shipment Date';
    summaryRows[1][13] = ':';
    summaryRows[1][14] = formatExcelDate(head.Timestamp);

    summaryRows[2][10] = 'Tobacco Type';
    summaryRows[2][13] = ':';
    summaryRows[2][14] = headerType;

    summaryRows[3][10] = 'Sub Type';
    summaryRows[3][13] = ':';
    summaryRows[3][14] = headerSubType;

    summaryRows[4][10] = 'Sub Type (Year)';
    summaryRows[4][13] = ':';
    summaryRows[4][14] = headerCropYear;

    // Metadata Block Dari / Kepada (Row 7 to 12)
    summaryRows[6][1] = 'Dari (From)';
    summaryRows[6][9] = 'Kepada (To)';

    summaryRows[7][1] = 'Perusahaan (Company)';
    summaryRows[7][4] = ':';
    summaryRows[7][5] = excelMetadata.fromCompany;
    summaryRows[7][9] = 'Perusahaan (Company)';
    summaryRows[7][11] = ':';
    summaryRows[7][12] = excelMetadata.toCompany;

    summaryRows[8][1] = 'Gudang (Warehouse)';
    summaryRows[8][4] = ':';
    summaryRows[8][5] = excelMetadata.gudangAsal;
    summaryRows[8][9] = 'Tujuan (Destination)';
    summaryRows[8][11] = ':';
    summaryRows[8][12] = headerDestination;

    summaryRows[9][1] = 'Transportasi  (Transporter)';
    summaryRows[9][4] = ':';
    summaryRows[9][5] = excelMetadata.transporter;
    summaryRows[9][9] = 'Alamat (Address)';
    summaryRows[9][11] = ':';
    summaryRows[9][12] = excelMetadata.alamatTujuan;

    summaryRows[10][1] = 'No. Kendaraan  (Truck No.)';
    summaryRows[10][4] = ':';
    summaryRows[10][5] = excelMetadata.truckNo;

    summaryRows[11][1] = 'Keterangan (Remarks)';
    summaryRows[11][4] = ':';
    summaryRows[11][5] = excelMetadata.remarks;

    // Table Headers (Excel Row 16 & 17, indices 15 and 16)
    summaryRows[15][1] = 'No.';
    summaryRows[15][2] = 'Grade';
    summaryRows[15][4] = 'Jumlah';
    summaryRows[15][7] = 'Bruto';
    summaryRows[15][10] = 'Tara';
    summaryRows[15][13] = 'Netto';

    summaryRows[16][2] = '(Grade)';
    summaryRows[16][4] = '(Quantity)';
    summaryRows[16][7] = '(Gross)';
    summaryRows[16][10] = '(Tare)';
    summaryRows[16][13] = '(Net)';

    // Items Data
    summaryData.forEach((s, idx) => {
      const rIdx = 17 + idx;
      summaryRows[rIdx][1] = idx + 1;
      summaryRows[rIdx][2] = s.grade;
      summaryRows[rIdx][4] = s.jumlahBale;
      summaryRows[rIdx][7] = Number(s.jumlahBruto.toFixed(2));
      summaryRows[rIdx][10] = Number(s.jumlahTare.toFixed(2));
      summaryRows[rIdx][13] = Number(s.jumlahNetto.toFixed(2));
    });

    // Total Row
    const totalSumRowIdx = 17 + summaryData.length;
    summaryRows[totalSumRowIdx][2] = 'Jumlah (Total)';
    summaryRows[totalSumRowIdx][4] = detailData.length; // Total quantity
    summaryRows[totalSumRowIdx][7] = Number(totalBruto.toFixed(2));
    summaryRows[totalSumRowIdx][10] = Number(totalTare.toFixed(2));
    summaryRows[totalSumRowIdx][13] = Number(totalNetto.toFixed(2));

    // Footer Signatures
    const fIdxSum = totalSumRowIdx + 2;
    summaryRows[fIdxSum][10] = `${excelMetadata.gudangAsal}, ${formatExcelDate(head.Timestamp)}`;

    summaryRows[totalSumRowIdx + 4][1] = 'Penerima';
    summaryRows[totalSumRowIdx + 4][6] = 'Pengemudi';
    summaryRows[totalSumRowIdx + 4][10] = 'Pengirim';

    summaryRows[totalSumRowIdx + 5][1] = '(Receiver)';
    summaryRows[totalSumRowIdx + 5][6] = '(Driver)';
    summaryRows[totalSumRowIdx + 5][10] = '(Sender)';

    summaryRows[totalSumRowIdx + 9][1] = '(                                                                 )';
    summaryRows[totalSumRowIdx + 9][6] = `( ${excelMetadata.driverName} )`;
    summaryRows[totalSumRowIdx + 9][10] = `( ${excelMetadata.senderName} )`;


    // Converts to worksheets
    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);

    // Apply styling matching screenshots
    applyStyleToSheet(wsDetail, detailData.length, true);
    applyStyleToSheet(wsSummary, summaryData.length, false);

    // Apply merges
    const detailMerges = [
      // Logo Block
      { s: { r: 0, c: 1 }, e: { r: 4, c: 2 } },  // B1:C5 (Logo block)

      // Title Block
      { s: { r: 0, c: 3 }, e: { r: 4, c: 9 } },  // D1:J5 (SURAT JALAN title block)

      // Right-side Metadata Header block
      { s: { r: 0, c: 14 }, e: { r: 0, c: 15 } }, // O1:P1
      { s: { r: 1, c: 14 }, e: { r: 1, c: 15 } }, // O2:P2
      { s: { r: 2, c: 14 }, e: { r: 2, c: 15 } }, // O3:P3
      { s: { r: 3, c: 14 }, e: { r: 3, c: 15 } }, // O4:P4
      { s: { r: 4, c: 14 }, e: { r: 4, c: 15 } }, // O5:P5

      // Dari block
      { s: { r: 7, c: 1 }, e: { r: 7, c: 3 } },  // Label Perusahaan Dari B8:D8
      { s: { r: 7, c: 5 }, e: { r: 7, c: 7 } },  // Value Perusahaan Dari F8:H8
      { s: { r: 8, c: 1 }, e: { r: 8, c: 3 } },  // Label Gudang Dari B9:D9
      { s: { r: 8, c: 5 }, e: { r: 8, c: 7 } },  // Value Gudang Dari F9:H9
      { s: { r: 9, c: 1 }, e: { r: 9, c: 3 } },  // Label Transportasi Dari B10:D10
      { s: { r: 9, c: 5 }, e: { r: 9, c: 7 } },  // Value Transportasi Dari F10:H10
      { s: { r: 10, c: 1 }, e: { r: 10, c: 3 } }, // Label No Kendaraan Dari B11:D11
      { s: { r: 10, c: 5 }, e: { r: 10, c: 7 } }, // Value No Kendaraan Dari F11:H11
      { s: { r: 11, c: 1 }, e: { r: 11, c: 3 } }, // Label Keterangan Dari B12:D12
      { s: { r: 11, c: 5 }, e: { r: 11, c: 7 } }, // Value Keterangan Dari F12:H12

      // Kepada block
      { s: { r: 7, c: 9 }, e: { r: 7, c: 10 } }, // Label Perusahaan Kepada J8:K8
      { s: { r: 7, c: 12 }, e: { r: 7, c: 15 } }, // Value Perusahaan Kepada M8:P8
      { s: { r: 8, c: 9 }, e: { r: 8, c: 10 } }, // Label Tujuan Kepada J9:K9
      { s: { r: 8, c: 12 }, e: { r: 8, c: 15 } }, // Value Tujuan Kepada M9:P9
      { s: { r: 9, c: 9 }, e: { r: 9, c: 10 } }, // Label Alamat J10:K10
      { s: { r: 9, c: 12 }, e: { r: 11, c: 15 } }, // Value Alamat Kepada M10:P12

      // Table Header merges
      { s: { r: 15, c: 1 }, e: { r: 16, c: 1 } },  // B16:B17 No.
      { s: { r: 15, c: 2 }, e: { r: 15, c: 3 } },  // C16:D16 No. Bale
      { s: { r: 16, c: 2 }, e: { r: 16, c: 3 } },  // C17:D17 (Bale No.)
      { s: { r: 15, c: 4 }, e: { r: 15, c: 6 } },  // E16:G16 Grade
      { s: { r: 16, c: 4 }, e: { r: 16, c: 6 } },  // E17:G17 (Grade)
      { s: { r: 15, c: 7 }, e: { r: 15, c: 9 } },  // H16:J16 Bruto
      { s: { r: 16, c: 7 }, e: { r: 16, c: 9 } },  // H17:J17 (Gross)
      { s: { r: 15, c: 10 }, e: { r: 15, c: 12 } }, // K16:M16 Tara
      { s: { r: 16, c: 10 }, e: { r: 16, c: 12 } }, // K17:M17 (Tare)
      { s: { r: 15, c: 13 }, e: { r: 15, c: 15 } }, // N16:P16 Netto
      { s: { r: 16, c: 13 }, e: { r: 16, c: 15 } }, // N17:P17 (Net)
    ];

    detailData.forEach((d, idx) => {
      const rIdx = 17 + idx;
      detailMerges.push(
        { s: { r: rIdx, c: 2 }, e: { r: rIdx, c: 3 } },   // C:D No. Bale
        { s: { r: rIdx, c: 4 }, e: { r: rIdx, c: 6 } },   // E:G Grade
        { s: { r: rIdx, c: 7 }, e: { r: rIdx, c: 9 } },   // H:J Bruto
        { s: { r: rIdx, c: 10 }, e: { r: rIdx, c: 12 } }, // K:M Tara
        { s: { r: rIdx, c: 13 }, e: { r: rIdx, c: 15 } }  // N:P Netto
      );
    });

    detailMerges.push(
      { s: { r: totalRowIdx, c: 2 }, e: { r: totalRowIdx, c: 3 } },   // C:D Jumlah (Total)
      { s: { r: totalRowIdx, c: 4 }, e: { r: totalRowIdx, c: 6 } },   // E:G Bale Count
      { s: { r: totalRowIdx, c: 7 }, e: { r: totalRowIdx, c: 9 } },   // H:J Total Bruto
      { s: { r: totalRowIdx, c: 10 }, e: { r: totalRowIdx, c: 12 } }, // K:M Total Tara
      { s: { r: totalRowIdx, c: 13 }, e: { r: totalRowIdx, c: 15 } }  // N:P Total Netto
    );

    detailMerges.push(
      { s: { r: fIdx, c: 10 }, e: { r: fIdx, c: 15 } }, // K22:P22 Lombok, 14-Jul-2026
      
      { s: { r: totalRowIdx + 4, c: 1 }, e: { r: totalRowIdx + 4, c: 3 } }, // Penerima B24:D24
      { s: { r: totalRowIdx + 4, c: 6 }, e: { r: totalRowIdx + 4, c: 9 } }, // Pengemudi G24:J24
      { s: { r: totalRowIdx + 4, c: 10 }, e: { r: totalRowIdx + 4, c: 15 } }, // Pengirim K24:P24

      { s: { r: totalRowIdx + 5, c: 1 }, e: { r: totalRowIdx + 5, c: 3 } }, // (Receiver) B25:D25
      { s: { r: totalRowIdx + 5, c: 6 }, e: { r: totalRowIdx + 5, c: 9 } }, // (Driver) G25:J25
      { s: { r: totalRowIdx + 5, c: 10 }, e: { r: totalRowIdx + 5, c: 15 } }, // (Sender) K25:P25

      { s: { r: totalRowIdx + 9, c: 1 }, e: { r: totalRowIdx + 9, c: 3 } }, // (               ) B29:D29
      { s: { r: totalRowIdx + 9, c: 6 }, e: { r: totalRowIdx + 9, c: 9 } }, // ( Driver Name ) G29:J29
      { s: { r: totalRowIdx + 9, c: 10 }, e: { r: totalRowIdx + 9, c: 15 } } // ( Sender Name ) K29:P29
    );

    const summaryMerges = [
      // Logo Block
      { s: { r: 0, c: 1 }, e: { r: 4, c: 2 } },  // B1:C5 (Logo block)

      // Title Block
      { s: { r: 0, c: 3 }, e: { r: 4, c: 9 } },  // D1:J5 (SURAT JALAN title block)

      // Right-side Metadata Header block
      { s: { r: 0, c: 14 }, e: { r: 0, c: 15 } }, // O1:P1
      { s: { r: 1, c: 14 }, e: { r: 1, c: 15 } }, // O2:P2
      { s: { r: 2, c: 14 }, e: { r: 2, c: 15 } }, // O3:P3
      { s: { r: 3, c: 14 }, e: { r: 3, c: 15 } }, // O4:P4
      { s: { r: 4, c: 14 }, e: { r: 4, c: 15 } }, // O5:P5

      // Dari block
      { s: { r: 7, c: 1 }, e: { r: 7, c: 3 } },  // Label Perusahaan Dari B8:D8
      { s: { r: 7, c: 5 }, e: { r: 7, c: 7 } },  // Value Perusahaan Dari F8:H8
      { s: { r: 8, c: 1 }, e: { r: 8, c: 3 } },  // Label Gudang Dari B9:D9
      { s: { r: 8, c: 5 }, e: { r: 8, c: 7 } },  // Value Gudang Dari F9:H9
      { s: { r: 9, c: 1 }, e: { r: 9, c: 3 } },  // Label Transportasi Dari B10:D10
      { s: { r: 9, c: 5 }, e: { r: 9, c: 7 } },  // Value Transportasi Dari F10:H10
      { s: { r: 10, c: 1 }, e: { r: 10, c: 3 } }, // Label No Kendaraan Dari B11:D11
      { s: { r: 10, c: 5 }, e: { r: 10, c: 7 } }, // Value No Kendaraan Dari F11:H11
      { s: { r: 11, c: 1 }, e: { r: 11, c: 3 } }, // Label Keterangan Dari B12:D12
      { s: { r: 11, c: 5 }, e: { r: 11, c: 7 } }, // Value Keterangan Dari F12:H12

      // Kepada block
      { s: { r: 7, c: 9 }, e: { r: 7, c: 10 } }, // Label Perusahaan Kepada J8:K8
      { s: { r: 7, c: 12 }, e: { r: 7, c: 15 } }, // Value Perusahaan Kepada M8:P8
      { s: { r: 8, c: 9 }, e: { r: 8, c: 10 } }, // Label Tujuan Kepada J9:K9
      { s: { r: 8, c: 12 }, e: { r: 8, c: 15 } }, // Value Tujuan Kepada M9:P9
      { s: { r: 9, c: 9 }, e: { r: 9, c: 10 } }, // Label Alamat J10:K10
      { s: { r: 9, c: 12 }, e: { r: 11, c: 15 } }, // Value Alamat Kepada M10:P12

      // Table Header merges
      { s: { r: 15, c: 1 }, e: { r: 16, c: 1 } },  // B16:B17 No.
      { s: { r: 15, c: 2 }, e: { r: 15, c: 3 } },  // C16:D16 No. Bale
      { s: { r: 16, c: 2 }, e: { r: 16, c: 3 } },  // C17:D17 (Bale No.)
      { s: { r: 15, c: 4 }, e: { r: 15, c: 6 } },  // E16:G16 Grade
      { s: { r: 16, c: 4 }, e: { r: 16, c: 6 } },  // E17:G17 (Grade)
      { s: { r: 15, c: 7 }, e: { r: 15, c: 9 } },  // H16:J16 Bruto
      { s: { r: 16, c: 7 }, e: { r: 16, c: 9 } },  // H17:J17 (Gross)
      { s: { r: 15, c: 10 }, e: { r: 15, c: 12 } }, // K16:M16 Tara
      { s: { r: 16, c: 10 }, e: { r: 16, c: 12 } }, // K17:M17 (Tare)
      { s: { r: 15, c: 13 }, e: { r: 15, c: 15 } }, // N16:P16 Netto
      { s: { r: 16, c: 13 }, e: { r: 16, c: 15 } }, // N17:P17 (Net)
    ];

    summaryData.forEach((s, idx) => {
      const rIdx = 17 + idx;
      summaryMerges.push(
        { s: { r: rIdx, c: 2 }, e: { r: rIdx, c: 3 } },   // C:D Grade
        { s: { r: rIdx, c: 4 }, e: { r: rIdx, c: 6 } },   // E:G Jumlah
        { s: { r: rIdx, c: 7 }, e: { r: rIdx, c: 9 } },   // H:J Bruto
        { s: { r: rIdx, c: 10 }, e: { r: rIdx, c: 12 } }, // K:M Tara
        { s: { r: rIdx, c: 13 }, e: { r: rIdx, c: 15 } }  // N:P Netto
      );
    });

    summaryMerges.push(
      { s: { r: totalSumRowIdx, c: 2 }, e: { r: totalSumRowIdx, c: 3 } },   // C:D Jumlah (Total)
      { s: { r: totalSumRowIdx, c: 4 }, e: { r: totalSumRowIdx, c: 6 } },   // E:G Quantity Total
      { s: { r: totalSumRowIdx, c: 7 }, e: { r: totalSumRowIdx, c: 9 } },   // H:J Total Bruto
      { s: { r: totalSumRowIdx, c: 10 }, e: { r: totalSumRowIdx, c: 12 } }, // K:M Total Tara
      { s: { r: totalSumRowIdx, c: 13 }, e: { r: totalSumRowIdx, c: 15 } }  // N:P Total Netto
    );

    summaryMerges.push(
      { s: { r: fIdxSum, c: 10 }, e: { r: fIdxSum, c: 15 } }, // K22:P22 Lombok, 14-Jul-2026
      
      { s: { r: totalSumRowIdx + 4, c: 1 }, e: { r: totalSumRowIdx + 4, c: 3 } }, // Penerima B24:D24
      { s: { r: totalSumRowIdx + 4, c: 6 }, e: { r: totalSumRowIdx + 4, c: 9 } }, // Pengemudi G24:J24
      { s: { r: totalSumRowIdx + 4, c: 10 }, e: { r: totalSumRowIdx + 4, c: 15 } }, // Pengirim K24:P24

      { s: { r: totalSumRowIdx + 5, c: 1 }, e: { r: totalSumRowIdx + 5, c: 3 } }, // (Receiver) B25:D25
      { s: { r: totalSumRowIdx + 5, c: 6 }, e: { r: totalSumRowIdx + 5, c: 9 } }, // (Driver) G25:J25
      { s: { r: totalSumRowIdx + 5, c: 10 }, e: { r: totalSumRowIdx + 5, c: 15 } }, // (Sender) K25:P25

      { s: { r: totalSumRowIdx + 9, c: 1 }, e: { r: totalSumRowIdx + 9, c: 3 } }, // (               ) B29:D29
      { s: { r: totalSumRowIdx + 9, c: 6 }, e: { r: totalSumRowIdx + 9, c: 9 } }, // ( Driver Name ) G29:J29
      { s: { r: totalSumRowIdx + 9, c: 10 }, e: { r: totalSumRowIdx + 9, c: 15 } } // ( Sender Name ) K29:P29
    );

    wsDetail['!merges'] = detailMerges;
    wsSummary['!merges'] = summaryMerges;

    // Apply column widths (highly optimized to fit perfectly on A4 portrait width)
    const cols = [
      { wch: 2 },  // A (Margin)
      { wch: 4 },  // B (No.)
      { wch: 8 },  // C (No. Bale col 1)
      { wch: 8 },  // D (No. Bale col 2)
      { wch: 6 },  // E (Grade col 1)
      { wch: 6 },  // F (Grade col 2)
      { wch: 6 },  // G (Grade col 3)
      { wch: 5 },  // H (Bruto col 1)
      { wch: 5 },  // I (Bruto col 2)
      { wch: 5 },  // J (Bruto col 3)
      { wch: 5 },  // K (Tara col 1 / Right labels)
      { wch: 5 },  // L (Tara col 2)
      { wch: 5 },  // M (Tara col 3)
      { wch: 4 },  // N (Netto col 1 / :)
      { wch: 12 }, // O (Netto col 2 / Right values)
      { wch: 12 }, // P (Netto col 3 / Right values)
    ];

    wsDetail['!cols'] = cols;
    wsSummary['!cols'] = cols;

    // Configure page setup, margins, and fitToPage properties for A4 portrait fit-to-page (1 page wide, 1 page high)
    const pageSetup = {
      paperSize: 9,      // A4 Paper Size
      orientation: 'portrait',
      fitToPage: true,   // Tells Excel to use fitToWidth and fitToHeight scale
      fitToWidth: 1,     // Fits all columns to 1 page wide
      fitToHeight: 1     // Fits all rows to 1 page high
    };

    const sheetPr = {
      pageSetUpPr: {
        fitToPage: true  // Crucial for Excel/LibreOffice to activate fitToPage mode
      }
    };

    const margins = {
      left: 0.25,        // Tight margins so content utilizes the page space nicely
      right: 0.25,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2
    };

    wsDetail['!pageSetup'] = pageSetup;
    wsSummary['!pageSetup'] = pageSetup;
    wsDetail['!sheetPr'] = sheetPr;
    wsSummary['!sheetPr'] = sheetPr;
    wsDetail['!margins'] = margins;
    wsSummary['!margins'] = margins;

    // 4. Build final workbook and write
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Delivery Notes-Detail');
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Delivery Notes-Recapt');

    if (companyLogo) {
      try {
        const excelBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(excelBuffer);

        const base64Data = companyLogo.replace(/^data:image\/\w+;base64,/, "");
        const extension = companyLogo.match(/image\/(\w+)/)?.[1] || 'png';

        const imageId = workbook.addImage({
          base64: base64Data,
          extension: extension as any,
        });

        workbook.eachSheet((worksheet) => {
          // Clear the default text in B1 so it doesn't overlap
          const cellB1 = worksheet.getCell('B1');
          cellB1.value = '';

          // Add the logo image in the merged B1:C5 area
          worksheet.addImage(imageId, {
            tl: { col: 1, row: 0 } as any,
            br: { col: 3, row: 5 } as any,
            editAs: 'oneCell'
          });
        });

        const modifiedBuffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([modifiedBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Shipping_${targetNo}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Error adding logo to Excel workbook', err);
        XLSX.writeFile(wb, `Shipping_${targetNo}.xlsx`);
      }
    } else {
      XLSX.writeFile(wb, `Shipping_${targetNo}.xlsx`);
    }

    showToast(`File Excel Shipping_${targetNo}.xlsx berhasil diunduh dengan format Surat Jalan.`, 'ok');
    setShowExportModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-4 rounded-xl shadow-xl font-bold flex items-center gap-3 text-sm text-white ${toastMsg.type === 'ok' ? 'bg-emerald-600 border-l-4 border-emerald-300' : 'bg-rose-600 border-l-4 border-rose-300'}`}>
          {toastMsg.text}
        </div>
      )}

      {/* Shipping Form */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <Truck size={18} className="text-amber-500" />
            Form Shipping
          </h3>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Quick Open/Lookup Existing Shipping */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <Search size={13} className="text-slate-400" />
              <input
                type="text"
                value={lookupNoShipping}
                onChange={e => setLookupNoShipping(e.target.value.toUpperCase())}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    triggerOpenLookup();
                  }
                }}
                placeholder="Buka No Shipping..."
                className="w-32 bg-transparent text-xs font-mono font-bold focus:outline-none text-slate-800 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={triggerOpenLookup}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-[10px] rounded uppercase cursor-pointer"
                title="Buka transaksi shipping yang sudah ada untuk dilihat atau diedit"
              >
                Buka
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-2xs cursor-pointer active:scale-95"
              title="Import data shipping pengiriman dari Excel / CSV (Otomatis kurangi stok gudang)"
            >
              <FileSpreadsheet size={15} className="text-amber-600" />
              Import Excel / CSV
            </button>
          </div>
        </div>

        {/* Info Session Box */}
        <div className="p-3.5 rounded-xl text-xs flex gap-3 items-start bg-slate-50 border border-slate-100 text-slate-500">
          <CheckSquare size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="leading-relaxed">
            Lengkapi data header (User, Type, Sub Type, Crop Year, Destination) lalu klik tombol <b>Simpan Header &amp; Dapatkan No Shipping</b>. Setelah itu, silakan scan barcode bal yang akan dikirimkan. 
            <span className="text-emerald-700 font-bold block mt-1">
              💡 Fitur Timbang Ulang Bale: Kolom <b>Netto (kg)</b> pada tabel dapat langsung Anda edit saat menimbang ulang sebelum atau setelah bal disimpan. Anda juga dapat mengklik tombol <b>Edit Berat</b> pada tabel Riwayat Shipping di bawah.
            </span>
          </p>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 flex justify-between items-center">
              <span>No Shipping</span>
              {isEditingMode ? (
                <span className="text-amber-700 font-extrabold animate-pulse text-[9px] bg-amber-100 px-1 rounded">MODE EDIT</span>
              ) : currentNoShipping ? (
                <span className="text-emerald-700 font-extrabold text-[9px] bg-emerald-100 px-1 rounded">AKTIF</span>
              ) : (
                <span className="text-slate-400 font-normal text-[9px]">Otomatis / Manual</span>
              )}
            </label>
            {currentNoShipping ? (
              <div className="flex items-center gap-1.5">
                <div className={`flex-1 px-3 py-2 ${isEditingMode ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-emerald-50 border-emerald-300 text-emerald-950'} border rounded-lg text-xs font-mono font-black flex items-center justify-between`}>
                  <span>{currentNoShipping}</span>
                  <span className="text-[9px] font-sans font-bold text-slate-500 uppercase">Tersimpan</span>
                </div>
                {!isEditingMode && (
                  <button
                    type="button"
                    onClick={() => startNewSession(true)}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex-shrink-0 cursor-pointer"
                    title="Mulai Sesi / No Shipping Baru"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={customNoShippingInput}
                  onChange={e => setCustomNoShippingInput(e.target.value.toUpperCase())}
                  placeholder="Otomatis (atau ketik manual)"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  title="Kosongkan untuk otomatis dari sistem (SHP-XXXX), atau ketik nomor manual jika ada"
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase">
                Tgl Shipping
              </label>
              {tanggalShipping !== getTodayDateString() ? (
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
                value={tanggalShipping}
                onChange={e => setTanggalShipping(e.target.value)}
                className="w-full pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-700"
              />
              <Calendar size={13} className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
            </div>
            {tanggalShipping !== getTodayDateString() && (
              <button
                type="button"
                onClick={() => setTanggalShipping(getTodayDateString())}
                className="text-[10px] text-amber-700 hover:underline font-bold mt-1 inline-block"
              >
                Reset ke Hari ini
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">User yang Shipping</label>
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

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 flex justify-between items-center">
              <span>Destination (Tujuan)</span>
              {destination.trim() && (
                <span className={`text-[10px] font-bold ${isDestinationDone ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {isDestinationDone ? '✓ Selesai' : 'Tekan Enter / Selesai'}
                </span>
              )}
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={destination}
                onChange={e => {
                  setDestination(e.target.value);
                  setIsDestinationDone(false);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (destination.trim()) {
                      setIsDestinationDone(true);
                    }
                  }
                }}
                onBlur={() => {
                  if (destination.trim()) {
                    setIsDestinationDone(true);
                  }
                }}
                className={`w-full px-3 py-2 ${
                  destination.trim() && !isDestinationDone ? 'pr-18' : 'pr-3'
                } bg-slate-50 border ${
                  isDestinationDone && destination.trim()
                    ? 'border-emerald-300 bg-emerald-50/20'
                    : 'border-slate-200'
                } rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500`}
                placeholder="Tujuan pengiriman"
              />
              {destination.trim() && !isDestinationDone && (
                <button
                  type="button"
                  onClick={() => setIsDestinationDone(true)}
                  className="absolute right-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-black rounded-md transition shadow-2xs cursor-pointer active:scale-95"
                  title="Klik jika selesai mengetik tujuan"
                >
                  Selesai
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Header Action Bar */}
        {isEditingMode ? (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-amber-50/70 border border-amber-200 p-3 rounded-xl gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
              <span className="text-xs text-amber-950 font-bold">
                Mengedit Transaksi: <b className="font-mono bg-white px-2 py-0.5 rounded border border-amber-300 text-xs">{currentNoShipping}</b>
              </span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => {
                  if (confirm('Apakah Anda yakin ingin membatalkan (void) seluruh transaksi Shipping ini? Semua barcode akan dikembalikan statusnya.')) {
                    setAdminActionType('void');
                    setAdminPinOpen(true);
                  }
                }}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition shadow flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={13} />
                Void Transaksi
              </button>
              <button
                type="button"
                onClick={handleUpdateHeader}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold rounded-lg transition shadow flex items-center gap-1 cursor-pointer"
              >
                Simpan Perubahan Header
              </button>
            </div>
          </div>
        ) : currentNoShipping ? (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-emerald-50/70 border border-emerald-200 p-3 rounded-xl gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs text-emerald-950 font-bold flex flex-wrap items-center gap-2">
                <span>Header Tersimpan:</span>
                <span className="font-mono text-sm font-black bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300">
                  {currentNoShipping}
                </span>
                <span className="text-slate-600 font-normal text-xs">• Tujuan: <b>{destination}</b></span>
              </span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleUpdateHeader}
                className="px-3.5 py-1.5 bg-white hover:bg-emerald-100/50 border border-emerald-300 text-emerald-900 text-xs font-bold rounded-lg transition shadow-2xs flex items-center gap-1 cursor-pointer"
                title="Simpan jika ada perubahan pada Operator, Tanggal, atau Tujuan"
              >
                Simpan Perubahan Header
              </button>
              <button
                type="button"
                onClick={() => startNewSession(true)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition shadow flex items-center gap-1 cursor-pointer"
              >
                <Plus size={13} />
                Sesi Baru (No Shipping Baru)
              </button>
            </div>
          </div>
        ) : isHeaderFilled() ? (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-emerald-50/80 border border-emerald-300 p-3.5 rounded-xl gap-3 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-200 text-emerald-900">
                <Truck size={18} />
              </div>
              <div>
                <span className="text-xs font-bold text-emerald-950 block">
                  Header Lengkap — Siap Simpan & Dapatkan No Shipping
                </span>
                <span className="text-[11px] text-emerald-800">
                  Tujuan: <b>{destination}</b>. Klik tombol di samping untuk menyimpan header dan memunculkan No Shipping resmi.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveHeader}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <CheckSquare size={16} />
              Simpan Header & Dapatkan No Shipping
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-slate-500">
            <div className="p-2 rounded-lg bg-slate-200 text-slate-500">
              <Truck size={16} />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-700 block">
                Form Header Belum Lengkap
              </span>
              <span className="text-[11px] text-slate-500">
                {!operator
                  ? 'Harap pilih User yang Shipping.'
                  : !type || !subType || !cropYear
                  ? 'Harap lengkapi Type, Sub Type, dan Crop Year.'
                  : !destination.trim()
                  ? 'Ketik Destination (Tujuan Pengiriman).'
                  : !isDestinationDone
                  ? 'Selesaikan ketik Destination lalu tekan Enter atau klik tombol Selesai untuk memunculkan tombol Simpan No Shipping.'
                  : 'Lengkapi seluruh data header di atas.'}
              </span>
            </div>
          </div>
        )}

        {/* Scan Barcode grid gates */}
        {!currentNoShipping ? (
          <div className="bg-slate-50 border border-slate-200 p-6 text-center text-xs font-medium text-slate-500 rounded-xl flex flex-col items-center justify-center gap-2">
            <div className="p-2.5 rounded-full bg-slate-100 text-slate-400">
              <Truck size={22} />
            </div>
            <span className="font-bold text-slate-700">No Shipping Belum Aktif</span>
            <span className="text-[11px] text-slate-500 max-w-md">
              Lengkapi form header di atas, selesai ketik destination, lalu klik <b>Simpan Header & Dapatkan No Shipping</b>. Setelah No Shipping resmi muncul, tabel scan barcode akan terbuka otomatis.
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Scan Barcode (Sudah Direclass)</h4>
              
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
                    <th className="px-4 py-2.5 min-w-[150px]">Grade Reclass (Terakhir)</th>
                    <th className="px-4 py-2.5 w-32">Netto (kg)</th>
                    <th className="px-4 py-2.5 w-32">Tare (kg)</th>
                    <th className="px-4 py-2.5 w-24 text-center">Status</th>
                    <th className="px-4 py-2.5 w-36 text-center">Aksi</th>
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
                        {/* Barcode input */}
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

                        {/* Grade Reclass Display */}
                        <td className="px-4 py-2 font-bold text-slate-500 text-[11px]">
                          {item.gradeReclass || '-'}
                        </td>

                        {/* Netto edit input (Bisa edit saat timbang ulang kapan saja) */}
                        <td className="px-4 py-2">
                          <div className="relative">
                            <input
                              type="number"
                              ref={el => (nettoRefs.current[item.id] = el)}
                              disabled={!item.isMatched}
                              value={item.beratNetto}
                              onChange={e => {
                                const val = e.target.value;
                                setGridItems(prev => prev.map(it => it.id === item.id ? { ...it, beratNetto: val } : it));
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveShippingRow(item.id);
                                }
                              }}
                              placeholder="0.00"
                              min="0"
                              step="0.01"
                              className={`w-full px-2.5 py-1 bg-white border ${
                                item.isSaved ? 'border-emerald-300 focus:border-amber-500' : 'border-slate-200 focus:border-amber-500'
                              } rounded focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold text-right disabled:bg-slate-50`}
                              title="Bisa diedit/timbang ulang kapan saja. Tekan Enter atau klik Simpan untuk memperbarui."
                            />
                          </div>
                        </td>

                        {/* Tare Display */}
                        <td className="px-4 py-2 font-mono font-bold text-slate-400">
                          {item.tare || '-'}
                        </td>

                        {/* Status Label */}
                        <td className="px-4 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${item.isSaved ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                            {item.statusText}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {item.isMatched && (
                              <button
                                type="button"
                                onClick={() => handleSaveShippingRow(item.id)}
                                className={`px-2.5 py-1 ${
                                  item.isSaved
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                                } text-[10px] font-extrabold rounded-md shadow-sm transition active:scale-95 flex items-center gap-1`}
                                title={item.isSaved ? "Simpan Perubahan Berat Timbang Ulang" : "Simpan Baris"}
                              >
                                {item.isSaved ? 'Update Berat' : 'Simpan'}
                              </button>
                            )}
                            {(!item.isSaved || isEditingMode) && (
                              <button
                                type="button"
                                onClick={() => removeGridRow(item.id)}
                                className="text-slate-400 hover:text-rose-600 p-1 hover:bg-slate-50 rounded transition font-black text-sm"
                                title={item.isSaved ? "Hapus Barcode dari Shipping" : "Hapus Baris"}
                              >
                                &times;
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

            {/* Actions for active session */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => startNewSession(true)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Transaksi Baru (No Shipping Baru)
              </button>
              {currentNoShipping && (
                <button
                  onClick={() => exportToExcel(currentNoShipping)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow"
                >
                  <FileSpreadsheet size={13} /> Export ke Excel
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* History table lists */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
        <h3 className="text-md font-extrabold text-slate-800">Riwayat Shipping</h3>
        <div className="flex max-w-sm gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
              placeholder="Cari No Shipping / No Barcode..."
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
                <th className="px-4 py-2.5 text-xs uppercase">No Shipping</th>
                <th className="px-4 py-2.5 text-xs uppercase">No Barcode</th>
                <th className="px-4 py-2.5 text-xs uppercase">Type / SubType / Year</th>
                <th className="px-4 py-2.5 text-xs uppercase">Destination</th>
                <th className="px-4 py-2.5 text-xs uppercase">Grade Reclass</th>
                <th className="px-4 py-2.5 text-xs uppercase text-right">Netto (kg)</th>
                <th className="px-4 py-2.5 text-xs uppercase text-right">Tare (kg)</th>
                <th className="px-4 py-2.5 text-xs uppercase">Tanggal</th>
                <th className="px-4 py-2.5 text-xs uppercase w-20 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-xs">
                    Belum ada data pengiriman (Shipping).
                  </td>
                </tr>
              ) : (
                filteredHistory.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 text-xs">
                    <td className="px-4 py-3 font-semibold text-slate-500 font-mono">{r.NoShipping}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold bg-slate-900 text-amber-500 px-2 py-0.5 rounded text-[10px] tracking-wider">
                        {r.NoBarcodeAsal}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-medium">
                      {[r.Type, r.SubType, r.CropYear].filter(Boolean).join(' / ') || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{r.Destination || '-'}</td>
                    <td className="px-4 py-3 font-bold font-mono text-slate-800">{r.GradeReclass}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-800 font-semibold">{Number(r.BeratNetto).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500">{Number(r.Tare || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono">{r.Timestamp}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditWeightItem({
                              noShipping: r.NoShipping,
                              noBarcodeAsal: r.NoBarcodeAsal,
                              gradeReclass: r.GradeReclass,
                              currentNetto: Number(r.BeratNetto) || 0,
                              newNetto: String(r.BeratNetto || '')
                            });
                          }}
                          className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold rounded transition inline-flex items-center gap-1 cursor-pointer"
                          title="Timbang Ulang / Edit Berat Bale"
                        >
                          <Edit2 size={10} className="text-amber-600" /> Edit Berat
                        </button>
                        {r.NoShipping && r.NoShipping !== '-' && (
                          <button
                            type="button"
                            onClick={() => exportToExcel(r.NoShipping)}
                            className="px-2 py-1 border border-slate-200 hover:bg-slate-50 text-[10px] font-bold text-slate-700 rounded transition inline-flex items-center gap-1 cursor-pointer"
                            title="Export Surat Jalan Excel"
                          >
                            <FileSpreadsheet size={10} className="text-emerald-600" /> Export
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

      {/* MODAL EXPORT EXCEL METADATA */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden transform scale-100 transition-all">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black tracking-wide uppercase">Pengaturan Surat Jalan (Excel Export)</h3>
                <p className="text-[10px] text-emerald-100 mt-0.5 font-medium">Lengkapi metadata dokumen Surat Jalan untuk No Shipping: <span className="font-mono font-bold text-white bg-slate-950/20 px-1.5 py-0.5 rounded">{exportNoShipping}</span></p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition text-lg"
              >
                &times;
              </button>
            </div>

            {/* Form Content */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Logo Upload Section */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-200/60 pb-1 flex items-center gap-1.5">
                  <ImageIcon size={12} className="text-slate-500" /> LOGO SURAT JALAN (COMPANY LOGO)
                </h4>
                
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  {/* Preview Area */}
                  <div className="w-28 h-28 bg-white border border-slate-200 rounded-xl flex flex-col items-center justify-center overflow-hidden p-2 relative group shadow-sm shrink-0">
                    {companyLogo ? (
                      <>
                        <img 
                          src={companyLogo} 
                          alt="Company Logo Preview" 
                          className="max-w-full max-h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="absolute inset-0 bg-slate-900/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-white rounded-xl"
                          title="Hapus Logo"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : (
                      <div className="text-center p-2">
                        <ImageIcon size={24} className="text-slate-300 mx-auto mb-1" />
                        <span className="text-[9px] font-bold text-slate-400 block uppercase">No Image</span>
                        <span className="text-[8px] text-slate-400 block mt-0.5 font-mono leading-tight">Default Text:<br/>INDONESIA<br/>DWI SEMBILAN</span>
                      </div>
                    )}
                  </div>

                  {/* Drop / Select Area */}
                  <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`flex-1 w-full h-28 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-4 text-center cursor-pointer transition ${isDragActive ? 'border-amber-500 bg-amber-50/50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                    onClick={() => document.getElementById('logo-file-input')?.click()}
                  >
                    <input 
                      id="logo-file-input"
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <Upload size={20} className={`mb-1.5 ${isDragActive ? 'text-amber-500 animate-bounce' : 'text-slate-400'}`} />
                    <p className="text-xs font-bold text-slate-700">Tarik & Lepas logo di sini, atau klik untuk memilih</p>
                    <p className="text-[10px] text-slate-400 mt-1 font-medium font-mono">Format PNG, JPG, JPEG (Maks. 2MB)</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Dari (From) Section */}
                <div className="bg-slate-50 p-4 rounded-xl space-y-3 border border-slate-100">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-200/60 pb-1">DARI (FROM)</h4>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Perusahaan (Company)</label>
                    <input
                      type="text"
                      value={excelMetadata.fromCompany}
                      onChange={e => saveExcelMetadata({ ...excelMetadata, fromCompany: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Gudang (Warehouse)</label>
                    <input
                      type="text"
                      value={excelMetadata.gudangAsal}
                      onChange={e => saveExcelMetadata({ ...excelMetadata, gudangAsal: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                    />
                  </div>
                </div>

                {/* Kepada (To) Section */}
                <div className="bg-slate-50 p-4 rounded-xl space-y-3 border border-slate-100">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-200/60 pb-1">KEPADA (TO)</h4>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Perusahaan (Company)</label>
                    <input
                      type="text"
                      value={excelMetadata.toCompany}
                      onChange={e => saveExcelMetadata({ ...excelMetadata, toCompany: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Alamat (Address)</label>
                    <input
                      type="text"
                      value={excelMetadata.alamatTujuan}
                      onChange={e => saveExcelMetadata({ ...excelMetadata, alamatTujuan: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Transport, Remarks & Signatures */}
              <div className="bg-slate-50 p-4 rounded-xl space-y-4 border border-slate-100">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-200/60 pb-1">TRANSPORTASI & TANDA TANGAN</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Transportasi</label>
                    <input
                      type="text"
                      value={excelMetadata.transporter}
                      onChange={e => saveExcelMetadata({ ...excelMetadata, transporter: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">No. Kendaraan (Truck No.)</label>
                    <input
                      type="text"
                      value={excelMetadata.truckNo}
                      onChange={e => saveExcelMetadata({ ...excelMetadata, truckNo: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Keterangan (Remarks)</label>
                    <input
                      type="text"
                      value={excelMetadata.remarks}
                      onChange={e => saveExcelMetadata({ ...excelMetadata, remarks: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nama Pengirim (Sender)</label>
                    <input
                      type="text"
                      value={excelMetadata.senderName}
                      onChange={e => saveExcelMetadata({ ...excelMetadata, senderName: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nama Pengemudi (Driver)</label>
                    <input
                      type="text"
                      value={excelMetadata.driverName}
                      onChange={e => saveExcelMetadata({ ...excelMetadata, driverName: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-2 border-t border-slate-100">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Batal
              </button>
              <button
                onClick={() => executeExcelExport(exportNoShipping)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow flex items-center gap-1.5"
              >
                <FileSpreadsheet size={13} /> Proses Download Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT BERAT BALE (TIMBANG ULANG) */}
      {editWeightItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 text-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-white/20 text-slate-950">
                  <Scale size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide">Timbang Ulang / Edit Berat Bale</h3>
                  <p className="text-[11px] font-semibold text-amber-950/80">Perbarui berat netto bale pada transaksi shipping</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditWeightItem(null)}
                className="text-slate-950/70 hover:text-slate-950 p-1 rounded-lg hover:bg-black/10 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1.5 font-medium">
                <div className="flex justify-between">
                  <span className="text-slate-500">No Shipping:</span>
                  <span className="font-mono font-bold text-slate-800">{editWeightItem.noShipping}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">No Barcode:</span>
                  <span className="font-mono font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                    {editWeightItem.noBarcodeAsal}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Grade Reclass:</span>
                  <span className="font-bold text-slate-800">{editWeightItem.gradeReclass || '-'}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200/60 pt-1.5">
                  <span className="text-slate-500">Berat Netto Sebelumnya:</span>
                  <span className="font-mono font-bold text-slate-600">{editWeightItem.currentNetto.toFixed(2)} kg</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                  Berat Netto Hasil Timbang Ulang (kg) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    autoFocus
                    value={editWeightItem.newNetto}
                    onChange={e => setEditWeightItem({ ...editWeightItem, newNetto: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveQuickEditWeight();
                      }
                    }}
                    placeholder="0.00"
                    className="w-full pl-3.5 pr-14 py-3 bg-white border-2 border-amber-400 rounded-xl text-lg font-mono font-black text-slate-900 text-right focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                  />
                  <span className="absolute right-3.5 top-3.5 text-xs font-black text-slate-400 pointer-events-none">
                    KG
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Masukkan berat bersih bale terkini hasil timbang ulang sebelum dikirimkan.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditWeightItem(null)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveQuickEditWeight}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 text-xs font-extrabold rounded-xl transition shadow flex items-center gap-1.5 cursor-pointer"
              >
                <CheckSquare size={14} /> Simpan Perubahan Berat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin PIN Dialog */}
      <AdminPinModal
        isOpen={adminPinOpen}
        onClose={() => setAdminPinOpen(false)}
        onSuccess={handleAdminPinSuccess}
      />

      {/* Import Shipping Modal */}
      <ImportShippingModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={(count) => {
          showToast(`Berhasil mengimpor ${count} bale ke transaksi Shipping. Stok gudang otomatis berkurang.`, 'ok');
          loadSourcesAndHistory();
          if (onShippingSaved) onShippingSaved();
          window.dispatchEvent(new Event('iscs-db-update'));
        }}
        currentUser={currentUser}
        masterPrices={prices}
      />
    </div>
  );
};
