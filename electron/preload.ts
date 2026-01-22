const { contextBridge, ipcRenderer } = require('electron')

console.log('=== PRELOAD SCRIPT LOADING ===')

const electronAPI = {
  selectVideoFile: () => ipcRenderer.invoke('select-video-file'),
  selectSubtitleFile: () => ipcRenderer.invoke('select-subtitle-file'),
  selectOutputFile: () => ipcRenderer.invoke('select-output-file'),
  processVideo: (options: any) => ipcRenderer.invoke('process-video', options),
  getVideoDuration: (filePath: string) => ipcRenderer.invoke('get-video-duration', filePath),
  getVideoUrl: (filePath: string) => ipcRenderer.invoke('get-video-url', filePath),
  onFFmpegProgress: (callback: (time: number) => void) => {
    ipcRenderer.on('ffmpeg-progress', (_: any, time: number) => callback(time))
  }
}

try {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  console.log('=== PRELOAD SUCCESS: electronAPI exposed ===')
} catch (error) {
  console.error('=== PRELOAD ERROR ===', error)
}