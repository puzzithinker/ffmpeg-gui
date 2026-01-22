import React, { useState, useCallback } from 'react'
import { useVideoStore } from '../store/useVideoStore'

const Timeline: React.FC = () => {
  const { videoFile, trimSettings, setTrimSettings } = useVideoStore()
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null)

  if (!videoFile) return null

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleMouseDown = useCallback((handle: 'start' | 'end') => {
    setIsDragging(handle)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return

    const rect = e.currentTarget.getBoundingClientRect()
    const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = percentage * videoFile.duration

    if (isDragging === 'start') {
      setTrimSettings({ startTime: Math.min(time, trimSettings.endTime - 1) })
    } else {
      setTrimSettings({ endTime: Math.max(time, trimSettings.startTime + 1) })
    }
  }, [isDragging, videoFile.duration, trimSettings, setTrimSettings])

  const handleMouseUp = useCallback(() => {
    setIsDragging(null)
  }, [])

  const startPercentage = (trimSettings.startTime / videoFile.duration) * 100
  const endPercentage = (trimSettings.endTime / videoFile.duration) * 100

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Trim Timeline</h2>
      
      <div className="space-y-4">
        <div className="flex justify-between items-center text-sm">
          <div>
            <label className="block text-gray-600">Start Time</label>
            <input
              type="number"
              min="0"
              max={videoFile.duration}
              step="0.1"
              value={trimSettings.startTime.toFixed(1)}
              onChange={(e) => setTrimSettings({ startTime: Math.max(0, Math.min(parseFloat(e.target.value), trimSettings.endTime - 1)) })}
              className="mt-1 block w-20 px-2 py-1 border border-gray-300 rounded-md text-sm"
            />
            <span className="text-gray-500">{formatTime(trimSettings.startTime)}</span>
          </div>
          
          <div className="text-center">
            <span className="text-lg font-medium">
              {formatTime(trimSettings.endTime - trimSettings.startTime)} selected
            </span>
          </div>
          
          <div>
            <label className="block text-gray-600">End Time</label>
            <input
              type="number"
              min="0"
              max={videoFile.duration}
              step="0.1"
              value={trimSettings.endTime.toFixed(1)}
              onChange={(e) => setTrimSettings({ endTime: Math.min(videoFile.duration, Math.max(parseFloat(e.target.value), trimSettings.startTime + 1)) })}
              className="mt-1 block w-20 px-2 py-1 border border-gray-300 rounded-md text-sm"
            />
            <span className="text-gray-500">{formatTime(trimSettings.endTime)}</span>
          </div>
        </div>

        <div 
          className="relative h-12 bg-gray-200 rounded-lg cursor-pointer select-none"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div 
            className="absolute h-full bg-primary-500 opacity-30 rounded-lg"
            style={{
              left: `${startPercentage}%`,
              width: `${endPercentage - startPercentage}%`
            }}
          />
          
          <div 
            className="absolute w-4 h-full bg-primary-600 rounded-l-lg cursor-ew-resize hover:bg-primary-700 transition-colors"
            style={{ left: `${startPercentage}%` }}
            onMouseDown={() => handleMouseDown('start')}
          >
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded" />
          </div>
          
          <div 
            className="absolute w-4 h-full bg-primary-600 rounded-r-lg cursor-ew-resize hover:bg-primary-700 transition-colors"
            style={{ left: `${endPercentage}%`, marginLeft: '-16px' }}
            onMouseDown={() => handleMouseDown('end')}
          >
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded" />
          </div>
        </div>

        <div className="flex justify-between text-xs text-gray-500">
          <span>0:00</span>
          <span>{formatTime(videoFile.duration)}</span>
        </div>
      </div>
    </div>
  )
}

export default Timeline