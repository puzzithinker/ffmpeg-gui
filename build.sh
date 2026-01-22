#!/bin/bash
# FFmpeg GUI - Linux/macOS Build Script
# This script builds the Tauri application for Linux or macOS

set -e

echo "===================================="
echo "FFmpeg GUI - Build Script"
echo "===================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "ERROR: Rust is not installed or not in PATH"
    echo "Please install Rust from https://rustup.rs/"
    exit 1
fi

# Check if FFmpeg is available
if ! command -v ffmpeg &> /dev/null; then
    echo "WARNING: FFmpeg is not found in PATH"
    echo "The application will require FFmpeg to be installed"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "Install with: brew install ffmpeg"
    else
        echo "Install with: sudo apt install ffmpeg"
    fi
    echo ""
fi

# Check for Linux system dependencies
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Checking for required system libraries..."

    MISSING_DEPS=""

    if ! pkg-config --exists webkit2gtk-4.1; then
        MISSING_DEPS="$MISSING_DEPS libwebkit2gtk-4.1-dev"
    fi

    if ! pkg-config --exists gtk+-3.0; then
        MISSING_DEPS="$MISSING_DEPS libgtk-3-dev"
    fi

    if [ ! -z "$MISSING_DEPS" ]; then
        echo "ERROR: Missing required system libraries"
        echo "Please install them with:"
        echo "  sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \\"
        echo "    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev pkg-config"
        exit 1
    fi
fi

echo "Step 1: Installing Node dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Node dependencies"
    exit 1
fi

echo ""
echo "Step 2: Building Tauri application..."
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Build failed"
    exit 1
fi

echo ""
echo "===================================="
echo "Build completed successfully!"
echo "===================================="
echo ""
echo "The installer can be found in:"
echo "  src-tauri/target/release/bundle/"
echo ""

if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Available formats:"
    echo "  - macOS app bundle (.app)"
    echo "  - DMG installer (.dmg)"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Available formats:"
    echo "  - Debian package (.deb)"
    echo "  - AppImage (.AppImage)"
fi

echo ""
