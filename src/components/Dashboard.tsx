import React, { useState, useEffect } from 'react';
import { apiGetSummary } from '../db';
import { DashboardSummary } from '../types';
import { RefreshCw, ShoppingCart, Repeat, Layers, Truck, FileText, AlertCircle } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [isSpinning, setIsSpinning] = useState(false);

  const fetchSummary = () => {
    setIsSpinning(true);
    const s = apiGetSummary();
    setSummary(s);

    const now = new Date();
    setLastUpdated(
      now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' +
        now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    );

    setTimeout(() => {
      setIsSpinning(false);
    }, 600);
  };

  useEffect(() => {
    fetchSummary();

    const handleUpdate = () => {
      fetchSummary();
    };

    window.addEventListener('iscs-db-update', handleUpdate);
    return () => {
      window.removeEventListener('iscs-db-update', handleUpdate);
    };
  }, []);

  if (!summary) return null;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">Ringkasan Keseluruhan</h2>
          <p className="text-xs text-slate-400 mt-0.5">Terakhir diperbarui: {lastUpdated}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('iscs-navigate', { detail: { page: 'pageCreateBale' } }));
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition duration-150 active:scale-95 shadow-sm cursor-pointer"
          >
            <ShoppingCart size={15} />
            + Buat Bale Baru
          </button>
          <button
            onClick={fetchSummary}
            disabled={isSpinning}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-xl transition duration-150 active:scale-95 disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw size={15} className={`${isSpinning ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {/* Total Buying */}
        <div className="relative overflow-hidden bg-gradient-to-br from-teal-600 to-teal-800 rounded-2xl p-6 text-white shadow-md hover:-translate-y-1 hover:shadow-lg transition">
          <div className="absolute right-[-15px] top-[-15px] w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="w-10 h-10 rounded-xl bg-white/18 flex items-center justify-center mb-4">
            <ShoppingCart size={20} className="text-white" />
          </div>
          <p className="text-xs uppercase tracking-wider font-bold opacity-80">Total Buying</p>
          <h3 className="text-2xl font-black mt-1">
            {summary.totalBeratBuying.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-xs font-semibold opacity-75 mt-0.5">kg netto</p>
        </div>

        {/* Total Reclass */}
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 to-amber-700 rounded-2xl p-6 text-white shadow-md hover:-translate-y-1 hover:shadow-lg transition">
          <div className="absolute right-[-15px] top-[-15px] w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="w-10 h-10 rounded-xl bg-white/18 flex items-center justify-center mb-4">
            <Repeat size={20} className="text-white" />
          </div>
          <p className="text-xs uppercase tracking-wider font-bold opacity-80">Total Reclass</p>
          <h3 className="text-2xl font-black mt-1">
            {summary.totalBeratReclass.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-xs font-semibold opacity-75 mt-0.5">kg netto</p>
        </div>

        {/* Sisa Stok */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-6 text-white shadow-md hover:-translate-y-1 hover:shadow-lg transition">
          <div className="absolute right-[-15px] top-[-15px] w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="w-10 h-10 rounded-xl bg-white/18 flex items-center justify-center mb-4">
            <Layers size={20} className="text-white" />
          </div>
          <p className="text-xs uppercase tracking-wider font-bold opacity-80">Sisa Stok</p>
          <h3 className="text-2xl font-black mt-1">
            {summary.sisaStok.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-xs font-semibold opacity-75 mt-0.5">kg</p>
        </div>

        {/* Total Shipping */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-6 text-white shadow-md hover:-translate-y-1 hover:shadow-lg transition">
          <div className="absolute right-[-15px] top-[-15px] w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="w-10 h-10 rounded-xl bg-white/18 flex items-center justify-center mb-4">
            <Truck size={20} className="text-white" />
          </div>
          <p className="text-xs uppercase tracking-wider font-bold opacity-80">Total Shipping</p>
          <h3 className="text-2xl font-black mt-1">
            {summary.totalBeratShipping.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-xs font-semibold opacity-75 mt-0.5">kg netto</p>
        </div>

        {/* Total Invoice */}
        <div className="relative overflow-hidden bg-gradient-to-br from-rose-600 to-rose-800 rounded-2xl p-6 text-white shadow-md hover:-translate-y-1 hover:shadow-lg transition">
          <div className="absolute right-[-15px] top-[-15px] w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="w-10 h-10 rounded-xl bg-white/18 flex items-center justify-center mb-4">
            <FileText size={20} className="text-white" />
          </div>
          <p className="text-xs uppercase tracking-wider font-bold opacity-80">Total Invoice</p>
          <h3 className="text-2xl font-black mt-1">
            Rp{summary.totalInvoiceAkhir.toLocaleString('id-ID')}
          </h3>
          <p className="text-xs font-semibold opacity-75 mt-0.5">nilai akhir</p>
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-slate-500 text-xs flex gap-3 items-start">
        <AlertCircle size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
        <p className="leading-relaxed">
          Angka di atas mengakumulasi seluruh data sepanjang waktu (tanpa filter tanggal). 
          <b> Sisa Stok</b> = total sisa fisik tembakau di gudang, dihitung dari (total netto Buying yang belum di-reclass) + (total netto Reclass yang belum dikirim). 
          <b> Total Invoice</b> = jumlah Uang Sebesar (setelah PPh &amp; Materai &amp; Roundup) dari seluruh invoice yang tersimpan secara lokal.
        </p>
      </div>
    </div>
  );
};
