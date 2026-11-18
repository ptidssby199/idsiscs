import React, { useState, useEffect } from 'react';
import { getLocal, setLocal, fetchDbFromServer, pushDbToServer, getCompleteLocalDb, setCompleteLocalDb } from '../db';
import { BuyingRow, ReclassRow, ShippingRow, InvoiceRow } from '../types';
import {
  Database,
  UploadCloud,
  DownloadCloud,
  FileJson,
  History,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Server,
  UserCheck,
  RotateCcw,
  Plus,
  Trash2,
  FileCheck,
  ArrowRightLeft,
  Settings,
  Wifi,
  WifiOff,
  Network,
  Activity
} from 'lucide-react';

interface BackupSyncProps {
  currentUser: any;
}

interface SyncLog {
  id: string;
  timestamp: string;
  operator: string;
  filename: string;
  mode: 'CLIENT_EXPORT' | 'SERVER_IMPORT' | 'SERVER_EXPORT' | 'CLIENT_IMPORT';
  buyingCount: number;
  reclassCount: number;
  shippingCount: number;
  invoiceCount: number;
  duplicateCount: number;
  status: 'SUCCESS' | 'FAILED';
}

interface ClientImportReport {
  valid: boolean;
  error?: string;
  filename: string;
  exportedAt?: string;
  operator?: string;
  pricesCount: number;
  usersCount: number;
  preprintCount: number;
  hasSettings: boolean;
  buying: { new: number; dup: number; data: BuyingRow[] };
  reclass: { new: number; dup: number; data: ReclassRow[] };
  shipping: { new: number; dup: number; data: ShippingRow[] };
  invoice: { new: number; dup: number; data: InvoiceRow[] };
  rawPayload?: any;
}

