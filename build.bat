@echo off
REM FFmpeg GUI - Windows Build Script
REM This script builds the Tauri application for Windows

echo ====================================
echo FFmpeg GUI - Windows Build Script
echo ====================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if Rust is installed
where cargo >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Rust is not installed or not in PATH
    echo Please install Rust from https://rustup.rs/
    pause
    exit /b 1
)

REM Check if FFmpeg is available
where ffmpeg >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: FFmpeg is not found in PATH
    echo The application will require FFmpeg to be installed
    echo Download from: https://ffmpeg.org/download.html
    echo.
)

echo Step 1: Installing Node dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install Node dependencies
    pause
    exit /b 1
)

echo.
echo Step 2: Building Tauri application...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo ====================================
echo Build completed successfully!
echo ====================================
echo.
echo The installer can be found in:
echo   src-tauri\target\release\bundle\
echo.
echo Available formats:
echo   - NSIS installer (.exe)
echo   - MSI installer (.msi)
echo.

pause
