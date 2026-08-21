import { describe, it, expect, beforeEach, vi } from 'vitest'
import { tauriAPI } from './tauri-api'
import { applyDroppedPaths, applySubtitlePath, applyVideoPath } from './media'
import { useVideoStore } from '../store/useVideoStore'

vi.mock('./tauri-api', () => ({
  tauriAPI: {
    getMediaInfo: vi.fn(),
    getVideoDuration: vi.fn(),
    readSubtitleFile: vi.fn(),
  },
}))

describe('media loaders', () => {
  beforeEach(() => {
    useVideoStore.getState().reset()
    vi.clearAllMocks()
  })

  it('applyVideoPath stores duration and dimensions', async () => {
    vi.mocked(tauriAPI.getMediaInfo).mockResolvedValue({
      duration: 42,
      width: 1280,
      height: 720,
    })

    await applyVideoPath('/tmp/clip.mp4')

    const file = useVideoStore.getState().videoFile
    expect(file).toMatchObject({
      path: '/tmp/clip.mp4',
      name: 'clip.mp4',
      duration: 42,
      width: 1280,
      height: 720,
    })
    expect(useVideoStore.getState().trimSettings.endTime).toBe(42)
    expect(useVideoStore.getState().cropSettings).toMatchObject({
      width: 1280,
      height: 720,
      enabled: false,
    })
  })

  it('falls back to getVideoDuration when media info fails', async () => {
    vi.mocked(tauriAPI.getMediaInfo).mockRejectedValue(new Error('no probe'))
    vi.mocked(tauriAPI.getVideoDuration).mockResolvedValue(15)

    await applyVideoPath('/tmp/old.avi')

    expect(useVideoStore.getState().videoFile).toMatchObject({
      duration: 15,
      name: 'old.avi',
    })
  })

  it('applySubtitlePath hydrates bilingual cues without dirty', async () => {
    vi.mocked(tauriAPI.readSubtitleFile).mockResolvedValue(
      '1\n00:00:00,000 --> 00:00:01,000\n你好\nOlá\n'
    )

    await applySubtitlePath('/tmp/Doris-pt.srt')

    const { subtitleFile, subtitleEdit } = useVideoStore.getState()
    expect(subtitleFile?.name).toBe('Doris-pt.srt')
    expect(subtitleEdit.entries).toHaveLength(1)
    expect(subtitleEdit.entries[0].text).toBe('你好')
    expect(subtitleEdit.entries[0].bilingualText).toBe('Olá')
    expect(subtitleEdit.isBilingual).toBe(true)
    expect(subtitleEdit.isDirty).toBe(false)
  })

  it('applyDroppedPaths in trim loads video then subtitle', async () => {
    vi.mocked(tauriAPI.getMediaInfo).mockResolvedValue({
      duration: 5,
      width: 640,
      height: 360,
    })
    vi.mocked(tauriAPI.readSubtitleFile).mockResolvedValue(
      '1\n00:00:00,000 --> 00:00:01,000\nHi\n'
    )

    await applyDroppedPaths(['/a/video.mp4', '/a/video.srt'])

    expect(useVideoStore.getState().videoFile?.path).toBe('/a/video.mp4')
    expect(useVideoStore.getState().subtitleFile?.path).toBe('/a/video.srt')
  })

  it('applyDroppedPaths in merge adds every video', async () => {
    useVideoStore.setState({ mode: 'merge' })
    vi.mocked(tauriAPI.getMediaInfo).mockResolvedValue({
      duration: 3,
      width: 1920,
      height: 1080,
    })

    await applyDroppedPaths(['/a.mp4', '/b.mkv'])

    expect(useVideoStore.getState().mergeVideoFiles.map((f) => f.name)).toEqual([
      'a.mp4',
      'b.mkv',
    ])
  })
})
