import {
  User,
  MasterPrice,
  BuyingRow,
  ReclassRow,
  ReclassLogRow,
  ShippingRow,
  InvoiceRow,
  SettingItem,
  PrePrintRow,
  BarcodeSettings,
  DashboardSummary
} from './types';

// =========================================================================
// HYBRID STORAGE SYSTEM (RAM + INDEXEDDB + LOCALSTORAGE)
// Centralized storage that breaks the 5 MB browser storage limit.
// =========================================================================

const DB_NAME = 'iscs_indexed_db';
const STORE_NAME = 'keyval';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

const getIDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
};

export const idbGet = async (key: string): Promise<any> => {
  try {
    const db = await getIDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('IndexedDB get error:', err);
    return null;
  }
};

export const idbSet = async (key: string, value: any): Promise<void> => {
  try {
    const db = await getIDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('IndexedDB set error:', err);
  }
};

export const idbRemove = async (key: string): Promise<void> => {
  try {
    const db = await getIDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('IndexedDB remove error:', err);
  }
};

const ALL_KEYS = [
  'iscs_users',
  'iscs_prices',
  'iscs_settings',
  'iscs_counters',
  'iscs_buying',
  'iscs_reclass',
  'iscs_reclass_log',
  'iscs_preprint',
  'iscs_shipping',
  'iscs_invoice',
  'iscs_synced_ids',
  'iscs_sync_logs'
];

const OTHER_KEYS = [
  'iscs_storage_mode',
  'iscs_local_db_version',
  'iscs_active_session'
];

// Memory-resident cache to provide high-performance, synchronous data access for React components
const dbMemoryCache: Record<string, any> = {};

// Warm up the memory cache synchronously from localStorage for instant boot
if (typeof window !== 'undefined') {
  ALL_KEYS.forEach(k => {
    const data = localStorage.getItem(k);
    if (data) {
      try {
        dbMemoryCache[k] = JSON.parse(data);
      } catch {
        dbMemoryCache[k] = [];
      }
    } else {
      dbMemoryCache[k] = [];
    }
  });

  OTHER_KEYS.forEach(k => {
    const data = localStorage.getItem(k);
    dbMemoryCache[k] = data;
  });
}

// Synchronous getter (API remains fully compatible)
const getLocal = <T>(key: string, fallback: T): T => {
  if (dbMemoryCache[key] !== undefined && dbMemoryCache[key] !== null) {
    const val = dbMemoryCache[key];
    return (Array.isArray(val) ? [...val] : val) as T;
  }
  if (typeof window === 'undefined') return fallback;
  const data = localStorage.getItem(key);
  if (!data) return fallback;
  try {
    const val = JSON.parse(data);
    dbMemoryCache[key] = val;
    return (Array.isArray(val) ? [...val] : val) as T;
  } catch {
    dbMemoryCache[key] = data;
    return (data as any) || fallback;
  }
};

// Synchronous setter with background IndexedDB save & local fallback
const setLocal = <T>(key: string, value: T): void => {
  dbMemoryCache[key] = value;
  
  // Save to IndexedDB asynchronously (no 5 MB limit!)
  if (typeof window !== 'undefined') {
    idbSet(key, value);

    // Backup to localStorage (with try-catch to ignore quota errors)
    try {
      if (typeof value === 'string') {
        localStorage.setItem(key, value);
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (e) {
      console.warn(`LocalStorage quota exceeded for key "${key}", but safely stored in memory and IndexedDB.`, e);
    }
  }

  window.dispatchEvent(new Event('iscs-db-update'));
  if (getLocal<string>('iscs_storage_mode', 'local') === 'lan') {
    pushDbToServer();
  }
};

export const getCompleteLocalDb = () => {
  const db: Record<string, any> = {};
  ALL_KEYS.forEach(k => {
    if (dbMemoryCache[k] !== undefined && dbMemoryCache[k] !== null) {
      db[k] = dbMemoryCache[k];
    } else {
      const data = typeof window !== 'undefined' ? localStorage.getItem(k) : null;
      try {
        db[k] = data ? JSON.parse(data) : [];
      } catch {
        db[k] = [];
      }
    }
  });
  return db;
};

export const setCompleteLocalDb = (db: Record<string, any>) => {
  ALL_KEYS.forEach(k => {
    if (db[k] !== undefined) {
      dbMemoryCache[k] = db[k];
      if (typeof window !== 'undefined') {
        idbSet(k, db[k]);
        try {
          localStorage.setItem(k, JSON.stringify(db[k]));
        } catch (e) {
          // Ignore quota errors
        }
      }
    }
  });
  window.dispatchEvent(new Event('iscs-db-update'));
};

let isPushing = false;
export const pushDbToServer = async () => {
  if (isPushing) return;
  isPushing = true;
  try {
    const dbData = getCompleteLocalDb();
    const response = await fetch('/api/lan/db', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: dbData })
    });
    if (response.ok) {
      const resJson = await response.json();
      if (resJson.version) {
        setLocal('iscs_local_db_version', String(resJson.version));
      }
    }
  } catch (err) {
    console.error('LAN Sync push error:', err);
  } finally {
    isPushing = false;
  }
};

let isFetching = false;
export const fetchDbFromServer = async () => {
  if (isFetching) return;
  isFetching = true;
  try {
    const response = await fetch('/api/lan/db');
    if (response.ok) {
      const resJson = await response.json();
      if (resJson.data && typeof resJson.data === 'object') {
        setCompleteLocalDb(resJson.data);
        if (resJson.version) {
          setLocal('iscs_local_db_version', String(resJson.version));
        }
      }
    }
  } catch (err) {
    console.error('LAN Sync fetch error:', err);
  } finally {
    isFetching = false;
  }
};

export const startLanPolling = () => {
  const intervalId = setInterval(async () => {
    const mode = getLocal<string>('iscs_storage_mode', 'local');
    if (mode !== 'lan') return;

    try {
      const response = await fetch('/api/lan/version');
      if (response.ok) {
        const { version } = await response.json();
        const localVersion = getLocal('iscs_local_db_version', '');
        
        if (!localVersion || String(version) !== String(localVersion)) {
          await fetchDbFromServer();
        }
      }
    } catch (err) {
      // ignore
    }
  }, 3000);

  return () => clearInterval(intervalId);
};

// Asynchronous loader to populate the memory cache with IndexedDB data on boot
export const loadDatabaseFromIndexedDB = async () => {
  const allKeysToLoad = [...ALL_KEYS, ...OTHER_KEYS];
  let updated = false;

  for (const k of allKeysToLoad) {
    const val = await idbGet(k);
    if (val !== undefined && val !== null) {
      dbMemoryCache[k] = val;
      updated = true;
      // Mirror to localStorage if possible
      try {
        if (typeof val === 'string') {
          localStorage.setItem(k, val);
        } else {
          localStorage.setItem(k, JSON.stringify(val));
        }
      } catch (e) {
        // quota exceeded, safe to ignore
      }
    }
  }

  if (updated) {
    window.dispatchEvent(new Event('iscs-db-update'));
    if (dbMemoryCache['iscs_storage_mode'] === 'lan') {
      fetchDbFromServer();
    }
  }
};

// Start background services and DB loader
if (typeof window !== 'undefined') {
  // Load IndexedDB data first, then run initial validations
  loadDatabaseFromIndexedDB().then(() => {
    ensureDatabase();
  });
  
  startLanPolling();
}

// Initialize DB structure on load
export const ensureDatabase = (): void => {
  const users = getLocal<User[]>('iscs_users', []);
  if (users.length === 0) {
    setLocal<User[]>('iscs_users', [
      { Username: 'admin', PIN: '1234', Nama: 'Administrator', Role: 'admin', MenuAccess: 'ALL' },
      { Username: 'petugas1', PIN: '1111', Nama: 'Ahmad Timbang', Role: 'user', MenuAccess: 'pageDashboard,pageBuying,pageReclass,pageShipping,pagePrePrint,pageLaporan,pageInvoice' }
    ]);
  }

  const prices = getLocal<MasterPrice[]>('iscs_prices', []);
  if (prices.length === 0) {
    setLocal<MasterPrice[]>('iscs_prices', [
      { GradeBuying: 'A', Harga: 55000, Tipe: 'BUYING', Type: 'VIRGINIA', SubType: 'LOKAL', CropYear: '2026' },
      { GradeBuying: 'B', Harga: 45000, Tipe: 'BUYING', Type: 'VIRGINIA', SubType: 'LOKAL', CropYear: '2026' },
      { GradeBuying: 'C', Harga: 35000, Tipe: 'BUYING', Type: 'VIRGINIA', SubType: 'LOKAL', CropYear: '2026' },
      { GradeBuying: 'A', Harga: 58000, Tipe: 'RECLASS', Type: 'VIRGINIA', SubType: 'LOKAL', CropYear: '2026' },
      { GradeBuying: 'B', Harga: 48000, Tipe: 'RECLASS', Type: 'VIRGINIA', SubType: 'LOKAL', CropYear: '2026' },
      { GradeBuying: 'C', Harga: 38000, Tipe: 'RECLASS', Type: 'VIRGINIA', SubType: 'LOKAL', CropYear: '2026' }
    ]);
  }

  const settings = getLocal<SettingItem[]>('iscs_settings', []);
  const defaults = [
    { Key: 'BarcodeCompany', Value: 'IDS' },
    { Key: 'BarcodeTipe', Value: 'SC25' },
    { Key: 'BarcodeSumber', Value: 'LB' },
    { Key: 'BarcodeDigitCounter', Value: '5' },
    { Key: 'PrePrintCompanyName', Value: 'PT INDO DEWATA SEMESTA' },
    { Key: 'NamaPerusahaan', Value: 'PT INDO DEWATA SEMESTA' },
    { Key: 'LokasiInvoice', Value: 'Lumajang' },
    { Key: 'KonstantaValue', Value: '0.50' }
  ];

  defaults.forEach(def => {
    const found = settings.find(s => s.Key === def.Key);
    if (!found) {
      settings.push(def);
    }
  });
  setLocal<SettingItem[]>('iscs_settings', settings);
};

// Auto-run ensureDatabase
ensureDatabase();

/* =========================================================================
   SEQUENCE / COUNTER GENERATOR
   ========================================================================= */
const nextSequence = (key: string): number => {
  const counters = getLocal<Record<string, number>>('iscs_counters', {});
  const current = counters[key] || 0;
  const nextVal = current + 1;
  counters[key] = nextVal;
  setLocal('iscs_counters', counters);
  return nextVal;
};

export const getSettingValue = (key: string, fallback: string): string => {
  const settings = getLocal<SettingItem[]>('iscs_settings', []);
  const item = settings.find(s => s.Key === key);
  return item ? item.Value : fallback;
};

export const setSettingValue = (key: string, value: string): void => {
  const settings = getLocal<SettingItem[]>('iscs_settings', []);
  const idx = settings.findIndex(s => s.Key === key);
  if (idx !== -1) {
    settings[idx].Value = value;
  } else {
    settings.push({ Key: key, Value: value });
  }
  setLocal('iscs_settings', settings);
};

export const getBarcodeSettings = (): BarcodeSettings => {
  return {
    company: String(getSettingValue('BarcodeCompany', 'IDS')).toUpperCase(),
    tipe: String(getSettingValue('BarcodeTipe', 'SC25')).toUpperCase(),
    sumber: String(getSettingValue('BarcodeSumber', 'LB')).toUpperCase(),
    digitCounter: Number(getSettingValue('BarcodeDigitCounter', '5')) || 5
  };
};

export const getDatePartsFromDateString = (dateStr?: string): { dd: string; mm: string; yy: string; dateKey: string; fullDate: Date } => {
  let d = new Date();
  if (dateStr && typeof dateStr === 'string' && dateStr.trim()) {
    const trimmed = dateStr.trim();
    const matchYMD = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matchYMD) {
      const year = parseInt(matchYMD[1], 10);
      const month = parseInt(matchYMD[2], 10) - 1;
      const day = parseInt(matchYMD[3], 10);
      d = new Date(year, month, day);
    } else {
      const matchDMY = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
      if (matchDMY) {
        const day = parseInt(matchDMY[1], 10);
        const month = parseInt(matchDMY[2], 10) - 1;
        const year = parseInt(matchDMY[3], 10);
        d = new Date(year, month, day);
      } else {
        const parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime())) {
          d = parsed;
        }
      }
    }
  }
  const dd = ('0' + d.getDate()).slice(-2);
  const mm = ('0' + (d.getMonth() + 1)).slice(-2);
  const yy = String(d.getFullYear()).slice(-2);
  return { dd, mm, yy, dateKey: `${dd}${mm}${yy}`, fullDate: d };
};

export const generateBuyingBarcode = (customDate?: string, customSumber?: string): string => {
  const s = getBarcodeSettings();
  const sumber = (customSumber && customSumber.trim()) ? customSumber.trim().toUpperCase() : s.sumber;
  const { dateKey } = getDatePartsFromDateString(customDate);

  // Existing barcodes from buying & preprint to prevent ANY collisions
  const buyingList = getLocal<BuyingRow[]>('iscs_buying', []);
  const preprintList = getLocal<PrePrintRow[]>('iscs_preprint', []);
  const usedCodes = new Set<string>();
  buyingList.forEach(b => { if (b.NoBarcode) usedCodes.add(b.NoBarcode.trim().toUpperCase()); });
  preprintList.forEach(p => { if (p.NoBarcode) usedCodes.add(p.NoBarcode.trim().toUpperCase()); });

  // Sync counter for this dateKey with existing barcodes
  const counters = getLocal<Record<string, number>>('iscs_counters', {});
  const counterKey = 'BARCODE-' + dateKey;
  let highestExistingSeq = counters[counterKey] || 0;

  const prefix = (s.company + s.tipe + sumber + dateKey).toUpperCase();
  usedCodes.forEach(code => {
    if (code.startsWith(prefix)) {
      const numPart = code.slice(prefix.length);
      const parsed = parseInt(numPart, 10);
      if (!isNaN(parsed) && parsed > highestExistingSeq) {
        highestExistingSeq = parsed;
      }
    }
  });

  if (highestExistingSeq > (counters[counterKey] || 0)) {
    counters[counterKey] = highestExistingSeq;
    setLocal('iscs_counters', counters);
  }

  let code = '';
  let attempts = 0;
  do {
    const seq = nextSequence(counterKey);
    const counterStr = ('00000000' + seq).slice(-s.digitCounter);
    code = (s.company + s.tipe + sumber + dateKey + counterStr).toUpperCase();
    attempts++;
  } while (usedCodes.has(code) && attempts < 1000);

  return code;
};

const generateNoBuying = (): string => {
  const seq = nextSequence('NOBUYING');
  return 'BUY-' + ('0000' + seq).slice(-4);
};

const generateNoReclass = (): string => {
  const today = new Date();
  const yy = String(today.getFullYear()).slice(-2);
  const mm = ('0' + (today.getMonth() + 1)).slice(-2);
  const dd = ('0' + today.getDate()).slice(-2);
  const todayKey = `${yy}${mm}${dd}`;
  const seq = nextSequence('RC-' + todayKey);
  return 'RC-' + todayKey + '-' + ('000' + seq).slice(-4);
};

const generateNoInvoice = (): string => {
  const seq = nextSequence('NOINVOICE');
  return 'INV-' + ('0000' + seq).slice(-4);
};

