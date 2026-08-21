export const VIDEO_EXTENSIONS = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'] as const
export const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa'] as const

export function extensionOf(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function isVideoPath(filePath: string): boolean {
  return (VIDEO_EXTENSIONS as readonly string[]).includes(extensionOf(filePath))
}

export function isSubtitlePath(filePath: string): boolean {
  return (SUBTITLE_EXTENSIONS as readonly string[]).includes(extensionOf(filePath))
}
