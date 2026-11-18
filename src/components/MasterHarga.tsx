import React, { useState, useEffect } from 'react';
import { apiGetMasterPrice, apiSavePrice, apiDeletePrice, apiGetReclassList } from '../db';
import { MasterPrice } from '../types';
import * as XLSX from 'xlsx';
import { PlusCircle, Trash2, ListFilter, Percent, Pencil, Upload, FileSpreadsheet, DollarSign, Sparkles } from 'lucide-react';
import { ImportMasterHargaModal } from './ImportMasterHargaModal';

interface MasterHargaProps {
  onPricesChanged?: () => void;
}

export const MasterHarga: React.FC<MasterHargaProps> = ({ onPricesChanged }) => {
  const [prices, setPrices] = useState<MasterPrice[]>([]);
  
  // Form fields
  const [tipe, setTipe] = useState<'BUYING' | 'RECLASS'>('BUYING');
  const [type, setType] = useState('VIRGINIA');
  const [subType, setSubType] = useState('LOKAL');
  const [cropYear, setCropYear] = useState('2026');
  const [grade, setGrade] = useState('');
  const [harga, setHarga] = useState('');

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editingKey, setEditingKey] = useState<{
    grade: string;
    tipe: 'BUYING' | 'RECLASS';
    type: string;
    subType: string;
    cropYear: string;
  } | null>(null);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  const fetchPrices = () => {
    const list = apiGetMasterPrice();
    setPrices(list);
  };

  const exportPricesToExcel = () => {
    if (!prices.length) {
      showToast('Tidak ada data harga untuk diexport.', 'err');
      return;
    }
    const rows = prices.map((p, idx) => ({
      'No': idx + 1,
      'Tipe': p.Tipe,
      'Type': p.Type,
      'Sub Type': p.SubType,
      'Crop Year': p.CropYear,
      'Grade': p.GradeBuying,
      'Harga (Rp/kg)': p.Harga
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 18 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Master_Harga');
    XLSX.writeFile(wb, `Master_Harga_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('File Master Harga berhasil diexport.', 'ok');
  };

  useEffect(() => {
    fetchPrices();
  }, []);

  useEffect(() => {
    const handleDbUpdate = () => {
      fetchPrices();
    };
    window.addEventListener('iscs-db-update', handleDbUpdate);
    return () => {
      window.removeEventListener('iscs-db-update', handleDbUpdate);
    };
  }, []);

  const showToast = (text: string, type: 'ok' | 'err') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleSyncFromTransactions = () => {
    const rcList = apiGetReclassList();
    if (!rcList.length) {
      showToast('Belum ada data transaksi Reclass.', 'err');
      return;
    }
    const currentPrices = apiGetMasterPrice();
    const currentReclassGrades = new Set(
      currentPrices.filter(p => p.Tipe === 'RECLASS').map(p => p.GradeBuying.toUpperCase())
    );

    let addedCount = 0;
    const uniqueRcGrades = Array.from(new Set(rcList.map(r => r.GradeReclass.trim().toUpperCase()).filter(Boolean)));

    uniqueRcGrades.forEach(g => {
      if (!currentReclassGrades.has(g)) {
        // Try counterpart NSRS
        const counterpart = g.replace(/NSPS/g, 'NSRS');
        const match = currentPrices.find(p => p.Tipe === 'RECLASS' && p.GradeBuying.toUpperCase() === counterpart) ||
                      currentPrices.find(p => {
                        const cleanG = g.replace(/[^A-Z0-9]/g, '').replace(/5/g, 'S').replace(/O/g, '0').replace(/NSPS/g, 'NSRS');
                        const cleanP = p.GradeBuying.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/5/g, 'S').replace(/O/g, '0').replace(/NSPS/g, 'NSRS');
                        return cleanG === cleanP;
                      });

        if (match && match.Harga > 0) {
          apiSavePrice(g, match.Harga, 'RECLASS', match.Type, match.SubType, match.CropYear);
          addedCount++;
        }
      }
    });

    if (addedCount > 0) {
      fetchPrices();
      showToast(`Berhasil menyinkronkan ${addedCount} grade Reclass (NSPS ↔ NSRS) ke Master Harga!`, 'ok');
    } else {
      showToast('Semua grade transaksi Reclass sudah memiliki padanan di Master Harga.', 'ok');
    }
  };

  const handleStartEdit = (p: MasterPrice) => {
    setIsEditing(true);
    setEditingKey({
      grade: p.GradeBuying,
      tipe: p.Tipe,
      type: p.Type,
      subType: p.SubType,
      cropYear: p.CropYear
    });
    setTipe(p.Tipe);
    setType(p.Type);
    setSubType(p.SubType);
    setCropYear(p.CropYear);
    setGrade(p.GradeBuying);
    setHarga(String(p.Harga));
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingKey(null);
    setGrade('');
    setHarga('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!grade.trim()) {
      showToast('Grade tidak boleh kosong.', 'err');
      return;
    }
    const valHarga = Number(harga);
    if (!harga || isNaN(valHarga) || valHarga < 0) {
      showToast('Harga harus diisi angka valid >= 0.', 'err');
      return;
    }
    if (!type.trim() || !subType.trim() || !cropYear.trim()) {
      showToast('Type, Sub Type, dan Crop Year wajib diisi.', 'err');
      return;
    }

    const targetGrade = grade.trim().toUpperCase();
    const targetType = type.trim().toUpperCase();
    const targetSubType = subType.trim().toUpperCase();
    const targetCropYear = cropYear.trim().toUpperCase();

    if (isEditing && editingKey) {
      const keyChanged =
        editingKey.grade.toUpperCase() !== targetGrade ||
        editingKey.tipe !== tipe ||
        editingKey.type.toUpperCase() !== targetType ||
        editingKey.subType.toUpperCase() !== targetSubType ||
        editingKey.cropYear.toUpperCase() !== targetCropYear;

      if (keyChanged) {
        apiDeletePrice(editingKey.grade, editingKey.tipe, editingKey.type, editingKey.subType, editingKey.cropYear);
      }
    }

    const res = apiSavePrice(targetGrade, valHarga, tipe, targetType, targetSubType, targetCropYear);
    if (res.success) {
      showToast(res.message || 'Harga tersimpan.', 'ok');
      setGrade('');
      setHarga('');
      setIsEditing(false);
      setEditingKey(null);
      fetchPrices();
      if (onPricesChanged) onPricesChanged();
    } else {
      showToast(res.message || 'Gagal menyimpan.', 'err');
    }
  };

  const handleDelete = (p: MasterPrice) => {
    if (!confirm(`Hapus grade ${p.GradeBuying} untuk ${p.Type}/${p.SubType}/${p.CropYear}?`)) return;
    const res = apiDeletePrice(p.GradeBuying, p.Tipe, p.Type, p.SubType, p.CropYear);
    if (res.success) {
      showToast('Grade berhasil dihapus.', 'ok');
      fetchPrices();
      if (onPricesChanged) onPricesChanged();
    } else {
      showToast(res.message || 'Gagal menghapus.', 'err');
    }
  };

  const buyingPrices = prices.filter(p => p.Tipe === 'BUYING');
  const reclassPrices = prices.filter(p => p.Tipe === 'RECLASS');

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-4 rounded-xl shadow-xl font-bold flex items-center gap-3 text-sm text-white ${toastMsg.type === 'ok' ? 'bg-emerald-600 border-l-4 border-emerald-300' : 'bg-rose-600 border-l-4 border-rose-300'}`}>
          {toastMsg.text}
        </div>
      )}

      {/* Top Banner Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <DollarSign className="text-teal-600" size={24} />
            Master Data Harga Tembakau
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Kelola daftar harga per kg per grade untuk transaksi <b>Buying</b> (Timbang Masuk) dan <b>Reclass</b> (Grading).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition shadow-sm active:scale-95 cursor-pointer"
          >
            <Upload size={15} />
            Import Excel / CSV
          </button>

          <button
            type="button"
            onClick={exportPricesToExcel}
            disabled={prices.length === 0}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-2 transition shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <FileSpreadsheet size={15} className="text-slate-500" />
            Export ke Excel (.xlsx)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Input Form Panel */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <h3 className="text-lg font-extrabold text-slate-800 mb-4 flex items-center gap-2">
            {isEditing ? (
              <>
                <Pencil size={18} className="text-amber-500" />
                Edit Harga
              </>
            ) : (
              <>
                <PlusCircle size={18} className="text-amber-500" />
                Tambah Harga Baru
              </>
            )}
          </h3>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                Jenis Harga
              </label>
              <select
                value={tipe}
                onChange={e => setTipe(e.target.value as 'BUYING' | 'RECLASS')}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="BUYING">Harga Buying</option>
                <option value="RECLASS">Harga Reclass</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Grade Buying dan Reclass adalah daftar terpisah. Grade yang sama bisa punya harga berbeda.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Type
                </label>
                <input
                  type="text"
                  value={type}
                  onChange={e => setType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="mis. VIRGINIA"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Sub Type
                </label>
                <input
                  type="text"
                  value={subType}
                  onChange={e => setSubType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="mis. LOKAL"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                Crop Year
              </label>
              <input
                type="text"
                value={cropYear}
                onChange={e => setCropYear(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="mis. 2026"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                Grade
              </label>
              <input
                type="text"
                value={grade}
                onChange={e => setGrade(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="mis. A, B, C, MIX"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                Harga per Kg
              </label>
              <input
                type="number"
                value={harga}
                onChange={e => setHarga(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="mis. 45000"
                min="0"
                step="1"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold rounded-xl text-sm transition flex items-center justify-center gap-2"
              >
                {isEditing ? 'Perbarui Harga' : 'Simpan Harga'}
              </button>
              {isEditing && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-sm transition"
                >
                  Batal
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Display List Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Buying Prices */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <h3 className="text-md font-extrabold text-slate-800 mb-4 flex items-center gap-2">
              <ListFilter size={16} className="text-teal-500" />
              Daftar Harga Buying
            </h3>
            <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-xl">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                    <th className="px-4 py-2 text-xs uppercase">Type</th>
                    <th className="px-4 py-2 text-xs uppercase">Sub Type</th>
                    <th className="px-4 py-2 text-xs uppercase">Crop Year</th>
                    <th className="px-4 py-2 text-xs uppercase">Grade</th>
                    <th className="px-4 py-2 text-xs uppercase text-right">Harga/kg</th>
                    <th className="px-4 py-2 text-xs uppercase w-20 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {buyingPrices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">
                        Belum ada grade buying di Master Harga.
                      </td>
                    </tr>
                  ) : (
                    buyingPrices.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2 font-medium text-slate-700">{p.Type}</td>
                        <td className="px-4 py-2 text-slate-600">{p.SubType}</td>
                        <td className="px-4 py-2 text-slate-500 font-mono text-xs">{p.CropYear}</td>
                        <td className="px-4 py-2 font-bold text-slate-800 font-mono">{p.GradeBuying}</td>
                        <td className="px-4 py-2 text-right text-slate-800 font-semibold font-mono">
                          Rp{p.Harga.toLocaleString('id-ID')}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleStartEdit(p)}
                              className="text-amber-600 hover:text-amber-800 p-1 hover:bg-amber-50 rounded transition"
                              title="Edit Harga"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(p)}
                              className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded transition"
                              title="Hapus Harga"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reclass Prices */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-md font-extrabold text-slate-800 flex items-center gap-2">
                <Percent size={16} className="text-amber-500" />
                Daftar Harga Reclass
              </h3>
              <button
                type="button"
                onClick={handleSyncFromTransactions}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                title="Sinkronkan grade dari data transaksi Reclass (NSPS ↔ NSRS)"
              >
                <Sparkles size={13} className="text-emerald-600" />
                Sinkronkan NSPS ↔ NSRS
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-xl">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                    <th className="px-4 py-2 text-xs uppercase">Type</th>
                    <th className="px-4 py-2 text-xs uppercase">Sub Type</th>
                    <th className="px-4 py-2 text-xs uppercase">Crop Year</th>
                    <th className="px-4 py-2 text-xs uppercase">Grade</th>
                    <th className="px-4 py-2 text-xs uppercase text-right">Harga/kg</th>
                    <th className="px-4 py-2 text-xs uppercase w-20 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reclassPrices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">
                        Belum ada grade reclass di Master Harga.
                      </td>
                    </tr>
                  ) : (
                    reclassPrices.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2 font-medium text-slate-700">{p.Type}</td>
                        <td className="px-4 py-2 text-slate-600">{p.SubType}</td>
                        <td className="px-4 py-2 text-slate-500 font-mono text-xs">{p.CropYear}</td>
                        <td className="px-4 py-2 font-bold text-slate-800 font-mono">{p.GradeBuying}</td>
                        <td className="px-4 py-2 text-right text-slate-800 font-semibold font-mono">
                          Rp{p.Harga.toLocaleString('id-ID')}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleStartEdit(p)}
                              className="text-amber-600 hover:text-amber-800 p-1 hover:bg-amber-50 rounded transition"
                              title="Edit Harga"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(p)}
                              className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded transition"
                              title="Hapus Harga"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      <ImportMasterHargaModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        currentPrices={prices}
        onSuccess={(count) => {
          showToast(`Berhasil mengimpor ${count} harga ke Master Harga!`, 'ok');
          fetchPrices();
          if (onPricesChanged) onPricesChanged();
        }}
      />
    </div>
  );
};