export const toRomanMonth = (month1Based: number): string => {
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return romans[month1Based - 1] || 'I';
};

export const generateNoShipping = (customDate?: string): string => {
  let d: Date;
  if (customDate) {
    const parts = customDate.trim().split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      d = new Date(customDate);
    }
  } else {
    d = new Date();
  }
  if (isNaN(d.getTime())) d = new Date();

  const kode = (getSettingValue('ShippingKode', 'PG') || 'PG').trim().toUpperCase();
  const source = (getSettingValue('ShippingSource', 'LJ') || 'LJ').trim().toUpperCase();

  const dd = ('0' + d.getDate()).slice(-2);
  const mmNum = d.getMonth() + 1;
  const mmRoman = toRomanMonth(mmNum);
  const yy = String(d.getFullYear()).slice(-2);
  const dateSegment = `${dd}${mmRoman}${yy}`;

  // Monthly reset: counter key includes year and month (e.g. NOSHIPPING_202312)
  const monthKey = `${d.getFullYear()}${('0' + mmNum).slice(-2)}`;
  const seq = nextSequence(`NOSHIPPING_${monthKey}`);
  const seqStr = ('0000' + seq).slice(-4);

  return `${kode}-${source}-${dateSegment}-${seqStr}`;
};

/* =========================================================================
   AUTH & USERS
   ========================================================================= */
export const resolveMenuAccess = (role: string, menuAccessRaw: string): 'ALL' | string[] => {
  if (role.toLowerCase() === 'admin') return 'ALL';
  const raw = String(menuAccessRaw || '').trim();
  if (!raw || raw.toUpperCase() === 'ALL') return 'ALL';
  if (raw.toUpperCase() === 'NONE') return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
};

export const apiLogin = (username: string, pin: string) => {
  const users = getLocal<User[]>('iscs_users', []);
  const found = users.find(u => u.Username === username && u.PIN === pin);
  if (!found) {
    return { success: false, message: 'Username atau PIN salah.' };
  }
  const user = {
    username: found.Username,
    nama: found.Nama,
    role: found.Role,
    menuAccess: resolveMenuAccess(found.Role, found.MenuAccess)
  };
  setLocal('iscs_active_session', user);
  return {
    success: true,
    user
  };
};

export const apiGetUserInfo = (username: string) => {
  const users = getLocal<User[]>('iscs_users', []);
  const found = users.find(u => u.Username === username);
  if (!found) return { success: false, message: 'Akun tidak ditemukan.' };
  return {
    success: true,
    user: {
      username: found.Username,
      nama: found.Nama,
      role: found.Role,
      menuAccess: resolveMenuAccess(found.Role, found.MenuAccess)
    }
  };
};

export const apiGetUserList = (actingUsername: string) => {
  const users = getLocal<User[]>('iscs_users', []);
  const acting = users.find(u => u.Username === actingUsername);
  if (!acting || acting.Role !== 'admin') {
    return { success: false, message: 'Hanya admin yang bisa mengakses Manajemen User.' };
  }
  return {
    success: true,
    users: users.map(u => ({
      username: u.Username,
      nama: u.Nama,
      role: u.Role,
      menuAccess: resolveMenuAccess(u.Role, u.MenuAccess)
    }))
  };
};

export const apiCreateUser = (payload: { username: string; pin: string; nama: string; role: 'admin' | 'user'; menuAccess: string[] }, actingUsername: string) => {
  const users = getLocal<User[]>('iscs_users', []);
  const acting = users.find(u => u.Username === actingUsername);
  if (!acting || acting.Role !== 'admin') {
    return { success: false, message: 'Hanya admin yang bisa menambah user.' };
  }

  const username = payload.username.trim();
  const pin = payload.pin.trim();
  const nama = payload.nama.trim();
  const role = payload.role;
  const menuAccess = payload.menuAccess || [];

  if (!username || !pin) return { success: false, message: 'Username dan PIN wajib diisi.' };
  if (!/^\d{4,8}$/.test(pin)) return { success: false, message: 'PIN harus angka 4-8 digit.' };

  const exists = users.some(u => u.Username.toLowerCase() === username.toLowerCase());
  if (exists) return { success: false, message: 'Username sudah ada.' };

  const menuAccessStr = role === 'admin' ? 'ALL' : (menuAccess.length ? menuAccess.join(',') : 'NONE');
  users.push({ Username: username, PIN: pin, Nama: nama, Role: role, MenuAccess: menuAccessStr });
  setLocal('iscs_users', users);

  return { success: true, message: 'User baru berhasil ditambahkan.' };
};

export const apiUpdateUserAccess = (payload: { username: string; nama: string; role: 'admin' | 'user'; menuAccess: string[] }, actingUsername: string) => {
  const users = getLocal<User[]>('iscs_users', []);
  const acting = users.find(u => u.Username === actingUsername);
  if (!acting || acting.Role !== 'admin') {
    return { success: false, message: 'Hanya admin yang bisa mengubah hak akses.' };
  }

  const username = payload.username.trim();
  const role = payload.role;
  const nama = payload.nama;
  const menuAccess = payload.menuAccess || [];

  const idx = users.findIndex(u => u.Username === username);
  if (idx === -1) return { success: false, message: 'User tidak ditemukan.' };

  // Prevent last admin from being demoted
  if (role !== 'admin' && users[idx].Role === 'admin') {
    const otherAdmins = users.filter((u, i) => i !== idx && u.Role === 'admin');
    if (!otherAdmins.length) return { success: false, message: 'Tidak bisa mengubah role admin terakhir menjadi user.' };
  }

  users[idx].Nama = nama;
  users[idx].Role = role;
  users[idx].MenuAccess = role === 'admin' ? 'ALL' : (menuAccess.length ? menuAccess.join(',') : 'NONE');
  setLocal('iscs_users', users);

  return { success: true, message: 'Hak akses user berhasil diperbarui.' };
};

export const apiResetUserPin = (payload: { username: string; pin: string }, actingUsername: string) => {
  const users = getLocal<User[]>('iscs_users', []);
  const acting = users.find(u => u.Username === actingUsername);
  if (!acting || acting.Role !== 'admin') {
    return { success: false, message: 'Hanya admin yang bisa reset PIN.' };
  }

  const username = payload.username.trim();
  const pin = payload.pin.trim();
  if (!/^\d{4,8}$/.test(pin)) return { success: false, message: 'PIN harus angka 4-8 digit.' };

  const idx = users.findIndex(u => u.Username === username);
  if (idx === -1) return { success: false, message: 'User tidak ditemukan.' };

  users[idx].PIN = pin;
  setLocal('iscs_users', users);

  return { success: true, message: 'PIN berhasil direset.' };
};

export const apiDeleteUser = (payload: { username: string }, actingUsername: string) => {
  const users = getLocal<User[]>('iscs_users', []);
  const acting = users.find(u => u.Username === actingUsername);
  if (!acting || acting.Role !== 'admin') {
    return { success: false, message: 'Hanya admin yang bisa menghapus user.' };
  }

  const username = payload.username.trim();
  if (username === actingUsername) return { success: false, message: 'Tidak bisa menghapus akun sendiri.' };

  const idx = users.findIndex(u => u.Username === username);
  if (idx === -1) return { success: false, message: 'User tidak ditemukan.' };

  if (users[idx].Role === 'admin') {
    const otherAdmins = users.filter((u, i) => i !== idx && u.Role === 'admin');
    if (!otherAdmins.length) return { success: false, message: 'Tidak bisa menghapus admin terakhir.' };
  }

  users.splice(idx, 1);
  setLocal('iscs_users', users);

  return { success: true, message: 'User berhasil dihapus.' };
};

/* =========================================================================
   MASTER HARGA
   ========================================================================= */
export const apiGetMasterPrice = (): MasterPrice[] => {
  return getLocal<MasterPrice[]>('iscs_prices', []);
};

export const apiSavePrice = (grade: string, harga: number, tipe: 'BUYING' | 'RECLASS', type: string, subType: string, cropYear: string) => {
  const g = grade.trim().toUpperCase();
  const t = tipe === 'RECLASS' ? 'RECLASS' : 'BUYING';
  const ty = type.trim().toUpperCase();
  const st = subType.trim().toUpperCase();
  const cy = cropYear.trim().toUpperCase();

  if (!g) return { success: false, message: 'Grade tidak boleh kosong.' };
  if (!ty || !st || !cy) return { success: false, message: 'Type, Sub Type, dan Crop Year wajib diisi.' };

  const prices = getLocal<MasterPrice[]>('iscs_prices', []);
  const idx = prices.findIndex(p => p.GradeBuying.toUpperCase() === g && p.Tipe === t && p.Type.toUpperCase() === ty && p.SubType.toUpperCase() === st && p.CropYear.toUpperCase() === cy);

  if (idx !== -1) {
    prices[idx].Harga = Number(harga);
    setLocal('iscs_prices', prices);
    return { success: true, message: `Harga ${t} grade ${g} diperbarui.` };
  } else {
    prices.push({ GradeBuying: g, Harga: Number(harga), Tipe: t, Type: ty, SubType: st, CropYear: cy });
    setLocal('iscs_prices', prices);
    return { success: true, message: `Grade ${t} ${g} ditambahkan.` };
  }
};

export const apiDeletePrice = (grade: string, tipe: 'BUYING' | 'RECLASS', type: string, subType: string, cropYear: string) => {
  const g = grade.trim().toUpperCase();
  const t = tipe === 'RECLASS' ? 'RECLASS' : 'BUYING';
  const ty = type.trim().toUpperCase();
  const st = subType.trim().toUpperCase();
  const cy = cropYear.trim().toUpperCase();

  const prices = getLocal<MasterPrice[]>('iscs_prices', []);
  const idx = prices.findIndex(p => p.GradeBuying.toUpperCase() === g && p.Tipe === t && p.Type.toUpperCase() === ty && p.SubType.toUpperCase() === st && p.CropYear.toUpperCase() === cy);

  if (idx !== -1) {
    prices.splice(idx, 1);
    setLocal('iscs_prices', prices);
    return { success: true };
  }
  return { success: false, message: 'Grade tidak ditemukan.' };
};

export interface ImportMasterPriceItem {
  tipe: 'BUYING' | 'RECLASS';
  type: string;
  subType: string;
  cropYear: string;
  grade: string;
  harga: number;
}

export const apiImportMasterPrice = (
  items: ImportMasterPriceItem[],
  mode: 'update_or_insert' | 'replace_all' = 'update_or_insert'
): { success: boolean; message: string; inserted: number; updated: number; total: number } => {
  if (!items || items.length === 0) {
    return { success: false, message: 'Tidak ada data harga yang valid untuk diimpor.', inserted: 0, updated: 0, total: 0 };
  }

  let prices = mode === 'replace_all' ? [] : getLocal<MasterPrice[]>('iscs_prices', []);
  let inserted = 0;
  let updated = 0;

  for (const it of items) {
    const g = String(it.grade || '').trim().toUpperCase();
    const t = String(it.tipe || '').trim().toUpperCase() === 'RECLASS' ? 'RECLASS' : 'BUYING';
    const ty = String(it.type || 'VIRGINIA').trim().toUpperCase();
    const st = String(it.subType || 'LOKAL').trim().toUpperCase();
    const cy = String(it.cropYear || '2026').trim().toUpperCase();
    const h = Number(it.harga) || 0;

    if (!g || h <= 0) continue;

    const idx = prices.findIndex(p => 
      p.GradeBuying.toUpperCase() === g &&
      p.Tipe === t &&
      p.Type.toUpperCase() === ty &&
      p.SubType.toUpperCase() === st &&
      p.CropYear.toUpperCase() === cy
    );

    if (idx !== -1) {
      prices[idx].Harga = h;
      updated++;
    } else {
      prices.push({
        GradeBuying: g,
        Harga: h,
        Tipe: t,
        Type: ty,
        SubType: st,
        CropYear: cy
      });
      inserted++;
    }
  }

  setLocal('iscs_prices', prices);
  return {
    success: true,
    message: `Berhasil mengimpor master harga: ${inserted} grade baru ditambahkan, ${updated} harga diperbarui.`,
    inserted,
    updated,
    total: inserted + updated
  };
};

export const getPriceForGrade = (
  grade: string,
  tipe: 'BUYING' | 'RECLASS',
  type?: string,
  subType?: string,
  cropYear?: string
): number => {
  if (!grade || !grade.trim()) return 0;
  const g = grade.trim().toUpperCase();
  const t = tipe === 'RECLASS' ? 'RECLASS' : 'BUYING';
  const otherTipe = t === 'RECLASS' ? 'BUYING' : 'RECLASS';
  const ty = (type || '').trim().toUpperCase();
  const st = (subType || '').trim().toUpperCase();
  const cy = (cropYear || '').trim().toUpperCase();

  const prices = apiGetMasterPrice();
  if (!prices || prices.length === 0) return 0;

  // 1. Exact 5-tuple: Grade + requested Tipe + Type + SubType + CropYear
  let found = prices.find(p => 
    p.GradeBuying.toUpperCase() === g &&
    p.Tipe === t &&
    p.Type.toUpperCase() === ty &&
    p.SubType.toUpperCase() === st &&
    p.CropYear.toUpperCase() === cy
  );
  if (found && found.Harga > 0) return found.Harga;

  // 2. Grade + requested Tipe + Type + CropYear (any SubType)
  if (ty && cy) {
    found = prices.find(p => 
      p.GradeBuying.toUpperCase() === g &&
      p.Tipe === t &&
      p.Type.toUpperCase() === ty &&
      p.CropYear.toUpperCase() === cy
    );
    if (found && found.Harga > 0) return found.Harga;
  }

  // 3. Grade + requested Tipe + Type (any SubType & any CropYear)
  if (ty) {
    found = prices.find(p => 
      p.GradeBuying.toUpperCase() === g &&
      p.Tipe === t &&
      p.Type.toUpperCase() === ty
    );
    if (found && found.Harga > 0) return found.Harga;
  }

  // 4. Grade + requested Tipe (any Type, SubType, CropYear)
  found = prices.find(p => 
    p.GradeBuying.toUpperCase() === g &&
    p.Tipe === t
  );
  if (found && found.Harga > 0) return found.Harga;

  // 5. Cross-Tipe fallback (e.g. if Reclass grade was registered under BUYING or vice-versa)
  // 5a. Grade + other Tipe + Type + SubType + CropYear
  found = prices.find(p => 
    p.GradeBuying.toUpperCase() === g &&
    p.Tipe === otherTipe &&
    p.Type.toUpperCase() === ty &&
    p.SubType.toUpperCase() === st &&
    p.CropYear.toUpperCase() === cy
  );
  if (found && found.Harga > 0) return found.Harga;

  // 5b. Grade + other Tipe + Type
  if (ty) {
    found = prices.find(p => 
      p.GradeBuying.toUpperCase() === g &&
      p.Tipe === otherTipe &&
      p.Type.toUpperCase() === ty
    );
    if (found && found.Harga > 0) return found.Harga;
  }

  // 5c. Grade + other Tipe (any Type/SubType/CropYear)
  found = prices.find(p => 
    p.GradeBuying.toUpperCase() === g &&
    p.Tipe === otherTipe
  );
  if (found && found.Harga > 0) return found.Harga;

  // 6. Any entry with matching Grade regardless of Tipe/Type/SubType/CropYear
  found = prices.find(p => p.GradeBuying.toUpperCase() === g && p.Harga > 0);
  if (found && found.Harga > 0) return found.Harga;

  // 7. Normalized alphanumeric grade match (e.g. '6RKS/53M/NSPS' vs '6RKS-53M-NSPS' vs '6RKS53MNSPS')
  const cleanG = g.replace(/[^A-Z0-9]/g, '');
  if (cleanG.length >= 2) {
    found = prices.find(p => 
      p.Tipe === t &&
      p.GradeBuying.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanG && 
      p.Harga > 0
    );
    if (found && found.Harga > 0) return found.Harga;

    found = prices.find(p => 
      p.GradeBuying.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanG && 
      p.Harga > 0
    );
    if (found && found.Harga > 0) return found.Harga;
  }

  // 8. Normalization with digit '5' <-> letter 'S', 'O' <-> '0', and 'NSPS' <-> 'NSRS' (common OCR/typing variation)
  const normalizeGradeFuzzy = (str: string) => {
    return str.toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .replace(/5/g, 'S')
      .replace(/O/g, '0')
      .replace(/NSPS/g, 'NSRS');
  };
  const fuzzyG = normalizeGradeFuzzy(g);

  // 8a. First check with requested Tipe (e.g. RECLASS)
  found = prices.find(p => p.Tipe === t && normalizeGradeFuzzy(p.GradeBuying) === fuzzyG && p.Harga > 0);
  if (found && found.Harga > 0) return found.Harga;

  // 8b. Then check across other Tipe
  found = prices.find(p => normalizeGradeFuzzy(p.GradeBuying) === fuzzyG && p.Harga > 0);
  if (found && found.Harga > 0) return found.Harga;

  // 9. Core grade match by parts (e.g. '6RKS/53M/NSPS' matches '6RKS/S3M/NSRS' because '6RKS' and 'S3M' match)
  const getCoreParts = (str: string) => {
    return str.toUpperCase()
      .split(/[\/\-\s_]+/)
      .filter(Boolean)
      .map(p => p.replace(/5/g, 'S').replace(/O/g, '0'));
  };
  const gParts = getCoreParts(g);
  if (gParts.length >= 2) {
    // 9a. Match requested Tipe first
    found = prices.find(p => {
      if (p.Tipe !== t || p.Harga <= 0) return false;
      const pParts = getCoreParts(p.GradeBuying);
      if (pParts.length >= 2) {
        return gParts[0] === pParts[0] && gParts[1] === pParts[1];
      }
      return false;
    });
    if (found && found.Harga > 0) return found.Harga;

    // 9b. Fallback to any Tipe
    found = prices.find(p => {
      if (p.Harga <= 0) return false;
      const pParts = getCoreParts(p.GradeBuying);
      if (pParts.length >= 2) {
        return gParts[0] === pParts[0] && gParts[1] === pParts[1];
      }
      return false;
    });
    if (found && found.Harga > 0) return found.Harga;
  }

  return 0;
};

