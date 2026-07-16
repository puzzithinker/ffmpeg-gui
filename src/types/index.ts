export interface VideoFile {
  path: string
  name: string
  duration: number
}

export interface SubtitleFile {
  path: string
  name: string
}

export interface TrimSettings {
  startTime: number
  endTime: number
}

export type QualityMode = 'copy' | 'reencode'

export interface QualitySettings {
  mode: QualityMode
  crf: number
}

export interface ProcessingOptions {
  inputFile: string
  outputFile: string
  startTime?: number
  endTime?: number
  subtitleFile?: string
  brightness?: number
  cropWidth?: number
  cropHeight?: number
  cropX?: number
  cropY?: number
  qualityMode?: string
  crf?: number
}

export interface ProcessingProgress {
  currentTime: number
  percentage: number
}

export type AppMode = 'trim' | 'multi-cut' | 'merge'

export interface VideoSegment {
  id: string
  startTime: number
  endTime: number
}

export interface CropSettings {
  enabled: boolean
  width: number
  height: number
  x: number
  y: number
}

export interface SubtitleSettings {
  font: string
  fontSize: number
  fontSizeAuto: boolean
}

export interface MultiCutMergeParams {
  inputFile: string
  outputFile: string
  segments: Array<{ startTime: number; endTime: number }>
  cropWidth?: number
  cropHeight?: number
  cropX?: number
  cropY?: number
  crf?: number
  /** Prefer stream-copy (keyframe) cuts when no crop. Default true. */
  preferCopy?: boolean
}

export interface MergeVideosParams {
  inputFiles: string[]
  outputFile: string
  crf?: number
}

export interface SubtitleEntry {
  id: string
  index: number
  startTimeMs: number
  endTimeMs: number
  text: string
  bilingualText: string
}

export type SecondaryLanguagePosition = 'before' | 'after'

export interface SubtitleEditState {
  entries: SubtitleEntry[]
  isDirty: boolean
  isBilingual: boolean
  primaryLanguage: string
  secondaryLanguage: string
  secondaryLanguagePosition: SecondaryLanguagePosition
  editedFilePath: string | null
}