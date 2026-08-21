import React from 'react'
import { useVideoStore } from '../store/useVideoStore'
import { formatTime } from '../utils/timeFormatting'
import TimestampInput from './TimestampInput'

const SegmentEditor: React.FC = () => {
  const videoFile = useVideoStore((s) => s.videoFile)
  const segments = useVideoStore((s) => s.segments)
  const addSegment = useVideoStore((s) => s.addSegment)
  const addSegmentAtPlayhead = useVideoStore((s) => s.addSegmentAtPlayhead)
  const markSegmentIn = useVideoStore((s) => s.markSegmentIn)
  const markSegmentOut = useVideoStore((s) => s.markSegmentOut)
  const updateSegment = useVideoStore((s) => s.updateSegment)
  const removeSegment = useVideoStore((s) => s.removeSegment)
  const requestSeek = useVideoStore((s) => s.requestSeek)
  const currentTime = useVideoStore((s) => s.currentTime)
  const segmentInPoint = useVideoStore((s) => s.segmentInPoint)

  if (!videoFile) return null

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Segments</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={markSegmentIn}
            className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-sm font-medium rounded-md"
            title="Mark in-point at playhead (I)"
          >
            I · In
          </button>
          <button
            type="button"
            onClick={markSegmentOut}
            className="px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-md"
            title="Close segment at playhead (O)"
          >
            O · Out
          </button>
          <button
            type="button"
            onClick={addSegmentAtPlayhead}
            className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-sm font-medium rounded-md"
          >
            Add at playhead
          </button>
          <button
            onClick={addSegment}
            className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-sm font-medium rounded-md"
          >
            + Append
          </button>
        </div>
      </div>

      {segments.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-4">
          No segments yet. Play the video, press I then O, or add at the playhead ({formatTime(currentTime)}).
          {segmentInPoint != null && (
            <span className="block mt-1 text-primary-600">
              In-point marked at {formatTime(segmentInPoint)}
            </span>
          )}
        </p>
      )}

      <div className="space-y-3">
        {segments.map((seg, index) => {
          const duration = seg.endTime - seg.startTime
          return (
            <div
              key={seg.id}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
            >
              <button
                type="button"
                className="text-sm font-medium text-primary-600 w-8 text-left hover:underline"
                title="Seek to segment start"
                onClick={() => requestSeek(seg.startTime)}
              >
                #{index + 1}
              </button>

              <div className="flex-1 grid grid-cols-2 gap-3">
                <TimestampInput
                  label="Start"
                  value={seg.startTime}
                  onChange={(v) => updateSegment(seg.id, { startTime: Math.min(v, seg.endTime - 0.1) })}
                  min={0}
                  max={seg.endTime - 0.1}
                  step={1}
                />

                <TimestampInput
                  label="End"
                  value={seg.endTime}
                  onChange={(v) => updateSegment(seg.id, { endTime: Math.max(v, seg.startTime + 0.1) })}
                  min={seg.startTime + 0.1}
                  max={videoFile.duration}
                  step={1}
                />
              </div>

              <div className="text-right">
                <span className="text-xs text-gray-500 block">Duration</span>
                <span className="text-sm font-medium">{formatTime(duration)}</span>
              </div>

              <button
                onClick={() => removeSegment(seg.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                title="Remove segment"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>

      {segments.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-600">
          <span className="font-medium">Total output duration: </span>
          {formatTime(segments.reduce((sum, s) => sum + (s.endTime - s.startTime), 0))}
        </div>
      )}
    </div>
  )
}

export default SegmentEditor
