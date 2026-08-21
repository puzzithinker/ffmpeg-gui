import { useEffect } from 'react'
import { useVideoStore } from '../store/useVideoStore'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

export function usePlaybackShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const {
        mode,
        videoFile,
        togglePlayback,
        markTrimIn,
        markTrimOut,
        markSegmentIn,
        markSegmentOut,
      } = useVideoStore.getState()

      if (!videoFile) return

      if (event.key === ' ' && !(event.target instanceof HTMLVideoElement)) {
        event.preventDefault()
        togglePlayback()
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'i') {
        event.preventDefault()
        if (mode === 'multi-cut') markSegmentIn()
        else markTrimIn()
        return
      }
      if (key === 'o') {
        event.preventDefault()
        if (mode === 'multi-cut') markSegmentOut()
        else markTrimOut()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
