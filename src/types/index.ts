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

export interface MultiCutMergeParams {
  inputFile: string
  outputFile: string
  segments: Array<{ startTime: number; endTime: number }>
  cropWidth?: number
  cropHeight?: number
  cropX?: number
  cropY?: number
}

export interface MergeVideosParams {
  inputFiles: string[]
  outputFile: string
}