import React, { useState, useEffect } from 'react'
import { useVideoStore } from '../store/useVideoStore'

const ProcessingPanel: React.FC = () => {
  const {
    videoFile,
    subtitleFile,
    trimSettings,
    isProcessing,
    processingProgress,
    setProcessing,
    setProcessingProgress,
    setError
  } = useVideoStore()

  const [outputPath, setOutputPath] = useState('')

  useEffect(() => {
    const handleProgress = (time: number) => {
      if (videoFile && trimSettings) {
        const duration = trimSettings.endTime - trimSettings.startTime
        const percentage = Math.min(100, (time / duration) * 100)
        setProcessingProgress({ currentTime: time, percentage })
      }
    }

    if (window.electronAPI?.onFFmpegProgress) {
      window.electronAPI.onFFmpegProgress(handleProgress)
    }
  }, [videoFile, trimSettings, setProcessingProgress])

  const handleSelectOutput = async () => {
    if (!window.electronAPI?.selectOutputFile) {
      setError('Electron API not available - please run in Electron app')
      return
    }
    
    try {
      const filePath = await window.electronAPI.selectOutputFile()
      if (filePath) {
        setOutputPath(filePath)
      }
    } catch (error) {
      setError(`Failed to select output file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleProcess = async () => {
    if (!videoFile || !outputPath) {
      setError('Please select both input video and output file')
      return
    }

    if (!window.electronAPI?.processVideo) {
      setError('Electron API not available - please run in Electron app')
      return
    }

    try {
      setProcessing(true)
      setProcessingProgress({ currentTime: 0, percentage: 0 })
      setError(null)

      const options = {
        inputFile: videoFile.path,
        outputFile: outputPath,
        startTime: trimSettings.startTime,
        endTime: trimSettings.endTime,
        subtitleFile: subtitleFile?.path
      }

      await window.electronAPI.processVideo(options)
      
      setProcessingProgress({ currentTime: trimSettings.endTime - trimSettings.startTime, percentage: 100 })
      setTimeout(() => {
        setProcessing(false)
        setProcessingProgress(null)
      }, 1000)
      
    } catch (error) {
      setError(`Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setProcessing(false)
      setProcessingProgress(null)
    }
  }

  const canProcess = videoFile && outputPath && !isProcessing

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Export Settings</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Output File
          </label>
          {outputPath ? (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
              <span className="text-sm text-gray-900 truncate flex-1">
                {outputPath.split(/[/\\]/).pop()}
              </span>
              <button
                onClick={handleSelectOutput}
                className="ml-2 text-primary-500 hover:text-primary-600 text-sm font-medium"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              onClick={handleSelectOutput}
              className="w-full p-3 border-2 border-dashed border-gray-300 rounded-md text-gray-500 hover:border-gray-400 hover:text-gray-600"
            >
              Select output location
            </button>
          )}
        </div>

        {videoFile && (
          <div className="bg-gray-50 p-3 rounded-md">
            <h3 className="font-medium text-gray-900 mb-2">Processing Summary</h3>
            <div className="space-y-1 text-sm text-gray-600">
              <div>Input: {videoFile.name}</div>
              <div>
                Duration: {Math.floor((trimSettings.endTime - trimSettings.startTime) / 60)}:
                {Math.floor((trimSettings.endTime - trimSettings.startTime) % 60).toString().padStart(2, '0')}
              </div>
              {subtitleFile && <div>Subtitles: {subtitleFile.name}</div>}
            </div>
          </div>
        )}

        {isProcessing && processingProgress && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Processing...</span>
              <span>{processingProgress.percentage.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-primary-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${processingProgress.percentage}%` }}
              />
            </div>
          </div>
        )}

        <button
          onClick={handleProcess}
          disabled={!canProcess}
          className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
            canProcess
              ? 'bg-primary-500 hover:bg-primary-600 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isProcessing ? 'Processing...' : 'Start Processing'}
        </button>
      </div>
    </div>
  )
}

export default ProcessingPanel