import React, { useState } from 'react';
import { getLocal } from '../db';
import { User } from '../types';
import { ShieldCheck, Lock } from 'lucide-react';

interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'Verifikasi PIN Admin',
  description = 'Tindakan ini memerlukan verifikasi PIN Admin untuk melanjutkan.'
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const users = getLocal<User[]>('iscs_users', []);
    const adminUser = users.find(u => u.Role === 'admin' && u.PIN === pin);

    if (adminUser) {
      setPin('');
      onSuccess();
    } else {
      setError('PIN Admin salah atau tidak terdaftar.');
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-slate-100 overflow-hidden animate-fade-in">
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2 text-amber-600 font-extrabold text-xs tracking-wider uppercase">
            <ShieldCheck size={16} />
            <span>Otorisasi Admin</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-800">{title}</h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">{description}</p>
          </div>

          <div className="space-y-1.5">
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  setPin(val);
                }}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-center font-bold tracking-widest focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="••••••"
                maxLength={6}
                autoFocus
              />
            </div>
            {error && <p className="text-[10px] text-rose-500 font-bold text-center">{error}</p>}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-1.5 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-50 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition"
            >
              Verifikasi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
