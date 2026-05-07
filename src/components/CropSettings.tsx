import React from 'react'
import { useVideoStore } from '../store/useVideoStore'

const CropSettings: React.FC = () => {
  const { cropSettings, setCropSettings } = useVideoStore()

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Crop</h2>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-gray-600">Enable</span>
          <input
            type="checkbox"
            checked={cropSettings.enabled}
            onChange={(e) => setCropSettings({ enabled: e.target.checked })}
            className="w-4 h-4 text-primary-500 rounded border-gray-300 focus:ring-primary-500"
          />
        </label>
      </div>

      <div className={`space-y-4 ${cropSettings.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Width</label>
            <input
              type="number"
              min={1}
              step={2}
              value={cropSettings.width}
              onChange={(e) => setCropSettings({ width: Math.max(1, parseInt(e.target.value) || 1) })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="1920"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Height</label>
            <input
              type="number"
              min={1}
              step={2}
              value={cropSettings.height}
              onChange={(e) => setCropSettings({ height: Math.max(1, parseInt(e.target.value) || 1) })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="1080"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">X Offset</label>
            <input
              type="number"
              min={0}
              step={2}
              value={cropSettings.x}
              onChange={(e) => setCropSettings({ x: Math.max(0, parseInt(e.target.value) || 0) })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Y Offset</label>
            <input
              type="number"
              min={0}
              step={2}
              value={cropSettings.y}
              onChange={(e) => setCropSettings({ y: Math.max(0, parseInt(e.target.value) || 0) })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="0"
            />
          </div>
        </div>

        {cropSettings.enabled && (
          <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-600">
            <span className="font-medium">FFmpeg filter: </span>
            <code className="text-xs bg-gray-200 px-1.5 py-0.5 rounded">
              crop={cropSettings.width}:{cropSettings.height}:{cropSettings.x}:{cropSettings.y}
            </code>
          </div>
        )}
      </div>
    </div>
  )
}

export default CropSettings
