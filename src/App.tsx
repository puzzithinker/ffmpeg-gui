import React from 'react'
import VideoProcessor from './components/VideoProcessor'

function App() {
  const isElectron = !!window.electronAPI

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
          {!isElectron && (
            <div className="mt-4 mx-auto max-w-md bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
              <p className="text-sm text-center">
                ⚠️ Preview mode - Run <code className="bg-yellow-200 px-1 rounded">npm run dev</code> to use full functionality
              </p>
            </div>
          )}
        </header>
        <VideoProcessor />
      </div>
    </div>
  )
}

export default App