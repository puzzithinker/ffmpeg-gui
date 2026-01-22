# FFmpeg GUI - Tauri Edition

A beautiful, modern GUI for FFmpeg video processing built with Tauri 2.x, Rust, and React. Trim videos, burn subtitles, and process media with ease.

## ✨ Features

- **Video Trimming** - Visually select start and end times with an interactive timeline
- **Subtitle Burning** - Permanently embed subtitles into videos
- **Real-time Progress** - Live progress tracking during video processing
- **Process Cancellation** - Stop processing at any time with the cancel button ✨ NEW
- **Native Performance** - Built with Rust and Tauri for blazing-fast performance
- **Cross-platform** - Works on Windows, macOS, and Linux
- **System FFmpeg** - Uses your system's FFmpeg installation (no bundled binaries)
- **Startup Validation** - Automatically checks for FFmpeg availability ✨ NEW
- **Window Close Protection** - Prevents accidental closure during processing ✨ NEW

## 🚀 Quick Start

### Prerequisites

1. **FFmpeg and FFprobe** must be installed and available in your system PATH:
   - **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH
   - **macOS**: `brew install ffmpeg`
   - **Linux**: `sudo apt install ffmpeg`

2. **Development Dependencies**:
   - Node.js 18+ and npm
   - Rust 1.77.2+ (install from [rustup.rs](https://rustup.rs))

### Linux System Dependencies

On Linux, install these system libraries before building:

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl wget file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  pkg-config
```

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd ffmpeg-gui

# Install dependencies
npm install

# Start development server
npm run dev
```

## 🛠️ Development

### Available Scripts

- `npm run dev` - Start Tauri development server with hot reload
- `npm run build` - Build production installer
- `npm run dev:vite` - Start Vite dev server only (for frontend development)
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

### Project Structure

```
ffmpeg-gui/
├── src/                        # React frontend
│   ├── components/             # React components
│   │   ├── FileSelector.tsx   # Video/subtitle file selection
│   │   ├── VideoPreview.tsx   # Video player with preview
│   │   ├── Timeline.tsx        # Interactive trim timeline
│   │   ├── ProcessingPanel.tsx # Export controls & progress
│   │   └── ErrorAlert.tsx      # Error display
│   ├── lib/
│   │   └── tauri-api.ts       # Tauri API wrapper
│   ├── store/
│   │   └── useVideoStore.ts   # Zustand state management
│   └── types/                  # TypeScript type definitions
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── commands/           # Tauri command handlers
│   │   │   ├── dialog.rs      # File selection dialogs
│   │   │   ├── video.rs       # Duration & availability checks
│   │   │   └── process.rs     # FFmpeg processing & cancellation
│   │   ├── state.rs           # Job tracking state
│   │   └── lib.rs             # Main entry point
│   ├── Cargo.toml             # Rust dependencies
│   └── tauri.conf.json        # Tauri configuration
└── package.json               # Node dependencies
```

## 📖 Usage

1. **Select Video**: Click "Select Video File" and choose your input video
2. **Trim (Optional)**: Drag the timeline handles or enter precise times
3. **Add Subtitles (Optional)**: Click "Select Subtitle File" to burn subtitles
4. **Choose Output**: Click "Select output location" to choose where to save
5. **Process**: Click "Start Processing" to begin
6. **Monitor Progress**: Watch the progress bar update in real-time
7. **Cancel Anytime**: Click "Cancel Processing" to stop if needed

### Supported Formats

**Video Input**: MP4, AVI, MOV, MKV, WebM, FLV
**Subtitle Input**: SRT, VTT, ASS, SSA
**Video Output**: MP4, AVI, MOV, MKV, WebM

## 🏗️ Architecture

### Backend (Rust)

The Tauri backend provides 7 command handlers:

1. `select_video_file` - Opens native file dialog for video selection
2. `select_subtitle_file` - Opens native file dialog for subtitles
3. `select_output_file` - Opens native save dialog
4. `get_duration` - Extracts video duration using ffprobe
5. `check_ffmpeg_availability` - Validates FFmpeg/ffprobe installation
6. `process_video` - Spawns FFmpeg process with progress tracking
7. `cancel_process` - Kills running FFmpeg process by job ID

**Job-based Processing:**
- Each `process_video` call returns a unique UUID job ID
- Jobs are stored in a concurrent HashMap for cancellation
- Progress events are emitted with job ID for tracking
- Events: `ffmpeg-progress`, `ffmpeg-complete`, `ffmpeg-error`, `ffmpeg-cancelled`

### Frontend (React + TypeScript)

- **State Management**: Zustand for global state
- **Styling**: Tailwind CSS
- **UI Components**: Custom React components
- **Video Preview**: Uses Tauri's `convertFileSrc` for secure file access
- **Event Handling**: Listens to backend events for progress updates

## 🔒 Security

- **Sandboxed Renderer**: Frontend runs in a sandboxed environment
- **IPC Communication**: All native access through Tauri commands
- **Asset Protocol**: Uses Tauri's asset protocol for secure video preview
- **Input Validation**: Rust backend validates all file paths and parameters
- **No Node Integration**: Frontend has no direct system access

## 🐛 Troubleshooting

### FFmpeg Not Found

If you see "FFmpeg Not Found" on startup:
1. Install FFmpeg following the prerequisites above
2. Ensure `ffmpeg` and `ffprobe` are in your system PATH
3. Test from terminal: `ffmpeg -version` and `ffprobe -version`
4. Restart the terminal and application
5. Click "Retry" in the modal after installation

### Build Failures

**Linux**: Make sure all system dependencies are installed (see above)
```bash
# Install all dependencies at once
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev pkg-config
```

**macOS**: Install Xcode command line tools
```bash
xcode-select --install
```

**Windows**: Install Visual Studio Build Tools with C++ workload
- Download from: https://visualstudio.microsoft.com/downloads/

### Performance Issues

- Ensure you're using a recent version of FFmpeg (4.x or 5.x recommended)
- Check that your system has sufficient disk space for output files
- For large files (>2GB), consider trimming to smaller segments first
- Hardware acceleration depends on your FFmpeg build and system

### Process Won't Cancel

If the cancel button doesn't stop processing:
- The process may take a few seconds to terminate
- Check Task Manager/Activity Monitor for lingering ffmpeg processes
- Ensure you have the latest version of the app

## 📝 Migration from Electron

This project was migrated from Electron to Tauri 2.x in January 2026. Key improvements:

- ✅ **Smaller Bundle**: Removed 262 Electron packages
- ✅ **Better Security**: Rust backend with type-safe command handlers
- ✅ **Faster Startup**: Native Rust performance vs Node.js
- ✅ **Process Cancellation**: NEW - Stop processing anytime
- ✅ **Startup Validation**: NEW - FFmpeg check with helpful error messages
- ✅ **Window Protection**: NEW - Prevents accidental closure during processing
- ✅ **Better Error Handling**: Comprehensive validation and user-friendly messages

The Electron version is preserved in git tag `v1.0.0-electron` for reference.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

### Development Setup

1. Fork the repository
2. Install dependencies: `npm install`
3. Make your changes
4. Test thoroughly with `npm run dev`
5. Run type checking: `npm run type-check`
6. Run linter: `npm run lint`
7. Submit a pull request

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

- Built with [Tauri](https://tauri.app)
- Powered by [FFmpeg](https://ffmpeg.org)
- UI styled with [Tailwind CSS](https://tailwindcss.com)
- State management by [Zustand](https://github.com/pmndrs/zustand)
- Rust async runtime by [Tokio](https://tokio.rs)

---

**Note**: This application requires FFmpeg to be installed separately. It does not bundle FFmpeg to:
- Keep the application size small
- Respect FFmpeg's licensing requirements (GPL/LGPL)
- Allow users to use their preferred FFmpeg build (standard, full, with hardware acceleration, etc.)
