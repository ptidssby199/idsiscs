import React, { useState, useEffect } from 'react';
import { getSettingValue, setSettingValue } from '../db';
import { Scale, Save, Info, AlertTriangle } from 'lucide-react';

export const MasterKonstanta: React.FC = () => {
  const [konstantaVal, setKonstantaVal] = useState('0.50');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    const val = getSettingValue('KonstantaValue', '0.50');
    setKonstantaVal(val);
  }, []);

  useEffect(() => {
    const handleDbUpdate = () => {
      const val = getSettingValue('KonstantaValue', '0.50');
      setKonstantaVal(val);
    };
    window.addEventListener('iscs-db-update', handleDbUpdate);
    return () => {
      window.removeEventListener('iscs-db-update', handleDbUpdate);
    };
  }, []);

  const showToast = (text: string, type: 'ok' | 'err') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(konstantaVal);
    if (isNaN(parsed) || parsed < 0) {
      showToast('Nilai konstanta harus berupa angka desimal positif atau nol (0).', 'err');
      return;
    }

    // Save with 2 decimal precision
    const formattedVal = parsed.toFixed(2);
    setSettingValue('KonstantaValue', formattedVal);
    setKonstantaVal(formattedVal);
    showToast(`Konstanta berhasil disimpan: ${formattedVal} kg`, 'ok');
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <div
          id="toast-konstanta"
          className={`fixed bottom-6 right-6 z-50 px-5 py-4 rounded-xl shadow-xl font-bold flex items-center gap-3 text-sm text-white transition-all duration-300 ${
            toastMsg.type === 'ok' ? 'bg-emerald-600 border-l-4 border-emerald-300' : 'bg-rose-600 border-l-4 border-rose-300'
          }`}
        >
          {toastMsg.text}
        </div>
      )}

      <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl">
            <Scale size={24} />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-slate-800">Master Konstanta</h3>
            <p className="text-xs text-slate-400">Atur potongan berat bruto otomatis untuk timbangan Buying</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
              Nilai Konstanta Potongan (kg)
            </label>
            <div className="relative">
              <input
                id="input-konstanta-val"
                type="number"
                step="0.01"
                min="0"
                value={konstantaVal}
                onChange={(e) => setKonstantaVal(e.target.value)}
                placeholder="0.50"
                className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                kg
              </span>
            </div>
          </div>

          <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-100/50 text-slate-700 text-xs space-y-2">
            <div className="flex gap-2 items-start">
              <Info size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <b>Bagaimana cara kerja Konstanta?</b> <br />
                Jika fitur ini diaktifkan di modul <b>Buying (Timbang Masuk)</b>, setiap penginputan berat bruto bale akan otomatis dikurangi dengan nilai konstanta ini. <br />
                <span className="font-mono bg-amber-500/10 text-amber-800 px-1 py-0.5 rounded text-[10px] font-bold">
                  Netto = Bruto &minus; Tare &minus; Konstanta
                </span>
              </p>
            </div>
            <div className="flex gap-2 items-start text-slate-500">
              <AlertTriangle size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Fitur ini dapat dinonaktifkan atau diaktifkan dengan cepat di layar timbang Buying menggunakan shortcut keyboard <b>F6</b>.
              </p>
            </div>
          </div>

          <button
            id="btn-save-konstanta"
            type="submit"
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold text-sm rounded-xl transition duration-150 active:scale-[0.98] shadow-sm"
          >
            <Save size={16} />
            Simpan Nilai Konstanta
          </button>
        </form>
      </div>
    </div>
  );
};