/* =========================================================================
   DATE & TIMESTAMP HELPERS (FOR BACKDATING & HISTORICAL TRACKING)
   ========================================================================= */
export const formatTimestamp = (d: Date = new Date()): string => {
  const yy = d.getFullYear();
  const mm = ('0' + (d.getMonth() + 1)).slice(-2);
  const dd = ('0' + d.getDate()).slice(-2);
  const hh = ('0' + d.getHours()).slice(-2);
  const min = ('0' + d.getMinutes()).slice(-2);
  const ss = ('0' + d.getSeconds()).slice(-2);
  return `${yy}-${mm}-${dd} ${hh}:${min}:${ss}`;
};

export const getTodayDateString = (): string => {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = ('0' + (d.getMonth() + 1)).slice(-2);
  const dd = ('0' + d.getDate()).slice(-2);
  return `${yy}-${mm}-${dd}`;
};

export const resolveTimestamp = (customDate?: string): string => {
  if (customDate && typeof customDate === 'string' && customDate.trim()) {
    const trimmed = customDate.trim();
    // YYYY-MM-DD HH:mm:ss
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // YYYY-MM-DD HH:mm
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(trimmed)) {
      return `${trimmed}:00`;
    }
    // YYYY-MM-DD (e.g. from <input type="date">)
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const now = new Date();
      const hh = ('0' + now.getHours()).slice(-2);
      const min = ('0' + now.getMinutes()).slice(-2);
      const ss = ('0' + now.getSeconds()).slice(-2);
      return `${trimmed} ${hh}:${min}:${ss}`;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return formatTimestamp(parsed);
    }
  }
  return formatTimestamp(new Date());
};

/* =========================================================================
   BUYING
   ========================================================================= */
export const apiGenerateNoBuyingFunc = () => {
  return { success: true, noBuying: generateNoBuying() };
};

export const apiSaveBuyingBatch = (payload: {
  namaSupplier: string;
  type: string;
  subType: string;
  cropYear: string;
  inputBy: string;
  items: Array<{ autoBarcode: boolean; noBarcode: string; gradeBuying: string; beratBruto: number; tare: number; beratNetto?: number }>;
  customDate?: string;
}) => {
  const namaSupplier = payload.namaSupplier.trim();
  const type = payload.type.trim().toUpperCase();
  const subType = payload.subType.trim().toUpperCase();
  const cropYear = payload.cropYear.trim().toUpperCase();
  const inputBy = payload.inputBy;
  const items = payload.items || [];

  if (!namaSupplier) return { success: false, message: 'Nama petani wajib diisi.' };
  if (!type || !subType || !cropYear) return { success: false, message: 'Type, Sub Type, dan Crop Year wajib dipilih.' };
  if (!items.length) return { success: false, message: 'Tambahkan minimal satu baris bale sebelum menyimpan.' };

  const buyingList = getLocal<BuyingRow[]>('iscs_buying', []);
  const existingBarcodes = new Set(buyingList.map(b => b.NoBarcode.toUpperCase()));

  // Pre-validate all items
  const manualCodesInBatch = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const rowNo = i + 1;
    const gradeBuying = it.gradeBuying.trim().toUpperCase();
    const beratBruto = Number(it.beratBruto) || 0;
    const tare = Number(it.tare) || 0;

    if (!gradeBuying) return { success: false, message: `Baris ${rowNo}: Grade Buying wajib diisi.` };
    if (beratBruto <= 0) return { success: false, message: `Baris ${rowNo}: Berat bruto harus lebih dari 0.` };
    if (tare < 0 || tare >= beratBruto) return { success: false, message: `Baris ${rowNo}: Tare tidak valid (harus lebih kecil dari berat bruto).` };

    if (!it.autoBarcode) {
      const manualCode = it.noBarcode.trim().toUpperCase();
      if (!manualCode) return { success: false, message: `Baris ${rowNo}: No Barcode wajib diisi (atau centang Auto Barcode).` };
      if (existingBarcodes.has(manualCode) || manualCodesInBatch.has(manualCode)) {
        return { success: false, message: `Baris ${rowNo}: No Barcode "${manualCode}" sudah dipakai.` };
      }
      manualCodesInBatch.add(manualCode);
    }
  }

  const noBuying = generateNoBuying();
  const timestamp = resolveTimestamp(payload.customDate);
  const savedItems: any[] = [];

  items.forEach(it => {
    const gradeBuying = it.gradeBuying.trim().toUpperCase();
    const beratBruto = Number(it.beratBruto) || 0;
    const tare = Number(it.tare) || 0;
    const beratNetto = it.beratNetto !== undefined ? Number(it.beratNetto) : (beratBruto - tare);
    const harga = getPriceForGrade(gradeBuying, 'BUYING', type, subType, cropYear);
    const total = beratNetto * harga;
    const noBarcode = it.autoBarcode ? generateBuyingBarcode(payload.customDate) : it.noBarcode.trim().toUpperCase();

    buyingList.push({
      Timestamp: timestamp,
      NoBarcode: noBarcode,
      NamaSupplier: namaSupplier,
      GradeBuying: gradeBuying,
      BeratBruto: beratBruto,
      Tare: tare,
      BeratNetto: beratNetto,
      HargaBuying: harga,
      TotalHarga: total,
      InputBy: inputBy,
      StatusReclass: 'BELUM',
      NoBuying: noBuying,
      Type: type,
      SubType: subType,
      CropYear: cropYear
    });

    savedItems.push({
      noBarcode,
      gradeBuying,
      beratBruto,
      tare,
      beratNetto,
      harga,
      total
    });
  });

  setLocal('iscs_buying', buyingList);

  return {
    success: true,
    message: `Buying ${noBuying} berhasil disimpan (${savedItems.length} bale).`,
    noBuying,
    namaSupplier,
    type,
    subType,
    cropYear,
    items: savedItems
  };
};

export const apiCreateSingleBale = (payload: {
  autoBarcode: boolean;
  noBarcode?: string;
  gradeBuying: string;
  beratNetto: number;
  tare?: number;
  namaSupplier?: string;
  type?: string;
  subType?: string;
  cropYear?: string;
  inputBy: string;
  customDate?: string;
}) => {
  const gradeBuying = (payload.gradeBuying || '').trim().toUpperCase();
  const beratNetto = Number(payload.beratNetto) || 0;
  const tare = Number(payload.tare) || 0;
  const beratBruto = beratNetto + tare;
  const namaSupplier = (payload.namaSupplier || '').trim() || 'STOK LANGSUNG';
  const type = (payload.type || '').trim().toUpperCase() || 'VIRGINIA';
  const subType = (payload.subType || '').trim().toUpperCase() || 'LOKAL';
  const cropYear = (payload.cropYear || '').trim().toUpperCase() || String(new Date().getFullYear());
  const inputBy = payload.inputBy || 'admin';

  if (!gradeBuying) {
    return { success: false, message: 'Grade wajib diisi/dipilih.' };
  }
  if (beratNetto <= 0) {
    return { success: false, message: 'Berat netto harus lebih dari 0 kg.' };
  }

  const buyingList = getLocal<BuyingRow[]>('iscs_buying', []);
  const existingBarcodes = new Set(buyingList.map(b => (b.NoBarcode || '').toUpperCase()));

  let noBarcode = '';
  if (payload.autoBarcode) {
    noBarcode = generateBuyingBarcode(payload.customDate);
  } else {
    noBarcode = (payload.noBarcode || '').trim().toUpperCase();
    if (!noBarcode) {
      return { success: false, message: 'No Barcode wajib diisi jika tidak menggunakan Auto Barcode.' };
    }
    if (existingBarcodes.has(noBarcode)) {
      return { success: false, message: `No Barcode "${noBarcode}" sudah pernah digunakan di sistem.` };
    }
  }

  const harga = getPriceForGrade(gradeBuying, 'BUYING', type, subType, cropYear);
  const total = Number((beratNetto * harga).toFixed(2));
  const noBuying = generateNoBuying();
  const timestamp = resolveTimestamp(payload.customDate);

  const newBale: BuyingRow = {
    Timestamp: timestamp,
    NoBarcode: noBarcode,
    NamaSupplier: namaSupplier,
    GradeBuying: gradeBuying,
    BeratBruto: beratBruto,
    Tare: tare,
    BeratNetto: beratNetto,
    HargaBuying: harga,
    TotalHarga: total,
    InputBy: inputBy,
    StatusReclass: 'BELUM',
    NoBuying: noBuying,
    Type: type,
    SubType: subType,
    CropYear: cropYear
  };

  buyingList.push(newBale);
  setLocal('iscs_buying', buyingList);

  return {
    success: true,
    message: `Bale baru "${noBarcode}" berhasil dibuat dan langsung masuk ke Stok Gudang!`,
    bale: newBale
  };
};

export const apiGetBuyingList = (): BuyingRow[] => {
  return getLocal<BuyingRow[]>('iscs_buying', []);
};

export const apiGetAvailableBarcodesForReclass = () => {
  const rows = getLocal<BuyingRow[]>('iscs_buying', []);
  return rows.map(r => ({
    noBarcode: r.NoBarcode,
    gradeBuying: r.GradeBuying,
    beratNetto: Number((Number(r.BeratBruto) - Number(r.Tare)).toFixed(2)),
    namaSupplier: r.NamaSupplier,
    statusReclass: r.StatusReclass || 'BELUM',
    type: r.Type || '',
    subType: r.SubType || '',
    cropYear: r.CropYear || ''
  }));
};

export const apiGetBuyingGroups = () => {
  const rows = getLocal<BuyingRow[]>('iscs_buying', []);
  const groups: Record<string, { noBuying: string; namaSupplier: string; tanggal: string; jumlahItem: number; totalNetto: number; totalHarga: number }> = {};
  const order: string[] = [];

  rows.forEach(r => {
    const key = r.NoBuying || r.NoBarcode;
    if (!groups[key]) {
      groups[key] = {
        noBuying: key,
        namaSupplier: r.NamaSupplier,
        tanggal: r.Timestamp,
        jumlahItem: 0,
        totalNetto: 0,
        totalHarga: 0
      };
      order.push(key);
    }
    groups[key].jumlahItem += 1;
    groups[key].totalNetto += Number(r.BeratNetto) || 0;
    groups[key].totalHarga += Number(r.TotalHarga) || 0;
  });

  return order.reverse().map(k => groups[k]);
};

export const apiGetBuyingSlip = (noBuying: string) => {
  const rows = getLocal<BuyingRow[]>('iscs_buying', []);
  const items = rows.filter(r => (r.NoBuying || r.NoBarcode) === noBuying);

  if (!items.length) return { success: false, message: 'No Buying tidak ditemukan.' };

  const namaSupplier = items[0].NamaSupplier;
  const tanggal = items[0].Timestamp;
  let totalNetto = 0;
  let totalHarga = 0;

  const detail = items.map((r, idx) => {
    totalNetto += Number(r.BeratNetto) || 0;
    totalHarga += Number(r.TotalHarga) || 0;
    return {
      no: idx + 1,
      noBarcode: r.NoBarcode,
      gradeBuying: r.GradeBuying,
      beratBruto: r.BeratBruto,
      tare: r.Tare,
      beratNetto: r.BeratNetto,
      harga: r.HargaBuying,
      total: r.TotalHarga
    };
  });

  return {
    success: true,
    slip: {
      noBuying,
      namaSupplier,
      tanggal,
      items: detail,
      totalNetto,
      totalHarga
    }
  };
};

/* =========================================================================
   RECLASS
   ========================================================================= */
export const getKodeSumberForBarcode = (noBarcode: string): string => {
  const code = noBarcode.trim().toUpperCase();
  if (!code) return '';
  const rows = getLocal<PrePrintRow[]>('iscs_preprint', []);
  const match = rows.filter(r => r.NoBarcode.toUpperCase() === code);
  return match.length ? match[match.length - 1].KodeSumber : '';
};

