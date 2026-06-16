import { create } from 'zustand'
import { VideoFile, SubtitleFile, TrimSettings, ProcessingProgress, AppMode, VideoSegment, CropSettings, SubtitleSettings, SubtitleEntry, SubtitleEditState } from '../types'

const initialSubtitleEdit: SubtitleEditState = {
  entries: [],
  isDirty: false,
  isBilingual: false,
  primaryLanguage: 'English',
  secondaryLanguage: 'Chinese',
  editedFilePath: null,
}

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
  subtitleSettings: SubtitleSettings
  subtitleEdit: SubtitleEditState
  isEditingSubtitles: boolean

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
  setSubtitleSettings: (settings: Partial<SubtitleSettings>) => void
  setSubtitleEntries: (entries: SubtitleEntry[]) => void
  updateSubtitleEntry: (id: string, updates: Partial<Pick<SubtitleEntry, 'startTimeMs' | 'endTimeMs' | 'text' | 'bilingualText'>>) => void
  addSubtitleEntry: (entry: SubtitleEntry) => void
  removeSubtitleEntry: (id: string) => void
  setBilingualMode: (enabled: boolean) => void
  setPrimaryLanguage: (lang: string) => void
  setSecondaryLanguage: (lang: string) => void
  setEditedFilePath: (path: string | null) => void
  setIsEditingSubtitles: (editing: boolean) => void
  clearSubtitleEdit: () => void
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
  subtitleSettings: { font: '', fontSize: 24 },
  subtitleEdit: { ...initialSubtitleEdit },
  isEditingSubtitles: false,

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
      subtitleSettings: { font: '', fontSize: 24 },
      subtitleEdit: { ...initialSubtitleEdit },
      isEditingSubtitles: false,
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
  setSubtitleSettings: (settings) => set((state) => ({
    subtitleSettings: { ...state.subtitleSettings, ...settings },
  })),
  setSubtitleEntries: (entries) => set((state) => ({
    subtitleEdit: { ...state.subtitleEdit, entries, isDirty: true },
  })),
  updateSubtitleEntry: (id, updates) => set((state) => ({
    subtitleEdit: {
      ...state.subtitleEdit,
      entries: state.subtitleEdit.entries.map(e =>
        e.id === id ? { ...e, ...updates } : e
      ),
      isDirty: true,
    },
  })),
  addSubtitleEntry: (entry) => set((state) => ({
    subtitleEdit: {
      ...state.subtitleEdit,
      entries: [...state.subtitleEdit.entries, entry],
      isDirty: true,
    },
  })),
  removeSubtitleEntry: (id) => set((state) => ({
    subtitleEdit: {
      ...state.subtitleEdit,
      entries: state.subtitleEdit.entries.filter(e => e.id !== id),
      isDirty: true,
    },
  })),
  setBilingualMode: (enabled) => set((state) => ({
    subtitleEdit: { ...state.subtitleEdit, isBilingual: enabled },
  })),
  setPrimaryLanguage: (lang) => set((state) => ({
    subtitleEdit: { ...state.subtitleEdit, primaryLanguage: lang },
  })),
  setSecondaryLanguage: (lang) => set((state) => ({
    subtitleEdit: { ...state.subtitleEdit, secondaryLanguage: lang },
  })),
  setEditedFilePath: (path) => set((state) => ({
    subtitleEdit: { ...state.subtitleEdit, editedFilePath: path, isDirty: false },
  })),
  setIsEditingSubtitles: (editing) => set({ isEditingSubtitles: editing }),
  clearSubtitleEdit: () => set({ subtitleEdit: { ...initialSubtitleEdit }, isEditingSubtitles: false }),
}))