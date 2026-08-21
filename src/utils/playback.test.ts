import { describe, expect, it } from 'vitest'
import type { SubtitleEntry } from '../types'
import {
  clampTime,
  findActiveCue,
  overlayFontSizePx,
  overlayLines,
  percentToTime,
  timeToPercent,
} from './playback'

const cue = (overrides: Partial<SubtitleEntry>): SubtitleEntry => ({
  id: 'a',
  index: 1,
  startTimeMs: 1000,
  endTimeMs: 2000,
  text: '你好',
  bilingualText: 'Olá',
  ...overrides,
})

describe('clampTime / percent', () => {
  it('clamps to [0, duration]', () => {
    expect(clampTime(-1, 10)).toBe(0)
    expect(clampTime(11, 10)).toBe(10)
    expect(clampTime(5, 10)).toBe(5)
    expect(clampTime(5, 0)).toBe(0)
  })

  it('converts time to percent and back', () => {
    expect(timeToPercent(25, 100)).toBe(25)
    expect(percentToTime(0.25, 100)).toBe(25)
    expect(timeToPercent(0, 0)).toBe(0)
  })
})

describe('findActiveCue', () => {
  const entries = [
    cue({ id: '1', startTimeMs: 0, endTimeMs: 1000 }),
    cue({ id: '2', startTimeMs: 1000, endTimeMs: 2500 }),
    cue({ id: '3', startTimeMs: 4000, endTimeMs: 5000 }),
  ]

  it('returns the cue that contains time (start inclusive, end exclusive)', () => {
    expect(findActiveCue(entries, 0)?.id).toBe('1')
    expect(findActiveCue(entries, 999)?.id).toBe('1')
    expect(findActiveCue(entries, 1000)?.id).toBe('2')
    expect(findActiveCue(entries, 2499)?.id).toBe('2')
  })

  it('returns null in gaps and at the exclusive end', () => {
    expect(findActiveCue(entries, 2500)).toBeNull()
    expect(findActiveCue(entries, 3000)).toBeNull()
    expect(findActiveCue(entries, 5000)).toBeNull()
  })
})

describe('overlayLines', () => {
  it('uses primary text when not bilingual', () => {
    expect(overlayLines(cue({}), false, 'after')).toEqual(['你好'])
  })

  it('stacks primary then secondary when position is after', () => {
    expect(overlayLines(cue({}), true, 'after')).toEqual(['你好', 'Olá'])
  })

  it('stacks secondary first when position is before', () => {
    expect(overlayLines(cue({}), true, 'before')).toEqual(['Olá', '你好'])
  })

  it('drops empty bilingual lines', () => {
    expect(overlayLines(cue({ bilingualText: '  ' }), true, 'after')).toEqual(['你好'])
  })
})

describe('overlayFontSizePx', () => {
  it('auto-scales from displayed height', () => {
    expect(overlayFontSizePx(1080, true, 24)).toBeCloseTo(48.6)
    expect(overlayFontSizePx(200, true, 24)).toBe(14)
  })

  it('treats custom size as 1080p-relative', () => {
    expect(overlayFontSizePx(1080, false, 24)).toBe(24)
    expect(overlayFontSizePx(540, false, 24)).toBe(12)
  })
})