export const apiAddReclass = (payload: {
  noBarcode: string;
  gradeReclass: string;
  beratNetto: number;
  inputBy: string;
  customDate?: string;
}) => {
  const noBarcode = payload.noBarcode.trim().toUpperCase();
  const gradeReclass = payload.gradeReclass.trim().toUpperCase();
  const beratNetto = Number(payload.beratNetto) || 0;
  const inputBy = payload.inputBy;

  if (!noBarcode) return { success: false, message: 'No barcode wajib dipilih.' };
  if (!gradeReclass) return { success: false, message: 'Grade reclass wajib diisi.' };
  if (beratNetto <= 0) return { success: false, message: 'Berat netto harus lebih dari 0.' };

  const buyingList = getLocal<BuyingRow[]>('iscs_buying', []);
  const bIdx = buyingList.findIndex(b => b.NoBarcode.toUpperCase() === noBarcode);

  if (bIdx === -1) return { success: false, message: 'No barcode tidak ditemukan di data buying.' };

  const matchB = buyingList[bIdx];
  const gradeBuying = matchB.GradeBuying;
  const type = matchB.Type;
  const subType = matchB.SubType;
  const cropYear = matchB.CropYear;

  const reclassSheet = getLocal<ReclassRow[]>('iscs_reclass', []);
  const reclassLog = getLocal<ReclassLogRow[]>('iscs_reclass_log', []);

  // Check if already reclassed
  const existingIdx = reclassSheet.findIndex(r => r.NoBarcode.toUpperCase() === noBarcode);

  if (existingIdx !== -1 && reclassSheet[existingIdx].StatusShipping === 'SUDAH') {
    return { success: false, message: 'Barcode ini sudah pernah dishipping, tidak bisa direclass ulang.' };
  }

  const noReclass = generateNoReclass();
  const timestamp = resolveTimestamp(payload.customDate);

  // Snapshot price at the time of Reclass transaction (historical preservation)
  const hargaReclass = getPriceForGrade(gradeReclass, 'RECLASS', type, subType, cropYear);
  const totalHargaReclass = Number((beratNetto * hargaReclass).toFixed(2));

  const newRow: ReclassRow = {
    Timestamp: timestamp,
    NoBarcode: noBarcode,
    GradeBuying: gradeBuying,
    GradeReclass: gradeReclass,
    BeratNetto: beratNetto,
    HargaReclass: hargaReclass,
    TotalHargaReclass: totalHargaReclass,
    InputBy: inputBy,
    StatusShipping: 'BELUM',
    NoReclass: noReclass,
    StatusInvoice: 'BELUM',
    Type: type,
    SubType: subType,
    CropYear: cropYear
  };

  if (existingIdx !== -1) {
    // Archive old record
    reclassLog.push(reclassSheet[existingIdx]);
    reclassSheet[existingIdx] = newRow;
    setLocal('iscs_reclass_log', reclassLog);
  } else {
    reclassSheet.push(newRow);
  }

  // Update StatusReclass in Buying
  buyingList[bIdx].StatusReclass = 'SUDAH';

  setLocal('iscs_buying', buyingList);
  setLocal('iscs_reclass', reclassSheet);

  return {
    success: true,
    message: existingIdx !== -1
      ? `Data reclass diperbarui (No Reclass: ${noReclass}). Riwayat sebelumnya diarsipkan ke ReclassLog.`
      : `Data reclass tersimpan (No Reclass: ${noReclass}).`,
    data: {
      noReclass,
      noBarcode,
      gradeBuying,
      gradeReclass,
      beratNetto,
      type,
      subType,
      cropYear,
      kodeSumber: getKodeSumberForBarcode(noBarcode),
      timestamp,
      tanggal: timestamp
    }
  };
};

export const apiGetReclassList = (): ReclassRow[] => {
  const reclassRows = getLocal<ReclassRow[]>('iscs_reclass', []);
  const prePrintRows = getLocal<PrePrintRow[]>('iscs_preprint', []);
  const kodeSumberByBarcode: Record<string, string> = {};

  prePrintRows.forEach(r => {
    kodeSumberByBarcode[r.NoBarcode.trim().toUpperCase()] = r.KodeSumber || '';
  });

  return reclassRows.map(r => ({
    ...r,
    KodeSumber: kodeSumberByBarcode[r.NoBarcode.trim().toUpperCase()] || ''
  }));
};

export const apiCleanupDuplicateReclassEntries = (username: string) => {
  const users = getLocal<User[]>('iscs_users', []);
  const u = users.find(x => x.Username === username);
  if (!u || u.Role !== 'admin') {
    return { success: false, message: 'Hanya admin yang boleh menjalankan pembersihan data.' };
  }

  const reclassRows = getLocal<ReclassRow[]>('iscs_reclass', []);
  if (reclassRows.length === 0) return { success: true, message: 'Tidak ada data untuk dibersihkan.', archived: 0 };

  const byBarcode: Record<string, ReclassRow[]> = {};
  reclassRows.forEach(row => {
    if (!byBarcode[row.NoBarcode]) byBarcode[row.NoBarcode] = [];
    byBarcode[row.NoBarcode].push(row);
  });

  const duplicateBarcodes = Object.keys(byBarcode).filter(bc => byBarcode[bc].length > 1);
  if (duplicateBarcodes.length === 0) {
    return { success: true, message: 'Tidak ada barcode duplikat. Data sudah bersih.', archived: 0 };
  }

  const reclassLog = getLocal<ReclassRow[]>('iscs_reclass_log', []);
  const keptRows: ReclassRow[] = [];
  let archivedCount = 0;

  Object.keys(byBarcode).forEach(barcode => {
    const rows = byBarcode[barcode];
    if (rows.length > 1) {
      for (let k = 0; k < rows.length - 1; k++) {
        reclassLog.push(rows[k]);
        archivedCount++;
      }
    }
    keptRows.push(rows[rows.length - 1]);
  });

  // Sort by Timestamp
  keptRows.sort((a, b) => new Date(a.Timestamp).getTime() - new Date(b.Timestamp).getTime());

  setLocal('iscs_reclass', keptRows);
  setLocal('iscs_reclass_log', reclassLog);

  return {
    success: true,
    message: `${archivedCount} baris duplikat diarsipkan ke ReclassLog. Sheet Reclass kini bersih, satu baris per barcode.`,
    archived: archivedCount
  };
};

export const apiGetAvailableBarcodesForShipping = () => {
  const reclassRows = getLocal<ReclassRow[]>('iscs_reclass', []);
  const buyingRows = getLocal<BuyingRow[]>('iscs_buying', []);
  const buyingByBarcode: Record<string, any> = {};
  buyingRows.forEach(b => { buyingByBarcode[b.NoBarcode] = b; });

  const latestByBarcode: Record<string, ReclassRow> = {};
  reclassRows.forEach(r => {
    if (r.StatusShipping === 'SUDAH') return;
    latestByBarcode[r.NoBarcode] = r;
  });

  const out: any[] = [];
  Object.keys(latestByBarcode).forEach(barcode => {
    const r = latestByBarcode[barcode];
    const b = buyingByBarcode[barcode] || {};
    out.push({
      noBarcode: barcode,
      noReclass: r.NoReclass,
      gradeReclass: r.GradeReclass,
      beratNetto: Number(r.BeratNetto) || 0,
      tare: Number(b.Tare) || 0,
      type: r.Type || '',
      subType: r.SubType || '',
      cropYear: r.CropYear || ''
    });
  });

  return out;
};

/* =========================================================================
   SHIPPING
   ========================================================================= */
export const apiGenerateNoShippingFunc = (customDate?: string) => {
  return { success: true, noShipping: generateNoShipping(customDate) };
};

export const apiAddShipping = (payload: {
  noBarcode: string;
  beratNetto: number;
  inputBy: string;
  noShipping: string;
  destination: string;
  customDate?: string;
}) => {
  const noBarcode = payload.noBarcode.trim().toUpperCase();
  const beratNetto = Number(payload.beratNetto) || 0;
  const inputBy = payload.inputBy;
  const noShipping = payload.noShipping.trim() || generateNoShipping(payload.customDate);
  const destination = payload.destination.trim();

  if (!noBarcode) return { success: false, message: 'No barcode wajib diisi.' };
  if (beratNetto <= 0) return { success: false, message: 'Berat netto harus lebih dari 0.' };

  const reclassSheet = getLocal<ReclassRow[]>('iscs_reclass', []);
  let matchedIdx = -1;

  for (let i = reclassSheet.length - 1; i >= 0; i--) {
    if (reclassSheet[i].NoBarcode.toUpperCase() === noBarcode && reclassSheet[i].StatusShipping !== 'SUDAH') {
      matchedIdx = i;
      break;
    }
  }

  if (matchedIdx === -1) {
    const isAlreadyShipped = reclassSheet.some(r => r.NoBarcode.toUpperCase() === noBarcode && r.StatusShipping === 'SUDAH');
    if (isAlreadyShipped) {
      return { success: false, message: `Barcode "${noBarcode}" sudah pernah di-shipping sebelumnya.` };
    }
    const buyingRows = getLocal<BuyingRow[]>('iscs_buying', []);
    const inBuying = buyingRows.some(b => b.NoBarcode.toUpperCase() === noBarcode);
    if (inBuying) {
      return { success: false, message: `Barcode "${noBarcode}" belum direclass! Barcode harus sudah di-reclass terlebih dahulu sebelum bisa di-shipping.` };
    }
    return { success: false, message: `Barcode "${noBarcode}" belum direclass atau tidak ditemukan.` };
  }

  const rc = reclassSheet[matchedIdx];
  const gradeReclass = rc.GradeReclass;
  const noReclass = rc.NoReclass;
  const type = rc.Type || '';
  const subType = rc.SubType || '';
  const cropYear = rc.CropYear || '';

  const buyingRows = getLocal<BuyingRow[]>('iscs_buying', []);
  const bRow = buyingRows.find(b => b.NoBarcode.toUpperCase() === noBarcode);
  const tare = bRow ? (Number(bRow.Tare) || 0) : 0;

  const now = new Date();
  const timestamp = resolveTimestamp(payload.customDate);

  const shipList = getLocal<ShippingRow[]>('iscs_shipping', []);
  shipList.push({
    Timestamp: timestamp,
    NoBarcode: noReclass,
    NoBarcodeAsal: noBarcode,
    GradeReclass: gradeReclass,
    BeratNetto: beratNetto,
    InputBy: inputBy,
    NoShipping: noShipping,
    Tare: tare,
    Type: type,
    SubType: subType,
    CropYear: cropYear,
    Destination: destination
  });

  // Flag Reclass as Shipped
  reclassSheet[matchedIdx].StatusShipping = 'SUDAH';

  setLocal('iscs_reclass', reclassSheet);
  setLocal('iscs_shipping', shipList);

  return {
    success: true,
    message: `Shipping ${noShipping} tersimpan.`,
    data: {
      noShipping,
      noReclass,
      noBarcodeAsal: noBarcode,
      gradeReclass,
      beratNetto,
      tare,
      type,
      subType,
      cropYear,
      destination,
      timestamp,
      tanggal: timestamp
    }
  };
};

export const apiGetShippingList = (): ShippingRow[] => {
  const reclassRows = getLocal<ReclassRow[]>('iscs_reclass', []);
  const reclassByNo: Record<string, any> = {};
  reclassRows.forEach(r => { reclassByNo[r.NoReclass] = r; });

  const rows = getLocal<ShippingRow[]>('iscs_shipping', []);
  return rows.map(r => {
    const rc = reclassByNo[r.NoBarcode] || {};
    return {
      ...r,
      NoBarcodeAsal: r.NoBarcodeAsal || rc.NoBarcode || '',
      NoShipping: r.NoShipping || '-',
      Destination: r.Destination || '',
      Type: r.Type || rc.Type || '',
      SubType: r.SubType || rc.SubType || '',
      CropYear: r.CropYear || rc.CropYear || '',
      GradeReclass: rc.GradeReclass || r.GradeReclass
    };
  });
};

export const apiGetShippingNoList = () => {
  const rows = getLocal<ShippingRow[]>('iscs_shipping', []);
  const map: Record<string, { noShipping: string; destination: string; jumlahBale: number; timestamp: string }> = {};
  const order: string[] = [];

  rows.forEach(r => {
    const no = String(r.NoShipping || '').trim();
    if (!no || no === '-') return;
    if (!map[no]) {
      map[no] = { noShipping: no, destination: r.Destination || '', jumlahBale: 0, timestamp: r.Timestamp };
      order.push(no);
    }
    map[no].jumlahBale++;
  });

  return order.reverse().map(no => map[no]);
};

/* =========================================================================
   INVOICE
   ========================================================================= */
export const apiGetReclassForInvoiceByNoBuying = (noBuying: string) => {
  const buyingRows = getLocal<BuyingRow[]>('iscs_buying', []);
  const barcodeSet = new Set<string>();
  const buyingByBarcode: Record<string, any> = {};

  buyingRows.forEach(r => {
    if ((r.NoBuying || r.NoBarcode) === noBuying) {
      barcodeSet.add(r.NoBarcode.toUpperCase());
      buyingByBarcode[r.NoBarcode.toUpperCase()] = r;
    }
  });

  const invoiceByReclass: Record<string, string> = {};
  const invoices = getLocal<InvoiceRow[]>('iscs_invoice', []);
  invoices.forEach(inv => {
    if (inv.IsVoid) return;
    String(inv.DaftarNoReclass || '').split(',').forEach(code => {
      const trimmed = code.trim();
      if (trimmed) {
        invoiceByReclass[trimmed] = inv.NoInvoice;
      }
    });
  });

  const reclassRows = getLocal<ReclassRow[]>('iscs_reclass', []);
  return reclassRows
    .filter(r => barcodeSet.has(r.NoBarcode.toUpperCase()))
    .map(r => {
      const b = buyingByBarcode[r.NoBarcode.toUpperCase()] || {};
      const sudahInvoice = r.StatusInvoice === 'SUDAH' && invoiceByReclass[r.NoReclass];
      return {
        noReclass: r.NoReclass,
        noBarcodeAsal: r.NoBarcode,
        gradeReclass: r.GradeReclass,
        beratNettoReclass: r.BeratNetto,
        statusShipping: r.StatusShipping || 'BELUM',
        tanggal: r.Timestamp,
        namaSupplier: b.NamaSupplier || '',
        gradeBuying: b.GradeBuying || '',
        beratNettoBuying: Number(b.BeratNetto) || 0,
        hargaBuying: Number(b.HargaBuying) || 0,
        totalHargaBuying: Number(b.TotalHarga) || 0,
        statusInvoice: sudahInvoice ? 'SUDAH' : 'BELUM',
        noInvoiceExisting: sudahInvoice ? (invoiceByReclass[r.NoReclass] || '') : ''
      };
    });
};

export const apiVoidInvoice = (noInvoice: string, voidedBy: string) => {
  const invoices = getLocal<InvoiceRow[]>('iscs_invoice', []);
  const idx = invoices.findIndex(inv => inv.NoInvoice === noInvoice);
  if (idx === -1) {
    return { success: false, message: 'Invoice tidak ditemukan.' };
  }
  if (invoices[idx].IsVoid) {
    return { success: false, message: 'Invoice sudah dalam status void.' };
  }

  // Revert status of reclass items
  const reclassList = String(invoices[idx].DaftarNoReclass || '').split(',').map(s => s.trim()).filter(Boolean);
  const reclassRows = getLocal<ReclassRow[]>('iscs_reclass', []);
  
  const anyShipped = reclassRows.some(r => reclassList.includes(r.NoReclass) && r.StatusShipping === 'SUDAH');
  if (anyShipped) {
    return { success: false, message: 'Gagal membatalkan: Beberapa item dalam invoice ini sudah dikirim (Shipped)!' };
  }

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

  invoices[idx].IsVoid = true;
  invoices[idx].VoidedAt = timestamp;
  invoices[idx].VoidedBy = voidedBy;

  reclassList.forEach(code => {
    const rcIdx = reclassRows.findIndex(r => r.NoReclass === code);
    if (rcIdx !== -1) {
      reclassRows[rcIdx].StatusInvoice = 'BELUM';
    }
  });

  setLocal('iscs_reclass', reclassRows);
  setLocal('iscs_invoice', invoices);

  return {
    success: true,
    message: `Invoice ${noInvoice} berhasil divoid (dibatalkan).`
  };
};

