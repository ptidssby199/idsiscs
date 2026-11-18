@echo off
setlocal enableextensions
cd /d "%~dp0"
title ISCS Engine v2 - Sistem Kontrol Stok Tembakau (Mode Cepat)
cls

echo =====================================================================
echo           ISCS STOCK CONTROL ENGINE v2 - PT INDO DEWATA SEMESTA
echo                   MODE INSTAN / CEPAT (1-2 DETIK)
echo =====================================================================
echo.

:: 1. Cek Node.js
call node -v >nul 2>&1
if errorlevel 1 goto NO_NODE

echo [OK] Node.js terdeteksi. Versi:
call node -v
echo.

:: 2. Cek apakah folder node_modules sudah ada
if exist "node_modules" goto NODE_MODULES_OK

echo [INFO] Folder node_modules belum ditemukan di folder ini.
echo Sedang mengunduh dan memasang modul dependencies pertama kali...
echo Mohon tunggu sebentar hingga proses selesai...
echo.
call npm install
if errorlevel 1 goto NPM_INSTALL_ERROR

echo [OK] Pemasangan dependencies selesai!
echo.

:NODE_MODULES_OK
:: 3. Cek apakah build produksi (dist) sudah siap
if exist "dist\server.cjs" goto START_SERVER_PRODUCTION

echo [INFO] Menyiapkan paket kompilasi produksi pertama kali (npm run build)...
echo Ini hanya dilakukan satu kali saja agar ke depannya aplikasi terbuka instan.
echo.
call npm run build
if errorlevel 1 goto BUILD_ERROR

:START_SERVER_PRODUCTION
:: 4. Buka browser otomatis
echo [INFO] Membuka browser ke http://localhost:3000 ...
start http://localhost:3000

:: 5. Jalankan server produksi instan (hanya butuh 1-2 detik)
echo.
echo =====================================================================
echo   Aplikasi AKTIF di http://localhost:3000
echo   Status : OFFLINE / STANDALONE (Bisa digunakan tanpa internet)
echo.
echo   * Jangan tutup jendela ini selama bekerja dengan aplikasi.
echo   * Jendela ini bisa Anda Minimize ke taskbar.
echo   * Untuk menghentikan aplikasi, tekan tombol Ctrl + C di sini.
echo =====================================================================
echo.

node dist\server.cjs
goto SELESAI

:NO_NODE
echo [ERROR] Node.js belum terpasang atau belum terbaca di sistem komputer ini!
echo.
echo Aplikasi ini membutuhkan Node.js agar dapat berjalan secara lokal di laptop/PC Anda.
echo Silakan unduh dan pasang Node.js versi LTS dari situs resmi:
echo https://nodejs.org/
echo.
echo Setelah instalasi Node.js selesai, silakan klik ganda kembali file ini.
goto SELESAI

:NPM_INSTALL_ERROR
echo.
echo [ERROR] Gagal memasang dependencies via npm install.
echo Pastikan komputer Anda terhubung ke internet saat pemasangan pertama kali.
goto SELESAI

:BUILD_ERROR
echo.
echo [ERROR] Gagal melakukan build kompilasi produksi.
echo Menjalankan dalam mode dev cadangan...
start http://localhost:3000
call npm run dev
goto SELESAI

:SELESAI
echo.
echo =====================================================================
echo Tekan tombol apa saja untuk menutup jendela ini...
echo =====================================================================
pause >nul
