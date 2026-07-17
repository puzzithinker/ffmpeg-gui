import { describe, it, expect } from 'vitest'
import {
  requiresReencodeFilters,
  canSelectStreamCopy,
  showCrfControls,
  qualitySummaryLabel,
} from './exportQuality'

describe('exportQuality (mode-aware, matches quality-first backend)', () => {
  it('trim without filters does not require re-encode', () => {
    expect(
      requiresReencodeFilters({
        mode: 'trim',
        cropEnabled: false,
        brightness: 0,
        hasSubtitle: false,
      })
    ).toBe(false)
    expect(
      canSelectStreamCopy({
        mode: 'trim',
        cropEnabled: false,
        brightness: 0,
        hasSubtitle: false,
      })
    ).toBe(true)
  })

  it('trim with subtitle/crop/brightness requires re-encode', () => {
    expect(
      requiresReencodeFilters({
        mode: 'trim',
        cropEnabled: false,
        brightness: 0,
        hasSubtitle: true,
      })
    ).toBe(true)
    expect(
      requiresReencodeFilters({
        mode: 'trim',
        cropEnabled: true,
        brightness: 0,
        hasSubtitle: false,
      })
    ).toBe(true)
    expect(
      requiresReencodeFilters({
        mode: 'trim',
        cropEnabled: false,
        brightness: 10,
        hasSubtitle: false,
      })
    ).toBe(true)
  })

  it('multi-cut without crop does not force filters (stream-copy path)', () => {
    expect(
      requiresReencodeFilters({
        mode: 'multi-cut',
        cropEnabled: false,
        brightness: 0,
        hasSubtitle: false,
      })
    ).toBe(false)
    expect(
      canSelectStreamCopy({
        mode: 'multi-cut',
        cropEnabled: false,
        brightness: 0,
        hasSubtitle: false,
      })
    ).toBe(true)
    expect(
      showCrfControls({
        mode: 'multi-cut',
        cropEnabled: false,
        brightness: 0,
        hasSubtitle: false,
        qualityMode: 'copy',
      })
    ).toBe(false)
  })

  it('multi-cut with crop requires re-encode and shows CRF', () => {
    expect(
      requiresReencodeFilters({
        mode: 'multi-cut',
        cropEnabled: true,
        brightness: 0,
        hasSubtitle: false,
      })
    ).toBe(true)
    expect(
      showCrfControls({
        mode: 'multi-cut',
        cropEnabled: true,
        brightness: 0,
        hasSubtitle: false,
        qualityMode: 'copy',
      })
    ).toBe(true)
  })

  it('merge never pretends filters force re-encode in the UI', () => {
    // Old bug: hasFilters = true for non-trim modes.
    expect(
      requiresReencodeFilters({
        mode: 'merge',
        cropEnabled: false,
        brightness: 0,
        hasSubtitle: false,
      })
    ).toBe(false)
    expect(
      canSelectStreamCopy({
        mode: 'merge',
        cropEnabled: true,
        brightness: 50,
        hasSubtitle: true,
      })
    ).toBe(true)
    expect(
      qualitySummaryLabel({
        mode: 'merge',
        cropEnabled: false,
        brightness: 0,
        hasSubtitle: false,
        qualityMode: 'copy',
      })
    ).toMatch(/stream copy/i)
  })

  it('qualitySummaryLabel distinguishes multi-cut copy vs crop re-encode and trim copy', () => {
    expect(
      qualitySummaryLabel({
        mode: 'multi-cut',
        cropEnabled: false,
        brightness: 0,
        hasSubtitle: false,
        qualityMode: 'copy',
      })
    ).toMatch(/keyframe/i)

    expect(
      qualitySummaryLabel({
        mode: 'multi-cut',
        cropEnabled: true,
        brightness: 0,
        hasSubtitle: false,
        qualityMode: 'reencode',
      })
    ).toMatch(/re-encode/i)

    expect(
      qualitySummaryLabel({
        mode: 'trim',
        cropEnabled: false,
        brightness: 0,
        hasSubtitle: false,
        qualityMode: 'copy',
      })
    ).toBe('Exact copy')

    expect(
      qualitySummaryLabel({
        mode: 'trim',
        cropEnabled: false,
        brightness: 0,
        hasSubtitle: true,
        qualityMode: 'reencode',
      })
    ).toBe('Re-encode')
  })

  it('showCrfControls for trim follows quality mode and forced filters', () => {
    expect(
      showCrfControls({
        mode: 'trim',
        cropEnabled: false,
        brightness: 0,
        hasSubtitle: false,
        qualityMode: 'copy',
      })
    ).toBe(false)

    expect(
      showCrfControls({
        mode: 'trim',
        cropEnabled: false,
        brightness: 0,
        hasSubtitle: false,
        qualityMode: 'reencode',
      })
    ).toBe(true)

    expect(
      showCrfControls({
        mode: 'trim',
        cropEnabled: false,
        brightness: 0,
        hasSubtitle: true,
        qualityMode: 'copy',
      })
    ).toBe(true)
  })
})
