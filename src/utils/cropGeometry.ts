import type { CropSettings } from '../types'

export interface Size {
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move'

export function evenFloor(value: number): number {
  const v = Math.max(0, Math.floor(value))
  return v - (v % 2)
}

/** object-fit: contain destination rect inside a container. */
export function containRect(container: Size, video: Size): Rect {
  if (container.width <= 0 || container.height <= 0 || video.width <= 0 || video.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const scale = Math.min(container.width / video.width, container.height / video.height)
  const width = video.width * scale
  const height = video.height * scale
  return {
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
    width,
    height,
  }
}

export function cropToDisplayRect(
  crop: Pick<CropSettings, 'x' | 'y' | 'width' | 'height'>,
  video: Size,
  displayed: Rect
): Rect {
  if (video.width <= 0 || video.height <= 0 || displayed.width <= 0 || displayed.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const sx = displayed.width / video.width
  const sy = displayed.height / video.height
  return {
    x: displayed.x + crop.x * sx,
    y: displayed.y + crop.y * sy,
    width: crop.width * sx,
    height: crop.height * sy,
  }
}

export function displayDeltaToVideo(
  dx: number,
  dy: number,
  video: Size,
  displayed: Rect
): { dx: number; dy: number } {
  if (displayed.width <= 0 || displayed.height <= 0) {
    return { dx: 0, dy: 0 }
  }
  return {
    dx: (dx / displayed.width) * video.width,
    dy: (dy / displayed.height) * video.height,
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

export function applyCropDrag(
  crop: Pick<CropSettings, 'x' | 'y' | 'width' | 'height'>,
  handle: CropHandle,
  dx: number,
  dy: number,
  video: Size
): Pick<CropSettings, 'x' | 'y' | 'width' | 'height'> {
  const minSize = 2
  const maxW = evenFloor(video.width) || 0
  const maxH = evenFloor(video.height) || 0
  if (maxW < minSize || maxH < minSize) {
    return { x: 0, y: 0, width: minSize, height: minSize }
  }

  let x = crop.x
  let y = crop.y
  let width = crop.width
  let height = crop.height

  if (handle === 'move') {
    x = clamp(x + dx, 0, maxW - width)
    y = clamp(y + dy, 0, maxH - height)
  } else {
    if (handle.includes('e')) {
      width = clamp(width + dx, minSize, maxW - x)
    }
    if (handle.includes('s')) {
      height = clamp(height + dy, minSize, maxH - y)
    }
    if (handle.includes('w')) {
      const nextX = clamp(x + dx, 0, x + width - minSize)
      width = width + (x - nextX)
      x = nextX
    }
    if (handle.includes('n')) {
      const nextY = clamp(y + dy, 0, y + height - minSize)
      height = height + (y - nextY)
      y = nextY
    }
  }

  x = evenFloor(x)
  y = evenFloor(y)
  width = Math.max(minSize, evenFloor(width))
  height = Math.max(minSize, evenFloor(height))
  if (x + width > maxW) {
    width = Math.max(minSize, evenFloor(maxW - x))
  }
  if (y + height > maxH) {
    height = Math.max(minSize, evenFloor(maxH - y))
  }

  return { x, y, width, height }
}

export function fullFrameCrop(width: number, height: number): CropSettings {
  const w = Math.max(2, evenFloor(width) || 2)
  const h = Math.max(2, evenFloor(height) || 2)
  return { enabled: false, width: w, height: h, x: 0, y: 0 }
}
