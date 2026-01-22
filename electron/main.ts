const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  // Use absolute path to ensure preload script is found
  const preloadPath = isDev 
    ? path.join(process.cwd(), 'dist', 'preload.js')
    : path.join(__dirname, 'preload.js')
  
  console.log('Preload script path:', preloadPath)
  console.log('__dirname:', __dirname)
  console.log('process.cwd():', process.cwd())
  
  // Check if preload file exists
  const fs = require('fs')
  console.log('Preload file exists:', fs.existsSync(preloadPath))
  
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
    titleBarStyle: 'default',
    show: false,
  })

  if (isDev) {
    console.log('Loading development URL: http://127.0.0.1:5173')
    mainWindow.loadURL('http://127.0.0.1:5173')
    mainWindow.webContents.openDevTools()
    
    // Add error handling for URL loading
    mainWindow.webContents.on('did-fail-load', (event: any, errorCode: any, errorDescription: any, validatedURL: any) => {
      console.error('Failed to load URL:', validatedURL, 'Error:', errorDescription)
    })
  } else {
    const htmlPath = path.join(__dirname, '..', 'index.html')
    console.log('Loading production file:', htmlPath)
    console.log('File exists:', fs.existsSync(htmlPath))
    
    if (fs.existsSync(htmlPath)) {
      mainWindow.loadFile(htmlPath)
    } else {
      // Fallback: try to load from different locations
      const altPath = path.join(__dirname, 'index.html')
      console.log('Trying alternative path:', altPath)
      console.log('Alt file exists:', fs.existsSync(altPath))
      if (fs.existsSync(altPath)) {
        mainWindow.loadFile(altPath)
      } else {
        console.error('Could not find index.html in any expected location')
        // Create a simple HTML page as fallback
        const fallbackHtml = `
          <!DOCTYPE html>
          <html>
          <head><title>FFmpeg GUI</title></head>
          <body><h1>FFmpeg GUI</h1><p>Production build loading issue. Please check console.</p></body>
          </html>
        `
        mainWindow.loadURL('data:text/html,' + encodeURIComponent(fallbackHtml))
      }
    }
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  return mainWindow
}

app.whenReady().then(() => {
  // Register custom protocol for serving local video files
  protocol.registerFileProtocol('safe-file', (request: any, callback: any) => {
    const url = request.url.substr(10) // Remove 'safe-file:' prefix
    callback({ path: path.normalize(decodeURIComponent(url)) })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC handlers for file operations
ipcMain.handle('select-video-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled) {
    return null
  }

  return result.filePaths[0]
})

// Get video data URL for preview
ipcMain.handle('get-video-url', async (_event: any, filePath: string) => {
  try {
    // For large video files, we'll use the safe-file protocol instead
    return `safe-file:${filePath}`
  } catch (error) {
    console.error('Error creating video URL:', error)
    return null
  }
})

ipcMain.handle('select-subtitle-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Subtitle Files', extensions: ['srt', 'vtt', 'ass', 'ssa'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled) {
    return null
  }

  return result.filePaths[0]
})

ipcMain.handle('select-output-file', async (_event: any) => {
  const result = await dialog.showSaveDialog({
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'avi', 'mov', 'mkv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled) {
    return null
  }

  return result.filePath
})

// FFmpeg processing
ipcMain.handle('process-video', async (event: any, options: {
  inputFile: string
  outputFile: string
  startTime?: number
  endTime?: number
  subtitleFile?: string
}) => {
  return new Promise<{ success: boolean }>((resolve, reject) => {
    const { inputFile, outputFile, startTime, endTime, subtitleFile } = options
    
    let ffmpegArgs = ['-i', inputFile]
    
    if (startTime !== undefined && endTime !== undefined) {
      ffmpegArgs.push('-ss', startTime.toString())
      ffmpegArgs.push('-to', endTime.toString())
    }
    
    if (subtitleFile) {
      ffmpegArgs.push('-vf', `subtitles=${subtitleFile}`)
    }
    
    ffmpegArgs.push('-c:v', 'libx264')
    ffmpegArgs.push('-c:a', 'aac')
    ffmpegArgs.push(outputFile)

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: 'pipe' })
    
    let errorOutput = ''
    
    ffmpeg.stderr.on('data', (data: Buffer) => {
      const output = data.toString()
      errorOutput += output
      
      // Parse progress from FFmpeg output
      const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/)
      if (timeMatch) {
        const [, hours, minutes, seconds] = timeMatch
        const currentTime = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds)
        event.sender.send('ffmpeg-progress', currentTime)
      }
    })

    ffmpeg.on('close', (code: number | null) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        reject(new Error(`FFmpeg process exited with code ${code}: ${errorOutput}`))
      }
    })

    ffmpeg.on('error', (err: Error) => {
      reject(err)
    })
  })
})

// Get video duration
ipcMain.handle('get-video-duration', async (_event: any, filePath: string) => {
  return new Promise<number>((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath
    ], { stdio: 'pipe' })

    let output = ''
    
    ffprobe.stdout.on('data', (data: Buffer) => {
      output += data.toString()
    })

    ffprobe.on('close', (code: number | null) => {
      if (code === 0) {
        try {
          const info = JSON.parse(output)
          const duration = parseFloat(info.format.duration)
          resolve(duration)
        } catch (error) {
          reject(error)
        }
      } else {
        reject(new Error(`ffprobe process exited with code ${code}`))
      }
    })

    ffprobe.on('error', (err: Error) => {
      reject(err)
    })
  })
})