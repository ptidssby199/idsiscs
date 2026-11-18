@echo off
setlocal enableextensions
cd /d "%~dp0"
title ISCS Engine v2 - Build dan Start Produksi
cls

echo =====================================================================
echo         ISCS ENGINE v2 - BUILD DAN START SERVER PRODUKSI
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
pause >nul
