import { describe, expect, it } from 'vitest'
import { extensionOf, isSubtitlePath, isVideoPath } from './fileKinds'

describe('fileKinds', () => {
  it('reads the last extension case-insensitively', () => {
    expect(extensionOf('C:\\\\clips\\\\Show.MP4')).toBe('mp4')
    expect(extensionOf('/tmp/a.b.srt')).toBe('srt')
    expect(extensionOf('noext')).toBe('')
  })

  it('classifies video and subtitle paths', () => {
    expect(isVideoPath('/a/b.mkv')).toBe(true)
    expect(isVideoPath('/a/b.srt')).toBe(false)
    expect(isSubtitlePath('Doris-pt.srt')).toBe(true)
    expect(isSubtitlePath('clip.webm')).toBe(false)
  })
})
