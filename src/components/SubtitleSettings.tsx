import React from 'react'
import { useVideoStore } from '../store/useVideoStore'

const SubtitleSettings: React.FC = () => {
  const { subtitleSettings, setSubtitleSettings } = useVideoStore()

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Subtitle Style</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Font Name</label>
          <input
            type="text"
            value={subtitleSettings.font}
            onChange={(e) => setSubtitleSettings({ font: e.target.value })}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            placeholder="e.g. Arial, DejaVu Sans, Noto Sans"
          />
          <p className="mt-1 text-xs text-gray-400">
            Leave empty for default. Uses system fonts via fontconfig.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs text-gray-500">Font Size</label>
            <span className="text-sm font-medium text-gray-700">{subtitleSettings.fontSize}</span>
          </div>
          <input
            type="range"
            min={8}
            max={72}
            step={1}
            value={subtitleSettings.fontSize}
            onChange={(e) => setSubtitleSettings({ fontSize: parseInt(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>8</span>
            <span>72</span>
          </div>
        </div>

        {(subtitleSettings.font || subtitleSettings.fontSize !== 24) && (
          <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-600">
            <span className="font-medium">FFmpeg force_style: </span>
            <code className="text-xs bg-gray-200 px-1.5 py-0.5 rounded">
              {[
                subtitleSettings.font && `FontName=${subtitleSettings.font}`,
                `FontSize=${subtitleSettings.fontSize}`,
              ].filter(Boolean).join(',')}
            </code>
          </div>
        )}
      </div>
    </div>
  )
}

export default SubtitleSettings
