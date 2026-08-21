import React from 'react'
import { useVideoStore } from '../store/useVideoStore'
import { tauriAPI } from '../lib/tauri-api'
import { logger } from '../lib/logger'
import { applySubtitlePath, applyVideoPath } from '../lib/media'

const FileSelector: React.FC = () => {
  const mode = useVideoStore((s) => s.mode)
  const videoFile = useVideoStore((s) => s.videoFile)
  const subtitleFile = useVideoStore((s) => s.subtitleFile)
  const setVideoFile = useVideoStore((s) => s.setVideoFile)
  const setSubtitleFile = useVideoStore((s) => s.setSubtitleFile)
  const setError = useVideoStore((s) => s.setError)
  const setTrimSettings = useVideoStore((s) => s.setTrimSettings)
  const isEditingSubtitles = useVideoStore((s) => s.isEditingSubtitles)
  const setIsEditingSubtitles = useVideoStore((s) => s.setIsEditingSubtitles)
  const clearSubtitleEdit = useVideoStore((s) => s.clearSubtitleEdit)

  const handleVideoSelect = async () => {
    try {
      await logger.log('[FileSelector] Starting video file selection...')
      const filePath = await tauriAPI.selectVideoFile()
      await logger.log(`[FileSelector] Selected file path: ${filePath}`)

      if (filePath) {
        await applyVideoPath(filePath)
        await logger.log('[FileSelector] Video file loaded successfully')
      }
    } catch (error) {
      await logger.error('[FileSelector] Error loading video', error)
      setError(`Failed to load video: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleSubtitleSelect = async () => {
    try {
      const filePath = await tauriAPI.selectSubtitleFile()
      if (filePath) {
        await applySubtitlePath(filePath, isEditingSubtitles)
      }
    } catch (error) {
      setError(`Failed to load subtitle: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleRemoveVideo = () => {
    setVideoFile(null)
    setSubtitleFile(null)
    clearSubtitleEdit()
    setTrimSettings({ startTime: 0, endTime: 0 })
  }

  const handleRemoveSubtitle = () => {
    setSubtitleFile(null)
    clearSubtitleEdit()
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Select Files</h2>
      
      <div className="space-y-4">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
          {videoFile ? (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{videoFile.name}</p>
                <p className="text-xs text-gray-500 break-all">{videoFile.path}</p>
                <p className="text-sm text-gray-500">
                  Duration: {Math.floor(videoFile.duration / 60)}:{Math.floor(videoFile.duration % 60).toString().padStart(2, '0')}
                  {videoFile.width && videoFile.height ? ` · ${videoFile.width}×${videoFile.height}` : ''}
                </p>
              </div>
              <button
                onClick={handleRemoveVideo}
                className="text-red-500 hover:text-red-700 font-medium"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="mt-4">
                <button
                  onClick={handleVideoSelect}
                  className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-md font-medium"
                >
                  Select Video File
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Drop a video here, or choose MP4, AVI, MOV, MKV, WebM, FLV
              </p>
            </div>
          )}
        </div>

        {mode === 'trim' && (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
            {subtitleFile ? (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{subtitleFile.name}</p>
                <p className="text-xs text-gray-500 break-all">{subtitleFile.path}</p>
                <p className="text-sm text-gray-500">Subtitle file loaded</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditingSubtitles(!isEditingSubtitles)}
                  className={`px-3 py-1 rounded-md text-sm font-medium ${
                    isEditingSubtitles
                      ? 'bg-primary-600 text-white'
                      : 'bg-primary-500 hover:bg-primary-600 text-white'
                  }`}
                >
                  {isEditingSubtitles ? 'Close Editor' : 'Edit'}
                </button>
                <button
                  onClick={handleRemoveSubtitle}
                  className="text-red-500 hover:text-red-700 font-medium"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <button
                onClick={handleSubtitleSelect}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md font-medium"
              >
                Select Subtitle File (Optional)
              </button>
              <p className="mt-2 text-xs text-gray-500">
                Drop an SRT here, or choose SRT, VTT, ASS, SSA
              </p>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}

export default FileSelector
