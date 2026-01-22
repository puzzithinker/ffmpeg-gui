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
}

export interface ProcessingProgress {
  currentTime: number
  percentage: number
}