import React, { useState, useEffect } from 'react'
import { useVideoStore } from '../store/useVideoStore'
import { tauriAPI } from '../lib/tauri-api'
import { logger } from '../lib/logger'

const ProcessingPanel: React.FC = () => {
  const {
    videoFile,
    subtitleFile,
    trimSettings,
    isProcessing,
    processingProgress,
    setProcessing,
    setProcessingProgress,
    setError,
    currentJobId,
    setCurrentJobId,
  } = useVideoStore()

  const [outputPath, setOutputPath] = useState('')

  useEffect(() => {
    let unlistenProgress: (() => void) | null = null
    let unlistenComplete: (() => void) | null = null
    let unlistenError: (() => void) | null = null
    let unlistenCancelled: (() => void) | null = null

    const setupListeners = async () => {
      unlistenProgress = await tauriAPI.onFFmpegProgress((event) => {
        const state = useVideoStore.getState()
        const effectiveJobId = event.jobId || state.currentJobId
        void logger.log(`[ProcessingPanel] Progress event payload: jobId=${event.jobId}, seconds=${event.seconds}, percent=${event.percent}, stateJob=${state.currentJobId}, effectiveJob=${effectiveJobId}`)

        if (!effectiveJobId) {
          void logger.log('[ProcessingPanel] Dropping progress event because no job id is available')
          return
        }

        if (!state.currentJobId) {
          state.setCurrentJobId(effectiveJobId)
        } else if (state.currentJobId !== effectiveJobId) {
          void logger.log(`[ProcessingPanel] Progress jobId mismatch (expected ${state.currentJobId}, got ${effectiveJobId}) — applying anyway`)
        }

        state.setProcessingProgress({
          currentTime: event.seconds,
          percentage: event.percent,
        })
        void logger.log(`[ProcessingPanel] Progress applied for jobId=${effectiveJobId}: ${event.percent.toFixed(2)}% at ${event.seconds}s`)
      })

      unlistenComplete = await tauriAPI.onFFmpegComplete((jobId) => {
        const state = useVideoStore.getState()
        const effectiveJobId = jobId || state.currentJobId
        void logger.log(`[ProcessingPanel] Complete event payload: jobId=${jobId}, stateJob=${state.currentJobId}, effectiveJob=${effectiveJobId}`)

        if (!effectiveJobId) {
          void logger.log('[ProcessingPanel] Dropping complete event because no job id is available')
          return
        }

        state.setProcessingProgress({ currentTime: state.trimSettings.endTime - state.trimSettings.startTime, percentage: 100 })
        setTimeout(() => {
          state.setProcessing(false)
          state.setProcessingProgress(null)
          state.setCurrentJobId(null)
        }, 1000)
        void logger.log(`[ProcessingPanel] Processing complete for jobId=${effectiveJobId}`)
      })

      unlistenError = await tauriAPI.onFFmpegError((jobId, error) => {
        const state = useVideoStore.getState()
        const effectiveJobId = jobId || state.currentJobId
        void logger.log(`[ProcessingPanel] Error event payload: jobId=${jobId}, stateJob=${state.currentJobId}, effectiveJob=${effectiveJobId}, error=${error}`)

        if (!effectiveJobId) {
          void logger.log('[ProcessingPanel] Dropping error event because no job id is available')
          return
        }

        state.setError(`Processing failed: ${error}`)
        state.setProcessing(false)
        state.setProcessingProgress(null)
        state.setCurrentJobId(null)
        void logger.error(`[ProcessingPanel] Processing failed for jobId=${effectiveJobId}`, error)
      })

      unlistenCancelled = await tauriAPI.onFFmpegCancelled((jobId) => {
        const state = useVideoStore.getState()
        const effectiveJobId = jobId || state.currentJobId
        void logger.log(`[ProcessingPanel] Cancelled event payload: jobId=${jobId}, stateJob=${state.currentJobId}, effectiveJob=${effectiveJobId}`)

        if (!effectiveJobId) {
          void logger.log('[ProcessingPanel] Dropping cancelled event because no job id is available')
          return
        }

        state.setError('Processing cancelled')
        state.setProcessing(false)
        state.setProcessingProgress(null)
        state.setCurrentJobId(null)
        void logger.log(`[ProcessingPanel] Processing cancelled for jobId=${effectiveJobId}`)
      })
    }

    setupListeners()

    return () => {
      if (unlistenProgress) unlistenProgress()
      if (unlistenComplete) unlistenComplete()
      if (unlistenError) unlistenError()
      if (unlistenCancelled) unlistenCancelled()
    }
  }, [])

  const handleSelectOutput = async () => {
    try {
      const filePath = await tauriAPI.selectOutputFile()
      if (filePath) {
        setOutputPath(filePath)
        await logger.log(`[ProcessingPanel] Selected output file: ${filePath}`)
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

    try {
      await logger.log(`[ProcessingPanel] Starting processing: input=${videoFile.path}, output=${outputPath}, trim=${trimSettings.startTime}-${trimSettings.endTime}, subtitle=${subtitleFile?.path ?? 'none'}`)
      setProcessing(true)
      setProcessingProgress({ currentTime: 0, percentage: 0 })
      setError(null)

      const jobId = await tauriAPI.processVideo({
        inputFile: videoFile.path,
        outputFile: outputPath,
        startTime: trimSettings.startTime,
        endTime: trimSettings.endTime,
        subtitleFile: subtitleFile?.path,
      })

      setCurrentJobId(jobId)
      await logger.log(`[ProcessingPanel] Processing started with jobId=${jobId}`)
    } catch (error) {
      setError(`Failed to start processing: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setProcessing(false)
      setProcessingProgress(null)
      await logger.error('[ProcessingPanel] Failed to start processing', error)
    }
  }

  const handleCancel = async () => {
    if (currentJobId) {
      try {
        await tauriAPI.cancelProcess(currentJobId)
      } catch (error) {
        setError(`Failed to cancel processing: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
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
                disabled={isProcessing}
                className="ml-2 text-primary-500 hover:text-primary-600 text-sm font-medium disabled:opacity-50"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              onClick={handleSelectOutput}
              disabled={isProcessing}
              className="w-full p-3 border-2 border-dashed border-gray-300 rounded-md text-gray-500 hover:border-gray-400 hover:text-gray-600 disabled:opacity-50"
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

        {!isProcessing ? (
          <button
            onClick={handleProcess}
            disabled={!canProcess}
            className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
              canProcess
                ? 'bg-primary-500 hover:bg-primary-600 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Start Processing
          </button>
        ) : (
          <button
            onClick={handleCancel}
            className="w-full py-3 px-4 rounded-md font-medium bg-red-500 hover:bg-red-600 text-white"
          >
            Cancel Processing
          </button>
        )}
      </div>
    </div>
  )
}

export default ProcessingPanel
