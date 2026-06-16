import type { SubtitleEntry } from '../types'

const SRT_TIMESTAMP_RE = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/

function srtTimeToMs(time: string): number {
  const match = SRT_TIMESTAMP_RE.exec(time.trim())
  if (!match) return 0
  const [, h, m, s, ms] = match
  return (
    parseInt(h, 10) * 3600000 +
    parseInt(m, 10) * 60000 +
    parseInt(s, 10) * 1000 +
    parseInt(ms, 10)
  )
}

export function msToSrtTime(ms: number): string {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`
}

export function formatMsDisplay(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const millis = ms % 1000
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}

export function parseSrtTimeInput(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // SRT format: HH:MM:SS,mmm or HH:MM:SS.mmm
  const srtMatch = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(trimmed)
  if (srtMatch) {
    const [, h, m, s, ms] = srtMatch
    return (
      parseInt(h, 10) * 3600000 +
      parseInt(m, 10) * 60000 +
      parseInt(s, 10) * 1000 +
      parseInt(ms.padEnd(3, '0'), 10)
    )
  }

  // Short format: MM:SS.mmm or MM:SS,mmm
  const shortMatch = /^(\d{1,3}):(\d{2})[,.](\d{1,3})$/.exec(trimmed)
  if (shortMatch) {
    const [, m, s, ms] = shortMatch
    return (
      parseInt(m, 10) * 60000 +
      parseInt(s, 10) * 1000 +
      parseInt(ms.padEnd(3, '0'), 10)
    )
  }

  // Plain seconds: 123.456
  const seconds = parseFloat(trimmed)
  if (!isNaN(seconds) && seconds >= 0) return Math.round(seconds * 1000)

  return null
}

export function parseSrt(content: string): SubtitleEntry[] {
  const entries: SubtitleEntry[] = []

  const blocks = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\n+/)

  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim() !== '')
    if (lines.length < 2) continue

    const index = parseInt(lines[0], 10)
    if (isNaN(index)) continue

    const timeMatch = lines[1].match(
      /^(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})$/
    )
    if (!timeMatch) continue

    const startTimeMs = srtTimeToMs(timeMatch[1])
    const endTimeMs = srtTimeToMs(timeMatch[2])
    const text = lines.slice(2).join('\n')

    entries.push({
      id: crypto.randomUUID(),
      index,
      startTimeMs,
      endTimeMs,
      text,
      bilingualText: '',
    })
  }

  return entries
}

export function serializeSrt(entries: SubtitleEntry[], bilingual: boolean = false): string {
  return entries
    .map((entry, i) => {
      const index = i + 1
      const start = msToSrtTime(entry.startTimeMs)
      const end = msToSrtTime(entry.endTimeMs)
      const textLines = bilingual && entry.bilingualText
        ? entry.text + '\n' + entry.bilingualText
        : entry.text
      return `${index}\n${start} --> ${end}\n${textLines}`
    })
    .join('\n\n')
}