import React, { useState } from 'react';
import { apiResetAllData, apiResetTransactionsOnly, getLocal, setLocal } from '../db';
import { AlertTriangle, RotateCcw, ShieldAlert, CheckCircle2, Lock } from 'lucide-react';
import { User } from '../types';

interface ResetDataProps {
  currentUser: any;
}

export const ResetData: React.FC<ResetDataProps> = ({ currentUser }) => {
  const [resetType, setResetType] = useState<'all' | 'transactions_only'>('all');
  const [adminPin, setAdminPin] = useState('');
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const [successReset, setSuccessReset] = useState(false);

  const showToast = (text: string, type: 'ok' | 'err') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleExecuteReset = (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Verify Admin PIN
    const users = getLocal<User[]>('iscs_users', []);
    const matchUser = users.find(u => u.Username === currentUser.username);
    if (!matchUser) {
      showToast('Sesi user tidak valid.', 'err');
      return;
    }

    if (matchUser.PIN !== adminPin) {
      showToast('PIN Administrator salah. Otorisasi gagal!', 'err');
      return;
    }

    // 2. Verify Confirmation Text
    if (typedConfirmation !== 'HAPUS') {
      showToast('Harap ketik "HAPUS" pada kolom konfirmasi.', 'err');
      return;
    }

    try {
      if (resetType === 'all') {
        // Full Reset
        apiResetAllData();
      } else {
        // Transactions only (properly clears IndexedDB, in-memory cache, and localStorage)
        apiResetTransactionsOnly();
        
        // Keep user logged in but reload to refresh state
        showToast('Semua data transaksi berhasil dihapus dari IndexedDB. Data Master dipertahankan.', 'ok');
        setSuccessReset(true);
        setTimeout(() => {
          window.location.reload();
        }, 2000);
        return;
      }

      setSuccessReset(true);
      showToast('Database berhasil direset penuh! Sistem akan memuat ulang...', 'ok');
      
      // Auto logout and reload in 2.5 seconds
      setTimeout(() => {
        window.location.reload();
      }, 2500);

    } catch (err: any) {
      showToast(`Gagal mereset data: ${err?.message || err}`, 'err');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold flex items-center gap-2 animate-bounce ${
          toastMsg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {toastMsg.type === 'ok' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <ShieldAlert size={16} className="text-rose-600" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {successReset ? (
        <div className="bg-white rounded-2xl border border-emerald-100 p-8 text-center space-y-4 shadow-md animate-fadeIn">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600 animate-pulse">
            <CheckCircle2 size={36} />
          </div>
          <h3 className="text-lg font-black text-slate-800">Proses Reset Berhasil!</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            Seluruh data yang dipilih telah berhasil dihapus secara permanen dari sistem. Halaman akan dimuat ulang ke kondisi default dalam beberapa detik...
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Header Banner */}
          <div className="bg-rose-500/5 border-b border-rose-100 p-6 flex items-start gap-4">
            <div className="p-3 bg-rose-100 rounded-xl text-rose-600">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800">Pusat Reset Data Sistem</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Halaman ini digunakan untuk mengosongkan atau mengembalikan database lokal sistem timbangan ke kondisi awal. Tindakan ini bersifat <span className="font-bold text-rose-600">destruktif dan permanen</span>.
              </p>
            </div>
          </div>

          <form onSubmit={handleExecuteReset} className="p-6 space-y-6">
            {/* Warning Alert */}
            <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-xs text-rose-900 flex gap-3">
              <AlertTriangle size={20} className="text-rose-600 flex-shrink-0" />
              <div className="space-y-1">
                <p className="font-extrabold text-rose-800 uppercase tracking-wide">Peringatan Keamanan Utama!</p>
                <p className="leading-relaxed">
                  Semua data transaksi yang dihapus tidak akan bisa dipulihkan kembali kecuali Anda memiliki file backup eksternal JSON. Pastikan Anda telah melakukan ekspor atau pencadangan penuh sebelum menekan tombol reset.
                </p>
              </div>
            </div>

            {/* Selection Reset Type */}
            <div className="space-y-3">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pilih Cakupan Reset Data</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className={`border rounded-xl p-4 flex flex-col justify-between cursor-pointer transition relative hover:border-rose-300 ${
                  resetType === 'all' ? 'border-rose-500 bg-rose-50/10' : 'border-slate-200 bg-white'
                }`}>
                  <input
                    type="radio"
                    name="reset_type"
                    checked={resetType === 'all'}
                    onChange={() => setResetType('all')}
                    className="absolute top-4 right-4 accent-rose-600"
                  />
                  <div className="space-y-1 pr-6">
                    <span className="text-xs font-extrabold block text-slate-800">Reset Semua Data (Penuh)</span>
                    <span className="text-[11px] text-slate-400 leading-relaxed block">
                      Menghapus seluruh data transaksi AND data master (Harga, Users/Petugas, Pengaturan Barcode & Konstanta), kemudian memulihkan user 'admin' default (PIN: 1234).
                    </span>
                  </div>
                </label>

                <label className={`border rounded-xl p-4 flex flex-col justify-between cursor-pointer transition relative hover:border-amber-300 ${
                  resetType === 'transactions_only' ? 'border-amber-500 bg-amber-50/10' : 'border-slate-200 bg-white'
                }`}>
                  <input
                    type="radio"
                    name="reset_type"
                    checked={resetType === 'transactions_only'}
                    onChange={() => setResetType('transactions_only')}
                    className="absolute top-4 right-4 accent-amber-500"
                  />
                  <div className="space-y-1 pr-6">
                    <span className="text-xs font-extrabold block text-slate-800">Reset Data Transaksi Saja</span>
                    <span className="text-[11px] text-slate-400 leading-relaxed block">
                      Hanya menghapus riwayat transaksi (Timbang Buying, Reclass, Shipping, Invoice, Preprint, Counter). Akun Operator, Daftar Harga Master, dan Konstanta tetap aman disimpan.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Validation Fields */}
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-4">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Lock size={12} />
                Konfirmasi & Otorisasi Administrator
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Typed Confirmation */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-600">
                    Ketik kata <span className="font-extrabold text-rose-600">"HAPUS"</span> untuk konfirmasi:
                  </label>
                  <input
                    type="text"
                    required
                    value={typedConfirmation}
                    onChange={e => setTypedConfirmation(e.target.value)}
                    placeholder="Ketik HAPUS"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white font-mono font-bold tracking-wider"
                  />
                </div>

                {/* Admin PIN */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-600">
                    Masukkan PIN Administrator Anda:
                  </label>
                  <input
                    type="password"
                    required
                    maxLength={8}
                    value={adminPin}
                    onChange={e => setAdminPin(e.target.value)}
                    placeholder="••••"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white font-mono tracking-widest text-center"
                  />
                </div>
              </div>
            </div>

            {/* Actions Submit */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setAdminPin('');
                  setTypedConfirmation('');
                }}
                className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 font-bold rounded-xl text-xs transition"
              >
                Kosongkan Form
              </button>
              <button
                type="submit"
                className={`px-5 py-2 font-bold rounded-xl text-xs text-white flex items-center gap-2 transition duration-150 active:scale-95 ${
                  resetType === 'all'
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/10'
                    : 'bg-amber-600 hover:bg-amber-700 shadow-md shadow-amber-600/10'
                }`}
              >
                <RotateCcw size={14} />
                Eksekusi Reset Sekarang
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
