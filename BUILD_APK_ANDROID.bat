@echo off
title ISCS Engine - Build APK Android (Capacitor)
color 0B
cd /d "%~dp0"

echo ========================================================
echo   ISCS STOCK CONTROL - BUILD APK ANDROID (CAPACITOR)
echo ========================================================
echo   File asli aplikasi PC / Server TIDAK diubah.
echo   Output APK: android\app\build\outputs\apk\debug\app-debug.apk
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js belum terinstall di Windows ini.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/4] Menginstall dependensi Node.js...
  call npm install
  if %errorlevel% neq 0 pause & exit /b 1
)

echo [2/4] Membangun aset web produksi (dist)...
call npm run build
if %errorlevel% neq 0 (
  echo [ERROR] Build web gagal!
  pause
  exit /b 1
)

echo [3/4] Menyinkronkan aset ke project Android (Capacitor)...
call npx cap sync android
if %errorlevel% neq 0 (
  echo [ERROR] Sinkronisasi Capacitor gagal!
  pause
  exit /b 1
)

echo [4/4] Mengcompile APK Android dengan Gradle...
if not exist "android\gradlew.bat" (
  echo [ERROR] Folder android\ belum tersedia. Jalankan: npx cap add android
  pause
  exit /b 1
)

where java >nul 2>nul
if %errorlevel% neq 0 (
  echo.
  echo [PERHATIAN] Java JDK / Android Studio belum terdeteksi di PATH Windows!
  echo Project Android sudah siap di folder: android\
  echo Silakan buka folder "android" menggunakan Android Studio,
  echo lalu pilih menu: Build ^> Build Bundle(s) / APK(s) ^> Build APK(s).
  pause
  exit /b 0
)

pushd android
call gradlew.bat assembleDebug
set BUILD_ERR=%errorlevel%
popd

if %BUILD_ERR% neq 0 (
  echo.
  echo [PERHATIAN] Compile Gradle gagal. Pastikan Android SDK ^& JAVA_HOME sudah terpasang
  echo atau buka folder "android" langsung melalui Android Studio.
  pause
  exit /b %BUILD_ERR%
)

if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
  copy /Y "android\app\build\outputs\apk\debug\app-debug.apk" "ISCS-Engine-Android.apk" >nul
  echo.
  echo ========================================================
  echo   SUKSES! File APK berhasil dibuat:
  echo   - %~dp0ISCS-Engine-Android.apk
  echo   - %~dp0android\app\build\outputs\apk\debug\app-debug.apk
  echo ========================================================
  echo   Pindahkan file ISCS-Engine-Android.apk ke HP Android untuk diinstall.
) else (
  echo [INFO] File APK belum ditemukan, silakan cek Android Studio.
)

pause
