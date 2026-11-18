import React, { useState } from 'react';
import { Download, Smartphone, X, Share } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled || (!isInstallable && !isIOS)) {
    return null;
  }

  const handleClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
    } else {
      await install();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          compact
            ? 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs rounded-lg transition shadow-sm cursor-pointer'
            : 'w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs rounded-xl transition shadow-sm cursor-pointer'
        }
        aria-label="Install Aplikasi di Perangkat"
      >
        {isIOS ? <Smartphone size={14} /> : <Download size={14} />}
        <span>{compact ? 'Install App' : 'Install di Android / HP'}</span>
      </button>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 text-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">
                Install di iPhone / iPad
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
                aria-label="Tutup panduan"
              >
                <X size={18} />
              </button>
            </div>
            <ol className="space-y-3 text-sm text-slate-600 list-decimal list-inside">
              <li className="leading-relaxed">
                Ketuk tombol <span className="inline-flex items-center gap-1 font-bold text-slate-900"><Share size={14} /> Bagikan (Share)</span> di bar Safari.
              </li>
              <li className="leading-relaxed">
                Gulir ke bawah lalu pilih <span className="font-bold text-slate-900">&ldquo;Tambahkan ke Layar Utama&rdquo;</span> (Add to Home Screen).
              </li>
              <li className="leading-relaxed">
                Ketuk <span className="font-bold text-slate-900">Tambah</span> di pojok kanan atas.
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full mt-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
};
