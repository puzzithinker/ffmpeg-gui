import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import VideoProcessor from './components/VideoProcessor'
import { tauriAPI } from './lib/tauri-api'
import { useVideoStore } from './store/useVideoStore'
import { logger } from './lib/logger'

function App() {
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null)
  const { isProcessing, currentJobId, setCurrentJobId, setProcessing, setProcessingProgress } = useVideoStore()

  // Check FFmpeg availability on startup
  useEffect(() => {
    const checkFFmpeg = async () => {
      try {
        const available = await tauriAPI.checkFfmpegAvailability()
        setFfmpegAvailable(available)
      } catch (error) {
        setFfmpegAvailable(false)
      }
    }

    checkFFmpeg()
  }, [])

  // Set up window close handler
  useEffect(() => {
    let unlisten: (() => void) | null = null
    let isClosing = false

    const setupCloseHandler = async () => {
      const appWindow = getCurrentWindow()

      unlisten = await appWindow.onCloseRequested(async (event) => {
        await logger.log('[App] Close requested')

        if (isClosing) {
          await logger.log('[App] Close already in progress')
          return
        }

        if (isProcessing && currentJobId) {
          event.preventDefault()
          await logger.log(`[App] Close blocked, processing job=${currentJobId}`)

          const shouldClose = window.confirm('Processing in progress. Cancel and close?')

          if (!shouldClose) {
            await logger.log('[App] Close cancelled by user')
            return
          }

          isClosing = true

          try {
            await tauriAPI.cancelProcess(currentJobId)
            setCurrentJobId(null)
            setProcessing(false)
            setProcessingProgress(null)
            await logger.log(`[App] Processing cancelled during close for job=${currentJobId}`)
          } catch (error) {
            console.error('Failed to cancel process:', error)
            await logger.error('[App] Failed to cancel during close', error)
          }

          if (unlisten) {
            unlisten()
            unlisten = null
          }
          await appWindow.close()
          return
        }

        // Not processing: let default close proceed
        isClosing = true
        await logger.log('[App] Closing window (no active job)')
        if (unlisten) {
          unlisten()
          unlisten = null
        }
      })
    }

    void setupCloseHandler()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [isProcessing, currentJobId, setCurrentJobId, setProcessing, setProcessingProgress])

  // Blocking modal if FFmpeg is not available
  if (ffmpegAvailable === false) {
    return (
      <div className="min-h-screen bg-gray-900 bg-opacity-75 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-red-500 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              FFmpeg Not Found
            </h2>
            <p className="text-gray-600 mb-6">
              This application requires FFmpeg and FFprobe to be installed and
              accessible from your system PATH.
            </p>
            <div className="bg-gray-50 rounded-md p-4 mb-6 text-left">
              <p className="text-sm font-medium text-gray-900 mb-2">
                Installation Instructions:
              </p>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>
                  <strong>Windows:</strong> Download from{' '}
                  <a
                    href="https://ffmpeg.org/download.html"
                    className="text-primary-500 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ffmpeg.org
                  </a>{' '}
                  and add to PATH
                </li>
                <li>
                  <strong>macOS:</strong> Run{' '}
                  <code className="bg-gray-200 px-1 rounded">
                    brew install ffmpeg
                  </code>
                </li>
                <li>
                  <strong>Linux:</strong> Run{' '}
                  <code className="bg-gray-200 px-1 rounded">
                    sudo apt install ffmpeg
                  </code>
                </li>
              </ul>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-primary-500 hover:bg-primary-600 text-white font-medium py-2 px-4 rounded-md"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Loading state
  if (ffmpegAvailable === null) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking system requirements...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 text-center">
            FFmpeg GUI
          </h1>
          <p className="text-gray-600 text-center mt-2">
            Trim videos and burn subtitles with ease
          </p>
        </header>
        <VideoProcessor />
      </div>
    </div>
  )
}

export default App
