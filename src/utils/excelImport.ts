import * as XLSX from 'xlsx';

/**
 * Robust date parser for Excel dates (Date object, serial number, or DD/MM/YYYY / YYYY-MM-DD string)
 */
export const parseExcelDate = (val: any): string => {
  if (!val) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // If Excel numeric serial number (e.g. 45572 for Oct 2024)
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const str = String(val).trim();

  // Pattern: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  // Pattern: YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Fallback to today
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Robust currency and price parser for Excel / CSV data
 * Handles raw numbers, Indonesian currency strings ('Rp 55.000', '55.000', '55.000,00'),
 * US style ('$55,000.00', '55,000'), and various per-kg suffixes.
 */
export const parseCleanPrice = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  let s = String(val).trim();
  // Remove currency signs, whitespace, and per-kg annotations
  s = s.replace(/^(rp|idr|\$)\.?\s*/i, '').replace(/\s*(rp|idr|\$)$/i, '');
  s = s.replace(/(\/|\bper\b)\s*kg\b/i, '').trim();

  // If both . and , exist (e.g. 55.000,00 or 55,000.00)
  if (s.includes('.') && s.includes(',')) {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastComma > lastDot) {
      // Indonesian style: 55.000,50 -> remove dots, replace comma with dot
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US style: 55,000.50 -> remove commas
      s = s.replace(/,/g, '');
    }
  } else if (s.includes('.')) {
    // Only dot(s): check if thousands separator (e.g. 55.000 or 1.250.000)
    if (/^\d{1,3}(\.\d{3})+$/.test(s) || (s.match(/\./g)?.length === 1 && /\.\d{3}$/.test(s))) {
      s = s.replace(/\./g, '');
    }
  } else if (s.includes(',')) {
    // Only comma(s): check if thousands separator (e.g. 55,000) or decimal comma (e.g. 55000,50)
    if (/^\d{1,3}(,\d{3})+$/.test(s) || (s.match(/,/g)?.length === 1 && /,\d{3}$/.test(s))) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  }

  // Remove any remaining unexpected non-numeric characters except dot
  s = s.replace(/[^0-9.]/g, '');
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
};

/**
 * Reads an uploaded Excel (.xlsx, .xls) or CSV file and returns an array of row objects
 */
export const readUploadedSpreadsheet = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          resolve([]);
          return;
        }
        const workbook = XLSX.read(data, {
          type: typeof data === 'string' ? 'string' : 'array',
          cellDates: true,
        });

        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          resolve([]);
          return;
        }

        const worksheet = workbook.Sheets[sheetName];
        const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, {
          defval: '',
          raw: false,
        });

        resolve(jsonRows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);

    // Read as array buffer for binary files
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Downloads a pre-formatted template for Buying Import
 */
