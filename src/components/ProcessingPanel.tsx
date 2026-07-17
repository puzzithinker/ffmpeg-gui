import React, { useState, useEffect, useMemo } from 'react'
import { useVideoStore } from '../store/useVideoStore'
import { tauriAPI } from '../lib/tauri-api'
import { logger } from '../lib/logger'
import { formatTime } from '../utils/timeFormatting'
import { serializeSrt } from '../utils/srtParser'
import {
  requiresReencodeFilters,
  canSelectStreamCopy,
  showCrfControls,
  qualitySummaryLabel,
} from '../utils/exportQuality'

const ProcessingPanel: React.FC = () => {
  // Targeted subscriptions — progress ticks only re-render progress-related slices.
  const mode = useVideoStore((s) => s.mode)
  const videoFile = useVideoStore((s) => s.videoFile)
  const subtitleFile = useVideoStore((s) => s.subtitleFile)
  const trimSettings = useVideoStore((s) => s.trimSettings)
  const brightness = useVideoStore((s) => s.brightness)
  const cropSettings = useVideoStore((s) => s.cropSettings)
  const subtitleSettings = useVideoStore((s) => s.subtitleSettings)
  const subtitleEdit = useVideoStore((s) => s.subtitleEdit)
  const segments = useVideoStore((s) => s.segments)
  const mergeVideoFiles = useVideoStore((s) => s.mergeVideoFiles)
  const isProcessing = useVideoStore((s) => s.isProcessing)
  const processingProgress = useVideoStore((s) => s.processingProgress)
  const currentJobId = useVideoStore((s) => s.currentJobId)
  const qualitySettings = useVideoStore((s) => s.qualitySettings)
  const setProcessing = useVideoStore((s) => s.setProcessing)
  const setProcessingProgress = useVideoStore((s) => s.setProcessingProgress)
  const setError = useVideoStore((s) => s.setError)
  const setCurrentJobId = useVideoStore((s) => s.setCurrentJobId)
  const setQualitySettings = useVideoStore((s) => s.setQualitySettings)

  const [outputPath, setOutputPath] = useState('')

  const qualityInput = useMemo(
    () => ({
      mode,
      cropEnabled: cropSettings.enabled,
      brightness,
      hasSubtitle: !!subtitleFile,
      qualityMode: qualitySettings.mode,
    }),
    [mode, cropSettings.enabled, brightness, subtitleFile, qualitySettings.mode]
  )

  const filtersForceReencode = requiresReencodeFilters(qualityInput)
  const streamCopySelectable = canSelectStreamCopy(qualityInput)
  const crfVisible = showCrfControls(qualityInput)

  useEffect(() => {
    if (filtersForceReencode && qualitySettings.mode === 'copy') {
      setQualitySettings({ mode: 'reencode' })
    }
  }, [filtersForceReencode, qualitySettings.mode, setQualitySettings])

  const getCrfLabel = (crf: number): string => {
    if (crf <= 10) return 'Near original / very large'
    if (crf <= 15) return 'Near lossless'
    if (crf <= 22) return 'High quality'
    if (crf <= 28) return 'Medium quality'
    return 'Low quality / small file'
  }

  const getCanProcess = () => {
    if (isProcessing || !outputPath) return false
    if (mode === 'trim') return !!videoFile
    if (mode === 'multi-cut') return !!videoFile && segments.length > 0
    if (mode === 'merge') return mergeVideoFiles.length >= 2
    return false
  }

  const getStatusLabel = () => {
    if (isProcessing) return 'Processing'
    if (mode === 'trim') return videoFile ? 'Ready to export' : 'Awaiting video'
    if (mode === 'multi-cut') return (videoFile && segments.length > 0) ? 'Ready to export' : 'Awaiting video & segments'
    if (mode === 'merge') return mergeVideoFiles.length >= 2 ? 'Ready to export' : 'Awaiting 2+ videos'
    return 'Awaiting input'
  }

  const getStatusStyle = () => {
    if (isProcessing) return 'bg-primary-100 text-primary-700 border-primary-200'
    if (getCanProcess()) return 'bg-green-100 text-green-700 border-green-200'
    return 'bg-gray-100 text-gray-600 border-gray-200'
  }

  const getDurationLabel = () => {
    if (mode === 'trim' && videoFile) {
      const dur = Math.max(0, trimSettings.endTime - trimSettings.startTime)
      return formatTime(dur)
    }
    if (mode === 'multi-cut' && videoFile && segments.length > 0) {
      const total = segments.reduce((sum, s) => sum + (s.endTime - s.startTime), 0)
      return formatTime(total)
    }
    if (mode === 'merge' && mergeVideoFiles.length > 0) {
      const total = mergeVideoFiles.reduce((sum, f) => sum + f.duration, 0)
      return formatTime(total)
    }
    return '0:00'
  }

  useEffect(() => {
    let unlistenProgress: (() => void) | null = null
    let unlistenComplete: (() => void) | null = null
    let unlistenError: (() => void) | null = null
    let unlistenCancelled: (() => void) | null = null

    const setupListeners = async () => {
      unlistenProgress = await tauriAPI.onFFmpegProgress((event) => {
        const state = useVideoStore.getState()
        const effectiveJobId = event.jobId || state.currentJobId

        if (!effectiveJobId) return

        if (!state.currentJobId) {
          state.setCurrentJobId(effectiveJobId)
        }

        state.setProcessingProgress({
          currentTime: event.seconds,
          percentage: event.percent,
        })
      })

      unlistenComplete = await tauriAPI.onFFmpegComplete((jobId) => {
        const state = useVideoStore.getState()
        const effectiveJobId = jobId || state.currentJobId
        if (!effectiveJobId) return

        state.setProcessingProgress({ currentTime: 0, percentage: 100 })
        setTimeout(() => {
          state.setProcessing(false)
          state.setProcessingProgress(null)
          state.setCurrentJobId(null)
        }, 1000)
      })

      unlistenError = await tauriAPI.onFFmpegError((jobId, error) => {
        const state = useVideoStore.getState()
        const effectiveJobId = jobId || state.currentJobId
        if (!effectiveJobId) return

        state.setError(`Processing failed: ${error}`)
        state.setProcessing(false)
        state.setProcessingProgress(null)
        state.setCurrentJobId(null)
      })

      unlistenCancelled = await tauriAPI.onFFmpegCancelled((jobId) => {
        const state = useVideoStore.getState()
        const effectiveJobId = jobId || state.currentJobId
        if (!effectiveJobId) return

        state.setError('Processing cancelled')
        state.setProcessing(false)
        state.setProcessingProgress(null)
        state.setCurrentJobId(null)
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
      }
    } catch (error) {
      setError(`Failed to select output file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleProcess = async () => {
    if (!outputPath) {
      setError('Please select an output file')
      return
    }

    try {
      setProcessing(true)
      setProcessingProgress({ currentTime: 0, percentage: 0 })
      setError(null)

      let jobId: string

      if (mode === 'trim') {
        if (!videoFile) {
          setError('Please select a video file')
          setProcessing(false)
          return
        }

        let effectiveSubtitlePath: string | undefined = subtitleFile?.path
        if (subtitleFile && subtitleEdit.entries.length > 0 && subtitleEdit.isDirty) {
          const content = serializeSrt(subtitleEdit.entries, subtitleEdit.isBilingual, subtitleEdit.secondaryLanguagePosition)
          const tempPath = await tauriAPI.writeTempSubtitle(content)
          effectiveSubtitlePath = tempPath
        } else if (subtitleFile && subtitleEdit.editedFilePath) {
          effectiveSubtitlePath = subtitleEdit.editedFilePath
        }

        jobId = await tauriAPI.processVideo({
          inputFile: videoFile.path,
          outputFile: outputPath,
          startTime: trimSettings.startTime,
          endTime: trimSettings.endTime,
          subtitleFile: effectiveSubtitlePath,
          subtitleFont: subtitleFile && subtitleSettings.font ? subtitleSettings.font : undefined,
          subtitleFontSize: subtitleFile && !subtitleSettings.fontSizeAuto ? subtitleSettings.fontSize : undefined,
          brightness: brightness !== 0 ? brightness : undefined,
          cropWidth: cropSettings.enabled ? cropSettings.width : undefined,
          cropHeight: cropSettings.enabled ? cropSettings.height : undefined,
          cropX: cropSettings.enabled ? cropSettings.x : undefined,
          cropY: cropSettings.enabled ? cropSettings.y : undefined,
          qualityMode: qualitySettings.mode,
          crf: qualitySettings.mode === 'reencode' ? qualitySettings.crf : undefined,
        })
      } else if (mode === 'multi-cut') {
        if (!videoFile || segments.length === 0) {
          setError('Please select a video and add segments')
          setProcessing(false)
          return
        }
        jobId = await tauriAPI.multiCutMerge({
          inputFile: videoFile.path,
          outputFile: outputPath,
          segments: segments.map(s => ({ startTime: s.startTime, endTime: s.endTime })),
          cropWidth: cropSettings.enabled ? cropSettings.width : undefined,
          cropHeight: cropSettings.enabled ? cropSettings.height : undefined,
          cropX: cropSettings.enabled ? cropSettings.x : undefined,
          cropY: cropSettings.enabled ? cropSettings.y : undefined,
          crf: qualitySettings.crf,
          preferCopy: !cropSettings.enabled,
        })
      } else {
        if (mergeVideoFiles.length < 2) {
          setError('Please select at least 2 videos to merge')
          setProcessing(false)
          return
        }
        jobId = await tauriAPI.mergeVideos({
          inputFiles: mergeVideoFiles.map(f => f.path),
          outputFile: outputPath,
          crf: qualitySettings.crf,
        })
      }

      setCurrentJobId(jobId)
      void logger.log(`[ProcessingPanel] Processing started with jobId=${jobId}`)
    } catch (error) {
      setError(`Failed to start processing: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setProcessing(false)
      setProcessingProgress(null)
    }
  }

  const handleCancel = async () => {
    const state = useVideoStore.getState()
    const jobId = state.currentJobId

    try {
      if (jobId) {
        await tauriAPI.cancelProcess(jobId)
      } else {
        await tauriAPI.cancelAllProcesses()
      }
      state.setProcessing(false)
      state.setProcessingProgress(null)
      state.setCurrentJobId(null)
      state.setError(null)
    } catch (error) {
      try {
        await tauriAPI.cancelAllProcesses()
        state.setProcessing(false)
        state.setProcessingProgress(null)
        state.setCurrentJobId(null)
      } catch {
        // ignore secondary failure
      }
      setError(`Failed to cancel processing: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const canProcess = getCanProcess()
  const summaryQuality = qualitySummaryLabel(qualityInput)
  const summaryQualityWithCrf =
    filtersForceReencode || qualitySettings.mode === 'reencode' || (mode === 'merge' && crfVisible)
      ? mode === 'multi-cut' && cropSettings.enabled
        ? `Frame-accurate re-encode (CRF ${qualitySettings.crf})`
        : mode === 'trim' && (filtersForceReencode || qualitySettings.mode === 'reencode')
          ? `Re-encode (CRF ${qualitySettings.crf})`
          : mode === 'merge'
            ? summaryQuality
            : summaryQuality
      : summaryQuality

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Export</h2>
        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusStyle()}`}>
          {getStatusLabel()}
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

        <div className="bg-gray-50 p-3 rounded-md">
          <h3 className="font-medium text-gray-900 mb-2">Summary</h3>
          <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Mode</p>
              <p className="font-medium">{mode === 'trim' ? 'Trim' : mode === 'multi-cut' ? 'Multi-Cut & Merge' : 'Merge Videos'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Output Duration</p>
              <p className="font-medium">{getDurationLabel()}</p>
            </div>
            {mode === 'trim' && videoFile && (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Input</p>
                  <p className="font-medium truncate">{videoFile.name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Subtitles</p>
                  <p className="font-medium">{subtitleFile ? subtitleFile.name : 'None'}</p>
                  {subtitleEdit.isBilingual && subtitleFile && (
                    <p className="text-xs text-primary-600">
                      Bilingual ({subtitleEdit.primaryLanguage} + {subtitleEdit.secondaryLanguage})
                    </p>
                  )}
                  {subtitleEdit.isDirty && subtitleFile && (
                    <p className="text-xs text-amber-600">Edited (unsaved)</p>
                  )}
                  {subtitleEdit.editedFilePath && !subtitleEdit.isDirty && subtitleFile && (
                    <p className="text-xs text-green-600">Edited</p>
                  )}
                </div>
                {subtitleFile && (subtitleSettings.font || !subtitleSettings.fontSizeAuto) && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Subtitle Style</p>
                    <p className="font-medium">
                      {subtitleSettings.font || 'Default font'}
                      {!subtitleSettings.fontSizeAuto ? `, ${subtitleSettings.fontSize}px` : ', auto size'}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Brightness</p>
                  <p className="font-medium">{brightness > 0 ? '+' : ''}{brightness}%</p>
                </div>
                {cropSettings.enabled && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Crop</p>
                    <p className="font-medium">{cropSettings.width}×{cropSettings.height}+{cropSettings.x}+{cropSettings.y}</p>
                  </div>
                )}
              </>
            )}
            {mode === 'multi-cut' && videoFile && (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Input</p>
                  <p className="font-medium truncate">{videoFile.name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Segments</p>
                  <p className="font-medium">{segments.length} segment{segments.length !== 1 ? 's' : ''}</p>
                </div>
                {cropSettings.enabled && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Crop</p>
                    <p className="font-medium">{cropSettings.width}×{cropSettings.height}+{cropSettings.x}+{cropSettings.y}</p>
                  </div>
                )}
              </>
            )}
            {mode === 'merge' && (
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Videos</p>
                <p className="font-medium">{mergeVideoFiles.length} file{mergeVideoFiles.length !== 1 ? 's' : ''}</p>
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Quality</p>
              <p className="font-medium">{summaryQualityWithCrf}</p>
            </div>
          </div>
        </div>

        <div className="border-t pt-3">
          <h3 className="font-medium text-gray-900 mb-2">Quality</h3>
          <div className="space-y-3">
            {(mode === 'trim' || mode === 'multi-cut') && (
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="quality"
                    value="copy"
                    checked={qualitySettings.mode === 'copy' && streamCopySelectable}
                    onChange={() => setQualitySettings({ mode: 'copy' })}
                    disabled={!streamCopySelectable || isProcessing}
                    className="text-primary-600 focus:ring-primary-500"
                  />
                  <span className={`text-sm ${!streamCopySelectable ? 'text-gray-400' : 'text-gray-700'}`}>
                    Exact copy
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="quality"
                    value="reencode"
                    checked={qualitySettings.mode === 'reencode' || !streamCopySelectable}
                    onChange={() => setQualitySettings({ mode: 'reencode' })}
                    disabled={isProcessing}
                    className="text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Custom quality</span>
                </label>
              </div>
            )}
            {filtersForceReencode && qualitySettings.mode === 'copy' && mode === 'trim' && (
              <p className="text-xs text-amber-600">
                Filters require re-encoding. Switching to custom quality mode.
              </p>
            )}
            {mode === 'trim' && qualitySettings.mode === 'copy' && !filtersForceReencode && (
              <p className="text-xs text-gray-500">
                Fastest. Preserves original quality exactly.
              </p>
            )}
            {mode === 'multi-cut' && !cropSettings.enabled && (
              <p className="text-xs text-gray-500">
                Stream-copies each segment (original quality). Cuts align to keyframes.
                Enable crop for frame-accurate re-encode.
              </p>
            )}
            {mode === 'merge' && (
              <p className="text-xs text-gray-500">
                Identical sources are joined with stream copy (no quality loss).
                Mismatched resolution/codec falls back to high-quality re-encode (CRF below).
              </p>
            )}
            {crfVisible && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">CRF: {qualitySettings.crf}</span>
                  <span className="text-xs text-gray-500">{getCrfLabel(qualitySettings.crf)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="51"
                  value={qualitySettings.crf}
                  onChange={(e) => setQualitySettings({ crf: parseInt(e.target.value) })}
                  disabled={isProcessing}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>0 (lossless)</span>
                  <span>51 (smallest)</span>
                </div>
              </div>
            )}
          </div>
        </div>

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
                className="bg-primary-500 h-2 rounded-full"
                style={{ width: `${processingProgress.percentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-primary-800">
              <span>{processingProgress.currentTime.toFixed(1)}s processed</span>
              <span>{Math.min(100, processingProgress.percentage).toFixed(1)}%</span>
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
