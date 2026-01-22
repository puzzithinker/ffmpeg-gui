import { create } from 'zustand'
import { VideoFile, SubtitleFile, TrimSettings, ProcessingProgress } from '../types'

interface VideoStore {
  videoFile: VideoFile | null
  subtitleFile: SubtitleFile | null
  trimSettings: TrimSettings
  isProcessing: boolean
  processingProgress: ProcessingProgress | null
  error: string | null

  setVideoFile: (file: VideoFile | null) => void
  setSubtitleFile: (file: SubtitleFile | null) => void
  setTrimSettings: (settings: Partial<TrimSettings>) => void
  setProcessing: (isProcessing: boolean) => void
  setProcessingProgress: (progress: ProcessingProgress | null) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useVideoStore = create<VideoStore>((set) => ({
  videoFile: null,
  subtitleFile: null,
  trimSettings: { startTime: 0, endTime: 0 },
  isProcessing: false,
  processingProgress: null,
  error: null,

  setVideoFile: (file) => set({ videoFile: file }),
  setSubtitleFile: (file) => set({ subtitleFile: file }),
  setTrimSettings: (settings) =>
    set((state) => ({
      trimSettings: { ...state.trimSettings, ...settings }
    })),
  setProcessing: (isProcessing) => set({ isProcessing }),
  setProcessingProgress: (progress) => set({ processingProgress: progress }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      videoFile: null,
      subtitleFile: null,
      trimSettings: { startTime: 0, endTime: 0 },
      isProcessing: false,
      processingProgress: null,
      error: null
    })
}))