export const downloadBuyingImportTemplate = () => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  const data = [
    {
      'Tanggal Buying': todayStr,
      'No Barcode': 'B2600001',
      'Berat (kg)': 48.5,
      'Grade Buying': 'SL1',
      'Supplier': 'PAK AHMAD',
      'Type': 'VIRGINIA',
      'SubType': 'LOKAL',
      'CropYear': '2026'
    },
    {
      'Tanggal Buying': todayStr,
      'No Barcode': 'B2600002',
      'Berat (kg)': 52.0,
      'Grade Buying': 'ML1',
      'Supplier': 'PAK AHMAD',
      'Type': 'VIRGINIA',
      'SubType': 'LOKAL',
      'CropYear': '2026'
    },
    {
      'Tanggal Buying': todayStr,
      'No Barcode': 'B2600003',
      'Berat (kg)': 45.2,
      'Grade Buying': 'TL1',
      'Supplier': 'PAK BUDI',
      'Type': 'VIRGINIA',
      'SubType': 'LOKAL',
      'CropYear': '2026'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  // Set column widths
  ws['!cols'] = [
    { wch: 15 }, // Tanggal
    { wch: 15 }, // Barcode
    { wch: 12 }, // Berat
    { wch: 14 }, // Grade
    { wch: 18 }, // Supplier
    { wch: 14 }, // Type
    { wch: 14 }, // SubType
    { wch: 12 }, // CropYear
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template_Buying');
  XLSX.writeFile(wb, 'Template_Import_Timbang_Buying.xlsx');
};

/**
 * Downloads a pre-formatted template for Reclass Import
 */
export const downloadReclassImportTemplate = () => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  const data = [
    {
      'Tanggal Reclass': todayStr,
      'No Barcode': 'B2600001',
      'Grade Reclass': 'SL1-RC'
    },
    {
      'Tanggal Reclass': todayStr,
      'No Barcode': 'B2600002',
      'Grade Reclass': 'ML1-RC'
    },
    {
      'Tanggal Reclass': todayStr,
      'No Barcode': 'B2600003',
      'Grade Reclass': 'TL1-RC'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 16 }, // Tanggal Reclass
    { wch: 16 }, // No Barcode
    { wch: 16 }, // Grade Reclass
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template_Reclass');
  XLSX.writeFile(wb, 'Template_Import_Grade_Reclass.xlsx');
};

/**
 * Downloads a pre-formatted template for Shipping Import
 */
export const downloadShippingImportTemplate = () => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  const data = [
    {
      'Tanggal Shipping': todayStr,
      'Tujuan': 'PT DJARUM KUDUS',
      'No Barcode': 'B2600001',
      'Grade': 'SL1-RC',
      'Berat (kg)': 48.5,
      'No Shipping': '' // Opsional: Kosongkan untuk auto-generate nomor surat jalan
    },
    {
      'Tanggal Shipping': todayStr,
      'Tujuan': 'PT DJARUM KUDUS',
      'No Barcode': 'B2600002',
      'Grade': 'ML1-RC',
      'Berat (kg)': 52.0,
      'No Shipping': ''
    },
    {
      'Tanggal Shipping': todayStr,
      'Tujuan': 'GUDANG SURABAYA',
      'No Barcode': 'B2600003',
      'Grade': 'TL1-RC',
      'Berat (kg)': 45.2,
      'No Shipping': ''
    }
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 18 }, // Tanggal Shipping
    { wch: 26 }, // Tujuan
    { wch: 16 }, // No Barcode
    { wch: 16 }, // Grade
    { wch: 14 }, // Berat (kg)
    { wch: 22 }, // No Shipping (opsional)
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template_Shipping');
  XLSX.writeFile(wb, 'Template_Import_Shipping.xlsx');
};

/**
 * Downloads a pre-formatted template for Master Price (Buying & Reclass) Import
 */
export const downloadMasterPriceImportTemplate = () => {
  const data = [
    {
      'Tipe': 'BUYING',
      'Type': 'VIRGINIA',
      'Sub Type': 'LOKAL',
      'Crop Year': '2026',
      'Grade': 'A',
      'Harga (Rp/kg)': 55000
    },
    {
      'Tipe': 'BUYING',
      'Type': 'VIRGINIA',
      'Sub Type': 'LOKAL',
      'Crop Year': '2026',
      'Grade': 'B',
      'Harga (Rp/kg)': 45000
    },
    {
      'Tipe': 'BUYING',
      'Type': 'VIRGINIA',
      'Sub Type': 'LOKAL',
      'Crop Year': '2026',
      'Grade': 'C',
      'Harga (Rp/kg)': 35000
    },
    {
      'Tipe': 'RECLASS',
      'Type': 'VIRGINIA',
      'Sub Type': 'LOKAL',
      'Crop Year': '2026',
      'Grade': 'A',
      'Harga (Rp/kg)': 58000
    },
    {
      'Tipe': 'RECLASS',
      'Type': 'VIRGINIA',
      'Sub Type': 'LOKAL',
      'Crop Year': '2026',
      'Grade': 'B',
      'Harga (Rp/kg)': 48000
    },
    {
      'Tipe': 'RECLASS',
      'Type': 'VIRGINIA',
      'Sub Type': 'LOKAL',
      'Crop Year': '2026',
      'Grade': 'C',
      'Harga (Rp/kg)': 38000
    }
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 14 }, // Tipe (BUYING / RECLASS)
    { wch: 16 }, // Type
    { wch: 16 }, // Sub Type
    { wch: 14 }, // Crop Year
    { wch: 14 }, // Grade
    { wch: 18 }  // Harga (Rp/kg)
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template_Master_Harga');
  XLSX.writeFile(wb, 'Template_Import_Master_Harga.xlsx');
};
