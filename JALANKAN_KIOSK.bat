@echo off
setlocal enableextensions
cd /d "%~dp0"
title ISCS Engine v2 - Mode KIOSK (Cetak Otomatis Cepat)
cls

echo =====================================================================
echo      ISCS ENGINE v2 - MODE KIOSK (LAYAR PENUH DAN SILENT PRINT)
echo                    MODE PRODUKSI CEPAT (1-2 DETIK)
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
echo Sedang memasang dependencies pertama kali...
call npm install
if errorlevel 1 goto NPM_INSTALL_ERROR

:NODE_MODULES_OK
:: 3. Cek apakah build produksi (dist) sudah siap
if exist "dist\server.cjs" goto LAUNCH_CHROME_KIOSK

echo [INFO] Menyiapkan paket kompilasi produksi pertama kali (npm run build)...
call npm run build
if errorlevel 1 goto BUILD_ERROR

:LAUNCH_CHROME_KIOSK
:: 4. Cari lokasi Google Chrome di Windows
set CHROME_EXE=""
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set CHROME_EXE="C:\Program Files\Google\Chrome\Application\chrome.exe"
)
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set CHROME_EXE="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set CHROME_EXE="%LocalAppData%\Google\Chrome\Application\chrome.exe"
)

:: 5. Buka Chrome Mode Kiosk
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
echo   Aplikasi aktif di http://localhost:3000 (Mode Kiosk Cepat)
echo   Tekan Alt + F4 pada Chrome untuk keluar dari mode layar penuh.
echo   Tekan Ctrl + C di jendela ini untuk menghentikan server.
echo =====================================================================
echo.

node dist\server.cjs
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

:BUILD_ERROR
echo.
echo [ERROR] Gagal melakukan build kompilasi produksi.
start http://localhost:3000
call npm run dev
goto SELESAI

:SELESAI
echo.
echo =====================================================================
echo Tekan tombol apa saja untuk menutup jendela ini...
echo =====================================================================
pause >nul
