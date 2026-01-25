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
  const trimmedDuration = Math.max(0, trimSettings.endTime - trimSettings.startTime)
  const statusLabel = isProcessing ? 'Processing' : videoFile ? 'Ready to export' : 'Awaiting video'
  const statusStyle = isProcessing ? 'bg-primary-100 text-primary-700 border-primary-200' : videoFile ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'

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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Export</h2>
        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusStyle}`}>
          {statusLabel}
        </span>
      </div>

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
            <h3 className="font-medium text-gray-900 mb-2">Summary</h3>
            <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Input</p>
                <p className="font-medium truncate">{videoFile.name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Duration</p>
                <p className="font-medium">
                  {Math.floor(trimmedDuration / 60)}:
                  {Math.floor(trimmedDuration % 60).toString().padStart(2, '0')}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Output</p>
                <p className="font-medium truncate">{outputPath ? outputPath.split(/[/\\]/).pop() : 'Not selected'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Subtitles</p>
                <p className="font-medium">{subtitleFile ? subtitleFile.name : 'None'}</p>
              </div>
            </div>
          </div>
        )}

        {isProcessing && processingProgress && (
          <div className="space-y-3 bg-primary-50 border border-primary-100 rounded-md p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-primary-700">Job</p>
                <p className="text-sm font-medium text-primary-900">{currentJobId?.slice(0, 8) ?? 'Active'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-primary-700">Progress</p>
                <p className="text-3xl font-semibold text-primary-900">{processingProgress.percentage.toFixed(1)}%</p>
              </div>
            </div>
            <div className="w-full bg-primary-100 rounded-full h-2">
              <div
                className="bg-primary-500 h-2 rounded-full transition-all duration-200"
                style={{ width: `${processingProgress.percentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-primary-800">
              <span>{processingProgress.currentTime.toFixed(1)}s processed</span>
              <span>{trimmedDuration ? Math.min(100, processingProgress.percentage).toFixed(1) : '0.0'}% of trim</span>
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