export const apiSaveInvoice = (payload: {
  noReclassList: string[];
  noBuying: string;
  inputBy: string;
  telahTerimaDari: string;
  keteranganManual: string;
  lokasi: string;
}) => {
  const noReclassList = payload.noReclassList || [];
  const noBuying = payload.noBuying.trim();
  const inputBy = payload.inputBy;
  const telahTerimaDari = payload.telahTerimaDari.trim();
  const keteranganManual = payload.keteranganManual.trim();
  const lokasi = payload.lokasi.trim();

  if (!noReclassList.length) return { success: false, message: 'Pilih minimal satu item untuk dibuatkan invoice.' };
  if (!telahTerimaDari) return { success: false, message: '"Telah Terima Dari" wajib diisi.' };
  if (!keteranganManual) return { success: false, message: '"Untuk Pembayaran" wajib diisi.' };

  const reclassRows = getLocal<ReclassRow[]>('iscs_reclass', []);
  const buyingRows = getLocal<BuyingRow[]>('iscs_buying', []);
  const buyingByBarcode: Record<string, any> = {};
  buyingRows.forEach(b => { buyingByBarcode[b.NoBarcode.toUpperCase()] = b; });

  const items: any[] = [];
  const matchedReclassRows: ReclassRow[] = [];
  let totalNetto = 0;
  let totalPembelian = 0;
  let namaPetani = '';

  noReclassList.forEach(code => {
    const rc = reclassRows.find(r => r.NoReclass === code);
    if (!rc) return;
    matchedReclassRows.push(rc);
    const b = buyingByBarcode[rc.NoBarcode.toUpperCase()] || {};
    const beratNettoBuying = Number(b.BeratNetto) || 0;
    const hargaBuying = Number(b.HargaBuying) || 0;
    const totalItem = Number(b.TotalHarga) || 0;

    totalNetto += beratNettoBuying;
    totalPembelian += totalItem;
    if (!namaPetani) namaPetani = b.NamaSupplier || '';

    items.push({
      noReclass: rc.NoReclass,
      noBarcodeAsal: rc.NoBarcode,
      gradeBuying: b.GradeBuying || '',
      beratNettoBuying,
      hargaBuying,
      totalHargaBuying: totalItem
    });
  });

  if (!items.length) return { success: false, message: 'Item yang dipilih tidak ditemukan.' };

  const PPH_RATE = 0.0025;
  const jumlahBale = items.length;
  const biayaPPh = Math.round(totalPembelian * PPH_RATE);
  const perluMaterai = totalPembelian >= 5000000;
  const biayaMaterai = perluMaterai ? 10000 : 0;
  const uangSebesarSebelumRound = totalPembelian - biayaPPh - biayaMaterai;
  const uangSebesar = Math.floor(uangSebesarSebelumRound / 100) * 100;
  const roundup = uangSebesar - uangSebesarSebelumRound;
  const untukPembayaran = `${keteranganManual} ${jumlahBale} Bal = ${totalNetto.toFixed(2)} Kg`;

  const noInvoice = generateNoInvoice();
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

  const invoices = getLocal<InvoiceRow[]>('iscs_invoice', []);
  invoices.push({
    Timestamp: timestamp,
    NoInvoice: noInvoice,
    DaftarNoReclass: noReclassList.join(', '),
    TotalNetto: totalNetto,
    InputBy: inputBy,
    NoBuying: noBuying,
    TotalPembelian: totalPembelian,
    BiayaPPh: biayaPPh,
    BiayaMaterai: biayaMaterai,
    UangSebesar: uangSebesar,
    NamaPerusahaan: telahTerimaDari,
    DeskripsiPembayaran: untukPembayaran,
    CaraPembayaran: 'Tunai',
    JumlahBal: jumlahBale,
    Lokasi: lokasi,
    Roundup: roundup
  });

  // Update StatusInvoice in Reclass
  matchedReclassRows.forEach(rc => {
    const idx = reclassRows.findIndex(r => r.NoReclass === rc.NoReclass);
    if (idx !== -1) {
      reclassRows[idx].StatusInvoice = 'SUDAH';
    }
  });

  setLocal('iscs_reclass', reclassRows);
  setLocal('iscs_invoice', invoices);

  return {
    success: true,
    message: `Invoice ${noInvoice} berhasil disimpan.`,
    invoice: {
      noInvoice,
      noBuying,
      tanggal: timestamp,
      namaPetani,
      items,
      jumlahBale,
      totalNetto,
      telahTerimaDari,
      untukPembayaran,
      lokasi,
      totalPembelian,
      biayaPPh,
      perluMaterai,
      biayaMaterai,
      uangSebesar,
      roundup
    }
  };
};

export const apiGetInvoiceForReprint = (noInvoice: string) => {
  const invoices = getLocal<InvoiceRow[]>('iscs_invoice', []);
  const inv = invoices.find(r => r.NoInvoice === noInvoice);
  if (!inv) return { success: false, message: 'Invoice tidak ditemukan.' };

  const buyingRows = getLocal<BuyingRow[]>('iscs_buying', []);
  const buyingRow = buyingRows.find(b => String(b.NoBuying) === String(inv.NoBuying));
  const namaPetani = buyingRow ? buyingRow.NamaSupplier : '';

  const biayaPPh = Number(inv.BiayaPPh) || 0;
  const biayaMaterai = Number(inv.BiayaMaterai) || 0;

  return {
    success: true,
    invoice: {
      noInvoice: inv.NoInvoice,
      noBuying: inv.NoBuying,
      tanggal: inv.Timestamp,
      namaPetani,
      jumlahBale: Number(inv.JumlahBal) || 0,
      totalNetto: Number(inv.TotalNetto) || 0,
      telahTerimaDari: inv.NamaPerusahaan,
      untukPembayaran: inv.DeskripsiPembayaran,
      lokasi: inv.Lokasi || '',
      totalPembelian: Number(inv.TotalPembelian) || 0,
      biayaPPh,
      perluMaterai: biayaMaterai > 0,
      biayaMaterai,
      uangSebesar: Number(inv.UangSebesar) || 0,
      roundup: Number(inv.Roundup) || 0,
      IsVoid: !!inv.IsVoid
    }
  };
};

export const apiGetInvoiceList = (): InvoiceRow[] => {
  return getLocal<InvoiceRow[]>('iscs_invoice', []);
};

/* =========================================================================
   PRE-PRINT LOGS
   ========================================================================= */
export const apiGeneratePrePrintBarcodes = (payload: {
  namaPetani: string;
  kodeSumber: string;
  jumlah: number;
  printedBy: string;
  customDate?: string;
}) => {
  const namaPetani = payload.namaPetani.trim();
  const kodeSumber = payload.kodeSumber.trim().toUpperCase();
  const jumlah = Math.max(1, Math.min(50, Number(payload.jumlah) || 1));
  const printedBy = payload.printedBy;

  if (!namaPetani) return { success: false, message: 'Nama petani wajib diisi.' };
  if (!kodeSumber) return { success: false, message: 'Kode sumber wajib diisi.' };

  const companyName = getSettingValue('PrePrintCompanyName', '');
  const preprintList = getLocal<PrePrintRow[]>('iscs_preprint', []);

  const timestamp = resolveTimestamp(payload.customDate);
  const labels: any[] = [];

  for (let i = 0; i < jumlah; i++) {
    const noBarcode = generateBuyingBarcode(payload.customDate, kodeSumber);
    preprintList.push({
      Timestamp: timestamp,
      NoBarcode: noBarcode,
      NamaPetani: namaPetani,
      KodeSumber: kodeSumber,
      PrintedBy: printedBy
    });
    labels.push({
      noBarcode,
      namaPetani,
      kodeSumber,
      tanggal: timestamp,
      companyName
    });
  }

  setLocal('iscs_preprint', preprintList);

  return { success: true, message: `${jumlah} label barcode berhasil dibuat.`, labels };
};

export const apiGetPrePrintHistory = (): PrePrintRow[] => {
  return getLocal<PrePrintRow[]>('iscs_preprint', []);
};

/* =========================================================================
   REPORTS UTILS
   ========================================================================= */
const inDateRange = (dateVal: string, dateFrom?: string, dateTo?: string): boolean => {
  if (!dateVal) return !dateFrom && !dateTo;
  const d = new Date(dateVal.replace(' ', 'T'));
  if (isNaN(d.getTime())) return !dateFrom && !dateTo;
  const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (dateFrom) {
    const from = new Date(dateFrom);
    const fromOnly = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    if (dOnly < fromOnly) return false;
  }
  if (dateTo) {
    const to = new Date(dateTo);
    const toOnly = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    if (dOnly > toOnly) return false;
  }
  return true;
};

/* =========================================================================
   DASHBOARD & SUMMARY
   ========================================================================= */
export const apiGetSummary = (): DashboardSummary => {
  const buying = getLocal<BuyingRow[]>('iscs_buying', []);
  const reclass = getLocal<ReclassRow[]>('iscs_reclass', []);
  const shipping = getLocal<ShippingRow[]>('iscs_shipping', []);
  const invoices = getLocal<InvoiceRow[]>('iscs_invoice', []);

  const sum = (rows: any[], key: string): number => {
    return rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);
  };

  const totalBeratReclass = sum(reclass, 'BeratNetto');
  const totalBeratShipping = sum(shipping, 'BeratNetto');
  
  // Calculate remaining stock exactly like Laporan.tsx:
  // 1. Buying but NOT yet Reclassed = Buying rows where StatusReclass !== "SUDAH"
  const unreclassedBuyingBerat = buying
    .filter(b => (b.StatusReclass || 'BELUM') !== 'SUDAH')
    .reduce((acc, b) => acc + (Number(b.BeratBruto) - Number(b.Tare) || 0), 0);

  // 2. Reclassed but NOT Shipped = Reclass rows where StatusShipping !== "SUDAH"
  const unshippedReclassBerat = reclass
    .filter(r => (r.StatusShipping || 'BELUM') !== 'SUDAH')
    .reduce((acc, r) => acc + (Number(r.BeratNetto) || 0), 0);

  const sisaStok = unreclassedBuyingBerat + unshippedReclassBerat;

  // Exclude voided invoices
  const activeInvoices = invoices.filter(r => !r.IsVoid);

  return {
    totalBuying: buying.length,
    totalBeratBuying: sum(buying, 'BeratNetto'),
    totalReclass: reclass.length,
    totalBeratReclass,
    totalShipping: shipping.length,
    totalBeratShipping,
    sisaStok,
    totalInvoice: activeInvoices.length,
    totalInvoiceAkhir: sum(activeInvoices, 'UangSebesar')
  };
};

/* =========================================================================
   DETAILED REPORTS
   ========================================================================= */
export const apiGetLaporanBuying = (dateFrom?: string, dateTo?: string) => {
  const rows = getLocal<BuyingRow[]>('iscs_buying', [])
    .filter(r => inDateRange(r.Timestamp, dateFrom, dateTo));

  const detail = rows.map(r => ({
    tanggal: r.Timestamp,
    noBuying: r.NoBuying || '-',
    noBarcode: r.NoBarcode,
    namaSupplier: r.NamaSupplier,
    grade: r.GradeBuying || '-',
    gradeBuying: r.GradeBuying || '-',
    type: r.Type || '',
    subType: r.SubType || '',
    cropYear: r.CropYear || '',
    bruto: Number(r.BeratBruto) || 0,
    tare: Number(r.Tare) || 0,
    netto: Number(r.BeratNetto) || 0,
    harga: Number(r.HargaBuying) || 0,
    total: Number(r.TotalHarga) || 0,
    statusReclass: r.StatusReclass || 'BELUM'
  }));

  // Summary per Grade
  const sumMap: Record<string, { grade: string; jumlah: number; totalNetto: number; totalTare: number }> = {};
  rows.forEach(r => {
    const g = r.GradeBuying || '-';
    if (!sumMap[g]) {
      sumMap[g] = { grade: g, jumlah: 0, totalNetto: 0, totalTare: 0 };
    }
    sumMap[g].jumlah++;
    sumMap[g].totalNetto += Number(r.BeratNetto) || 0;
    sumMap[g].totalTare += Number(r.Tare) || 0;
  });

  const summary = Object.keys(sumMap).sort().map(k => sumMap[k]);

  return { success: true, detail, summary };
};

export const apiGetLaporanReclass = (dateFrom?: string, dateTo?: string) => {
  const buyingRows = getLocal<BuyingRow[]>('iscs_buying', []);
  const buyingByBarcode: Record<string, any> = {};
  buyingRows.forEach(b => { buyingByBarcode[b.NoBarcode.toUpperCase()] = b; });

  const rows = getLocal<ReclassRow[]>('iscs_reclass', [])
    .filter(r => inDateRange(r.Timestamp, dateFrom, dateTo));

  const detail = rows.map(r => {
    const b = buyingByBarcode[r.NoBarcode.toUpperCase()] || {};
    return {
      tanggal: r.Timestamp,
      noReclass: r.NoReclass,
      noBarcode: r.NoBarcode,
      namaSupplier: b.NamaSupplier || '',
      gradeBuying: r.GradeBuying,
      gradeReclass: r.GradeReclass,
      type: r.Type || '',
      subType: r.SubType || '',
      cropYear: r.CropYear || '',
      netto: Number(r.BeratNetto) || 0,
      tare: Number(b.Tare) || 0,
      statusShipping: r.StatusShipping || 'BELUM',
      statusInvoice: r.StatusInvoice || 'BELUM'
    };
  });

  // Summary per Grade Reclass
  const sumMap: Record<string, { grade: string; jumlah: number; totalNetto: number; totalTare: number }> = {};
  rows.forEach(r => {
    const g = r.GradeReclass || '-';
    const b = buyingByBarcode[r.NoBarcode.toUpperCase()] || {};
    if (!sumMap[g]) {
      sumMap[g] = { grade: g, jumlah: 0, totalNetto: 0, totalTare: 0 };
    }
    sumMap[g].jumlah++;
    sumMap[g].totalNetto += Number(r.BeratNetto) || 0;
    sumMap[g].totalTare += Number(b.Tare) || 0;
  });

  const summary = Object.keys(sumMap).sort().map(k => sumMap[k]);

  return { success: true, detail, summary };
};

