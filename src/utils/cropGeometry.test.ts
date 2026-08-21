import { describe, expect, it } from 'vitest'
import {
  applyCropDrag,
  containRect,
  cropToDisplayRect,
  evenFloor,
  fullFrameCrop,
} from './cropGeometry'

describe('evenFloor', () => {
  it('rounds down to even non-negative integers', () => {
    expect(evenFloor(1920)).toBe(1920)
    expect(evenFloor(1919)).toBe(1918)
    expect(evenFloor(-3)).toBe(0)
    expect(evenFloor(1.9)).toBe(0)
  })
})

describe('containRect', () => {
  it('letterboxes a 16:9 video in a square', () => {
    const r = containRect({ width: 200, height: 200 }, { width: 1920, height: 1080 })
    expect(r.width).toBeCloseTo(200)
    expect(r.height).toBeCloseTo(200 * (1080 / 1920))
    expect(r.x).toBeCloseTo(0)
    expect(r.y).toBeCloseTo((200 - r.height) / 2)
  })

  it('pillarboxes a 9:16 video in a 16:9 box', () => {
    const r = containRect({ width: 160, height: 90 }, { width: 1080, height: 1920 })
    expect(r.height).toBeCloseTo(90)
    expect(r.width).toBeCloseTo(90 * (1080 / 1920))
    expect(r.y).toBeCloseTo(0)
  })
})

describe('cropToDisplayRect', () => {
  it('maps source pixels onto the contained video box', () => {
    const displayed = { x: 10, y: 20, width: 200, height: 100 }
    const r = cropToDisplayRect(
      { x: 50, y: 25, width: 100, height: 50 },
      { width: 200, height: 100 },
      displayed
    )
    expect(r).toEqual({ x: 60, y: 45, width: 100, height: 50 })
  })
})

describe('applyCropDrag', () => {
  const video = { width: 1920, height: 1080 }

  it('moves the crop and clamps to the frame', () => {
    const next = applyCropDrag({ x: 10, y: 10, width: 100, height: 80 }, 'move', 20, -4, video)
    expect(next.x).toBe(30)
    expect(next.y).toBe(6)
    expect(next.width).toBe(100)
    expect(next.height).toBe(80)
  })

  it('resizes from the east handle', () => {
    const next = applyCropDrag({ x: 0, y: 0, width: 100, height: 80 }, 'e', 16, 0, video)
    expect(next).toEqual({ x: 0, y: 0, width: 116, height: 80 })
  })

  it('resizes from the west handle and keeps the right edge', () => {
    const next = applyCropDrag({ x: 40, y: 0, width: 100, height: 80 }, 'w', 10, 0, video)
    expect(next.x).toBe(50)
    expect(next.width).toBe(90)
  })

  it('snaps to even pixels', () => {
    const next = applyCropDrag({ x: 0, y: 0, width: 100, height: 80 }, 'e', 5, 0, video)
    expect(next.width % 2).toBe(0)
  })
})

describe('fullFrameCrop', () => {
  it('returns a disabled full-frame crop with even size', () => {
    expect(fullFrameCrop(1920, 1080)).toEqual({
      enabled: false,
      width: 1920,
      height: 1080,
      x: 0,
      y: 0,
    })
    expect(fullFrameCrop(1919, 1079)).toEqual({
      enabled: false,
      width: 1918,
      height: 1078,
      x: 0,
      y: 0,
    })
  })
})
