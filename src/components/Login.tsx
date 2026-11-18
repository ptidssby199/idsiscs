import React, { useState } from 'react';
import { apiLogin } from '../db';
import { LogIn } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { OfflineIndicator } from './OfflineIndicator';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleKeypadPress = (digit: string) => {
    if (pin.length >= 8) return;
    setPin(prev => prev + digit);
    setErrorMsg('');
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin('');
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim() || !pin.trim()) {
      setErrorMsg('Username dan PIN wajib diisi.');
      return;
    }

    const res = apiLogin(username.trim(), pin.trim());
    if (res.success) {
      onLoginSuccess(res.user);
    } else {
      setErrorMsg(res.message || 'Gagal masuk.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 select-none relative overflow-hidden">
      <OfflineIndicator />
      <div className="flex-1 flex items-center justify-center px-4 py-6 relative">
        {/* Decorative ambient blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 border border-slate-100 z-10">
          <div className="flex items-center justify-between gap-2 mb-6">
            <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-widest text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg w-fit">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              ISCS ENGINE v2
            </div>
            <PWAInstallButton compact />
          </div>

        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight font-sans">
          Masuk Aplikasi
        </h1>
        <p className="text-sm text-slate-400 mt-1 mb-6">
          IDS &bull; Stock &amp; Control &bull; System
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-slate-800 transition"
                placeholder="budi / admin"
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              PIN (4-8 Digit)
            </label>
            <input
              type="password"
              value={pin}
              onChange={e => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                if (val.length <= 8) {
                  setPin(val);
                  setErrorMsg('');
                }
              }}
              inputMode="numeric"
              pattern="[0-9]*"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-2xl font-mono tracking-[0.75em] text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="••••"
            />
          </div>

          {/* Numeric PIN Keypad */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeypadPress(num)}
                className="py-3.5 bg-slate-50 border border-slate-200 hover:bg-amber-500 hover:text-white hover:border-transparent rounded-xl text-lg font-bold text-slate-700 transition active:scale-95"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="py-3.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-500 transition active:scale-95"
            >
              Hapus
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('0')}
              className="py-3.5 bg-slate-50 border border-slate-200 hover:bg-amber-500 hover:text-white hover:border-transparent rounded-xl text-lg font-bold text-slate-700 transition active:scale-95"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="py-3.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-500 transition flex items-center justify-center active:scale-95"
            >
              &larr;
            </button>
          </div>

          {errorMsg && (
            <div className="text-red-500 text-xs font-semibold py-1">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            className="w-full mt-2 py-3.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-98"
          >
            <LogIn size={18} />
            Masuk
          </button>
        </form>

        <div className="mt-8 text-center border-t border-slate-100 pt-6">
          <p className="text-[10px] text-slate-300 font-semibold tracking-wider uppercase mt-1">
            IT Development IDS 2026
          </p>
        </div>
      </div>
      </div>
    </div>
  );
};