export const apiGetLaporanShipping = (dateFrom?: string, dateTo?: string) => {
  const reclassRows = getLocal<ReclassRow[]>('iscs_reclass', []);
  const reclassByNo: Record<string, any> = {};
  reclassRows.forEach(r => { reclassByNo[r.NoReclass] = r; });

  const buyingRows = getLocal<BuyingRow[]>('iscs_buying', []);
  const buyingByBarcode: Record<string, any> = {};
  buyingRows.forEach(b => { buyingByBarcode[b.NoBarcode.toUpperCase()] = b; });

  const rows = getLocal<ShippingRow[]>('iscs_shipping', [])
    .filter(r => inDateRange(r.Timestamp, dateFrom, dateTo));

  const calc = (r: ShippingRow) => {
    const rc = reclassByNo[r.NoBarcode] || {};
    const gradeTerupdate = rc.GradeReclass || r.GradeReclass;
    const noBarcodeAsal = r.NoBarcodeAsal || rc.NoBarcode || '-';
    const b = buyingByBarcode[noBarcodeAsal.toUpperCase()] || {};
    const netto = Number(r.BeratNetto) || 0;
    const harga = (typeof rc.HargaReclass === 'number' && rc.HargaReclass > 0)
      ? rc.HargaReclass
      : getPriceForGrade(gradeTerupdate, 'RECLASS', rc.Type || '', rc.SubType || '', rc.CropYear || '');
    return {
      rc,
      gradeTerupdate,
      noBarcodeAsal,
      tare: Number(b.Tare) || 0,
      netto,
      totalNilai: netto * harga
    };
  };

  const detail = rows.map(r => {
    const c = calc(r);
    return {
      tanggal: r.Timestamp,
      noReclass: r.NoBarcode,
      noBarcodeAsal: c.noBarcodeAsal,
      grade: c.gradeTerupdate,
      type: c.rc.Type || '',
      subType: c.rc.SubType || '',
      cropYear: c.rc.CropYear || '',
      netto: c.netto,
      tare: c.tare,
      totalNilai: c.totalNilai,
      inputBy: r.InputBy || ''
    };
  });

  // Summary per Grade
  const sumMap: Record<string, { grade: string; jumlah: number; totalNetto: number; totalTare: number; totalNilai: number }> = {};
  rows.forEach(r => {
    const c = calc(r);
    const g = c.gradeTerupdate || '-';
    if (!sumMap[g]) {
      sumMap[g] = { grade: g, jumlah: 0, totalNetto: 0, totalTare: 0, totalNilai: 0 };
    }
    sumMap[g].jumlah++;
    sumMap[g].totalNetto += c.netto;
    sumMap[g].totalTare += c.tare;
    sumMap[g].totalNilai += c.totalNilai;
  });

  const summary = Object.keys(sumMap).sort().map(k => sumMap[k]);

  return { success: true, detail, summary };
};

export const apiGetLaporanInvoice = (dateFrom?: string, dateTo?: string) => {
  const buyingRows = getLocal<BuyingRow[]>('iscs_buying', []);
  const buyingByNoBuying: Record<string, any> = {};
  buyingRows.forEach(b => {
    const key = b.NoBuying || b.NoBarcode;
    if (key && !buyingByNoBuying[key]) {
      buyingByNoBuying[key] = b;
    }
  });

  const invoices = getLocal<InvoiceRow[]>('iscs_invoice', [])
    .filter(r => inDateRange(r.Timestamp, dateFrom, dateTo));

  const detail = invoices.map(r => {
    const b = buyingByNoBuying[r.NoBuying] || {};
    return {
      tanggal: r.Timestamp,
      noInvoice: r.NoInvoice,
      noBuying: r.NoBuying || '-',
      namaPetani: b.NamaSupplier || r.NamaPerusahaan || '-',
      jumlahBales: Number(r.JumlahBal) || 0,
      netto: Number(r.TotalNetto) || 0,
      totalBuying: Number(r.TotalPembelian) || 0,
      pph: Number(r.BiayaPPh) || 0,
      materai: Number(r.BiayaMaterai) || 0,
      roundup: Number(r.Roundup) || 0,
      totalSetelahMaterai: Number(r.UangSebesar) || 0
    };
  });

  return { success: true, detail };
};

export const apiGetBuyingVsReclassReport = (dateFrom?: string, dateTo?: string) => {
  const buyingRows = getLocal<BuyingRow[]>('iscs_buying', [])
    .filter(b => inDateRange(b.Timestamp, dateFrom, dateTo));
  const reclassRows = getLocal<ReclassRow[]>('iscs_reclass', []);

  const latestMatchFor = (b: BuyingRow) => {
    const matches = reclassRows.filter(r => r.NoBarcode.toUpperCase() === b.NoBarcode.toUpperCase());
    return matches.length ? matches[matches.length - 1] : null;
  };

  const detail = buyingRows.map(b => {
    const latest = latestMatchFor(b);
    const gradeReclass = latest ? (latest.GradeReclass || '-') : '-';
    const tare = Number(b.Tare) || 0;
    const netto = latest ? (Number(latest.BeratNetto) || 0) : (Number(b.BeratNetto) || 0);

    return {
      tanggal: b.Timestamp,
      noBuying: b.NoBuying || '-',
      noBarcode: b.NoBarcode,
      namaSupplier: b.NamaSupplier,
      gradeBuying: b.GradeBuying || '-',
      gradeReclass,
      type: b.Type || '',
      subType: b.SubType || '',
      cropYear: b.CropYear || '',
      jumlahReclass: latest ? 1 : 0,
      tare,
      netto,
      statusReclass: b.StatusReclass || 'BELUM'
    };
  });

  // Summary per combination
  const groupMap: Record<string, { gradeBuying: string; gradeReclass: string; jumlahBaleBuying: number; jumlahBaleReclass: number; nettoBuying: number; nettoReclass: number; tare: number }> = {};
  const groupOrder: string[] = [];

  buyingRows.forEach(b => {
    const latest = latestMatchFor(b);
    const gradeBuying = b.GradeBuying || '-';
    const gradeReclass = latest ? (latest.GradeReclass || '-') : '-';
    const key = gradeBuying + '|' + gradeReclass;

    if (!groupMap[key]) {
      groupMap[key] = {
        gradeBuying,
        gradeReclass,
        jumlahBaleBuying: 0,
        jumlahBaleReclass: 0,
        nettoBuying: 0,
        nettoReclass: 0,
        tare: 0
      };
      groupOrder.push(key);
    }
    const g = groupMap[key];
    g.jumlahBaleBuying += 1;
    g.nettoBuying += Number(b.BeratNetto) || 0;
    g.tare += Number(b.Tare) || 0;
    if (latest) {
      g.jumlahBaleReclass += 1;
      g.nettoReclass += Number(latest.BeratNetto) || 0;
    }
  });

  groupOrder.sort();
  const summary = groupOrder.map(k => groupMap[k]);

  return { success: true, detail, summary };
};

export const apiGetLaporanStok = (dateFrom?: string, dateTo?: string) => {
  const reclassRows = getLocal<ReclassRow[]>('iscs_reclass', []);
  const reclassByNo: Record<string, any> = {};
  reclassRows.forEach(r => { reclassByNo[r.NoReclass] = r; });

  const buyingRows = getLocal<BuyingRow[]>('iscs_buying', []);
  const buyingByBarcode: Record<string, any> = {};
  buyingRows.forEach(b => { buyingByBarcode[b.NoBarcode.toUpperCase()] = b; });

  const masuk = reclassRows.filter(r => inDateRange(r.Timestamp, dateFrom, dateTo));
  const keluar = getLocal<ShippingRow[]>('iscs_shipping', [])
    .filter(r => inDateRange(r.Timestamp, dateFrom, dateTo));

  const detail = masuk
    .filter(r => (r.StatusShipping || 'BELUM') !== 'SUDAH')
    .map(r => {
      const b = buyingByBarcode[r.NoBarcode.toUpperCase()] || {};
      return {
        tanggal: r.Timestamp,
        noBarcode: r.NoBarcode,
        noReclass: r.NoReclass,
        grade: r.GradeReclass || '-',
        netto: Number(r.BeratNetto) || 0,
        tare: Number(b.Tare) || 0
      };
    });

  const gradeMap: Record<string, { grade: string; masuk: number; keluar: number; sisa: number }> = {};
  const order: string[] = [];

  const ensureGrade = (grade: string) => {
    if (!gradeMap[grade]) {
      gradeMap[grade] = { grade, masuk: 0, keluar: 0, sisa: 0 };
      order.push(grade);
    }
    return gradeMap[grade];
  };

  masuk.forEach(r => {
    const g = ensureGrade(r.GradeReclass || '-');
    g.masuk += Number(r.BeratNetto) || 0;
  });

  keluar.forEach(r => {
    const rc = reclassByNo[r.NoBarcode] || {};
    const g = ensureGrade(rc.GradeReclass || r.GradeReclass || '-');
    g.keluar += Number(r.BeratNetto) || 0;
  });

  order.sort();
  const summary = order.map(k => {
    const g = gradeMap[k];
    g.sisa = g.masuk - g.keluar;
    return g;
  });

  const totalMasuk = summary.reduce((a, s) => a + s.masuk, 0);
  const totalKeluar = summary.reduce((a, s) => a + s.keluar, 0);

  return {
    success: true,
    summary,
    detail,
    totalMasuk,
    totalKeluar,
    totalSisa: totalMasuk - totalKeluar
  };
};

export { getLocal, setLocal };

export const apiSaveBarcodeSettings = (settings: { company: string; tipe: string; sumber: string; digitCounter: number }) => {
  setSettingValue('BarcodeCompany', settings.company);
  setSettingValue('BarcodeTipe', settings.tipe);
  setSettingValue('BarcodeSumber', settings.sumber);
  setSettingValue('BarcodeDigitCounter', String(settings.digitCounter));
  return { success: true, message: 'Format barcode berhasil disimpan.' };
};

export const apiGetUsers = (): User[] => {
  return getLocal<User[]>('iscs_users', []);
};

export const apiGetReclassOperators = () => {
  const users = getLocal<User[]>('iscs_users', []);
  return {
    success: true,
    operators: users.map(u => ({ username: u.Username, nama: u.Nama || u.Username }))
  };
};

export const getCurrentSession = () => {
  const user = getLocal<any>('iscs_active_session', null);
  if (user) {
    return { loggedIn: true, user };
  }
  return { loggedIn: false, user: null };
};

export const apiLogout = () => {
  delete dbMemoryCache['iscs_active_session'];
  idbRemove('iscs_active_session');
  localStorage.removeItem('iscs_active_session');
};

export const apiResetAllData = () => {
  const keysToReset = [
    'iscs_buying',
    'iscs_reclass',
    'iscs_reclass_log',
    'iscs_preprint',
    'iscs_shipping',
    'iscs_invoice',
    'iscs_synced_ids',
    'iscs_sync_logs',
    'iscs_counters',
    'iscs_prices',
    'iscs_users',
    'iscs_settings',
    'iscs_active_session'
  ];

  keysToReset.forEach(k => {
    delete dbMemoryCache[k];
    idbRemove(k);
    localStorage.removeItem(k);
  });

  // Restore defaults (default admin, default prices, default settings)
  ensureDatabase();

  // Force a reload
  window.dispatchEvent(new Event('iscs-db-update'));
};

export const apiResetTransactionsOnly = () => {
  const transKeys = [
    'iscs_buying',
    'iscs_reclass',
    'iscs_reclass_log',
    'iscs_preprint',
    'iscs_shipping',
    'iscs_invoice',
    'iscs_synced_ids',
    'iscs_sync_logs',
    'iscs_counters'
  ];

  transKeys.forEach(k => {
    delete dbMemoryCache[k];
    idbRemove(k);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(k);
      } catch {
        // ignore
      }
    }
  });

  window.dispatchEvent(new Event('iscs-db-update'));
};

export interface DatabaseHealthInfo {
  storageMode: string;
  isIndexedDBSupported: boolean;
  indexedDbHealthy: boolean;
  totalRecords: number;
  tableStats: Array<{ name: string; key: string; count: number }>;
  storageEstimate?: {
    usageBytes: number;
    quotaBytes: number;
    usageMB: number;
    quotaMB: number;
    percentUsed: number;
  };
  localStorageSizeKB: number;
  message: string;
}

export const apiGetDatabaseHealth = async (): Promise<DatabaseHealthInfo> => {
  const isIdbSupported = typeof indexedDB !== 'undefined';
  let idbHealthy = false;
  if (isIdbSupported) {
    try {
      await idbSet('iscs_health_check', Date.now());
      const testVal = await idbGet('iscs_health_check');
      idbHealthy = !!testVal;
      await idbRemove('iscs_health_check');
    } catch {
      idbHealthy = false;
    }
  }

  const tableKeys = [
    { name: 'Timbang Buying', key: 'iscs_buying' },
    { name: 'Grading Reclass', key: 'iscs_reclass' },
    { name: 'Log Reclass', key: 'iscs_reclass_log' },
    { name: 'Pengiriman Shipping', key: 'iscs_shipping' },
    { name: 'Kwitansi Invoice', key: 'iscs_invoice' },
    { name: 'Barcode Petani (PrePrint)', key: 'iscs_preprint' },
    { name: 'Master Harga', key: 'iscs_prices' },
    { name: 'Manajemen User', key: 'iscs_users' },
    { name: 'Pengaturan Barcode & Sistem', key: 'iscs_settings' }
  ];

  let totalRecords = 0;
  const tableStats = tableKeys.map(t => {
    const list = getLocal<any[]>(t.key, []);
    const count = Array.isArray(list) ? list.length : 0;
    totalRecords += count;
    return { name: t.name, key: t.key, count };
  });

  let storageEstimate: any = undefined;
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      const usage = est.usage || 0;
      const quota = est.quota || 0;
      storageEstimate = {
        usageBytes: usage,
        quotaBytes: quota,
        usageMB: Number((usage / (1024 * 1024)).toFixed(2)),
        quotaMB: Number((quota / (1024 * 1024)).toFixed(2)),
        percentUsed: quota > 0 ? Number(((usage / quota) * 100).toFixed(3)) : 0
      };
    } catch {
      // ignore
    }
  }

  let localStorageSizeKB = 0;
  if (typeof window !== 'undefined') {
    ALL_KEYS.forEach(k => {
      const item = localStorage.getItem(k);
      if (item) localStorageSizeKB += item.length / 1024;
    });
  }

  return {
    storageMode: getLocal<string>('iscs_storage_mode', 'local'),
    isIndexedDBSupported: isIdbSupported,
    indexedDbHealthy: idbHealthy,
    totalRecords,
    tableStats,
    storageEstimate,
    localStorageSizeKB: Number(localStorageSizeKB.toFixed(2)),
    message: idbHealthy
      ? 'Database IndexedDB aktif dan sehat! Penyimpanan menggunakan IndexedDB harddisk lokal komputer dengan kapasitas ratusan Megabyte hingga Puluhan Gigabyte (bebas dari limit 5 MB LocalStorage).'
      : 'IndexedDB tidak aktif atau sedang berjalan dalam mode RAM cache.'
  };
};

/* =========================================================================
   ADDITIONAL BUYING & SHIPPING EDIT / VOID HELPER APIS
   ========================================================================= */

export const apiIsBuyingShipped = (noBuying: string): boolean => {
  const buyingRows = getLocal<BuyingRow[]>('iscs_buying', []);
  const associatedBarcodes = buyingRows
    .filter(b => b.NoBuying === noBuying)
    .map(b => b.NoBarcode.toUpperCase());
  
  const reclassRows = getLocal<ReclassRow[]>('iscs_reclass', []);
  const rcBarcodes = reclassRows
    .filter(r => associatedBarcodes.includes(r.NoBarcode.toUpperCase()))
    .map(r => r.NoReclass.toUpperCase());

  const shippingRows = getLocal<ShippingRow[]>('iscs_shipping', []);
  const shippedSet = new Set(shippingRows.map(s => s.NoBarcode.toUpperCase()));
  const shippedAsalSet = new Set(shippingRows.map(s => s.NoBarcodeAsal?.toUpperCase()).filter(Boolean));

  return associatedBarcodes.some(b => shippedSet.has(b) || shippedAsalSet.has(b)) ||
         rcBarcodes.some(rc => shippedSet.has(rc));
};

