import React, { useState, useEffect } from 'react';
import { getCurrentSession, apiLogout } from './db';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { MasterHarga } from './components/MasterHarga';
import { PengaturanBarcode } from './components/PengaturanBarcode';
import { PrePrint } from './components/PrePrint';
import { ManajemenUser } from './components/ManajemenUser';
import { Diagnostik } from './components/Diagnostik';
import { Buying } from './components/Buying';
import { Reclass } from './components/Reclass';
import { Shipping } from './components/Shipping';
import { CetakInvoice } from './components/CetakInvoice';
import { Laporan } from './components/Laporan';
import { BackupSync } from './components/BackupSync';
import { MasterKonstanta } from './components/MasterKonstanta';
import { ResetData } from './components/ResetData';
import { PanduanPengguna } from './components/PanduanPengguna';
import { CreateBale } from './components/CreateBale';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';

import {
  Menu,
  X,
  LayoutDashboard,
  BookOpen,
  PackagePlus,
  ShoppingCart,
  Layers,
  Truck,
  DollarSign,
  Settings,
  Printer,
  Receipt,
  Users,
  Terminal,
  FileSpreadsheet,
  LogOut,
  UserCheck,
  Database,
  Scale,
  RotateCcw
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [currentView, setCurrentView] = useState('pageDashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Check initial session
  useEffect(() => {
    const session = getCurrentSession();
    if (session.loggedIn && session.user) {
      setCurrentUser(session.user);
    }
  }, []);

  useEffect(() => {
    const handleNav = (e: any) => {
      if (e.detail?.page) {
        setCurrentView(e.detail.page);
      }
    };
    window.addEventListener('iscs-navigate', handleNav);
    return () => window.removeEventListener('iscs-navigate', handleNav);
  }, []);

  // Sync back to dashboard if user has no permission to current view
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === 'admin') return;

    const access = Array.isArray(currentUser.menuAccess) ? currentUser.menuAccess : [];
    if (currentView !== 'pageDashboard' && !access.includes(currentView)) {
      // Check if it's a report tab
      const isReportTab = ['lapDailyBuying', 'lapBuying', 'lapReclass', 'lapShipping', 'lapInvoice', 'lapBvR', 'lapStok'].includes(currentView);
      if (isReportTab && access.includes('pageLaporan')) {
        return;
      }
      setCurrentView('pageDashboard');
    }
  }, [currentUser, currentView]);

  const handleLogout = () => {
    apiLogout();
    setCurrentUser(null);
    setCurrentView('pageDashboard');
  };

  if (!currentUser) {
    return <Login onLoginSuccess={(u) => setCurrentUser(u)} />;
  }

  // Sidebar link filtering
  const hasAccess = (viewId: string) => {
    if (currentUser.role === 'admin') return true;
    if (viewId === 'pageDashboard') return true;
    if (viewId === 'pagePanduan') return true;
    if (viewId === 'pageUsers') return false; // Admin only
    if (viewId === 'pageResetData') return false; // Admin only
    
    const access = Array.isArray(currentUser.menuAccess) ? currentUser.menuAccess : [];
    return access.includes(viewId);
  };

  const navItems = [
    { id: 'pageDashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'pageCreateBale', label: 'Buat Bale Baru', icon: <PackagePlus size={18} className="text-emerald-500" /> },
    { id: 'pageBuying', label: 'Timbang Buying', icon: <ShoppingCart size={18} /> },
    { id: 'pageReclass', label: 'Grading Reclass', icon: <Layers size={18} /> },
    { id: 'pageShipping', label: 'Pengiriman (Shipping)', icon: <Truck size={18} /> },
    { id: 'pageInvoice', label: 'Cetak Invoice', icon: <Receipt size={18} /> },
    { id: 'pageLaporan', label: 'Laporan & Export', icon: <FileSpreadsheet size={18} /> },
    { id: 'pageMaster', label: 'Master Harga', icon: <DollarSign size={18} /> },
    { id: 'pageKonstanta', label: 'Master Konstanta', icon: <Scale size={18} /> },
    { id: 'pageBarcode', label: 'Barcode & Printer', icon: <Settings size={18} /> },
    { id: 'pagePrePrint', label: 'Cetak Barcode Petani', icon: <Printer size={18} /> },
    { id: 'pageBackupSync', label: 'Backup & Sinkronisasi', icon: <Database size={18} /> },
    { id: 'pageResetData', label: 'Reset Semua Data', icon: <RotateCcw size={18} className="text-rose-500" /> },
    { id: 'pageUsers', label: 'Manajemen User', icon: <Users size={18} /> },
    { id: 'pageDiag', label: 'Diagnostik System', icon: <Terminal size={18} /> },
    { id: 'pagePanduan', label: 'Buku Panduan', icon: <BookOpen size={18} className="text-amber-400" /> }
  ].filter(item => hasAccess(item.id));

  const renderViewContent = () => {
    switch (currentView) {
      case 'pageDashboard':
        return <Dashboard />;
      case 'pageCreateBale':
        return <CreateBale currentUser={currentUser} />;
      case 'pagePanduan':
        return <PanduanPengguna />;
      case 'pageBuying':
        return <Buying currentUser={currentUser} />;
      case 'pageReclass':
        return <Reclass currentUser={currentUser} />;
      case 'pageShipping':
        return <Shipping currentUser={currentUser} />;
      case 'pageInvoice':
        return <CetakInvoice currentUser={currentUser} />;
      case 'pageLaporan':
        return (
          <Laporan
            currentUser={currentUser}
            permittedTabs={
              currentUser.role === 'admin'
                ? ['lapDailyBuying', 'lapBuying', 'lapReclass', 'lapShipping', 'lapInvoice', 'lapBvR', 'lapStok']
                : currentUser.menuAccess
            }
          />
        );
      case 'pageMaster':
        return <MasterHarga />;
      case 'pageKonstanta':
        return <MasterKonstanta />;
      case 'pageBarcode':
        return <PengaturanBarcode />;
      case 'pagePrePrint':
        return <PrePrint currentUser={currentUser} />;
      case 'pageUsers':
        return <ManajemenUser currentUser={currentUser} />;
      case 'pageBackupSync':
        return <BackupSync currentUser={currentUser} />;
      case 'pageResetData':
        return <ResetData currentUser={currentUser} />;
      case 'pageDiag':
        return <Diagnostik currentUser={currentUser} />;
      default:
        return <Dashboard />;
    }
  };

  const viewLabels: Record<string, string> = {
    pageDashboard: 'Dashboard Ringkasan',
    pageCreateBale: 'Buat Bale Baru (Masuk Stok)',
    pagePanduan: 'Buku Manual & Panduan Operasional',
    pageBuying: 'Transaksi Buying (Timbang Masuk)',
    pageReclass: 'Pemeriksaan Reclass (Grading)',
    pageShipping: 'Pengiriman Gudang (Shipping)',
    pageInvoice: 'Pembayaran & Kwitansi Invoice',
    pageLaporan: 'Laporan & Ekspor Data Excel',
    pageMaster: 'Daftar Master Harga Tembakau',
    pageKonstanta: 'Master Konstanta Potongan Timbangan',
    pageBarcode: 'Konfigurasi Format Barcode',
    pagePrePrint: 'Cetak Pre-Print Barcode Petani',
    pageBackupSync: 'Backup, Restore & Sinkronisasi Berkas',
    pageResetData: 'Pusat Reset Data Sistem',
    pageUsers: 'Manajemen Akun Operator',
    pageDiag: 'Diagnostik Engine'
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row relative font-sans text-slate-800">
      
      {/* Mobile Top Header Navigation */}
      <header className="md:hidden bg-slate-900 border-b border-slate-800 px-4 py-3 flex justify-between items-center text-white sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <span className="font-black tracking-wider text-amber-500 font-mono text-sm">ISCS ENGINE v2</span>
        </div>
        <div className="flex items-center gap-2">
          <PWAInstallButton compact />
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="text-white hover:text-amber-500 transition p-1"
          >
            {isSidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {/* Sidebar navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Sidebar Brand header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-black text-white text-md tracking-widest font-mono text-amber-500">ISCS CORE v2</span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">ISCS Engine v2</span>
          </div>
          <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setIsSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {/* User Info Capsule */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
            <UserCheck size={18} />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-white truncate">{currentUser.nama || currentUser.username}</h4>
            <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase mt-0.5 tracking-wider ${currentUser.role === 'admin' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-400'}`}>
              {currentUser.role}
            </span>
          </div>
        </div>

        {/* Sidebar Menu items scrollable */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 select-none">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentView(item.id);
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition duration-150 ${currentView === item.id ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/10' : 'hover:bg-slate-800/60 hover:text-white text-slate-400'}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Sidebar Footer install & logout buttons */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 space-y-2">
          <PWAInstallButton />
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-rose-900/40 hover:text-rose-400 text-slate-400 font-bold text-xs rounded-xl transition duration-150"
          >
            <LogOut size={14} />
            <span>Keluar Sesi</span>
          </button>
        </div>
      </aside>

      {/* Main content body wrapper */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <OfflineIndicator />
        <header className="bg-white border-b border-slate-100 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-xs hidden md:flex">
          <h2 className="text-sm font-extrabold text-slate-800 tracking-tight">
            {viewLabels[currentView] || 'Aplikasi ISCS'}
          </h2>
          <div className="flex items-center gap-3">
            <PWAInstallButton compact />
            <div className="text-xs font-mono font-bold text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              ISCS ENGINE v2 ACTIVE
            </div>
          </div>
        </header>

        {/* Screen layout page mount */}
        <div className="p-4 md:p-8 flex-1">
          {renderViewContent()}
        </div>
      </main>

      {/* Dim overlay for mobile drawer */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40 md:hidden"
        />
      )}
    </div>
  );
}
