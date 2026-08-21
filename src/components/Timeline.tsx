import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useVideoStore } from '../store/useVideoStore'
import { formatTime } from '../utils/timeFormatting'
import { percentToTime, timeToPercent } from '../utils/playback'
import TimestampInput from './TimestampInput'

type DragKind = 'start' | 'end' | 'playhead'

const Timeline: React.FC = () => {
  const videoFile = useVideoStore((s) => s.videoFile)
  const mode = useVideoStore((s) => s.mode)
  const trimSettings = useVideoStore((s) => s.trimSettings)
  const setTrimSettings = useVideoStore((s) => s.setTrimSettings)
  const currentTime = useVideoStore((s) => s.currentTime)
  const segmentInPoint = useVideoStore((s) => s.segmentInPoint)
  const requestSeek = useVideoStore((s) => s.requestSeek)
  const setScrubbing = useVideoStore((s) => s.setScrubbing)
  const markTrimIn = useVideoStore((s) => s.markTrimIn)
  const markTrimOut = useVideoStore((s) => s.markTrimOut)
  const markSegmentIn = useVideoStore((s) => s.markSegmentIn)
  const markSegmentOut = useVideoStore((s) => s.markSegmentOut)
  const addSegmentAtPlayhead = useVideoStore((s) => s.addSegmentAtPlayhead)

  const barRef = useRef<HTMLDivElement | null>(null)
  const [dragKind, setDragKind] = useState<DragKind | null>(null)

  const duration = videoFile?.duration ?? 0

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const bar = barRef.current
      if (!bar || duration <= 0) return 0
      const rect = bar.getBoundingClientRect()
      const p = (clientX - rect.left) / rect.width
      return percentToTime(p, duration)
    },
    [duration]
  )

  useEffect(() => {
    if (!dragKind) return

    const onMove = (event: MouseEvent) => {
      const time = timeFromClientX(event.clientX)
      if (dragKind === 'start') {
        setTrimSettings({ startTime: Math.min(time, trimSettings.endTime - 0.1) })
        requestSeek(Math.min(time, trimSettings.endTime - 0.1))
      } else if (dragKind === 'end') {
        setTrimSettings({ endTime: Math.max(time, trimSettings.startTime + 0.1) })
        requestSeek(Math.max(time, trimSettings.startTime + 0.1))
      } else {
        requestSeek(time)
      }
    }

    const onUp = () => {
      setDragKind(null)
      setScrubbing(false)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [
    dragKind,
    requestSeek,
    setScrubbing,
    setTrimSettings,
    timeFromClientX,
    trimSettings.endTime,
    trimSettings.startTime,
  ])

  if (!videoFile) return null

  const startDrag = (kind: DragKind) => {
    setDragKind(kind)
    setScrubbing(true)
  }

  const startPercentage = timeToPercent(trimSettings.startTime, duration)
  const endPercentage = timeToPercent(trimSettings.endTime, duration)
  const playheadPercentage = timeToPercent(currentTime, duration)
  const inPointPercentage =
    segmentInPoint != null ? timeToPercent(segmentInPoint, duration) : null
  const isTrim = mode === 'trim'

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-xl font-semibold">{isTrim ? 'Trim Timeline' : 'Playback Timeline'}</h2>
        <div className="flex items-center gap-2">
          {isTrim ? (
            <>
              <button
                type="button"
                onClick={markTrimIn}
                className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50"
                title="Set trim start to playhead (I)"
              >
                I · Start
              </button>
              <button
                type="button"
                onClick={markTrimOut}
                className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50"
                title="Set trim end to playhead (O)"
              >
                O · End
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={markSegmentIn}
                className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50"
                title="Mark segment in-point (I)"
              >
                I · In
              </button>
              <button
                type="button"
                onClick={markSegmentOut}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary-500 hover:bg-primary-600 text-white"
                title="Close segment at playhead (O)"
              >
                O · Out
              </button>
              <button
                type="button"
                onClick={addSegmentAtPlayhead}
                className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50"
              >
                Add 10s here
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {isTrim && (
          <div className="flex justify-between items-start text-sm">
            <TimestampInput
              label="Start Time"
              value={trimSettings.startTime}
              onChange={(v) => {
                const startTime = Math.min(v, trimSettings.endTime - 1)
                setTrimSettings({ startTime })
                requestSeek(startTime)
              }}
              min={0}
              max={trimSettings.endTime - 1}
              step={1}
            />

            <div className="text-center pt-5">
              <span className="text-lg font-medium">
                {formatTime(trimSettings.endTime - trimSettings.startTime)} selected
              </span>
              <p className="text-xs text-gray-500 mt-1">{formatTime(currentTime)} playhead</p>
            </div>

            <TimestampInput
              label="End Time"
              value={trimSettings.endTime}
              onChange={(v) => {
                const endTime = Math.max(v, trimSettings.startTime + 1)
                setTrimSettings({ endTime })
                requestSeek(endTime)
              }}
              min={trimSettings.startTime + 1}
              max={videoFile.duration}
              step={1}
            />
          </div>
        )}

        {!isTrim && (
          <div className="text-sm text-gray-600">
            Playhead {formatTime(currentTime)}
            {segmentInPoint != null && (
              <span className="ml-2 text-primary-600">
                · in-point {formatTime(segmentInPoint)}
              </span>
            )}
          </div>
        )}

        <div
          ref={barRef}
          className="relative h-12 bg-gray-200 rounded-lg cursor-pointer select-none"
          onMouseDown={(event) => {
            if (event.button !== 0) return
            const target = event.target as HTMLElement
            if (target.dataset.handle) return
            startDrag('playhead')
            requestSeek(timeFromClientX(event.clientX))
          }}
        >
          {isTrim && (
            <div
              className="absolute h-full bg-primary-500 opacity-30 rounded-lg"
              style={{
                left: `${startPercentage}%`,
                width: `${Math.max(0, endPercentage - startPercentage)}%`
              }}
            />
          )}

          {inPointPercentage != null && (
            <div
              className="absolute top-0 h-full w-0.5 bg-amber-500 z-10"
              style={{ left: `${inPointPercentage}%` }}
              title="Segment in-point"
            />
          )}

          {isTrim && (
            <>
              <div
                data-handle="start"
                className="absolute w-4 h-full bg-primary-600 rounded-l-lg cursor-ew-resize hover:bg-primary-700 transition-colors z-20"
                style={{ left: `${startPercentage}%` }}
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  startDrag('start')
                }}
              >
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded pointer-events-none" />
              </div>

              <div
                data-handle="end"
                className="absolute w-4 h-full bg-primary-600 rounded-r-lg cursor-ew-resize hover:bg-primary-700 transition-colors z-20"
                style={{ left: `${endPercentage}%`, marginLeft: '-16px' }}
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  startDrag('end')
                }}
              >
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded pointer-events-none" />
              </div>
            </>
          )}

          <div
            data-testid="playhead"
            className="absolute top-0 h-full w-0.5 bg-white z-30 pointer-events-none"
            style={{ left: `${playheadPercentage}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white rounded-sm rotate-45" />
          </div>
        </div>

        <div className="flex justify-between text-xs text-gray-500">
          <span>0:00</span>
          <span className="text-gray-400">
            Space play/pause · I/O mark · click timeline to seek
          </span>
          <span>{formatTime(videoFile.duration)}</span>
        </div>
      </div>
    </div>
  )
}

export default Timeline
