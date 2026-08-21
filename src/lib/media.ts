import { tauriAPI } from './tauri-api'
import { useVideoStore } from '../store/useVideoStore'
import { parseSrt } from '../utils/srtParser'
import { extractFileName } from '../utils/pathParsing'
import { isSubtitlePath, isVideoPath } from '../utils/fileKinds'
import type { VideoFile } from '../types'

export async function loadVideoFile(path: string): Promise<VideoFile> {
  const name = extractFileName(path) || 'Unknown'
  try {
    const info = await tauriAPI.getMediaInfo(path)
    return {
      path,
      name,
      duration: info.duration,
      width: info.width || undefined,
      height: info.height || undefined,
    }
  } catch {
    const duration = await tauriAPI.getVideoDuration(path)
    return { path, name, duration }
  }
}

export async function applyVideoPath(path: string): Promise<void> {
  const file = await loadVideoFile(path)
  const { setVideoFile, setTrimSettings, setError } = useVideoStore.getState()
  setVideoFile(file)
  setTrimSettings({ startTime: 0, endTime: file.duration })
  setError(null)
}

export async function applySubtitlePath(
  path: string,
  keepEditorOpen?: boolean
): Promise<void> {
  const name = extractFileName(path) || 'Unknown'
  const {
    replaceSubtitleFile,
    hydrateSubtitleEntries,
    setBilingualMode,
    setError,
    isEditingSubtitles,
  } = useVideoStore.getState()

  replaceSubtitleFile({ path, name }, keepEditorOpen ?? isEditingSubtitles)

  const content = await tauriAPI.readSubtitleFile(path)
  if (useVideoStore.getState().subtitleFile?.path !== path) return

  const entries = parseSrt(content)
  hydrateSubtitleEntries(entries)
  setBilingualMode(entries.some((e) => e.bilingualText.trim() !== ''))
  setError(null)
}

export async function applyMergeVideoPath(path: string): Promise<void> {
  const file = await loadVideoFile(path)
  useVideoStore.getState().addMergeVideo(file)
}

export async function applyDroppedPaths(paths: string[]): Promise<void> {
  const { mode, setError } = useVideoStore.getState()
  const videos = paths.filter(isVideoPath)
  const subs = paths.filter(isSubtitlePath)

  try {
    if (mode === 'merge') {
      for (const videoPath of videos) {
        await applyMergeVideoPath(videoPath)
      }
      return
    }

    if (videos[0]) {
      await applyVideoPath(videos[0])
    }
    if (subs[0] && mode === 'trim') {
      await applySubtitlePath(subs[0])
    }
  } catch (error) {
    setError(
      `Failed to load dropped file: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}