export const apiUpdateBuyingBatch = (payload: {
  noBuying: string;
  namaSupplier: string;
  type: string;
  subType: string;
  cropYear: string;
  inputBy: string;
  customDate?: string;
  items: Array<{
    noBarcode: string;
    gradeBuying: string;
    beratBruto: number;
    tare: number;
    autoBarcode: boolean;
    beratNetto?: number;
  }>;
}) => {
  const { noBuying, namaSupplier, type, subType, cropYear, inputBy, items } = payload;

  if (!noBuying) return { success: false, message: 'No Buying tidak valid.' };
  if (!namaSupplier.trim()) return { success: false, message: 'Nama petani wajib diisi.' };
  if (!type || !subType || !cropYear) return { success: false, message: 'Type, Sub Type, dan Crop Year wajib dipilih.' };
  if (!items.length) return { success: false, message: 'Tambahkan minimal satu baris bale.' };

  // Check if any barcode in this batch is already shipped
  if (apiIsBuyingShipped(noBuying)) {
    return { success: false, message: 'Gagal memperbarui: Transaksi ini mengandung barcode yang sudah di-shipping!' };
  }

  const buyingList = getLocal<BuyingRow[]>('iscs_buying', []);
  const reclassList = getLocal<ReclassRow[]>('iscs_reclass', []);

  // Filter out any existing items for this noBuying
  const oldItems = buyingList.filter(b => b.NoBuying === noBuying);
  const otherItems = buyingList.filter(b => b.NoBuying !== noBuying);

  // Identify any barcodes that were completely deleted from this batch
  const remainingBarcodes = new Set(items.map(it => it.noBarcode.trim().toUpperCase()).filter(Boolean));
  const deletedBarcodes = oldItems
    .filter(old => !remainingBarcodes.has(old.NoBarcode.toUpperCase()))
    .map(old => old.NoBarcode.toUpperCase());

  // Delete reclass records for the deleted barcodes
  const remainingReclass = reclassList.filter(rc => !deletedBarcodes.includes(rc.NoBarcode.toUpperCase()));

  // Setup list of existing barcodes to prevent duplicates among OTHER batches
  const otherBarcodes = new Set(otherItems.map(b => b.NoBarcode.toUpperCase()));

  // Pre-validate all items
  const manualCodesInBatch = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const rowNo = i + 1;
    const gradeBuying = it.gradeBuying.trim().toUpperCase();
    const beratBruto = Number(it.beratBruto) || 0;
    const tare = Number(it.tare) || 0;

    if (!gradeBuying) return { success: false, message: `Baris ${rowNo}: Grade Buying wajib diisi.` };
    if (beratBruto <= 0) return { success: false, message: `Baris ${rowNo}: Berat bruto harus lebih dari 0.` };
    if (tare < 0 || tare >= beratBruto) return { success: false, message: `Baris ${rowNo}: Tare tidak valid.` };

    if (!it.autoBarcode && it.noBarcode.trim()) {
      const manualCode = it.noBarcode.trim().toUpperCase();
      if (otherBarcodes.has(manualCode) || manualCodesInBatch.has(manualCode)) {
        return { success: false, message: `Baris ${rowNo}: No Barcode "${manualCode}" sudah dipakai transaksi lain.` };
      }
      manualCodesInBatch.add(manualCode);
    }
  }

  const timestamp = resolveTimestamp(payload.customDate);

  const updatedBuyingRows: BuyingRow[] = [];

  items.forEach(it => {
    const gradeBuying = it.gradeBuying.trim().toUpperCase();
    const beratBruto = Number(it.beratBruto) || 0;
    const tare = Number(it.tare) || 0;
    const beratNetto = it.beratNetto !== undefined ? Number(it.beratNetto) : (beratBruto - tare);
    let noBarcode = it.noBarcode.trim().toUpperCase();
    const oldMatch = oldItems.find(o => o.NoBarcode.toUpperCase() === noBarcode && noBarcode !== '');
    // Preserve historical buying price if grade has not changed
    const harga = (oldMatch && oldMatch.GradeBuying === gradeBuying && typeof oldMatch.HargaBuying === 'number' && oldMatch.HargaBuying > 0)
      ? oldMatch.HargaBuying
      : getPriceForGrade(gradeBuying, 'BUYING', type, subType, cropYear);
    const total = Number((beratNetto * harga).toFixed(2));
    
    if (it.autoBarcode && (!oldMatch || !noBarcode)) {
      noBarcode = generateBuyingBarcode(payload.customDate);
    } else if (!noBarcode) {
      noBarcode = generateBuyingBarcode(payload.customDate);
    }

    const statusReclass = oldMatch ? oldMatch.StatusReclass : 'BELUM';

    updatedBuyingRows.push({
      Timestamp: payload.customDate ? timestamp : (oldMatch ? oldMatch.Timestamp : timestamp),
      NoBarcode: noBarcode,
      NamaSupplier: namaSupplier,
      GradeBuying: gradeBuying,
      BeratBruto: beratBruto,
      Tare: tare,
      BeratNetto: beratNetto,
      HargaBuying: harga,
      TotalHarga: total,
      InputBy: oldMatch ? oldMatch.InputBy : inputBy,
      StatusReclass: statusReclass,
      NoBuying: noBuying,
      Type: type,
      SubType: subType,
      CropYear: cropYear
    });

    if (oldMatch) {
      const rcIdx = remainingReclass.findIndex(rc => rc.NoBarcode.toUpperCase() === noBarcode);
      if (rcIdx !== -1) {
        remainingReclass[rcIdx].GradeBuying = gradeBuying;
      }
    }
  });

  const newBuyingList = [...otherItems, ...updatedBuyingRows];

  setLocal('iscs_buying', newBuyingList);
  setLocal('iscs_reclass', remainingReclass);

  // Mark as unsynced
  const syncedIds = getLocal<Record<string, boolean>>('iscs_synced_ids', {});
  delete syncedIds[`buying_${noBuying}`];
  updatedBuyingRows.forEach(r => {
    delete syncedIds[`buying_${r.NoBarcode}`];
  });
  setLocal('iscs_synced_ids', syncedIds);

  return {
    success: true,
    message: `Transaksi Buying ${noBuying} berhasil diperbarui.`
  };
};

export const apiVoidBuyingBatch = (noBuying: string, voidedBy: string) => {
  if (apiIsBuyingShipped(noBuying)) {
    return { success: false, message: 'Gagal membatalkan: Transaksi ini mengandung barcode yang sudah di-shipping!' };
  }

  const buyingRows = getLocal<BuyingRow[]>('iscs_buying', []);
  const reclassRows = getLocal<ReclassRow[]>('iscs_reclass', []);
  const invoiceRows = getLocal<InvoiceRow[]>('iscs_invoice', []);

  // Check if any item in this buying batch has been invoiced
  const invoices = invoiceRows.filter(inv => !inv.IsVoid && inv.NoBuying === noBuying);
  if (invoices.length > 0) {
    return { success: false, message: 'Gagal membatalkan: Transaksi ini sudah dibuatkan Invoice/Kwitansi!' };
  }

  const oldItems = buyingRows.filter(b => b.NoBuying === noBuying);
  const remainingBuying = buyingRows.filter(b => b.NoBuying !== noBuying);

  const barcodesToDelete = oldItems.map(b => b.NoBarcode.toUpperCase());
  const remainingReclass = reclassRows.filter(rc => !barcodesToDelete.includes(rc.NoBarcode.toUpperCase()));

  setLocal('iscs_buying', remainingBuying);
  setLocal('iscs_reclass', remainingReclass);

  // Mark as unsynced
  const syncedIds = getLocal<Record<string, boolean>>('iscs_synced_ids', {});
  delete syncedIds[`buying_${noBuying}`];
  barcodesToDelete.forEach(b => {
    delete syncedIds[`buying_${b}`];
  });
  setLocal('iscs_synced_ids', syncedIds);

  return { success: true, message: `Transaksi Buying ${noBuying} berhasil dibatalkan (void).` };
};

export const apiDeleteShippingRow = (noShipping: string, noBarcodeAsal: string) => {
  const shipList = getLocal<ShippingRow[]>('iscs_shipping', []);
  const reclassRows = getLocal<ReclassRow[]>('iscs_reclass', []);

  const idx = shipList.findIndex(s => s.NoShipping === noShipping && s.NoBarcodeAsal.toUpperCase() === noBarcodeAsal.toUpperCase());
  if (idx === -1) {
    return { success: false, message: 'Data shipping tidak ditemukan.' };
  }

  // Revert status of reclass item
  const rcIdx = reclassRows.findIndex(r => r.NoBarcode.toUpperCase() === noBarcodeAsal.toUpperCase());
  if (rcIdx !== -1) {
    reclassRows[rcIdx].StatusShipping = 'BELUM';
  }

  shipList.splice(idx, 1);

  setLocal('iscs_shipping', shipList);
  setLocal('iscs_reclass', reclassRows);

  // Unsynced state
  const syncedIds = getLocal<Record<string, boolean>>('iscs_synced_ids', {});
  delete syncedIds[`shipping_${noShipping}`];
  setLocal('iscs_synced_ids', syncedIds);

  return { success: true, message: `Barcode ${noBarcodeAsal} berhasil dihapus dari shipping.` };
};

export const apiUpdateShippingRow = (noShipping: string, noBarcodeAsal: string, beratNetto: number) => {
  const shipList = getLocal<ShippingRow[]>('iscs_shipping', []);
  const idx = shipList.findIndex(s => s.NoShipping === noShipping && s.NoBarcodeAsal.toUpperCase() === noBarcodeAsal.toUpperCase());
  if (idx === -1) {
    return { success: false, message: 'Data shipping tidak ditemukan.' };
  }

  shipList[idx].BeratNetto = beratNetto;
  setLocal('iscs_shipping', shipList);

  // Unsynced state
  const syncedIds = getLocal<Record<string, boolean>>('iscs_synced_ids', {});
  delete syncedIds[`shipping_${noShipping}`];
  setLocal('iscs_synced_ids', syncedIds);

  return { success: true, message: `Barcode ${noBarcodeAsal} berhasil diperbarui.` };
};

export const apiUpdateShippingHeader = (noShipping: string, payload: {
  operator: string;
  type: string;
  subType: string;
  cropYear: string;
  destination: string;
  customDate?: string;
}) => {
  const shipList = getLocal<ShippingRow[]>('iscs_shipping', []);
  let found = false;
  const updated = shipList.map(s => {
    if (s.NoShipping === noShipping) {
      found = true;
      return {
        ...s,
        InputBy: payload.operator,
        Timestamp: payload.customDate ? resolveTimestamp(payload.customDate) : s.Timestamp,
        Type: payload.type,
        SubType: payload.subType,
        CropYear: payload.cropYear,
        Destination: payload.destination
      };
    }
    return s;
  });

  if (found) {
    setLocal('iscs_shipping', updated);

    // Unsynced state
    const syncedIds = getLocal<Record<string, boolean>>('iscs_synced_ids', {});
    delete syncedIds[`shipping_${noShipping}`];
    setLocal('iscs_synced_ids', syncedIds);

    return { success: true, message: 'Header shipping berhasil diperbarui.' };
  }
  return { success: false, message: 'Data shipping tidak ditemukan.' };
};

export const apiVoidShippingBatch = (noShipping: string) => {
  const shipList = getLocal<ShippingRow[]>('iscs_shipping', []);
  const reclassRows = getLocal<ReclassRow[]>('iscs_reclass', []);

  const toVoid = shipList.filter(s => s.NoShipping === noShipping);
  if (toVoid.length === 0) {
    return { success: false, message: 'Data shipping tidak ditemukan.' };
  }

  // Set all associated reclass items status back to BELUM
  const barcodesToRevert = toVoid.map(s => s.NoBarcodeAsal.toUpperCase());
  reclassRows.forEach(rc => {
    if (barcodesToRevert.includes(rc.NoBarcode.toUpperCase())) {
      rc.StatusShipping = 'BELUM';
    }
  });

  const remainingShipping = shipList.filter(s => s.NoShipping !== noShipping);

  setLocal('iscs_shipping', remainingShipping);
  setLocal('iscs_reclass', reclassRows);

  // Unsynced state
  const syncedIds = getLocal<Record<string, boolean>>('iscs_synced_ids', {});
  delete syncedIds[`shipping_${noShipping}`];
  setLocal('iscs_synced_ids', syncedIds);

  return { success: true, message: `Transaksi Shipping ${noShipping} berhasil dibatalkan (void).` };
};

/* =========================================================================
   IMPORT EXCEL / CSV FUNCTIONS
   ========================================================================= */

export interface ImportBuyingItem {
  tanggal?: string;
  noBarcode: string;
  berat: number;
  gradeBuying: string;
  namaSupplier?: string;
  type?: string;
  subType?: string;
  cropYear?: string;
  tare?: number;
}

