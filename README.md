# FFmpeg GUI

A beautiful, modern desktop application for video processing using FFmpeg. Built with Electron, TypeScript, React, and Tailwind CSS.

## Features

- **Video Import & Preview**: Load and preview video files with native video controls
- **Interactive Timeline**: Visual timeline with drag-and-drop trimming controls
- **Subtitle Support**: Import and burn SRT, VTT, ASS, SSA subtitle files
- **Real-time Progress**: Live progress tracking during video processing
- **Modern UI**: Beautiful, responsive interface built with Tailwind CSS
- **Cross-platform**: Works on Windows, macOS, and Linux

## Prerequisites

Before running this application, ensure you have:

1. **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
2. **FFmpeg** installed and accessible in your system PATH
   - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html) or use `winget install FFmpeg`
   - macOS: `brew install ffmpeg`
   - Linux: `sudo apt install ffmpeg` (Ubuntu/Debian) or equivalent for your distribution

## Installation

1. Clone or download this repository
2. Open a terminal in the project directory
3. Install dependencies:
   ```bash
   npm install
   ```

## Development

### Option 1: Web Preview (UI Testing)
To test the UI and components without Electron:

```bash
npm run dev
```

This starts only the Vite dev server at http://localhost:5173. Perfect for UI development and testing the interface.

### Option 2: Full Electron App
To run the complete application with FFmpeg functionality:

```bash
npm run dev:full
```

This will:
- Start the Vite development server for the React frontend
- Launch the Electron application with hot reload enabled
- Enable full FFmpeg processing capabilities

**Note:** If you're in a Linux environment with Windows file mounts (like WSL), you may need to run the Electron app on Windows directly.

## Building

To build the application for production:

```bash
npm run build
```

To create distributable packages:

```bash
npm run build:electron
```

This will create installers in the `release/` directory.

## Usage

1. **Select Video File**: Click "Select Video File" to choose your input video
2. **Set Trim Points**: Use the interactive timeline to set start and end points for trimming
3. **Add Subtitles** (Optional): Click "Select Subtitle File" to add subtitles that will be burned into the video
4. **Choose Output**: Select where to save the processed video
5. **Process**: Click "Start Processing" to begin video processing

### Supported Formats

**Video Input**: MP4, AVI, MOV, MKV, WebM, FLV  
**Subtitle Input**: SRT, VTT, ASS, SSA  
**Video Output**: MP4, AVI, MOV, MKV

## Project Structure

```
ffmpeg-gui/
├── electron/           # Electron main process
│   ├── main.ts         # Main application window and IPC handlers
│   ├── preload.ts      # Preload script for secure IPC communication
│   └── tsconfig.json   # TypeScript config for Electron
├── src/                # React frontend
│   ├── components/     # UI components
│   ├── store/          # Zustand state management
│   ├── types/          # TypeScript type definitions
│   └── App.tsx         # Main React component
├── package.json        # Dependencies and scripts
├── vite.config.ts      # Vite configuration
└── tailwind.config.js  # Tailwind CSS configuration
```

## Technologies Used

- **Electron**: Desktop application framework
- **React**: UI library
- **TypeScript**: Type-safe JavaScript
- **Vite**: Fast build tool and development server
- **Tailwind CSS**: Utility-first CSS framework
- **Zustand**: Lightweight state management
- **FFmpeg**: Video processing backend

## Troubleshooting

### FFmpeg not found
If you get "FFmpeg not found" errors:
1. Ensure FFmpeg is installed on your system
2. Verify it's accessible from command line: `ffmpeg -version`
3. On Windows, ensure FFmpeg is in your PATH environment variable

### Video preview not working
- Some video formats may not preview in the browser but will still process correctly
- Try using MP4 files for best preview compatibility

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details