import type { SecondaryLanguagePosition, SubtitleEntry } from '../types'

export function clampTime(time: number, duration: number): number {
  if (!Number.isFinite(time)) return 0
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return Math.min(Math.max(time, 0), duration)
}

export function timeToPercent(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return (clampTime(time, duration) / duration) * 100
}

export function percentToTime(percent: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  const p = Math.min(Math.max(percent, 0), 1)
  return p * duration
}

/** Inclusive start, exclusive end. First matching cue wins. */
export function findActiveCue(
  entries: SubtitleEntry[],
  timeMs: number
): SubtitleEntry | null {
  if (!Number.isFinite(timeMs)) return null
  for (const entry of entries) {
    if (timeMs >= entry.startTimeMs && timeMs < entry.endTimeMs) {
      return entry
    }
  }
  return null
}

export function overlayLines(
  entry: SubtitleEntry,
  bilingual: boolean,
  secondaryPosition: SecondaryLanguagePosition
): string[] {
  if (!bilingual) {
    return entry.text ? [entry.text] : []
  }
  const primary = entry.text.trim()
  const secondary = entry.bilingualText.trim()
  const ordered =
    secondaryPosition === 'before'
      ? [secondary, primary]
      : [primary, secondary]
  return ordered.filter((line) => line.length > 0)
}

export function overlayFontSizePx(
  displayedHeight: number,
  fontSizeAuto: boolean,
  fontSize: number
): number {
  const height = Math.max(0, displayedHeight)
  if (fontSizeAuto) {
    return Math.min(72, Math.max(14, height * 0.045))
  }
  // Treat the style slider as a 1080p-relative size so preview tracks the video box.
  return Math.min(96, Math.max(8, fontSize * (height / 1080)))
}
