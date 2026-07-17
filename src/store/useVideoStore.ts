import { create } from 'zustand'
import { VideoFile, SubtitleFile, TrimSettings, ProcessingProgress, AppMode, VideoSegment, CropSettings, SubtitleSettings, SubtitleEntry, SubtitleEditState, SecondaryLanguagePosition, QualitySettings, QualityMode } from '../types'

const initialSubtitleEdit: SubtitleEditState = {
  entries: [],
  isDirty: false,
  isBilingual: false,
  primaryLanguage: 'Chinese',
  secondaryLanguage: 'Portuguese',
  secondaryLanguagePosition: 'after',
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
  qualitySettings: QualitySettings

  setVideoFile: (file: VideoFile | null) => void
  setSubtitleFile: (file: SubtitleFile | null) => void
  /**
   * Replace the active subtitle file and reset editor/burn state so a re-import
   * cannot leave old cues in memory while the UI shows the new filename.
   */
  replaceSubtitleFile: (file: SubtitleFile, keepEditorOpen?: boolean) => void
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
  /** Load entries from disk (or a fresh import) without marking the editor dirty. */
  hydrateSubtitleEntries: (entries: SubtitleEntry[]) => void
  updateSubtitleEntry: (id: string, updates: Partial<Pick<SubtitleEntry, 'startTimeMs' | 'endTimeMs' | 'text' | 'bilingualText'>>) => void
  addSubtitleEntry: (entry: SubtitleEntry, afterId?: string | null) => void
  removeSubtitleEntry: (id: string) => void
  setBilingualMode: (enabled: boolean) => void
  setPrimaryLanguage: (lang: string) => void
  setSecondaryLanguage: (lang: string) => void
  setEditedFilePath: (path: string | null) => void
  setIsEditingSubtitles: (editing: boolean) => void
  setSecondaryLanguagePosition: (position: SecondaryLanguagePosition) => void
  clearSubtitleEdit: () => void
  setQualitySettings: (settings: Partial<QualitySettings>) => void
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
  subtitleSettings: { font: '', fontSize: 24, fontSizeAuto: true },
  subtitleEdit: { ...initialSubtitleEdit },
  isEditingSubtitles: false,
  // CRF 8 is near-transparent vs many sources (much larger files than 18).
  qualitySettings: { mode: 'copy' as QualityMode, crf: 8 },

  setVideoFile: (file) => set({ videoFile: file }),
  setSubtitleFile: (file) => set({ subtitleFile: file }),
  replaceSubtitleFile: (file, keepEditorOpen = false) =>
    set({
      subtitleFile: file,
      subtitleEdit: { ...initialSubtitleEdit },
      isEditingSubtitles: keepEditorOpen,
    }),
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
      subtitleSettings: { font: '', fontSize: 24, fontSizeAuto: true },
      subtitleEdit: { ...initialSubtitleEdit },
      isEditingSubtitles: false,
      qualitySettings: { mode: 'copy' as QualityMode, crf: 8 },
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
  hydrateSubtitleEntries: (entries) => set((state) => ({
    subtitleEdit: {
      ...state.subtitleEdit,
      entries,
      isDirty: false,
      editedFilePath: null,
    },
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
  addSubtitleEntry: (entry, afterId) => set((state) => {
    const entries = state.subtitleEdit.entries
    if (!afterId) {
      return {
        subtitleEdit: {
          ...state.subtitleEdit,
          entries: [...entries, entry],
          isDirty: true,
        },
      }
    }
    const afterIdx = entries.findIndex(e => e.id === afterId)
    if (afterIdx === -1) {
      return {
        subtitleEdit: {
          ...state.subtitleEdit,
          entries: [...entries, entry],
          isDirty: true,
        },
      }
    }
    const newEntries = [...entries]
    newEntries.splice(afterIdx + 1, 0, entry)
    const reindexed = newEntries.map((e, i) => ({ ...e, index: i + 1 }))
    return {
      subtitleEdit: {
        ...state.subtitleEdit,
        entries: reindexed,
        isDirty: true,
      },
    }
  }),
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
  setSecondaryLanguagePosition: (position) => set((state) => ({
    subtitleEdit: { ...state.subtitleEdit, secondaryLanguagePosition: position },
  })),
  clearSubtitleEdit: () => set({ subtitleEdit: { ...initialSubtitleEdit }, isEditingSubtitles: false }),
  setQualitySettings: (settings) => set((state) => ({
    qualitySettings: { ...state.qualitySettings, ...settings },
  })),
}))