export const apiImportBuying = (payload: {
  items: ImportBuyingItem[];
  defaultSupplier?: string;
  defaultType?: string;
  defaultSubType?: string;
  defaultCropYear?: string;
  defaultTare?: number;
  inputBy: string;
}) => {
  if (!payload.items || payload.items.length === 0) {
    return { success: false, message: 'Tidak ada data bale yang akan diimpor.' };
  }

  const buyingList = getLocal<BuyingRow[]>('iscs_buying', []);
  const existingBarcodes = new Set(buyingList.map(b => b.NoBarcode.trim().toUpperCase()));
  const defaultSupplier = (payload.defaultSupplier || 'IMPORT').trim();
  const defaultType = (payload.defaultType || 'VIRGINIA').trim().toUpperCase();
  const defaultSubType = (payload.defaultSubType || 'LOKAL').trim().toUpperCase();
  const defaultCropYear = (payload.defaultCropYear || '2026').trim().toUpperCase();
  const defaultTare = Number(payload.defaultTare) || 0;
  const inputBy = payload.inputBy || 'admin';

  // Group items by: supplier + '__' + type + '__' + subType + '__' + cropYear + '__' + date
  const grouped: Record<string, {
    supplier: string;
    type: string;
    subType: string;
    cropYear: string;
    date: string;
    items: ImportBuyingItem[];
  }> = {};

  let skippedCount = 0;
  const processedBarcodes = new Set<string>();

  for (const it of payload.items) {
    const rawBarcode = (it.noBarcode || '').trim().toUpperCase();
    if (!rawBarcode) {
      skippedCount++;
      continue;
    }
    if (existingBarcodes.has(rawBarcode) || processedBarcodes.has(rawBarcode)) {
      skippedCount++;
      continue;
    }
    if (!it.gradeBuying || !it.gradeBuying.trim()) {
      skippedCount++;
      continue;
    }
    const berat = Number(it.berat) || 0;
    if (berat <= 0) {
      skippedCount++;
      continue;
    }

    processedBarcodes.add(rawBarcode);

    const sup = (it.namaSupplier || defaultSupplier).trim().toUpperCase();
    const ty = (it.type || defaultType).trim().toUpperCase();
    const st = (it.subType || defaultSubType).trim().toUpperCase();
    const cy = (it.cropYear || defaultCropYear).trim().toUpperCase();
    const dt = it.tanggal ? it.tanggal.trim() : getTodayDateString();

    const groupKey = `${sup}__${ty}__${st}__${cy}__${dt}`;
    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        supplier: sup,
        type: ty,
        subType: st,
        cropYear: cy,
        date: dt,
        items: []
      };
    }
    grouped[groupKey].items.push(it);
  }

  if (processedBarcodes.size === 0) {
    return { 
      success: false, 
      message: 'Tidak ada data valid yang dapat diimpor. Semua barcode mungkin sudah ada di database atau data tidak lengkap.' 
    };
  }

  let totalImported = 0;
  const generatedNoBuyings: string[] = [];

  for (const key of Object.keys(grouped)) {
    const group = grouped[key];
    const noBuying = generateNoBuying();
    generatedNoBuyings.push(noBuying);
    const timestamp = resolveTimestamp(group.date);

    for (const it of group.items) {
      const barcode = it.noBarcode.trim().toUpperCase();
      const grade = it.gradeBuying.trim().toUpperCase();
      const tare = it.tare !== undefined ? Number(it.tare) : defaultTare;
      const beratNetto = Number(it.berat) || 0;
      const beratBruto = Number((beratNetto + tare).toFixed(2));
      const harga = getPriceForGrade(grade, 'BUYING', group.type, group.subType, group.cropYear);
      const totalHarga = Number((beratNetto * harga).toFixed(2));

      buyingList.push({
        Timestamp: timestamp,
        NoBarcode: barcode,
        NamaSupplier: group.supplier,
        GradeBuying: grade,
        BeratBruto: beratBruto,
        Tare: Number(tare.toFixed(2)),
        BeratNetto: Number(beratNetto.toFixed(2)),
        HargaBuying: harga,
        TotalHarga: totalHarga,
        InputBy: inputBy,
        StatusReclass: 'BELUM',
        NoBuying: noBuying,
        Type: group.type,
        SubType: group.subType,
        CropYear: group.cropYear
      });
      totalImported++;
    }
  }

  setLocal('iscs_buying', buyingList);

  return {
    success: true,
    totalImported,
    skippedCount,
    noBuyings: generatedNoBuyings,
    message: `Berhasil mengimpor ${totalImported} bale ke ${generatedNoBuyings.length} transaksi Buying.${skippedCount > 0 ? ` (${skippedCount} baris dilewati karena duplikat/invalid)` : ''}`
  };
};

export interface ImportReclassItem {
  tanggal?: string;
  noBarcode: string;
  gradeReclass: string;
}

export const apiImportReclass = (payload: {
  items: ImportReclassItem[];
  inputBy: string;
}) => {
  if (!payload.items || payload.items.length === 0) {
    return { success: false, message: 'Tidak ada data reclass yang akan diimpor.' };
  }

  const buyingList = getLocal<BuyingRow[]>('iscs_buying', []);
  const buyingMap = new Map<string, { row: BuyingRow; index: number }>();
  buyingList.forEach((b, idx) => {
    buyingMap.set(b.NoBarcode.trim().toUpperCase(), { row: b, index: idx });
  });

  const reclassSheet = getLocal<ReclassRow[]>('iscs_reclass', []);
  const reclassLog = getLocal<ReclassLogRow[]>('iscs_reclass_log', []);
  const inputBy = payload.inputBy || 'admin';

  let successCount = 0;
  let skippedCount = 0;
  const reclassItemsSaved: ReclassRow[] = [];
  const processedBarcodes = new Set<string>();

  for (const it of payload.items) {
    const rawBarcode = (it.noBarcode || '').trim().toUpperCase();
    const gradeReclass = (it.gradeReclass || '').trim().toUpperCase();

    if (!rawBarcode || !gradeReclass || processedBarcodes.has(rawBarcode)) {
      skippedCount++;
      continue;
    }

    const buyingEntry = buyingMap.get(rawBarcode);
    if (!buyingEntry) {
      skippedCount++;
      continue;
    }

    const { row: matchB, index: bIdx } = buyingEntry;

    // Check if already shipped
    const existingIdx = reclassSheet.findIndex(r => r.NoBarcode.toUpperCase() === rawBarcode);
    if (existingIdx !== -1 && reclassSheet[existingIdx].StatusShipping === 'SUDAH') {
      skippedCount++;
      continue;
    }

    processedBarcodes.add(rawBarcode);

    const noReclass = generateNoReclass();
    const timestamp = resolveTimestamp(it.tanggal);
    const netto = Number(matchB.BeratNetto) || (Number(matchB.BeratBruto) - Number(matchB.Tare));

    // Snapshot price at the time of Reclass transaction (historical preservation)
    const hargaReclass = getPriceForGrade(gradeReclass, 'RECLASS', matchB.Type, matchB.SubType, matchB.CropYear);
    const totalHargaReclass = Number((netto * hargaReclass).toFixed(2));

    const newRow: ReclassRow = {
      Timestamp: timestamp,
      NoBarcode: rawBarcode,
      GradeBuying: matchB.GradeBuying,
      GradeReclass: gradeReclass,
      BeratNetto: netto,
      HargaReclass: hargaReclass,
      TotalHargaReclass: totalHargaReclass,
      InputBy: inputBy,
      StatusShipping: 'BELUM',
      NoReclass: noReclass,
      StatusInvoice: 'BELUM',
      Type: matchB.Type,
      SubType: matchB.SubType,
      CropYear: matchB.CropYear
    };

    if (existingIdx !== -1) {
      reclassLog.push(reclassSheet[existingIdx]);
      reclassSheet[existingIdx] = newRow;
    } else {
      reclassSheet.push(newRow);
    }

    buyingList[bIdx].StatusReclass = 'SUDAH';
    successCount++;
    reclassItemsSaved.push(newRow);
  }

  if (successCount === 0) {
    return {
      success: false,
      message: 'Tidak ada barcode valid yang dapat direclass. Periksa apakah barcode sudah ada di data Buying atau sudah pernah dishipping.'
    };
  }

  setLocal('iscs_reclass', reclassSheet);
  setLocal('iscs_reclass_log', reclassLog);
  setLocal('iscs_buying', buyingList);

  return {
    success: true,
    totalImported: successCount,
    skippedCount,
    items: reclassItemsSaved,
    message: `Berhasil mengimpor ${successCount} data reclass.${skippedCount > 0 ? ` (${skippedCount} baris dilewati)` : ''}`
  };
};

/* =========================================================================
   IMPORT SHIPPING (EXCEL / CSV) & OTOMATIS KURANGI STOK GUDANG
   ========================================================================= */
export interface ImportShippingItem {
  tanggal?: string;        // Tanggal shipping (YYYY-MM-DD)
  tujuan: string;          // Tujuan / Destination
  noBarcode: string;       // No Barcode (bale barcode)
  grade?: string;          // Grade shipping / Grade reclass
  berat?: number;          // Berat netto (kg)
  noShipping?: string;     // No Shipping (opsional jika sudah ada)
  type?: string;           // Type (VIRGINIA dll)
  subType?: string;        // SubType (LOKAL dll)
  cropYear?: string;       // CropYear (2026 dll)
}

export const apiImportShipping = (payload: {
  items: ImportShippingItem[];
  defaultDestination?: string;
  defaultType?: string;
  defaultSubType?: string;
  defaultCropYear?: string;
  inputBy: string;
}) => {
  if (!payload.items || payload.items.length === 0) {
    return { success: false, message: 'Tidak ada data shipping yang akan diimpor.' };
  }

  const buyingList = getLocal<BuyingRow[]>('iscs_buying', []);
  const buyingMap = new Map<string, { row: BuyingRow; index: number }>();
  buyingList.forEach((b, idx) => {
    buyingMap.set(b.NoBarcode.trim().toUpperCase(), { row: b, index: idx });
  });

  const reclassList = getLocal<ReclassRow[]>('iscs_reclass', []);
  const shippingList = getLocal<ShippingRow[]>('iscs_shipping', []);

  // Set of barcodes already shipped
  const alreadyShippedBarcodes = new Set<string>();
  shippingList.forEach(s => {
    if (s.NoBarcodeAsal) alreadyShippedBarcodes.add(s.NoBarcodeAsal.trim().toUpperCase());
    if (s.NoBarcode) alreadyShippedBarcodes.add(s.NoBarcode.trim().toUpperCase());
  });
  reclassList.forEach(r => {
    if (r.StatusShipping === 'SUDAH') {
      alreadyShippedBarcodes.add(r.NoBarcode.trim().toUpperCase());
      if (r.NoReclass) alreadyShippedBarcodes.add(r.NoReclass.trim().toUpperCase());
    }
  });

  const defaultDestination = (payload.defaultDestination || 'GUDANG').trim();
  const defaultType = (payload.defaultType || 'VIRGINIA').trim().toUpperCase();
  const defaultSubType = (payload.defaultSubType || 'LOKAL').trim().toUpperCase();
  const defaultCropYear = (payload.defaultCropYear || '2026').trim().toUpperCase();
  const inputBy = payload.inputBy || 'admin';

  let totalImported = 0;
  let skippedCount = 0;
  const processedBarcodes = new Set<string>();
  const generatedNoShippings = new Set<string>();

  // Map for auto-generating No Shipping per (tujuan + '__' + tanggal) when noShipping is omitted
  const groupNoShippingMap: Record<string, string> = {};

  for (const it of payload.items) {
    const rawBarcode = (it.noBarcode || '').trim().toUpperCase();
    if (!rawBarcode) {
      skippedCount++;
      continue;
    }

    if (processedBarcodes.has(rawBarcode) || alreadyShippedBarcodes.has(rawBarcode)) {
      skippedCount++;
      continue;
    }

    const tujuan = (it.tujuan || defaultDestination).trim().toUpperCase();
    const tanggal = it.tanggal ? it.tanggal.trim() : getTodayDateString();
    const timestamp = resolveTimestamp(tanggal);

    // Determine No Shipping:
    let noShipping = (it.noShipping || '').trim().toUpperCase();
    if (!noShipping) {
      const groupKey = `${tujuan}__${tanggal}`;
      if (!groupNoShippingMap[groupKey]) {
        groupNoShippingMap[groupKey] = generateNoShipping(tanggal);
      }
      noShipping = groupNoShippingMap[groupKey];
    }
    generatedNoShippings.add(noShipping);

    // Match in reclass
    let matchedRcIdx = -1;
    for (let i = reclassList.length - 1; i >= 0; i--) {
      if ((reclassList[i].NoBarcode.toUpperCase() === rawBarcode || reclassList[i].NoReclass.toUpperCase() === rawBarcode) && reclassList[i].StatusShipping !== 'SUDAH') {
        matchedRcIdx = i;
        break;
      }
    }

    let gradeReclass = '';
    let beratNetto = Number(it.berat) || 0;
    let tare = 0;
    let noReclass = '';
    let barcodeAsal = rawBarcode;
    let type = (it.type || defaultType).trim().toUpperCase();
    let subType = (it.subType || defaultSubType).trim().toUpperCase();
    let cropYear = (it.cropYear || defaultCropYear).trim().toUpperCase();

    if (matchedRcIdx === -1) {
      // Barcode has not been reclassed yet!
      // Enforce rule: barcode must already be reclassed to be eligible for shipping
      skippedCount++;
      continue;
    }

    // Barcode found in Reclass!
    const rc = reclassList[matchedRcIdx];
    rc.StatusShipping = 'SUDAH';
    noReclass = rc.NoReclass;
    barcodeAsal = rc.NoBarcode;
    gradeReclass = (it.grade || rc.GradeReclass || '').trim().toUpperCase();
    if (beratNetto <= 0) {
      beratNetto = Number(rc.BeratNetto) || 0;
    }
    type = rc.Type || type;
    subType = rc.SubType || subType;
    cropYear = rc.CropYear || cropYear;

    const buyingEntry = buyingMap.get(barcodeAsal);
    if (buyingEntry) {
      tare = Number(buyingEntry.row.Tare) || 0;
    }

    if (beratNetto <= 0) {
      skippedCount++;
      continue;
    }

    processedBarcodes.add(rawBarcode);

    shippingList.push({
      Timestamp: timestamp,
      NoBarcode: noReclass || rawBarcode,
      NoBarcodeAsal: barcodeAsal,
      GradeReclass: gradeReclass,
      BeratNetto: Number(beratNetto.toFixed(2)),
      InputBy: inputBy,
      NoShipping: noShipping,
      Tare: Number(tare.toFixed(2)),
      Type: type,
      SubType: subType,
      CropYear: cropYear,
      Destination: tujuan
    });

    totalImported++;
  }

  if (totalImported === 0) {
    return {
      success: false,
      message: 'Tidak ada data shipping valid yang berhasil diimpor. Semua barcode mungkin sudah pernah dishipping atau data tidak lengkap.'
    };
  }

  setLocal('iscs_shipping', shippingList);
  setLocal('iscs_reclass', reclassList);
  setLocal('iscs_buying', buyingList);

  return {
    success: true,
    totalImported,
    skippedCount,
    noShippings: Array.from(generatedNoShippings),
    message: `Berhasil mengimpor ${totalImported} bale ke ${generatedNoShippings.size} transaksi Surat Jalan Shipping.${skippedCount > 0 ? ` (${skippedCount} baris dilewati karena duplikat/sudah dishipping)` : ''} Stok gudang telah otomatis dikurangi.`
  };
};

/**
 * Ensures all existing Reclass rows have their historical snapshot prices permanently locked.
 * If a row already has HargaReclass > 0, it is NEVER modified by any Master Price change.
 */
export const apiEnsureReclassHistoricalPrices = (): { updatedCount: number } => {
  const reclassList = getLocal<ReclassRow[]>('iscs_reclass', []);
  if (!reclassList || reclassList.length === 0) return { updatedCount: 0 };

  const buyingList = getLocal<BuyingRow[]>('iscs_buying', []);
  const buyMap: Record<string, BuyingRow> = {};
  buyingList.forEach(b => { buyMap[b.NoBarcode.toUpperCase()] = b; });

  let updatedCount = 0;
  const newReclass = reclassList.map(rc => {
    // If it already has a valid locked price (> 0), NEVER touch it!
    if (rc.HargaReclass !== undefined && rc.HargaReclass !== null && Number(rc.HargaReclass) > 0) {
      return rc;
    }
    const b = buyMap[rc.NoBarcode.toUpperCase()];
    const ty = (rc.Type || b?.Type || '').trim();
    const st = (rc.SubType || b?.SubType || '').trim();
    const cy = (rc.CropYear || b?.CropYear || '').trim();
    const h = getPriceForGrade(rc.GradeReclass, 'RECLASS', ty, st, cy);
    if (h > 0) {
      updatedCount++;
      const netto = Number(rc.BeratNetto) || 0;
      return {
        ...rc,
        HargaReclass: h,
        TotalHargaReclass: Number((netto * h).toFixed(2))
      };
    }
    return rc;
  });

  if (updatedCount > 0) {
    setLocal('iscs_reclass', newReclass);
  }
  return { updatedCount };
};