export const BackupSync: React.FC<BackupSyncProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'backupRestore' | 'sync' | 'lanSync'>('lanSync');
  const [syncMode, setSyncMode] = useState<'client' | 'server'>('client');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  // LAN network sync states
  const [storageMode, setStorageMode] = useState<'local' | 'lan'>(
    () => (localStorage.getItem('iscs_storage_mode') as 'local' | 'lan') || 'local'
  );
  const [lanStatus, setLanStatus] = useState<{
    connected: boolean;
    localIp: string;
    port: number;
    isServer: boolean;
    serverVersion: string;
    localVersion: string;
  }>({
    connected: false,
    localIp: 'localhost',
    port: 3000,
    isServer: false,
    serverVersion: '-',
    localVersion: '-'
  });
  const [isSyncingLan, setIsSyncingLan] = useState(false);

  // Stats for Backup
  const [dbStats, setDbStats] = useState<Record<string, number>>({});

  // Sync state
  const [unsyncedStats, setUnsyncedStats] = useState({
    buying: 0,
    reclass: 0,
    shipping: 0,
    invoice: 0
  });

  // Log history
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);

  // Import states for SERVER MODE (receives client files)
  const [importFile, setImportFile] = useState<any>(null);
  const [importReport, setImportReport] = useState<{
    valid: boolean;
    error?: string;
    filename: string;
    exportedAt?: string;
    operator?: string;
    buying: { new: number; dup: number; data: BuyingRow[] };
    reclass: { new: number; dup: number; data: ReclassRow[] };
    shipping: { new: number; dup: number; data: ShippingRow[] };
    invoice: { new: number; dup: number; data: InvoiceRow[] };
  } | null>(null);

  // Import states for CLIENT MODE (receives server files)
  const [clientImportFile, setClientImportFile] = useState<any>(null);
  const [clientImportReport, setClientImportReport] = useState<ClientImportReport | null>(null);

  // Client confirmation modal trigger after export
  const [exportConfirmData, setExportConfirmData] = useState<{
    buyingIds: string[];
    reclassIds: string[];
    shippingIds: string[];
    invoiceIds: string[];
  } | null>(null);

  const showToast = (text: string, type: 'ok' | 'err') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadStats = () => {
    const buying = getLocal<BuyingRow[]>('iscs_buying', []);
    const reclass = getLocal<ReclassRow[]>('iscs_reclass', []);
    const shipping = getLocal<ShippingRow[]>('iscs_shipping', []);
    const invoice = getLocal<InvoiceRow[]>('iscs_invoice', []);
    const preprint = getLocal<any[]>('iscs_preprint', []);
    const prices = getLocal<any[]>('iscs_prices', []);
    const users = getLocal<any[]>('iscs_users', []);

    setDbStats({
      'Timbang Buying': buying.length,
      'Grading Reclass': reclass.length,
      'Pengiriman Shipping': shipping.length,
      'Kwitansi Invoice': invoice.length,
      'Barcode PrePrint': preprint.length,
      'Master Harga': prices.length,
      'Manajemen User': users.length
    });

    // Unsynced analysis
    const syncedIds = getLocal<Record<string, boolean>>('iscs_synced_ids', {});

    const unsyncedBuying = buying.filter(r => !syncedIds[`buying_${r.NoBarcode}`]).length;
    const unsyncedReclass = reclass.filter(r => !syncedIds[`reclass_${r.NoReclass}`]).length;
    const unsyncedShipping = shipping.filter(r => !syncedIds[`shipping_${r.NoBarcode}`]).length;
    const unsyncedInvoice = invoice.filter(r => !syncedIds[`invoice_${r.NoInvoice}`]).length;

    setUnsyncedStats({
      buying: unsyncedBuying,
      reclass: unsyncedReclass,
      shipping: unsyncedShipping,
      invoice: unsyncedInvoice
    });

    // Logs
    const logs = getLocal<SyncLog[]>('iscs_sync_logs', []);
    setSyncLogs([...logs].reverse());
  };

  useEffect(() => {
    loadStats();
  }, []);

  const checkLanStatus = async () => {
    try {
      const resStatus = await fetch('/api/lan/status');
      if (resStatus.ok) {
        const statusData = await resStatus.json();
        
        const resVersion = await fetch('/api/lan/version');
        let sVersion = '-';
        if (resVersion.ok) {
          const vData = await resVersion.json();
          sVersion = String(vData.version);
        }

        const lVersion = localStorage.getItem('iscs_local_db_version') || '-';

        setLanStatus({
          connected: true,
          localIp: statusData.localIp || 'localhost',
          port: statusData.port || 3000,
          isServer: statusData.isServer || false,
          serverVersion: sVersion,
          localVersion: lVersion
        });
      } else {
        setLanStatus(prev => ({ ...prev, connected: false }));
      }
    } catch {
      setLanStatus(prev => ({ ...prev, connected: false }));
    }
  };

  const handleToggleStorageMode = async (mode: 'local' | 'lan') => {
    if (mode === 'lan') {
      setIsSyncingLan(true);
      try {
        // Test connection first
        const res = await fetch('/api/lan/status');
        if (!res.ok) {
          showToast('Gagal terhubung ke Server LAN. Pastikan server aktif!', 'err');
          setIsSyncingLan(false);
          return;
        }
        
        // Fetch server's current DB state to see if it has data
        const serverRes = await fetch('/api/lan/db');
        if (serverRes.ok) {
          const serverJson = await serverRes.json();
          const serverDb = serverJson.data || {};
          
          const serverHasData = 
            (serverDb.iscs_buying && serverDb.iscs_buying.length > 0) ||
            (serverDb.iscs_reclass && serverDb.iscs_reclass.length > 0) ||
            (serverDb.iscs_shipping && serverDb.iscs_shipping.length > 0) ||
            (serverDb.iscs_users && serverDb.iscs_users.length > 2); // default users is 2
          
          const localDb = getCompleteLocalDb();
          const localHasData = 
            (localDb.iscs_buying && localDb.iscs_buying.length > 0) ||
            (localDb.iscs_reclass && localDb.iscs_reclass.length > 0) ||
            (localDb.iscs_shipping && localDb.iscs_shipping.length > 0);

          if (serverHasData) {
            // Server has real data! Pull from server to local storage (Safest)
            setCompleteLocalDb(serverDb);
            if (serverJson.version) {
              localStorage.setItem('iscs_local_db_version', String(serverJson.version));
            }
            showToast('Koneksi LAN Aktif! Mengunduh data terpusat dari Server.', 'ok');
          } else if (localHasData) {
            // Server is empty, but local has data! Seed server with local data
            await fetch('/api/lan/db', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: localDb })
            });
            if (serverJson.version) {
              localStorage.setItem('iscs_local_db_version', String(serverJson.version));
            }
            showToast('Koneksi LAN Aktif! Mengunggah data lokal PC ini ke Server.', 'ok');
          } else {
            // Both are fresh
            setCompleteLocalDb(serverDb);
            if (serverJson.version) {
              localStorage.setItem('iscs_local_db_version', String(serverJson.version));
            }
            showToast('Koneksi LAN Aktif! Sinkronisasi berhasil terhubung.', 'ok');
          }
        }

        // Set localStorage mode and version
        localStorage.setItem('iscs_storage_mode', 'lan');
        setStorageMode('lan');
      } catch (err) {
        showToast('Koneksi LAN gagal/terputus.', 'err');
      } finally {
        setIsSyncingLan(false);
        checkLanStatus();
      }
    } else {
      localStorage.setItem('iscs_storage_mode', 'local');
      setStorageMode('local');
      showToast('Berhasil beralih ke mode Penyimpanan Lokal Offline.', 'ok');
    }
  };

  const handleManualPushLan = async () => {
    const confirmPush = window.confirm(
      "PERINGATAN SEEDING/UNGGAH!\n\nTindakan ini akan mengunggah data dari PC lokal ini untuk MENIMPA seluruh database di server terpusat.\nKomputer client lain akan mengikuti data ini.\n\nApakah Anda yakin?"
    );
    if (!confirmPush) return;

    setIsSyncingLan(true);
    try {
      const dbData = getCompleteLocalDb();
      const res = await fetch('/api/lan/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dbData })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.version) {
          localStorage.setItem('iscs_local_db_version', String(json.version));
        }
        showToast('Berhasil mengunggah (PUSH) database lokal ke Server LAN!', 'ok');
        checkLanStatus();
      } else {
        showToast('Gagal mengunggah database ke Server.', 'err');
      }
    } catch {
      showToast('Koneksi LAN gagal/terputus.', 'err');
    } finally {
      setIsSyncingLan(false);
    }
  };

  const handleManualPullLan = async () => {
    const confirmPull = window.confirm(
      "PERINGATAN UNDUH!\n\nTindakan ini akan mengunduh database terpusat dari server LAN untuk MENIMPA data lokal di PC ini.\n\nApakah Anda yakin?"
    );
    if (!confirmPull) return;

    setIsSyncingLan(true);
    try {
      const freshRes = await fetch('/api/lan/db');
      if (freshRes.ok) {
        const freshJson = await freshRes.json();
        setCompleteLocalDb(freshJson.data);
        if (freshJson.version) {
          localStorage.setItem('iscs_local_db_version', String(freshJson.version));
        }
        showToast('Berhasil mengunduh (PULL) database terpusat dari Server!', 'ok');
        checkLanStatus();
      } else {
        showToast('Gagal mengunduh database dari Server.', 'err');
      }
    } catch {
      showToast('Koneksi LAN gagal/terputus.', 'err');
    } finally {
      setIsSyncingLan(false);
    }
  };

  const handleForceSyncLan = async () => {
    setIsSyncingLan(true);
    try {
      await fetchDbFromServer();
      await checkLanStatus();
      showToast('Sinkronisasi data LAN berhasil diperbarui secara manual!', 'ok');
    } catch {
      showToast('Gagal sinkronisasi data LAN.', 'err');
    } finally {
      setIsSyncingLan(false);
    }
  };

  useEffect(() => {
    checkLanStatus();
    const interval = setInterval(checkLanStatus, 5000);
    return () => clearInterval(interval);
  }, [storageMode]);

  const getFormatDate = () => {
    const d = new Date();
    const yy = d.getFullYear();
    const mm = ('0' + (d.getMonth() + 1)).slice(-2);
    const dd = ('0' + d.getDate()).slice(-2);
    const hh = ('0' + d.getHours()).slice(-2);
    const min = ('0' + d.getMinutes()).slice(-2);
    const ss = ('0' + d.getSeconds()).slice(-2);
    return `${yy}${mm}${dd}_${hh}${min}${ss}`;
  };

  // BACKUP FUNCTION
  const handleBackup = () => {
    try {
      const keys = [
        'iscs_users',
        'iscs_prices',
        'iscs_buying',
        'iscs_reclass',
        'iscs_shipping',
        'iscs_invoice',
        'iscs_preprint',
        'iscs_settings',
        'iscs_synced_ids',
        'iscs_sync_logs'
      ];
      const backupData: Record<string, any> = {};
      keys.forEach(k => {
        backupData[k] = getLocal(k, null);
      });

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iscs_backup_${getFormatDate()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Database berhasil dibackup ke file JSON!', 'ok');
    } catch (err: any) {
      showToast(`Gagal backup: ${err?.message || err}`, 'err');
    }
  };

  // RESTORE FUNCTION
  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = event.target?.result as string;
        const parsed = JSON.parse(raw);

        // Simple validation
        if (!parsed.iscs_users && !parsed.iscs_buying) {
          showToast('Format file backup tidak valid.', 'err');
          return;
        }

        const confirmRestore = window.confirm(
          '⚠️ PERINGATAN Kritis!\n\nMelakukan Restore akan MENGHAPUS seluruh database lokal Anda saat ini dan menggantinya dengan data dari file backup.\n\nApakah Anda yakin ingin melanjutkan?'
        );

        if (!confirmRestore) {
          e.target.value = '';
          return;
        }

        // Apply backup
        Object.keys(parsed).forEach(k => {
          if (parsed[k] !== null) {
            setLocal(k, parsed[k]);
          }
        });

        showToast('Database berhasil direstore! Aplikasi akan menyegarkan data.', 'ok');
        loadStats();
        setTimeout(() => {
          window.location.reload();
        }, 1500);

      } catch (err: any) {
        showToast(`Gagal membaca file: ${err?.message || err}`, 'err');
      }
    };
    reader.readAsText(file);
  };

  // SYNC EXPORT (CLIENT)
  const handleClientExport = () => {
    try {
      const buying = getLocal<BuyingRow[]>('iscs_buying', []);
      const reclass = getLocal<ReclassRow[]>('iscs_reclass', []);
      const shipping = getLocal<ShippingRow[]>('iscs_shipping', []);
      const invoice = getLocal<InvoiceRow[]>('iscs_invoice', []);
      const syncedIds = getLocal<Record<string, boolean>>('iscs_synced_ids', {});

      // Filter only unsynced
      const exportBuying = buying.filter(r => !syncedIds[`buying_${r.NoBarcode}`]);
      const exportReclass = reclass.filter(r => !syncedIds[`reclass_${r.NoReclass}`]);
      const exportShipping = shipping.filter(r => !syncedIds[`shipping_${r.NoBarcode}`]);
      const exportInvoice = invoice.filter(r => !syncedIds[`invoice_${r.NoInvoice}`]);

      if (
        exportBuying.length === 0 &&
        exportReclass.length === 0 &&
        exportShipping.length === 0 &&
        exportInvoice.length === 0
      ) {
        showToast('Semua transaksi sudah sinkron. Tidak ada data baru untuk diekspor.', 'err');
        return;
      }

      const syncPayload = {
        type: 'iscs_sync_file',
        client_id: `CLI-${currentUser.username.toUpperCase()}`,
        exported_at: new Date().toLocaleDateString('id-ID') + ' ' + new Date().toLocaleTimeString('id-ID'),
        operator: currentUser.nama || currentUser.username,
        data: {
          buying: exportBuying,
          reclass: exportReclass,
          shipping: exportShipping,
          invoice: exportInvoice
        }
      };

      const filename = `iscs_sync_client_${getFormatDate()}.json`;
      const blob = new Blob([JSON.stringify(syncPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Create confirmation data
      setExportConfirmData({
        buyingIds: exportBuying.map(r => `buying_${r.NoBarcode}`),
        reclassIds: exportReclass.map(r => `reclass_${r.NoReclass}`),
        shippingIds: exportShipping.map(r => `shipping_${r.NoBarcode}`),
        invoiceIds: exportInvoice.map(r => `invoice_${r.NoInvoice}`)
      });

      // Write export log
      const logs = getLocal<SyncLog[]>('iscs_sync_logs', []);
      const newLog: SyncLog = {
        id: 'LOG_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        timestamp: new Date().toLocaleDateString('id-ID') + ' ' + new Date().toLocaleTimeString('id-ID'),
        operator: currentUser.nama || currentUser.username,
        filename,
        mode: 'CLIENT_EXPORT',
        buyingCount: exportBuying.length,
        reclassCount: exportReclass.length,
        shippingCount: exportShipping.length,
        invoiceCount: exportInvoice.length,
        duplicateCount: 0,
        status: 'SUCCESS'
      };
      logs.push(newLog);
      setLocal('iscs_sync_logs', logs);
      loadStats();

      showToast('File sinkronisasi sukses diunduh!', 'ok');
    } catch (err: any) {
      showToast(`Gagal ekspor sinkronisasi: ${err?.message || err}`, 'err');
    }
  };

  const confirmExportMarkAsSynced = () => {
    if (!exportConfirmData) return;
    const syncedIds = getLocal<Record<string, boolean>>('iscs_synced_ids', {});

    exportConfirmData.buyingIds.forEach(id => { syncedIds[id] = true; });
    exportConfirmData.reclassIds.forEach(id => { syncedIds[id] = true; });
    exportConfirmData.shippingIds.forEach(id => { syncedIds[id] = true; });
    exportConfirmData.invoiceIds.forEach(id => { syncedIds[id] = true; });

    setLocal('iscs_synced_ids', syncedIds);
    setExportConfirmData(null);
    showToast('Transaksi berhasil ditandai sebagai SUDAH SINKRON.', 'ok');
    loadStats();
  };

  // SYNC IMPORT PARSING (SERVER)
  const handleServerFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = event.target?.result as string;
        const payload = JSON.parse(raw);

        if (payload.type !== 'iscs_sync_file' || !payload.data) {
          setImportReport({
            valid: false,
            error: 'Bukan file sinkronisasi ISCS yang sah untuk diimport ke Server.',
            filename: file.name,
            buying: { new: 0, dup: 0, data: [] },
            reclass: { new: 0, dup: 0, data: [] },
            shipping: { new: 0, dup: 0, data: [] },
            invoice: { new: 0, dup: 0, data: [] }
          });
          return;
        }

        // Validate duplicates
        const currentBuying = getLocal<BuyingRow[]>('iscs_buying', []);
        const currentReclass = getLocal<ReclassRow[]>('iscs_reclass', []);
        const currentShipping = getLocal<ShippingRow[]>('iscs_shipping', []);
        const currentInvoice = getLocal<InvoiceRow[]>('iscs_invoice', []);

        const clientBuying = (payload.data.buying || []) as BuyingRow[];
        const clientReclass = (payload.data.reclass || []) as ReclassRow[];
        const clientShipping = (payload.data.shipping || []) as ShippingRow[];
        const clientInvoice = (payload.data.invoice || []) as InvoiceRow[];

        // DUPLICATE PREVENTIONS (MATCHING UNIQUE KEYS)
        const buyingNew = clientBuying.filter(b => !currentBuying.some(x => x.NoBarcode === b.NoBarcode));
        const buyingDup = clientBuying.length - buyingNew.length;

        const reclassNew = clientReclass.filter(r => !currentReclass.some(x => x.NoReclass === r.NoReclass));
        const reclassDup = clientReclass.length - reclassNew.length;

        const shippingNew = clientShipping.filter(s => !currentShipping.some(x => x.NoBarcode === s.NoBarcode));
        const shippingDup = clientShipping.length - shippingNew.length;

        const invoiceNew = clientInvoice.filter(v => !currentInvoice.some(x => x.NoInvoice === v.NoInvoice));
        const invoiceDup = clientInvoice.length - invoiceNew.length;

        setImportReport({
          valid: true,
          filename: file.name,
          exportedAt: payload.exported_at,
          operator: payload.operator,
          buying: { new: buyingNew.length, dup: buyingDup, data: buyingNew },
          reclass: { new: reclassNew.length, dup: reclassDup, data: reclassNew },
          shipping: { new: shippingNew.length, dup: shippingDup, data: shippingNew },
          invoice: { new: invoiceNew.length, dup: invoiceDup, data: invoiceNew }
        });

      } catch (err: any) {
        setImportReport({
          valid: false,
          error: `Gagal membaca file JSON: ${err?.message || err}`,
          filename: file.name,
          buying: { new: 0, dup: 0, data: [] },
          reclass: { new: 0, dup: 0, data: [] },
          shipping: { new: 0, dup: 0, data: [] },
          invoice: { new: 0, dup: 0, data: [] }
        });
      }
    };
    reader.readAsText(file);
  };

  // SYNC MERGE APPLY (SERVER)
  const handleServerMerge = () => {
    if (!importReport || !importReport.valid) return;

    try {
      const currentBuying = getLocal<BuyingRow[]>('iscs_buying', []);
      const currentReclass = getLocal<ReclassRow[]>('iscs_reclass', []);
      const currentShipping = getLocal<ShippingRow[]>('iscs_shipping', []);
      const currentInvoice = getLocal<InvoiceRow[]>('iscs_invoice', []);

      // Merge data
      const mergedBuying = [...currentBuying, ...importReport.buying.data];
      const mergedReclass = [...currentReclass, ...importReport.reclass.data];
      const mergedShipping = [...currentShipping, ...importReport.shipping.data];
      const mergedInvoice = [...currentInvoice, ...importReport.invoice.data];

      // Save to server localstorage
      setLocal('iscs_buying', mergedBuying);
      setLocal('iscs_reclass', mergedReclass);
      setLocal('iscs_shipping', mergedShipping);
      setLocal('iscs_invoice', mergedInvoice);

      // Save Sync Log
      const totalDup =
        importReport.buying.dup +
        importReport.reclass.dup +
        importReport.shipping.dup +
        importReport.invoice.dup;

      const logs = getLocal<SyncLog[]>('iscs_sync_logs', []);
      const newLog: SyncLog = {
        id: 'LOG_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        timestamp: new Date().toLocaleDateString('id-ID') + ' ' + new Date().toLocaleTimeString('id-ID'),
        operator: `${currentUser.nama || currentUser.username} (Server)`,
        filename: importReport.filename,
        mode: 'SERVER_IMPORT',
        buyingCount: importReport.buying.new,
        reclassCount: importReport.reclass.new,
        shippingCount: importReport.shipping.new,
        invoiceCount: importReport.invoice.new,
        duplicateCount: totalDup,
        status: 'SUCCESS'
      };
      logs.push(newLog);
      setLocal('iscs_sync_logs', logs);

      showToast(`Berhasil menggabungkan data! ${importReport.buying.new + importReport.reclass.new + importReport.shipping.new + importReport.invoice.new} transaksi baru diimport.`, 'ok');

      // Clear states
      setImportFile(null);
      setImportReport(null);
      loadStats();

    } catch (err: any) {
      showToast(`Gagal melakukan merge data: ${err?.message || err}`, 'err');
    }
  };

  // SYNC EXPORT (SERVER) -> Export master data & verified server records for Client
  const handleServerExport = () => {
    try {
      const prices = getLocal<any[]>('iscs_prices', []);
      const users = getLocal<any[]>('iscs_users', []);
      const preprint = getLocal<any[]>('iscs_preprint', []);
      const settings = getLocal<any>('iscs_settings', null);
      const buying = getLocal<BuyingRow[]>('iscs_buying', []);
      const reclass = getLocal<ReclassRow[]>('iscs_reclass', []);
      const shipping = getLocal<ShippingRow[]>('iscs_shipping', []);
      const invoice = getLocal<InvoiceRow[]>('iscs_invoice', []);

      const syncPayload = {
        type: 'iscs_server_sync_file',
        server_id: `SRV-${currentUser.username.toUpperCase()}`,
        exported_at: new Date().toLocaleDateString('id-ID') + ' ' + new Date().toLocaleTimeString('id-ID'),
        operator: currentUser.nama || currentUser.username,
        data: {
          prices,
          users,
          preprint,
          settings,
          buying,
          reclass,
          shipping,
          invoice
        }
      };

      const filename = `iscs_sync_server_${getFormatDate()}.json`;
      const blob = new Blob([JSON.stringify(syncPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Write export log
      const logs = getLocal<SyncLog[]>('iscs_sync_logs', []);
      const newLog: SyncLog = {
        id: 'LOG_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        timestamp: new Date().toLocaleDateString('id-ID') + ' ' + new Date().toLocaleTimeString('id-ID'),
        operator: `${currentUser.nama || currentUser.username} (Server)`,
        filename,
        mode: 'SERVER_EXPORT',
        buyingCount: buying.length,
        reclassCount: reclass.length,
        shippingCount: shipping.length,
        invoiceCount: invoice.length,
        duplicateCount: 0,
        status: 'SUCCESS'
      };
      logs.push(newLog);
      setLocal('iscs_sync_logs', logs);
      loadStats();

      showToast('File sinkronisasi Server berhasil diunduh!', 'ok');
    } catch (err: any) {
      showToast(`Gagal ekspor sinkronisasi Server: ${err?.message || err}`, 'err');
    }
  };

  // SYNC IMPORT PARSING (CLIENT) -> Handles file from Server
  const handleClientFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setClientImportFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = event.target?.result as string;
        const payload = JSON.parse(raw);

        if (payload.type !== 'iscs_server_sync_file' || !payload.data) {
          setClientImportReport({
            valid: false,
            error: 'Bukan file sinkronisasi Server ISCS yang sah.',
            filename: file.name,
            pricesCount: 0,
            usersCount: 0,
            preprintCount: 0,
            hasSettings: false,
            buying: { new: 0, dup: 0, data: [] },
            reclass: { new: 0, dup: 0, data: [] },
            shipping: { new: 0, dup: 0, data: [] },
            invoice: { new: 0, dup: 0, data: [] }
          });
          return;
        }

        const data = payload.data;
        const currentBuying = getLocal<BuyingRow[]>('iscs_buying', []);
        const currentReclass = getLocal<ReclassRow[]>('iscs_reclass', []);
        const currentShipping = getLocal<ShippingRow[]>('iscs_shipping', []);
        const currentInvoice = getLocal<InvoiceRow[]>('iscs_invoice', []);

        const serverBuying = (data.buying || []) as BuyingRow[];
        const serverReclass = (data.reclass || []) as ReclassRow[];
        const serverShipping = (data.shipping || []) as ShippingRow[];
        const serverInvoice = (data.invoice || []) as InvoiceRow[];

        // DUPLICATE PREVENTIONS FOR CLIENT (MATCHING UNIQUE KEYS)
        const buyingNew = serverBuying.filter(b => !currentBuying.some(x => x.NoBarcode === b.NoBarcode));
        const buyingDup = serverBuying.length - buyingNew.length;

        const reclassNew = serverReclass.filter(r => !currentReclass.some(x => x.NoReclass === r.NoReclass));
        const reclassDup = serverReclass.length - reclassNew.length;

        const shippingNew = serverShipping.filter(s => !currentShipping.some(x => x.NoBarcode === s.NoBarcode));
        const shippingDup = serverShipping.length - shippingNew.length;

        const invoiceNew = serverInvoice.filter(v => !currentInvoice.some(x => x.NoInvoice === v.NoInvoice));
        const invoiceDup = serverInvoice.length - invoiceNew.length;

        setClientImportReport({
          valid: true,
          filename: file.name,
          exportedAt: payload.exported_at,
          operator: payload.operator,
          pricesCount: (data.prices || []).length,
          usersCount: (data.users || []).length,
          preprintCount: (data.preprint || []).length,
          hasSettings: !!data.settings,
          buying: { new: buyingNew.length, dup: buyingDup, data: buyingNew },
          reclass: { new: reclassNew.length, dup: reclassDup, data: reclassNew },
          shipping: { new: shippingNew.length, dup: shippingDup, data: shippingNew },
          invoice: { new: invoiceNew.length, dup: invoiceDup, data: invoiceNew },
          rawPayload: payload
        });

      } catch (err: any) {
        setClientImportReport({
          valid: false,
          error: `Gagal membaca file JSON: ${err?.message || err}`,
          filename: file.name,
          pricesCount: 0,
          usersCount: 0,
          preprintCount: 0,
          hasSettings: false,
          buying: { new: 0, dup: 0, data: [] },
          reclass: { new: 0, dup: 0, data: [] },
          shipping: { new: 0, dup: 0, data: [] },
          invoice: { new: 0, dup: 0, data: [] }
        });
      }
    };
    reader.readAsText(file);
  };

  // SYNC MERGE APPLY (CLIENT) -> Safe overwrite for masters, safe merge for transactions
  const handleClientMerge = () => {
    if (!clientImportReport || !clientImportReport.valid || !clientImportReport.rawPayload) return;

    try {
      const payload = clientImportReport.rawPayload;
      const data = payload.data;

      // 1. Overwrite authorized master data tables
      if (data.prices) setLocal('iscs_prices', data.prices);
      if (data.users) setLocal('iscs_users', data.users);
      if (data.preprint) setLocal('iscs_preprint', data.preprint);
      if (data.settings) setLocal('iscs_settings', data.settings);

      // 2. Merge transactions safely
      const currentBuying = getLocal<BuyingRow[]>('iscs_buying', []);
      const currentReclass = getLocal<ReclassRow[]>('iscs_reclass', []);
      const currentShipping = getLocal<ShippingRow[]>('iscs_shipping', []);
      const currentInvoice = getLocal<InvoiceRow[]>('iscs_invoice', []);

      const mergedBuying = [...currentBuying, ...clientImportReport.buying.data];
      const mergedReclass = [...currentReclass, ...clientImportReport.reclass.data];
      const mergedShipping = [...currentShipping, ...clientImportReport.shipping.data];
      const mergedInvoice = [...currentInvoice, ...clientImportReport.invoice.data];

      setLocal('iscs_buying', mergedBuying);
      setLocal('iscs_reclass', mergedReclass);
      setLocal('iscs_shipping', mergedShipping);
      setLocal('iscs_invoice', mergedInvoice);

      // Mark the imported transactions as already synced in client so they aren't re-exported back!
      const syncedIds = getLocal<Record<string, boolean>>('iscs_synced_ids', {});
      clientImportReport.buying.data.forEach(b => { syncedIds[`buying_${b.NoBarcode}`] = true; });
      clientImportReport.reclass.data.forEach(r => { syncedIds[`reclass_${r.NoReclass}`] = true; });
      clientImportReport.shipping.data.forEach(s => { syncedIds[`shipping_${s.NoBarcode}`] = true; });
      clientImportReport.invoice.data.forEach(v => { syncedIds[`invoice_${v.NoInvoice}`] = true; });
      setLocal('iscs_synced_ids', syncedIds);

      // 3. Write Client Sync Log
      const totalDup =
        clientImportReport.buying.dup +
        clientImportReport.reclass.dup +
        clientImportReport.shipping.dup +
        clientImportReport.invoice.dup;

      const logs = getLocal<SyncLog[]>('iscs_sync_logs', []);
      const newLog: SyncLog = {
        id: 'LOG_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        timestamp: new Date().toLocaleDateString('id-ID') + ' ' + new Date().toLocaleTimeString('id-ID'),
        operator: `${currentUser.nama || currentUser.username} (Client)`,
        filename: clientImportReport.filename,
        mode: 'CLIENT_IMPORT',
        buyingCount: clientImportReport.buying.data.length,
        reclassCount: clientImportReport.reclass.data.length,
        shippingCount: clientImportReport.shipping.data.length,
        invoiceCount: clientImportReport.invoice.data.length,
        duplicateCount: totalDup,
        status: 'SUCCESS'
      };
      logs.push(newLog);
      setLocal('iscs_sync_logs', logs);

      showToast('Master Data & Transaksi berhasil disinkronisasi dari Server!', 'ok');

      // Clear states
      setClientImportFile(null);
      setClientImportReport(null);
      loadStats();

      // reload trigger
      setTimeout(() => {
        window.confirm('Master Data (Harga, User, PrePrint) telah berhasil diperbarui dari Server. Aplikasi akan memuat ulang halaman untuk menyegarkan memori.');
        window.location.reload();
      }, 500);

    } catch (err: any) {
      showToast(`Gagal memproses merge data Server ke Client: ${err?.message || err}`, 'err');
    }
  };

  const handleResetSyncStatus = () => {
    const confirmReset = window.confirm(
      'Apakah Anda yakin ingin MERESET status sinkronisasi di komputer Klien ini?\n\nSemua data transaksi akan ditandai sebagai BELUM SINKRON dan akan diikutkan kembali saat ekspor file sinkronisasi berikutnya.'
    );
    if (confirmReset) {
      setLocal('iscs_synced_ids', {});
      showToast('Status sinkronisasi berhasil direset.', 'ok');
      loadStats();
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-4 rounded-xl shadow-xl font-bold flex items-center gap-3 text-sm text-white ${toastMsg.type === 'ok' ? 'bg-emerald-600 border-l-4 border-emerald-300' : 'bg-rose-600 border-l-4 border-rose-300'}`}>
          {toastMsg.text}
        </div>
      )}

      {/* Confirmation Modal for Client Export Mark */}
      {exportConfirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="p-3 bg-amber-50 rounded-xl text-amber-600 w-12 h-12 flex items-center justify-center">
              <FileCheck size={24} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-800">Tandai Sudah Sinkron?</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Anda baru saja mengunduh file ekspor sinkronisasi. Apakah Anda ingin menandai transaksi-transaksi tersebut sebagai <span className="font-bold text-amber-600">SUDAH SINKRON</span> di komputer Klien ini?
              </p>
              <p className="text-[11px] text-slate-400 mt-2 leading-relaxed italic bg-slate-50 p-2.5 rounded-lg border border-slate-200 border-dashed">
                Dengan menandai sudah sinkron, transaksi tersebut tidak akan dimasukkan lagi di file unduhan berikutnya, menghindari transfer file yang terlalu besar.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setExportConfirmData(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition"
              >
                Jangan Tandai
              </button>
              <button
                onClick={confirmExportMarkAsSynced}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition"
              >
                Ya, Tandai Sudah Sinkron
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Tabs switcher */}
      <div className="flex border-b border-slate-200 gap-6 overflow-x-auto whitespace-nowrap scrollbar-none">
        <button
          onClick={() => setActiveTab('lanSync')}
          className={`pb-3 text-sm font-extrabold transition flex items-center gap-1.5 border-b-2 ${activeTab === 'lanSync' ? 'border-amber-500 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          <Network size={16} className={storageMode === 'lan' ? "text-emerald-500 animate-pulse" : ""} />
          Real-Time Jaringan LAN <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${storageMode === 'lan' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{storageMode === 'lan' ? 'AKTIF' : 'OFFLINE'}</span>
        </button>
        <button
          onClick={() => setActiveTab('sync')}
          className={`pb-3 text-sm font-extrabold transition flex items-center gap-1.5 border-b-2 ${activeTab === 'sync' ? 'border-amber-500 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          <ArrowRightLeft size={16} />
          Sinkronisasi Berkas Manual (Off-line)
        </button>
        <button
          onClick={() => setActiveTab('backupRestore')}
          className={`pb-3 text-sm font-extrabold transition flex items-center gap-1.5 border-b-2 ${activeTab === 'backupRestore' ? 'border-amber-500 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          <Database size={16} />
          Backup &amp; Restore Full DB
        </button>
      </div>

      {/* LAN REAL-TIME SYNC TAB */}
      {activeTab === 'lanSync' && (
        <div className="space-y-6 animate-fadeIn">
          {/* LAN Connection Summary Card */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl ${storageMode === 'lan' && lanStatus.connected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                  {storageMode === 'lan' && lanStatus.connected ? <Wifi size={24} className="animate-bounce" /> : <WifiOff size={24} />}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-800">Status Koneksi Sinkronisasi LAN</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Mode Penyimpanan: <span className="font-bold text-slate-700 uppercase">{storageMode === 'lan' ? 'Server Terpusat (LAN)' : 'Lokal Browser (Offline)'}</span>
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                      lanStatus.connected ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-rose-50 text-rose-800 border border-rose-100'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${lanStatus.connected ? 'bg-emerald-500' : 'bg-rose-500'} ${lanStatus.connected ? 'animate-ping' : ''}`} />
                      {lanStatus.connected ? 'Koneksi Server: Aktif / Terhubung' : 'Koneksi Server: Terputus'}
                    </span>
                    {storageMode === 'lan' && (
                      <span className="text-[10px] bg-slate-50 text-slate-600 border border-slate-100 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 font-mono">
                        <Activity size={10} className="text-amber-500" />
                        Sinkronisasi berkala aktif (3s)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Force sync button when in LAN mode */}
              {storageMode === 'lan' && (
                <button
                  type="button"
                  onClick={handleForceSyncLan}
                  disabled={isSyncingLan || !lanStatus.connected}
                  className="w-full md:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 text-amber-500 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-95"
                >
                  <RefreshCw size={14} className={isSyncingLan ? "animate-spin" : ""} />
                  {isSyncingLan ? 'Sinkronisasi...' : 'Tarik Data Terbaru Sekarang'}
                </button>
              )}
            </div>
          </div>

          {/* Manual Force Push / Pull when LAN mode is active */}
          {storageMode === 'lan' && lanStatus.connected && (
            <div className="bg-amber-50/40 border border-amber-100 rounded-2xl p-5 space-y-3 animate-fadeIn">
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Settings size={14} className="text-amber-600" />
                  Penyelarasan Data Arah Khusus (Manual)
                </h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  Gunakan tombol di bawah ini jika ingin memastikan data menyatu secara spesifik. Sistem secara otomatis melakukan polling background setiap 3 detik, namun aksi di bawah ini memberi kontrol penuh untuk memindahkan database secara instan.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleManualPullLan}
                  disabled={isSyncingLan}
                  className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-start gap-2.5 transition active:scale-95 shadow-2xs"
                >
                  <DownloadCloud size={16} className="text-emerald-500 shrink-0" />
                  <div className="text-left">
                    <span className="block text-xs font-black text-slate-800">Unduh Data Server ke PC Ini (Pull)</span>
                    <span className="block text-[9px] text-slate-400 font-medium">Mengambil database dari Server untuk menimpa browser ini</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleManualPushLan}
                  disabled={isSyncingLan}
                  className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-start gap-2.5 transition active:scale-95 shadow-2xs"
                >
                  <UploadCloud size={16} className="text-amber-500 shrink-0" />
                  <div className="text-left">
                    <span className="block text-xs font-black text-slate-800">Unggah Data PC Ini ke Server (Push)</span>
                    <span className="block text-[9px] text-slate-400 font-medium">Mengirim data browser ini untuk menimpa Server terpusat</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Selector: Choose Storage Mode */}
          <div className="space-y-3">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pilih Mode Penyimpanan & Sinkronisasi Sistem</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Local Storage Option */}
              <div
                onClick={() => handleToggleStorageMode('local')}
                className={`border rounded-2xl p-5 cursor-pointer transition relative flex flex-col justify-between hover:border-slate-300 ${
                  storageMode === 'local' ? 'border-slate-900 bg-slate-50/50 shadow-xs' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black block text-slate-800 flex items-center gap-1.5">
                      <Database size={15} className="text-slate-500" />
                      Lokal Browser (Offline Standalone)
                    </span>
                    <input
                      type="radio"
                      name="storage_mode"
                      checked={storageMode === 'local'}
                      readOnly
                      className="accent-slate-900"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Setiap komputer timbangan menyimpan data secara mandiri di dalam browser (localStorage). Tidak memerlukan koneksi internet ataupun jaringan lokal. Cocok jika komputer timbangan hanya ada 1 unit.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-[10px]">
                  <span className="font-semibold text-slate-400">Penyimpanan Terisolasi</span>
                  <span className={`font-bold ${storageMode === 'local' ? 'text-amber-600' : 'text-slate-400'}`}>
                    {storageMode === 'local' ? '● Aktif Digunakan' : ''}
                  </span>
                </div>
              </div>

              {/* Central LAN Storage Option */}
              <div
                onClick={() => handleToggleStorageMode('lan')}
                className={`border rounded-2xl p-5 cursor-pointer transition relative flex flex-col justify-between hover:border-emerald-300 ${
                  storageMode === 'lan' ? 'border-emerald-600 bg-emerald-50/10 shadow-xs' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black block text-slate-800 flex items-center gap-1.5">
                      <Network size={15} className="text-emerald-600" />
                      Server Terpusat LAN (Real-Time Jaringan)
                    </span>
                    <input
                      type="radio"
                      name="storage_mode"
                      checked={storageMode === 'lan'}
                      readOnly
                      className="accent-emerald-600"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Menghubungkan beberapa komputer timbangan dalam jaringan LAN/Wi-Fi yang sama ke database terpusat secara real-time. Jika salah satu menginput timbangan, komputer lain akan langsung melihat datanya.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-[10px]">
                  <span className="font-semibold text-slate-400">Database Tersinkronisasi</span>
                  <span className={`font-bold ${storageMode === 'lan' ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {storageMode === 'lan' ? '● Aktif Digunakan' : ''}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* LAN Connection Instructions Guide */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
            <h4 className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
              <Settings size={14} />
              Panduan Menghubungkan Dua Komputer (Server & Client LAN)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-600 leading-relaxed">
              {/* Step 1: Server Config */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5 shadow-2xs">
                <span className="text-[10px] font-black text-amber-600 uppercase tracking-wide block">LANGKAH 1: Atur Komputer Server</span>
                <p className="text-[11px]">
                  Pilih salah satu PC Anda untuk bertindak sebagai <b>SERVER</b> utama (PC tempat menimbang). Hubungkan PC tersebut ke router Wi-Fi atau kabel LAN kantor.
                </p>
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 space-y-1">
                  <span className="text-[10px] font-bold text-amber-800 block">Alamat URL Server Jaringan Anda:</span>
                  <span className="font-mono font-black text-slate-900 block select-all text-xs bg-white px-2 py-1 rounded border border-amber-200">
                    http://{lanStatus.localIp}:{lanStatus.port}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  *Catatan: Pastikan firewall Windows mengizinkan Port 3000 agar komputer lain bisa mengakses alamat IP di atas.
                </p>
              </div>

              {/* Step 2: Client Config */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5 shadow-2xs">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wide block">LANGKAH 2: Hubungkan Komputer Client</span>
                <p className="text-[11px]">
                  Di komputer kedua (misal komputer Kasir/Invoice atau laptop grading kedua), sambungkan ke Wi-Fi/LAN yang sama.
                </p>
                <p className="text-[11px]">
                  Buka aplikasi browser Anda di PC Client, kemudian ketikkan alamat IP server tadi:
                  <strong className="block text-slate-900 bg-slate-50 p-1.5 rounded font-mono mt-1 text-center border border-slate-100 select-all">http://{lanStatus.localIp}:{lanStatus.port}</strong>
                </p>
                <p className="text-[11px]">
                  Setelah halaman dimuat, masuk ke halaman <b>Backup & Sinkronisasi</b> ini, lalu pilih opsi <b>Server Terpusat LAN (Real-Time Jaringan)</b> di atas.
                </p>
              </div>
            </div>

            {/* Diagnostic Information Section */}
            {storageMode === 'lan' && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Informasi Diagnostik Database LAN</span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold">
                  <div>
                    <span className="text-slate-400 block font-normal text-[11px]">Status Client:</span>
                    <span className="text-emerald-600 font-bold">Terhubung</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-normal text-[11px]">Server Jaringan:</span>
                    <span className="text-slate-700 font-mono font-bold">{lanStatus.localIp}:{lanStatus.port}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-normal text-[11px]">Versi DB Server:</span>
                    <span className="text-slate-700 font-mono font-bold">{lanStatus.serverVersion}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-normal text-[11px]">Versi DB Client:</span>
                    <span className="text-slate-700 font-mono font-bold">{lanStatus.localVersion}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BACKUP & RESTORE TAB */}
      {activeTab === 'backupRestore' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
          {/* Backup Database Card */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
            <h3 className="text-md font-extrabold text-slate-800 flex items-center gap-2">
              <DownloadCloud size={18} className="text-amber-500" />
              Backup Database Lokal
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Menyalin seluruh data internal ISCS (Akun User, Harga, Transaksi, Invoice, Pengaturan) ke dalam satu file berkas biner `.json`. Simpan berkas ini secara aman sebagai cadangan rutin Anda.
            </p>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Metrik Baris Data Saat Ini</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.keys(dbStats).map(name => (
                  <div key={name} className="flex justify-between p-2 bg-white rounded-lg border border-slate-100 font-semibold text-slate-600">
                    <span>{name}</span>
                    <span className="font-mono font-bold text-slate-800">{dbStats[name]}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleBackup}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-amber-500 font-bold rounded-xl text-xs flex items-center gap-2 transition active:scale-95 shadow-sm"
            >
              <DownloadCloud size={14} />
              Unduh File Backup Database
            </button>
          </div>

          {/* Restore Database Card */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
            <h3 className="text-md font-extrabold text-slate-800 flex items-center gap-2">
              <UploadCloud size={18} className="text-rose-500" />
              Restore Database Lokal
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Memuat berkas cadangan `.json` yang telah Anda unduh sebelumnya untuk dikembalikan ke penyimpanan internal sistem ini.
            </p>
            <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-xl text-[11px] text-rose-800 flex gap-2">
              <AlertTriangle size={18} className="text-rose-600 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <b>PENTING:</b> Proses restore ini bersifat <b>destruktif</b>. Seluruh data transaksi lokal Anda saat ini di komputer ini akan <b>ditimpa penuh</b> dan tidak dapat dikembalikan. Lakukan backup terlebih dahulu jika ragu!
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pilih File Berkas Backup (.json)</label>
              <input
                type="file"
                accept=".json"
                onChange={handleRestore}
                className="block w-full text-xs text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-xl file:border-0
                  file:text-xs file:font-bold
                  file:bg-rose-50 file:text-rose-700
                  hover:file:bg-rose-100 transition cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* SINKRONISASI DATA TAB */}
      {activeTab === 'sync' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Top Selection Box for Sync Role */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-md font-extrabold text-slate-800">Sistem Sinkronisasi Berkas Dua-Arah (Off-line)</h3>
              <p className="text-xs text-slate-400 mt-0.5">Komputer timbangan offline bertindak sebagai <b>Klien</b>, dan Komputer server kantor bertindak sebagai <b>Server</b>. Keduanya sekarang bisa saling berbagi data.</p>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setSyncMode('client')}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${syncMode === 'client' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <UserCheck size={14} />
                Mode Client (Klien)
              </button>
              <button
                onClick={() => setSyncMode('server')}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${syncMode === 'server' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Server size={14} />
                Mode Server (Kantor)
              </button>
            </div>
          </div>

          {/* SINKRONISASI CLIENT VIEW */}
          {syncMode === 'client' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Client Actions Panel (Two Way) */}
              <div className="lg:col-span-2 space-y-6">
                {/* section 1: Export Client Transactions */}
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-5">
                  <h3 className="text-md font-extrabold text-slate-800 flex items-center gap-2">
                    <DownloadCloud size={18} className="text-amber-500" />
                    1. Kirim Data Transaksi Baru ke Server (Export dari Klien)
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mt-[-8px]">
                    Kumpulkan data timbangan, reclass, shipping, dan kwitansi baru yang dibuat di Klien ini untuk dikirimkan dan digabungkan ke komputer Server.
                  </p>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Transaksi Baru yang Belum Sinkron</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="bg-white p-3 rounded-lg border border-slate-100 text-center">
                        <span className="text-slate-400 font-medium block">Buying</span>
                        <span className="text-lg font-extrabold text-slate-800 font-mono mt-0.5 block">{unsyncedStats.buying} <span className="text-[10px] font-bold text-slate-400">bal</span></span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-100 text-center">
                        <span className="text-slate-400 font-medium block">Reclass</span>
                        <span className="text-lg font-extrabold text-slate-800 font-mono mt-0.5 block">{unsyncedStats.reclass} <span className="text-[10px] font-bold text-slate-400">bal</span></span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-100 text-center">
                        <span className="text-slate-400 font-medium block">Shipping</span>
                        <span className="text-lg font-extrabold text-slate-800 font-mono mt-0.5 block">{unsyncedStats.shipping} <span className="text-[10px] font-bold text-slate-400">bal</span></span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-100 text-center">
                        <span className="text-slate-400 font-medium block">Invoice</span>
                        <span className="text-lg font-extrabold text-slate-800 font-mono mt-0.5 block">{unsyncedStats.invoice} <span className="text-[10px] font-bold text-slate-400">kwt</span></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2.5">
                    <button
                      onClick={handleClientExport}
                      className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-500 font-bold rounded-xl text-xs flex items-center gap-2 transition active:scale-95 shadow-sm"
                    >
                      <DownloadCloud size={15} />
                      Unduh File Sinkronisasi Client (.json)
                    </button>
                    <button
                      onClick={handleResetSyncStatus}
                      className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                    >
                      <RotateCcw size={14} />
                      Reset Status Sinkron
                    </button>
                  </div>
                </div>

                {/* section 2: Import Master Data / Transactions from Server */}
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-5">
                  <h3 className="text-md font-extrabold text-slate-800 flex items-center gap-2">
                    <UploadCloud size={18} className="text-indigo-500" />
                    2. Terima Master Data &amp; Update dari Server (Import ke Klien)
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mt-[-8px]">
                    Unggah file sinkronisasi dari Server (`iscs_sync_server_*.json`) untuk memperbarui daftar harga master, akun operator terbaru, nomor pre-print barcode petani, dan transaksi lain dari kantor.
                  </p>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unggah File Sinkronisasi Server (.json)</label>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleClientFileSelect}
                      className="block w-full text-xs text-slate-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-xl file:border-0
                        file:text-xs file:font-bold
                        file:bg-indigo-50 file:text-indigo-700
                        hover:file:bg-indigo-100 transition cursor-pointer"
                    />
                  </div>

                  {/* Pre-import report analysis for Client */}
                  {clientImportReport && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4 animate-scaleUp">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <CheckCircle2 size={16} className={clientImportReport.valid ? "text-emerald-500" : "text-rose-500"} />
                          Hasil Verifikasi File Sinkronisasi Server
                        </span>
                        {clientImportReport.valid && (
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded uppercase">Valid</span>
                        )}
                      </div>

                      {clientImportReport.valid ? (
                        <div className="space-y-3 text-xs text-slate-600">
                          <div className="grid grid-cols-2 gap-y-1.5 leading-relaxed bg-white border border-slate-100 p-3 rounded-lg">
                            <div>Nama Operator Server:</div>
                            <div className="font-bold text-slate-800">{clientImportReport.operator}</div>
                            <div>Tanggal Ekspor Server:</div>
                            <div className="font-semibold text-slate-800">{clientImportReport.exportedAt}</div>
                            <div>Nama Berkas:</div>
                            <div className="font-mono text-[10px] bg-slate-50 px-1 py-0.5 rounded select-all w-fit">{clientImportReport.filename}</div>
                          </div>

                          <div className="space-y-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Daftar Pembaruan Master Data (Akan Menimpa Tabel Lokal):</span>
                            <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-slate-700">
                              <div className="bg-white border border-slate-200 p-2 rounded-lg">
                                <span className="text-slate-400 font-medium block text-[9px] uppercase">Master Harga</span>
                                <span className="text-sm font-extrabold text-indigo-600 font-mono block mt-0.5">{clientImportReport.pricesCount} baris</span>
                              </div>
                              <div className="bg-white border border-slate-200 p-2 rounded-lg">
                                <span className="text-slate-400 font-medium block text-[9px] uppercase">Akun Operator</span>
                                <span className="text-sm font-extrabold text-indigo-600 font-mono block mt-0.5">{clientImportReport.usersCount} akun</span>
                              </div>
                              <div className="bg-white border border-slate-200 p-2 rounded-lg">
                                <span className="text-slate-400 font-medium block text-[9px] uppercase">PrePrint Barcode</span>
                                <span className="text-sm font-extrabold text-indigo-600 font-mono block mt-0.5">{clientImportReport.preprintCount} baris</span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Gabungkan Transaksi Server (Anti-Duplikasi):</span>
                            
                            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-400 font-bold uppercase">
                                    <th className="px-3 py-2">Kategori Data</th>
                                    <th className="px-3 py-2 text-center text-teal-600">Baru (Akan Diimport)</th>
                                    <th className="px-3 py-2 text-center text-rose-500">Duplikat (Akan Dilewati)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                                  <tr>
                                    <td className="px-3 py-2 text-xs font-sans font-medium text-slate-600">Timbangan Buying</td>
                                    <td className="px-3 py-2 text-center text-teal-600 font-bold">+{clientImportReport.buying.new}</td>
                                    <td className="px-3 py-2 text-center text-rose-500">{clientImportReport.buying.dup} skipped</td>
                                  </tr>
                                  <tr>
                                    <td className="px-3 py-2 text-xs font-sans font-medium text-slate-600">Grading Reclass</td>
                                    <td className="px-3 py-2 text-center text-teal-600 font-bold">+{clientImportReport.reclass.new}</td>
                                    <td className="px-3 py-2 text-center text-rose-500">{clientImportReport.reclass.dup} skipped</td>
                                  </tr>
                                  <tr>
                                    <td className="px-3 py-2 text-xs font-sans font-medium text-slate-600">Pengiriman Shipping</td>
                                    <td className="px-3 py-2 text-center text-teal-600 font-bold">+{clientImportReport.shipping.new}</td>
                                    <td className="px-3 py-2 text-center text-rose-500">{clientImportReport.shipping.dup} skipped</td>
                                  </tr>
                                  <tr>
                                    <td className="px-3 py-2 text-xs font-sans font-medium text-slate-600">Kwitansi Invoice</td>
                                    <td className="px-3 py-2 text-center text-teal-600 font-bold">+{clientImportReport.invoice.new}</td>
                                    <td className="px-3 py-2 text-center text-rose-500">{clientImportReport.invoice.dup} skipped</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <button
                            onClick={handleClientMerge}
                            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition shadow active:scale-[0.98]"
                          >
                            <Plus size={15} />
                            UPDATE DAN GABUNGKAN DATA KE KLIEN
                          </button>
                        </div>
                      ) : (
                        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex gap-2 font-medium">
                          <AlertTriangle size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
                          <span>Gagal: {clientImportReport.error}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Client Sync Side info */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4 h-fit">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Alur Sinkronisasi Dua Arah</h4>
                <div className="text-xs text-slate-500 space-y-4 leading-relaxed">
                  <div>
                    <span className="font-extrabold text-slate-700 block mb-1">Arah 1: Timbangan Lapangan ke Kantor</span>
                    <p>Unduh file di Klien lapangan, simpan di Flashdisk, lalu upload di Server kantor untuk pengumpulan transaksi.</p>
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <span className="font-extrabold text-slate-700 block mb-1">Arah 2: Kantor ke Timbangan Lapangan</span>
                    <p>Unduh file sinkronisasi di Server kantor (yang memuat data harga master baru, operator baru, settings, dan nomor barcode cetakan pre-print), lalu upload di Klien lapangan untuk sinkronisasi otomatis.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SINKRONISASI SERVER VIEW */}
          {syncMode === 'server' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Server Actions Panel (Two Way) */}
                <div className="lg:col-span-2 space-y-6">
                  {/* section 1: Import Client Transactions to Server */}
                  <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-5">
                    <h3 className="text-md font-extrabold text-slate-800 flex items-center gap-2">
                      <UploadCloud size={18} className="text-teal-500" />
                      1. Terima Data Klien (Import ke Server Kantor)
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed mt-[-8px]">
                      Unggah file sinkronisasi JSON yang dikirimkan oleh komputer Klien lapangan untuk secara otomatis divalidasi dan digabungkan ke database Server tanpa menduplikasi data.
                    </p>

                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unggah File Sinkronisasi Client (.json)</label>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleServerFileSelect}
                        className="block w-full text-xs text-slate-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-xl file:border-0
                          file:text-xs file:font-bold
                          file:bg-teal-50 file:text-teal-700
                          hover:file:bg-teal-100 transition cursor-pointer"
                      />
                    </div>

                    {/* Pre-import report analysis */}
                    {importReport && (
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4 animate-scaleUp">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <CheckCircle2 size={16} className={importReport.valid ? "text-emerald-500" : "text-rose-500"} />
                            Hasil Verifikasi File Sinkronisasi Klien
                          </span>
                          {importReport.valid && (
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded uppercase">Valid</span>
                          )}
                        </div>

                        {importReport.valid ? (
                          <div className="space-y-3 text-xs text-slate-600">
                            <div className="grid grid-cols-2 gap-y-1.5 leading-relaxed bg-white border border-slate-100 p-3 rounded-lg">
                              <div>Nama Operator Klien:</div>
                              <div className="font-bold text-slate-800">{importReport.operator}</div>
                              <div>Tanggal Ekspor Klien:</div>
                              <div className="font-semibold text-slate-800">{importReport.exportedAt}</div>
                              <div>Nama Berkas:</div>
                              <div className="font-mono text-[10px] bg-slate-50 px-1 py-0.5 rounded select-all w-fit">{importReport.filename}</div>
                            </div>

                            <div className="space-y-2">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Analisis Duplikasi &amp; Pencegahan Double-Data:</span>
                              
                              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-400 font-bold uppercase">
                                      <th className="px-3 py-2">Kategori Data</th>
                                      <th className="px-3 py-2 text-center text-teal-600">Baru (Akan Diimport)</th>
                                      <th className="px-3 py-2 text-center text-rose-500">Duplikat (Akan Dilewati)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                                    <tr>
                                      <td className="px-3 py-2 text-xs font-sans font-medium text-slate-600">Timbangan Buying</td>
                                      <td className="px-3 py-2 text-center text-teal-600 font-bold">+{importReport.buying.new}</td>
                                      <td className="px-3 py-2 text-center text-rose-500">{importReport.buying.dup} skipped</td>
                                    </tr>
                                    <tr>
                                      <td className="px-3 py-2 text-xs font-sans font-medium text-slate-600">Grading Reclass</td>
                                      <td className="px-3 py-2 text-center text-teal-600 font-bold">+{importReport.reclass.new}</td>
                                      <td className="px-3 py-2 text-center text-rose-500">{importReport.reclass.dup} skipped</td>
                                    </tr>
                                    <tr>
                                      <td className="px-3 py-2 text-xs font-sans font-medium text-slate-600">Pengiriman Shipping</td>
                                      <td className="px-3 py-2 text-center text-teal-600 font-bold">+{importReport.shipping.new}</td>
                                      <td className="px-3 py-2 text-center text-rose-500">{importReport.shipping.dup} skipped</td>
                                    </tr>
                                    <tr>
                                      <td className="px-3 py-2 text-xs font-sans font-medium text-slate-600">Kwitansi Invoice</td>
                                      <td className="px-3 py-2 text-center text-teal-600 font-bold">+{importReport.invoice.new}</td>
                                      <td className="px-3 py-2 text-center text-rose-500">{importReport.invoice.dup} skipped</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {importReport.buying.new + importReport.reclass.new + importReport.shipping.new + importReport.invoice.new === 0 ? (
                              <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl flex gap-2">
                                <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                                Tidak ada data baru yang divalidasi. Seluruh isi berkas sinkronisasi ini sudah ada (tercatat) di Server Anda sebelumnya. Aman untuk dilewati!
                              </div>
                            ) : (
                              <button
                                onClick={handleServerMerge}
                                className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition shadow active:scale-[0.98]"
                              >
                                <Plus size={15} />
                                GABUNGKAN DATA KE SERVER (MERGE)
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex gap-2 font-medium">
                            <AlertTriangle size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
                            <span>Gagal: {importReport.error}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* section 2: Export Master Data from Server to Client */}
                  <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
                    <h3 className="text-md font-extrabold text-slate-800 flex items-center gap-2">
                      <DownloadCloud size={18} className="text-indigo-500" />
                      2. Kirim Update / Master Data ke Klien (Export dari Server)
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed mt-[-8px]">
                      Kompilasi master harga terbaru, manajemen user operator, berkas pre-print barcode, format barcode settings, dan semua riwayat yang ada di Server untuk disinkronkan ke komputer Klien.
                    </p>

                    <button
                      onClick={handleServerExport}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition active:scale-95 shadow-sm w-fit"
                    >
                      <DownloadCloud size={15} />
                      Unduh File Sinkronisasi Server (.json)
                    </button>
                  </div>
                </div>

                {/* Server Mode Side info */}
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4 h-fit">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Penanganan Keamanan</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Sistem secara otomatis menganalisis database lokal Server untuk mencari id unik yang sama:
                  </p>
                  <ul className="text-xs text-slate-500 space-y-2.5 list-disc pl-4 leading-relaxed">
                    <li><span className="font-semibold text-slate-700">NoBarcode</span> dicocokkan untuk menghindari duplikasi timbangan awal.</li>
                    <li><span className="font-semibold text-slate-700">NoReclass</span> dicocokkan untuk memastikan satu grade akhir reclass per bale.</li>
                    <li><span className="font-semibold text-slate-700">NoInvoice</span> dicocokkan agar kwitansi pembayaran tidak terduplikasi.</li>
                    <li>Sistem tidak akan menimpa baris transaksi yang ada, melainkan menambahkan baris yang benar-benar baru secara aman.</li>
                  </ul>
                </div>
              </div>

              {/* Sync verification trail history */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <History size={18} className="text-slate-400" />
                  <h3 className="text-md font-extrabold text-slate-800">Log Verifikasi Sinkronisasi</h3>
                </div>
                
                <div className="border border-slate-100 rounded-xl overflow-x-auto max-h-72">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold">
                        <th className="px-4 py-2">Waktu</th>
                        <th className="px-4 py-2">Operator</th>
                        <th className="px-4 py-2">Aksi</th>
                        <th className="px-4 py-2">Berkas</th>
                        <th className="px-4 py-2 text-center text-teal-600">Baru / Total</th>
                        <th className="px-4 py-2 text-center text-rose-500">Duplikat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px] font-medium text-slate-600">
                      {syncLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-slate-400">Belum ada riwayat aktivitas sinkronisasi.</td>
                        </tr>
                      ) : (
                        syncLogs.map((l, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2 font-mono whitespace-nowrap">{l.timestamp}</td>
                            <td className="px-4 py-2 max-w-[120px] truncate">{l.operator}</td>
                            <td className="px-4 py-2">
                              {l.mode === 'CLIENT_EXPORT' ? (
                                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded font-bold text-[9px] uppercase tracking-wider">Klien Ekspor</span>
                              ) : l.mode === 'CLIENT_IMPORT' ? (
                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-bold text-[9px] uppercase tracking-wider">Klien Impor</span>
                              ) : l.mode === 'SERVER_EXPORT' ? (
                                <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded font-bold text-[9px] uppercase tracking-wider">Server Ekspor</span>
                              ) : (
                                <span className="px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded font-bold text-[9px] uppercase tracking-wider">Server Impor</span>
                              )}
                            </td>
                            <td className="px-4 py-2 font-mono text-[10px] text-slate-400 max-w-[150px] truncate" title={l.filename}>{l.filename}</td>
                            <td className="px-4 py-2 text-center text-teal-600 font-extrabold font-mono">+{l.buyingCount + l.reclassCount + l.shippingCount + l.invoiceCount}</td>
                            <td className="px-4 py-2 text-center text-rose-500 font-mono">{l.duplicateCount || 0}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
