import { create } from 'zustand'
import { VideoFile, SubtitleFile, TrimSettings, ProcessingProgress, AppMode, VideoSegment, CropSettings } from '../types'

interface VideoStore {
  videoFile: VideoFile | null
  subtitleFile: SubtitleFile | null
  trimSettings: TrimSettings
  brightness: number
  isProcessing: boolean
  processingProgress: ProcessingProgress | null
  error: string | null
  currentJobId: string | null
  mode: AppMode
  segments: VideoSegment[]
  mergeVideoFiles: VideoFile[]
  cropSettings: CropSettings

  setVideoFile: (file: VideoFile | null) => void
  setSubtitleFile: (file: SubtitleFile | null) => void
  setTrimSettings: (settings: Partial<TrimSettings>) => void
  setBrightness: (value: number) => void
  setProcessing: (isProcessing: boolean) => void
  setProcessingProgress: (progress: ProcessingProgress | null) => void
  setError: (error: string | null) => void
  setCurrentJobId: (jobId: string | null) => void
  reset: () => void
  setMode: (mode: AppMode) => void
  addSegment: () => void
  updateSegment: (id: string, updates: Partial<Pick<VideoSegment, 'startTime' | 'endTime'>>) => void
  removeSegment: (id: string) => void
  clearSegments: () => void
  addMergeVideo: (file: VideoFile) => void
  removeMergeVideo: (index: number) => void
  reorderMergeVideos: (fromIndex: number, toIndex: number) => void
  clearMergeVideos: () => void
  setCropSettings: (settings: Partial<CropSettings>) => void
}

export const useVideoStore = create<VideoStore>((set) => ({
  videoFile: null,
  subtitleFile: null,
  trimSettings: { startTime: 0, endTime: 0 },
  brightness: 0,
  isProcessing: false,
  processingProgress: null,
  error: null,
  currentJobId: null,
  mode: 'trim',
  segments: [],
  mergeVideoFiles: [],
  cropSettings: { enabled: false, width: 1920, height: 1080, x: 0, y: 0 },

  setVideoFile: (file) => set({ videoFile: file }),
  setSubtitleFile: (file) => set({ subtitleFile: file }),
  setTrimSettings: (settings) =>
    set((state) => ({
      trimSettings: { ...state.trimSettings, ...settings }
    })),
  setBrightness: (value) => set({ brightness: value }),
  setProcessing: (isProcessing) => set({ isProcessing }),
  setProcessingProgress: (progress) => set({ processingProgress: progress }),
  setError: (error) => set({ error }),
  setCurrentJobId: (jobId) => set({ currentJobId: jobId }),
  reset: () =>
    set({
      videoFile: null,
      subtitleFile: null,
      trimSettings: { startTime: 0, endTime: 0 },
      brightness: 0,
      isProcessing: false,
      processingProgress: null,
      error: null,
      currentJobId: null,
      mode: 'trim',
      segments: [],
      mergeVideoFiles: [],
      cropSettings: { enabled: false, width: 1920, height: 1080, x: 0, y: 0 },
    }),
  setMode: (mode) => set({ mode }),
  addSegment: () => set((state) => {
    const videoFile = state.videoFile
    if (!videoFile) return state
    const lastSegment = state.segments[state.segments.length - 1]
    const startTime = lastSegment ? lastSegment.endTime : 0
    const endTime = Math.min(startTime + 10, videoFile.duration)
    return {
      segments: [...state.segments, { id: crypto.randomUUID(), startTime, endTime }],
    }
  }),
  updateSegment: (id, updates) => set((state) => ({
    segments: state.segments.map(s => s.id === id ? { ...s, ...updates } : s),
  })),
  removeSegment: (id) => set((state) => ({
    segments: state.segments.filter(s => s.id !== id),
  })),
  clearSegments: () => set({ segments: [] }),
  addMergeVideo: (file) => set((state) => ({
    mergeVideoFiles: [...state.mergeVideoFiles, file],
  })),
  removeMergeVideo: (index) => set((state) => ({
    mergeVideoFiles: state.mergeVideoFiles.filter((_, i) => i !== index),
  })),
  reorderMergeVideos: (fromIndex, toIndex) => set((state) => {
    const newFiles = [...state.mergeVideoFiles]
    const [moved] = newFiles.splice(fromIndex, 1)
    newFiles.splice(toIndex, 0, moved)
    return { mergeVideoFiles: newFiles }
  }),
  clearMergeVideos: () => set({ mergeVideoFiles: [] }),
  setCropSettings: (settings) => set((state) => ({
    cropSettings: { ...state.cropSettings, ...settings },
  })),
}))