import React from 'react'
import { useVideoStore } from '../store/useVideoStore'
import type { AppMode } from '../types'

const modes: { value: AppMode; label: string; description: string }[] = [
  { value: 'trim', label: 'Trim', description: 'Single segment trim' },
  { value: 'multi-cut', label: 'Multi-Cut & Merge', description: 'Cut multiple segments, merge into one' },
  { value: 'merge', label: 'Merge Videos', description: 'Combine multiple videos' },
]

const ModeSelector: React.FC = () => {
  const { mode, setMode } = useVideoStore()

  return (
    <div className="flex gap-1 bg-gray-200 rounded-lg p-1">
      {modes.map((m) => (
        <button
          key={m.value}
          onClick={() => setMode(m.value)}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            mode === m.value
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
          title={m.description}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

export default ModeSelector
