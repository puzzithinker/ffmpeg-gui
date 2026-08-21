import React, { useRef } from 'react'
import type { CropHandle } from '../utils/cropGeometry'
import {
  applyCropDrag,
  containRect,
  cropToDisplayRect,
  displayDeltaToVideo,
} from '../utils/cropGeometry'
import type { CropSettings } from '../types'

const HANDLES: Exclude<CropHandle, 'move'>[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const handleClass: Record<Exclude<CropHandle, 'move'>, string> = {
  n: 'cursor-ns-resize left-1/2 top-0 -translate-x-1/2 -translate-y-1/2',
  s: 'cursor-ns-resize left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2',
  e: 'cursor-ew-resize right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
  w: 'cursor-ew-resize left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
  ne: 'cursor-nesw-resize right-0 top-0 translate-x-1/2 -translate-y-1/2',
  nw: 'cursor-nwse-resize left-0 top-0 -translate-x-1/2 -translate-y-1/2',
  se: 'cursor-nwse-resize right-0 bottom-0 translate-x-1/2 translate-y-1/2',
  sw: 'cursor-nesw-resize left-0 bottom-0 -translate-x-1/2 translate-y-1/2',
}

interface CropOverlayProps {
  crop: CropSettings
  videoWidth: number
  videoHeight: number
  container: { width: number; height: number }
  onChange: (next: Pick<CropSettings, 'x' | 'y' | 'width' | 'height'>) => void
}

const CropOverlay: React.FC<CropOverlayProps> = ({
  crop,
  videoWidth,
  videoHeight,
  container,
  onChange,
}) => {
  const dragRef = useRef<{
    handle: CropHandle
    startX: number
    startY: number
    origin: Pick<CropSettings, 'x' | 'y' | 'width' | 'height'>
  } | null>(null)

  if (!crop.enabled || videoWidth <= 0 || videoHeight <= 0 || container.width <= 0) {
    return null
  }

  const video = { width: videoWidth, height: videoHeight }
  const displayed = containRect(container, video)
  const box = cropToDisplayRect(crop, video, displayed)

  const onPointerDown = (handle: CropHandle) => (event: React.PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    dragRef.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
    }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const delta = displayDeltaToVideo(
      event.clientX - drag.startX,
      event.clientY - drag.startY,
      video,
      displayed
    )
    onChange(applyCropDrag(drag.origin, drag.handle, delta.dx, delta.dy, video))
  }

  const endDrag = () => {
    dragRef.current = null
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div
        className="pointer-events-none absolute border-2 border-primary-400"
        style={{
          left: box.x,
          top: box.y,
          width: box.width,
          height: box.height,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
        }}
      >
        <div
          className="pointer-events-auto absolute left-1/2 top-1 z-10 h-4 w-10 -translate-x-1/2 cursor-move rounded-sm bg-primary-500"
          title="Drag to move crop"
          onPointerDown={onPointerDown('move')}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        {HANDLES.map((handle) => (
          <div
            key={handle}
            className={`pointer-events-auto absolute z-10 h-3 w-3 rounded-sm bg-white border border-primary-600 ${handleClass[handle]}`}
            onPointerDown={onPointerDown(handle)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        ))}
      </div>
    </div>
  )
}

export default CropOverlay
