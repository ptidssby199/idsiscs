import React, { useState } from 'react';
import {
  BookOpen,
  Search,
  Printer,
  CheckCircle,
  HelpCircle,
  Terminal,
  Database,
  Layers,
  ShoppingCart,
  Truck,
  Receipt,
  Scale,
  Settings,
  ArrowRight,
  Info,
  ShieldAlert,
  Download,
  DollarSign,
  Upload,
  FileSpreadsheet
} from 'lucide-react';

export function PanduanPengguna() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'buying' | 'reclass' | 'shipping' | 'invoice' | 'master' | 'system' | 'kiosk' | 'batch'>('all');

  const handleDownloadBat = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'application/x-bat' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const batContentStandard = `@echo off
setlocal enableextensions
cd /d "%~dp0"
title ISCS Engine v2 - Sistem Kontrol Stok Tembakau
cls

echo =====================================================================
echo           ISCS STOCK CONTROL ENGINE v2 - PT INDO DEWATA SEMESTA
echo =====================================================================
echo.

call node -v >nul 2>&1
if errorlevel 1 goto NO_NODE

echo [OK] Node.js terdeteksi. Versi:
call node -v
echo.

if exist "node_modules" goto NODE_MODULES_OK

echo [INFO] Folder node_modules belum ditemukan di folder ini.
echo Sedang mengunduh dan memasang modul dependencies pertama kali...
echo Mohon tunggu 1-2 menit hingga proses selesai...
echo.
call npm install
if errorlevel 1 goto NPM_INSTALL_ERROR

echo [OK] Pemasangan dependencies selesai!
echo.

:NODE_MODULES_OK
echo [INFO] Membuka browser ke http://localhost:3000 ...
start http://localhost:3000

echo.
echo =====================================================================
echo   Aplikasi sedang dijalankan di http://localhost:3000
echo   Jangan tutup jendela Command Prompt ini selama menggunakan aplikasi.
echo   Untuk menghentikan aplikasi, tekan tombol Ctrl + C di jendela ini.
echo =====================================================================
echo.

call npm run dev
goto SELESAI

:NO_NODE
echo [ERROR] Node.js belum terpasang atau belum terbaca di sistem komputer ini!
echo.
echo Aplikasi ini membutuhkan Node.js agar dapat berjalan secara lokal.
echo Silakan unduh dan pasang Node.js versi LTS dari situs resmi:
echo https://nodejs.org/
echo.
echo Setelah instalasi Node.js selesai, silakan klik ganda kembali file ini.
goto SELESAI

:NPM_INSTALL_ERROR
echo.
echo [ERROR] Gagal memasang dependencies via npm install.
echo Pastikan komputer Anda terhubung ke internet dan coba kembali.
goto SELESAI

:SELESAI
echo.
echo =====================================================================
echo Tekan tombol apa saja untuk menutup jendela ini...
echo =====================================================================
pause >nul`;

  const batContentKiosk = `@echo off
setlocal enableextensions
cd /d "%~dp0"
title ISCS Engine v2 - Mode KIOSK (Cetak Otomatis)
cls

echo =====================================================================
echo      ISCS ENGINE v2 - MODE KIOSK (LAYAR PENUH DAN SILENT PRINT)
echo =====================================================================
echo.

call node -v >nul 2>&1
if errorlevel 1 goto NO_NODE

echo [OK] Node.js terdeteksi. Versi:
call node -v
echo.

if exist "node_modules" goto NODE_MODULES_OK

echo [INFO] Folder node_modules belum ditemukan di folder ini.
echo Sedang memasang dependencies pertama kali...
call npm install
if errorlevel 1 goto NPM_INSTALL_ERROR

:NODE_MODULES_OK
set CHROME_EXE=""
if exist "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (
    set CHROME_EXE="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
)
if exist "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" (
    set CHROME_EXE="C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
)
if exist "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" (
    set CHROME_EXE="%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe"
)

if %CHROME_EXE%=="" goto CHROME_NOT_FOUND

echo [INFO] Menjalankan Google Chrome dalam Mode KIOSK...
start "" %CHROME_EXE% --kiosk --kiosk-printing http://localhost:3000
goto START_SERVER

:CHROME_NOT_FOUND
echo [PERINGATAN] Google Chrome tidak ditemukan di folder default.
echo Membuka di browser standar...
start http://localhost:3000

:START_SERVER
echo.
echo =====================================================================
echo   Aplikasi aktif di http://localhost:3000
echo   Tekan Alt + F4 pada Chrome untuk keluar dari mode layar penuh.
echo   Tekan Ctrl + C di jendela ini untuk menghentikan server.
echo =====================================================================
echo.

call npm run dev
goto SELESAI

:NO_NODE
echo [ERROR] Node.js belum terpasang di komputer ini!
echo Silakan unduh dan pasang Node.js versi LTS dari:
echo https://nodejs.org/
goto SELESAI

:NPM_INSTALL_ERROR
echo.
echo [ERROR] Gagal memasang dependencies via npm install.
goto SELESAI

:SELESAI
echo.
echo =====================================================================
echo Tekan tombol apa saja untuk menutup jendela ini...
echo =====================================================================
pause >nul`;

  const batContentBuild = `@echo off
setlocal enableextensions
cd /d "%~dp0"
title ISCS Engine v2 - Build dan Start Produksi
cls

echo =====================================================================
echo         ISCS ENGINE v2 - BUILD DAN START SERVER PRODUKSI
echo =====================================================================
echo.

call node -v >nul 2>&1
if errorlevel 1 goto NO_NODE

echo [OK] Node.js terdeteksi. Versi:
call node -v
echo.

if exist "node_modules" goto NODE_MODULES_OK

echo [INFO] Folder node_modules belum ditemukan di folder ini.
echo Sedang memasang modul dependencies pertama kali...
call npm install
if errorlevel 1 goto NPM_INSTALL_ERROR

:NODE_MODULES_OK
echo.
echo [1/2] Melakukan kompilasi build produksi (npm run build)...
call npm run build
if errorlevel 1 goto BUILD_ERROR

echo.
echo [2/2] Membuka browser ke http://localhost:3000 ...
start http://localhost:3000

echo.
echo =====================================================================
echo   Server Produksi berjalan di http://localhost:3000
echo   Jangan tutup jendela ini selama menggunakan aplikasi.
echo   Tekan Ctrl + C untuk menghentikan server.
echo =====================================================================
echo.

call npm start
goto SELESAI

:NO_NODE
echo [ERROR] Node.js belum terpasang atau belum terbaca di sistem komputer ini!
echo Silakan unduh dan pasang Node.js versi LTS dari:
echo https://nodejs.org/
goto SELESAI

:NPM_INSTALL_ERROR
echo.
echo [ERROR] Gagal memasang dependencies via npm install.
echo Pastikan koneksi internet aktif dan coba kembali.
goto SELESAI

:BUILD_ERROR
echo.
echo [ERROR] Proses kompilasi build produksi gagal!
goto SELESAI

:SELESAI
echo.
echo =====================================================================
echo Tekan tombol apa saja untuk menutup jendela ini...
echo =====================================================================
pause >nul`;

  const guides = [
    {
      id: 'batch',
      category: 'batch',
      title: 'File Batch (.BAT) - 1 Klik Jalankan di Windows Tanpa CMD',
      icon: <Terminal className="text-amber-500" size={20} />,
      summary: 'Cara termudah dan tercepat menyalakan aplikasi di Windows hanya dengan mengklik ganda (Double-Click) file .bat.',
      steps: [
        {
          num: 1,
          title: 'Klik Ganda "JALANKAN_APLIKASI.bat"',
          desc: 'Di folder utama aplikasi, klik ganda file "JALANKAN_APLIKASI.bat". File ini secara otomatis mendeteksi Node.js, menginstal modul jika belum ada, menyalakan server, dan langsung membuka browser ke http://localhost:3000 tanpa perlu Anda mengetik perintah apa pun di terminal.'
        },
        {
          num: 2,
          title: 'Untuk Pos Timbangan: "JALANKAN_KIOSK.bat"',
          desc: 'Untuk komputer di meja timbangan atau kasir pembayaran kwitansi, klik ganda file "JALANKAN_KIOSK.bat". File ini otomatis membuka Google Chrome dalam mode Layar Penuh (Kiosk) dan mengaktifkan fitur Cetak Langsung (Silent Printing) tanpa muncul jendela pop-up print Chrome.'
        },
        {
          num: 3,
          title: 'Buat Shortcut di Desktop',
          desc: 'Agar operator tidak perlu membuka-buka folder, klik kanan file JALANKAN_APLIKASI.bat -> pilih "Send to" -> "Desktop (create shortcut)". Operator cukup mengklik icon di desktop untuk mulai bekerja.'
        },
        {
          num: 4,
          title: 'Mematikan Aplikasi',
          desc: 'Jendela Command Prompt (layar hitam) akan tetap terbuka selama server berjalan. Untuk mematikannya, cukup tutup jendela tersebut dengan mengklik tombol silang (X) atau tekan Ctrl + C.'
        }
      ],
      tips: [
        'Komputer harus terpasang Node.js versi LTS (dapat diunduh gratis dari nodejs.org).',
        'Anda dapat mengunduh ulang file batch ini kapan saja lewat tombol download di bawah.'
      ]
    },
    {
      id: 'buying',
      category: 'buying',
      title: 'Tahap 1: Timbang Buying (Timbang Masuk)',
      icon: <ShoppingCart className="text-amber-500" size={20} />,
      summary: 'Proses penimbangan tembakau masuk dari petani dan pencatatan berat kotor (bruto).',
      steps: [
        {
          num: 1,
          title: 'Persiapan Barcode Petani',
          desc: 'Sebelum memulai penimbangan, pastikan petani sudah membawa Barcode Pre-Print yang telah dicetak dari menu "Cetak Barcode Petani". Barcode ini berisi nomor ID unik petani.'
        },
        {
          num: 2,
          title: 'Input Data Timbangan',
          desc: 'Masuk ke menu "Timbang Buying". Scan barcode petani atau cari namanya. Masukkan nilai timbangan Bruto (berat kotor). Sistem akan secara otomatis mengurangkan potongan konstanta (seperti berat keranjang kosong dan persentase potongan air/tali) untuk menghasilkan nilai Netto.'
        },
        {
          num: 3,
          title: 'Simpan & Cetak Barcode Keranjang',
          desc: 'Klik tombol "Simpan Transaksi". Printer barcode akan mencetak label barcode baru khusus untuk keranjang tersebut yang berisi kode transaksi buying, berat netto, dan nama petani. Tempelkan label ini secara erat pada keranjang tembakau.'
        }
      ],
      tips: [
        'Pastikan timbangan digital sudah dikalibrasi (di-tera) dan terhubung dengan baik jika menggunakan integrasi serial.',
        'Potongan konstanta standar diatur pada menu "Master Konstanta" (misal: berat keranjang = 8.5 kg, potongan admin = 1.5%).',
        'Fitur Backdate: Anda dapat memilih sendiri Tanggal Buying di kolom tanggal jika ingin menginput transaksi tanggal lampau/kemarin.',
        'Tanggal Generate Barcode Petani: Kode tanggal di nomor barcode (format DDMMYY) otomatis mengikuti "Tanggal Cetak" yang Anda pilih di menu Cetak Barcode Petani, termasuk ketika memilih tanggal cetak backdate/kemarin.'
      ]
    },
    {
      id: 'reclass',
      category: 'reclass',
      title: 'Tahap 2: Grading & Pemeriksaan Reclass',
      icon: <Layers className="text-blue-500" size={20} />,
      summary: 'Proses klasifikasi ulang grade (grading) dan berat timbangan di atas meja penguji.',
      steps: [
        {
          num: 1,
          title: 'Scan Barcode Keranjang',
          desc: 'Bawa keranjang tembakau ke meja pengujian reclass. Masuk ke menu "Grading Reclass", lalu arahkan barcode scanner ke label keranjang yang ditempel di Tahap 1. Data buying akan langsung muncul di layar.'
        },
        {
          num: 2,
          title: 'Penentuan Grade & Berat Uji',
          desc: 'Pemeriksa tembakau (Grader) akan menentukan kualitas grade tembakau. Masukkan Grade hasil uji (misal: Grade A, B+, C) dan lakukan penimbangan ulang di meja reclass untuk menginput berat netto reclass.'
        },
        {
          num: 3,
          title: 'Pemeriksaan Selisih (BvR)',
          desc: 'Sistem secara otomatis menghitung selisih berat antara saat Timbang Buying vs Grading Reclass (BvR). Jika selisih berada di luar batas toleransi (misalnya susut > 1.5 kg), sistem akan menampilkan indikator peringatan merah untuk mencegah manipulasi.'
        },
        {
          num: 4,
          title: 'Simpan Transaksi Reclass',
          desc: 'Klik "Simpan Reclass" untuk mengunci data grade dan berat final keranjang tersebut.'
        }
      ],
      tips: [
        'Jika keranjang salah di-scan, klik tombol "Reset Scanner" di layar untuk membersihkan input dan mengulangi scan.',
        'Data selisih Buying vs Reclass (BvR) sangat penting untuk memantau penyusutan tembakau selama proses antrean.',
        'Fitur Backdate: Tanggal Reclass dapat diatur manual ke tanggal lampau, dan tanggal tersebut otomatis tercetak pada label thermal.'
      ]
    },
    {
      id: 'shipping',
      category: 'shipping',
      title: 'Tahap 3: Pengiriman Gudang (Shipping)',
      icon: <Truck className="text-emerald-500" size={20} />,
      summary: 'Pengelompokan keranjang tembakau berdasarkan grade final untuk dikirim ke gudang pusat.',
      steps: [
        {
          num: 1,
          title: 'Pendaftaran Nomor Pengiriman (Surat Jalan)',
          desc: 'Masuk ke menu "Pengiriman (Shipping)". Klik "Buat Pengiriman Baru". Sistem akan menghasilkan Nomor Shipping unik dengan format otomatis (misal: SHIP-YYYYMMDD-XXXX).'
        },
        {
          num: 2,
          title: 'Scan Keranjang Masuk Truk',
          desc: 'Scan satu per satu barcode keranjang yang akan dimasukkan ke dalam truk pengiriman. Sistem akan memvalidasi bahwa hanya keranjang yang SUDAH melalui tahap Grading Reclass yang bisa masuk ke dalam manifes shipping.'
        },
        {
          num: 3,
          title: 'Verifikasi & Kunci Surat Jalan',
          desc: 'Setelah semua keranjang masuk, verifikasi total berat dan jumlah keranjang di layar. Klik "Kunci & Cetak Surat Jalan" untuk mencetak dokumen manifes pengiriman sebagai bukti jalan supir.'
        }
      ],
      tips: [
        'Keranjang yang sudah dimasukkan ke dalam daftar shipping tidak dapat diubah datanya di menu Buying atau Reclass kecuali status shipping dibatalkan/dihapus terlebih dahulu.',
        'Aturan Validasi Barcode: Hanya barcode yang SUDAH di-reclass yang dapat di-shipping. Barcode yang belum di-reclass akan ditolak oleh sistem dengan notifikasi peringatan.',
        'Gunakan cetak manifest ringkas untuk menghemat kertas saat penyerahan di gerbang gudang pusat.',
        'Fitur Backdate: Tanggal Surat Jalan / Shipping dapat disesuaikan ke tanggal lampau dan akan tercatat pada dokumen delivery notes Excel.',
        'Fitur Import Excel / CSV: Di form Shipping tersedia tombol "Import Excel / CSV" untuk mengimpor pengiriman massal dengan format: Tanggal Shipping, Tujuan, No Barcode, Grade, Berat (kg). Hanya barcode yang sudah di-reclass yang akan diproses, dan otomatis mengurangi stok aktif di gudang.'
      ]
    },
    {
      id: 'invoice',
      category: 'invoice',
      title: 'Tahap 4: Pembayaran & Cetak Invoice Kwitansi',
      icon: <Receipt className="text-violet-500" size={20} />,
      summary: 'Pencairan dana dan pencetakan bukti kwitansi resmi menggunakan kertas NCR 4-Ply.',
      steps: [
        {
          num: 1,
          title: 'Pencarian Data Pembayaran Petani',
          desc: 'Masuk ke menu "Cetak Invoice". Cari berdasarkan nama petani atau scan salah satu barcode keranjang milik petani tersebut. Sistem akan menampilkan seluruh keranjang miliknya yang sudah di-shipping dan siap dibayar.'
        },
        {
          num: 2,
          title: 'Penghitungan Nilai Invoice',
          desc: 'Sistem mengambil harga per kg berdasarkan "Master Harga" yang berlaku untuk masing-masing Grade Reclass keranjang tersebut. Total kotor, potongan admin, potongan timbangan, dan jumlah bersih yang harus dibayarkan akan dihitung secara real-time.'
        },
        {
          num: 3,
          title: 'Pemilihan Font Cetakan (NCR 4-Ply)',
          desc: 'Sebelum menekan tombol cetak, pilih font cetakan yang sesuai. Untuk printer Dot-Matrix (seperti Epson LX-310) dengan kertas karbon 4-Ply, disarankan memilih opsi **"Dot Matrix Standard (Courier New)"** agar huruf tercetak tebal, sejajar, dan tembus tajam hingga ply paling bawah.'
        },
        {
          num: 4,
          title: 'Cetak Kwitansi & Bayar',
          desc: 'Klik tombol "Cetak Kwitansi / Invoice". Invoice akan dicetak. Lakukan pembayaran fisik uang kepada petani dan minta tanda tangan di atas kertas cetakan tersebut.'
        }
      ],
      tips: [
        'Kwitansi yang sudah dicetak akan berubah statusnya menjadi PAID. Jika terjadi kesalahan input, admin berhak melakukan proses VOID dengan memasukkan PIN Otorisasi Admin.',
        'Satu lembar kwitansi dapat menggabungkan beberapa keranjang sekaligus dari petani yang sama untuk efisiensi kertas.'
      ]
    },
    {
      id: 'master',
      category: 'master',
      title: 'Master Data Harga & Import Excel (Buying & Reclass)',
      icon: <DollarSign className="text-teal-600" size={20} />,
      summary: 'Kelola harga resmi per kg per grade untuk transaksi Buying dan Reclass, serta cara impor massal via file Excel / CSV.',
      steps: [
        {
          num: 1,
          title: 'Format Kolom File Import Excel',
          desc: 'Untuk mengimpor harga secara massal, siapkan file Excel (.xlsx / .xls) atau CSV dengan kolom: **Tipe** (BUYING atau RECLASS), **Type** (mis. VIRGINIA), **Sub Type** (mis. LOKAL), **Crop Year** (mis. 2026), **Grade** (mis. A, B, C, SL1, ML1), dan **Harga (Rp/kg)**.'
        },
        {
          num: 2,
          title: 'Download Template Resmi',
          desc: 'Pada menu "Master Harga", klik tombol "Import Excel / CSV", kemudian klik tombol "Download Template". File contoh berformat .xlsx yang siap Anda edit akan otomatis terunduh.'
        },
        {
          num: 3,
          title: 'Pilihan Metode: Update & Tambah vs Ganti Semua',
          desc: 'Sistem menyediakan dua opsi import: (1) **Update & Tambah Baru** (Rekomendasi) untuk memperbarui harga grade yang cocok sekaligus menambahkan grade baru tanpa menghapus data lain, dan (2) **Ganti Semua (Replace All)** jika ingin mereset seluruh daftar harga lama dan menggantinya 100% dengan data file.'
        },
        {
          num: 4,
          title: 'Export Data Master ke Excel',
          desc: 'Anda dapat mengklik tombol "Export ke Excel (.xlsx)" kapan saja untuk mencadangkan daftar harga master yang sedang berlaku atau mengeditnya di Excel sebelum diunggah kembali.'
        }
      ],
      tips: [
        'Daftar Harga Buying dan Reclass bersifat independen. Grade yang sama (misal Grade A) dapat memiliki harga berbeda antara saat timbang masuk (Buying) dan saat grading sortir (Reclass).',
        'Data master harga langsung tersimpan permanen di IndexedDB komputer Anda dan otomatis digunakan sebagai referensi penghitungan nilai nota timbang serta kwitansi invoice.'
      ]
    },
    {
      id: 'system',
      category: 'system',
      title: 'Sistem Penyimpanan & Backup Data (Hybrid Storage)',
      icon: <Database className="text-cyan-500" size={20} />,
      summary: 'Memahami bagaimana data Anda disimpan dengan aman menggunakan perpaduan IndexedDB + LocalStorage.',
      steps: [
        {
          num: 1,
          title: 'Sistem Penyimpanan Tanpa Batas (IndexedDB)',
          desc: 'Aplikasi ini menggunakan teknologi Hybrid Storage terbaru. Semua data transaksi, master harga, dan log disimpan di dalam IndexedDB komputer lokal Anda. Berbeda dengan LocalStorage biasa yang dibatasi maksimal 5 MB, IndexedDB mendukung kapasitas penyimpanan ratusan Megabyte hingga Gigabyte secara gratis dan aman.'
        },
        {
          num: 2,
          title: 'Pencadangan Rutin (Backup)',
          desc: 'Sangat disarankan untuk masuk ke menu "Backup & Sinkronisasi" di akhir hari kerja. Klik "Ekspor Backup Database (.json)" untuk mengunduh seluruh data aplikasi ke dalam satu file cadangan. Simpan file ini di Flashdisk atau Google Drive.'
        },
        {
          num: 3,
          title: 'Pemulihan Data (Restore)',
          desc: 'Jika komputer Anda rusak atau Anda ingin pindah komputer, cukup buka aplikasi ini di komputer baru, masuk ke menu "Backup & Sinkronisasi", klik "Pilih File Backup", masukkan file cadangan .json yang Anda simpan, dan klik "Restore Database". Seluruh data akan kembali dalam sekejap.'
        }
      ],
      tips: [
        'Jangan pernah menghapus "Clear Browsing Data / Cookies" secara menyeluruh sebelum melakukan ekspor backup, karena browser dapat menghapus database lokal jika Anda memilih opsi hapus semua data situs.',
        'Gunakan file ZIP Backup yang disediakan di root folder aplikasi jika Anda ingin menduplikasi seluruh kode sumber dan database sekaligus.'
      ]
    },
    {
      id: 'kiosk',
      category: 'kiosk',
      title: 'Konfigurasi Chrome Kiosk & Cetak Otomatis (Silent Printing)',
      icon: <Terminal className="text-slate-600" size={20} />,
      summary: 'Langkah konfigurasi agar aplikasi berjalan dalam mode layar penuh (Kiosk) dan mencetak langsung tanpa dialog print Chrome.',
      steps: [
        {
          num: 1,
          title: 'Siapkan Shortcut Google Chrome',
          desc: 'Klik kanan pada desktop Windows Anda, pilih "New" -> "Shortcut". Atau salin shortcut Chrome yang sudah ada.'
        },
        {
          num: 2,
          title: 'Edit Target Path Shortcut',
          desc: 'Klik kanan pada Shortcut tersebut, pilih "Properties". Pada kolom "Target", geser ke bagian paling ujung kanan setelah tanda kutip terakhir, berikan spasi satu kali, lalu tempelkan parameter berikut:\n\n--kiosk --kiosk-printing "https://ais-dev-nhjchvordk5f4tvscva6g2-945544937231.asia-southeast1.run.app"'
        },
        {
          num: 3,
          title: 'Konfigurasi Printer Standar',
          desc: 'Pastikan printer Dot Matrix (Epson LX-310 / sejenisnya) sudah terpasang, terhubung, dan dijadikan sebagai "Default Printer" di Windows Control Panel Anda.'
        },
        {
          num: 4,
          title: 'Jalankan Mode Kiosk',
          desc: 'Tutup seluruh jendela Chrome yang sedang terbuka terlebih dahulu (penting agar parameter baru aktif). Kemudian klik ganda pada shortcut baru tersebut. Chrome akan terbuka dalam mode layar penuh dan setiap kali Anda menekan tombol "Cetak" di aplikasi, kwitansi akan langsung tercetak ke printer Dot-Matrix tanpa dialog pop-up print!'
        }
      ],
      tips: [
        'Untuk keluar dari mode layar penuh Kiosk Chrome, tekan tombol **Alt + F4** di keyboard Anda.',
        'Pada pengaturan Cetakan awal Chrome (tekan Ctrl + P sekali sebelum mengaktifkan Kiosk), pastikan opsi "Headers and Footers" dikesampingkan (uncheck) dan "Margins" diatur ke "None" agar cetakan bersih dari tulisan tanggal/URL di tepi kertas.'
      ]
    }
  ];

  const filteredGuides = guides.filter((g) => {
    const matchTab = activeTab === 'all' || g.category === activeTab;
    const matchSearch =
      g.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.steps.some(s => s.title.toLowerCase().includes(searchTerm.toLowerCase()) || s.desc.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchTab && matchSearch;
  });

  return (
    <div id="manualBookArea" className="space-y-6">
      
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden border border-indigo-500/20">
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <BookOpen size={240} className="text-white" />
        </div>
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/30 px-3 py-1 rounded-full text-xs text-indigo-300 font-bold mb-3">
            <BookOpen size={14} />
            <span>PANDUAN OPERASIONAL RESMI</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mb-2">Buku Manual &amp; Handoff Sistem</h1>
          <p className="text-slate-300 text-xs leading-relaxed">
            Selamat datang di Pusat Panduan ISCS Stock Control Engine v2. Temukan petunjuk langkah-demi-langkah, solusi kendala cetak NCR 4-Ply, konfigurasi Kiosk, dan pengelolaan data harian di bawah ini.
          </p>
        </div>
      </div>

      {/* Control Panel: Search & Filter Tabs */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row gap-3 justify-between items-center">
          
          {/* Search bar */}
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Cari topik panduan atau langkah..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
            />
          </div>

          {/* Quick print manual button */}
          <button
            onClick={() => window.print()}
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            <Printer size={15} />
            <span>Cetak Panduan Ini</span>
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            Semua Panduan
          </button>
          <button
            onClick={() => setActiveTab('buying')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'buying' ? 'bg-amber-500 text-slate-950' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            1. Timbang Buying
          </button>
          <button
            onClick={() => setActiveTab('reclass')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'reclass' ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            2. Grading Reclass
          </button>
          <button
            onClick={() => setActiveTab('shipping')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'shipping' ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            3. Pengiriman
          </button>
          <button
            onClick={() => setActiveTab('invoice')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'invoice' ? 'bg-violet-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            4. Kwitansi Invoice
          </button>
          <button
            onClick={() => setActiveTab('master')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'master' ? 'bg-teal-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            5. Master Harga
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'system' ? 'bg-cyan-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            Hybrid Storage &amp; Backup
          </button>
          <button
            onClick={() => setActiveTab('batch')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'batch' ? 'bg-amber-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            File Batch (.BAT) 1-Klik
          </button>
          <button
            onClick={() => setActiveTab('kiosk')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'kiosk' ? 'bg-slate-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            Chrome Kiosk &amp; Print Setup
          </button>
        </div>
      </div>

      {/* Direct Download .BAT Files Banner */}
      <div className="bg-gradient-to-br from-amber-500/10 via-white to-amber-500/5 p-5 rounded-2xl border border-amber-300/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-3 bg-amber-600 text-white rounded-xl shadow-md">
            <Terminal size={22} />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 text-sm">Unduh File Launcher Windows (.BAT)</h4>
            <p className="text-slate-600 text-xs mt-0.5 leading-relaxed">
              Jalankan aplikasi di komputer kasir/timbangan tanpa membuka terminal. Tinggal klik 2x, server dan browser langsung terbuka otomatis!
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={() => handleDownloadBat('JALANKAN_APLIKASI.bat', batContentStandard)}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs"
          >
            <Download size={14} />
            <span>JALANKAN_APLIKASI.bat</span>
          </button>
          <button
            onClick={() => handleDownloadBat('JALANKAN_KIOSK.bat', batContentKiosk)}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
          >
            <Download size={14} />
            <span>JALANKAN_KIOSK.bat</span>
          </button>
          <button
            onClick={() => handleDownloadBat('BUILD_DAN_START.bat', batContentBuild)}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition shadow-xs"
          >
            <Download size={14} />
            <span>BUILD_DAN_START.bat</span>
          </button>
        </div>
      </div>

      {/* Guide List Rendering */}
      <div className="space-y-6 print:space-y-12">
        {filteredGuides.length > 0 ? (
          filteredGuides.map((guide) => (
            <div
              key={guide.id}
              className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition duration-150 hover:shadow-md print:border-none print:shadow-none"
            >
              {/* Header Box */}
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-start gap-3.5">
                <div className="p-2.5 bg-white rounded-xl shadow-xs border border-slate-200">
                  {guide.icon}
                </div>
                <div className="space-y-1">
                  <h3 className="font-extrabold text-slate-900 text-sm tracking-tight">{guide.title}</h3>
                  <p className="text-slate-500 text-xs leading-relaxed">{guide.summary}</p>
                </div>
              </div>

              {/* Steps Body */}
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Langkah Alur Kerja:</span>
                    <div className="space-y-4">
                      {guide.steps.map((step) => (
                        <div key={step.num} className="flex gap-3">
                          <div className="flex-none w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-black flex items-center justify-center shadow-sm">
                            {step.num}
                          </div>
                          <div className="space-y-1 pt-0.5">
                            <h4 className="text-xs font-bold text-slate-800">{step.title}</h4>
                            <p className="text-slate-600 text-xs leading-relaxed whitespace-pre-line">{step.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommendations & Tips */}
                  <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200/60 px-3 py-1.5 rounded-lg">
                        <Info size={15} />
                        <span className="text-xs font-bold">Rekomendasi &amp; Tips Lapangan</span>
                      </div>
                      <ul className="space-y-3">
                        {guide.tips.map((tip, idx) => (
                          <li key={idx} className="flex gap-2.5 text-xs text-slate-600 leading-relaxed">
                            <CheckCircle size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Footer decoration */}
                    <div className="border-t border-slate-200/60 pt-4 mt-4 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>ISCS DOC-ID: {guide.id.toUpperCase()}-02</span>
                      <span className="text-emerald-500 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                        Terverifikasi Lapangan
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
            <HelpCircle className="mx-auto text-slate-300" size={48} />
            <h3 className="font-bold text-slate-700 text-sm">Topik tidak ditemukan</h3>
            <p className="text-slate-400 text-xs">Coba gunakan kata kunci pencarian lain atau pilih kategori tab di atas.</p>
          </div>
        )}
      </div>

      {/* Troubleshooting Q&A Bento Box */}
      <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-amber-900 font-extrabold text-sm">
          <ShieldAlert className="text-amber-600" size={20} />
          <span>Troubleshooting &amp; Pertanyaan Sering Ditanyakan (FAQ)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-700">
          <div className="bg-white p-4 rounded-xl border border-amber-200/60 space-y-1.5">
            <span className="font-bold text-slate-900">Q: Bagaimana jika printer Dot-Matrix mencetak lambat atau font-nya berantakan?</span>
            <p className="text-slate-600 leading-relaxed">
              A: Pastikan Anda memilih opsi font **Courier New** sebelum mencetak. Font Arial/Sans cenderung dicetak sebagai gambar (graphics mode) yang lambat oleh Dot-Matrix, sedangkan **Courier New / Monospace** menggunakan built-in font hardware printer yang sangat cepat dan tajam.
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-amber-200/60 space-y-1.5">
            <span className="font-bold text-slate-900">Q: Apakah data saya akan hilang jika browser atau komputer dimatikan?</span>
            <p className="text-slate-600 leading-relaxed">
              A: **Tidak.** Dengan sistem Hybrid Storage, data Anda langsung disimpan ke dalam IndexedDB di harddisk lokal secara otomatis setiap kali ada transaksi baru. Lakukan ekspor backup (.json) secara harian sebagai tindakan pencegahan ekstra.
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-amber-200/60 space-y-1.5">
            <span className="font-bold text-slate-900">Q: Bagaimana cara menghubungkan beberapa komputer timbangan ke satu database (LAN)?</span>
            <p className="text-slate-600 leading-relaxed">
              A: Buka menu "Backup &amp; Sinkronisasi". Aktifkan mode penyimpanan **"Server Lokal (LAN)"** dan isi alamat IP server pusat Anda. Sistem akan melakukan polling data secara otomatis setiap 30 detik untuk menyamakan database.
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-amber-200/60 space-y-1.5">
            <span className="font-bold text-slate-900">Q: Mengapa barcode keranjang tidak bisa di-scan di tahap Reclass?</span>
            <p className="text-slate-600 leading-relaxed">
              A: Pastikan keranjang tersebut sudah terdaftar di menu "Timbang Buying". Jika sudah tapi tetap gagal, bersihkan scanner Anda dari debu tembakau, atau ketikkan nomor barcode secara manual pada kolom pencarian.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
