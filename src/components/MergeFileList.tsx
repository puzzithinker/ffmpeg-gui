import React from 'react'
import { useVideoStore } from '../store/useVideoStore'
import { tauriAPI } from '../lib/tauri-api'

const MergeFileList: React.FC = () => {
  const { mergeVideoFiles, addMergeVideo, removeMergeVideo, reorderMergeVideos, clearMergeVideos, setError } = useVideoStore()

  const handleAddFiles = async () => {
    try {
      const paths = await tauriAPI.selectMultipleVideoFiles()
      if (paths) {
        for (const path of paths) {
          const duration = await tauriAPI.getVideoDuration(path)
          const name = path.split(/[/\\]/).pop() || 'Unknown'
          addMergeVideo({ path, name, duration })
        }
      }
    } catch (error) {
      setError(`Failed to load video: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString())
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (fromIndex !== toIndex) {
      reorderMergeVideos(fromIndex, toIndex)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Videos to Merge</h2>
        <div className="flex gap-2">
          {mergeVideoFiles.length > 0 && (
            <button
              onClick={clearMergeVideos}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md"
            >
              Clear All
            </button>
          )}
          <button
            onClick={handleAddFiles}
            className="px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-md"
          >
            + Add Videos
          </button>
        </div>
      </div>

      {mergeVideoFiles.length === 0 && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <p className="text-gray-500">No videos selected</p>
          <p className="text-gray-400 text-sm mt-1">Click &quot;+ Add Videos&quot; to select files</p>
        </div>
      )}

      <div className="space-y-2">
        {mergeVideoFiles.map((file, index) => (
          <div
            key={`${file.path}-${index}`}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragOver={handleDragOver}
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-grab active:cursor-grabbing"
          >
            <div className="flex-shrink-0 text-gray-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
              </svg>
            </div>

            <span className="text-sm font-medium text-gray-500 w-6">{index + 1}.</span>

            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{file.name}</p>
              <p className="text-xs text-gray-500 truncate">{file.path}</p>
            </div>

            <span className="text-sm text-gray-500 flex-shrink-0">
              {Math.floor(file.duration / 60)}:{String(Math.floor(file.duration % 60)).padStart(2, '0')}
            </span>

            <button
              onClick={() => removeMergeVideo(index)}
              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
              title="Remove"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {mergeVideoFiles.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-600">
          <span className="font-medium">{mergeVideoFiles.length} videos</span> · Total duration:{' '}
          {(() => {
            const total = mergeVideoFiles.reduce((sum, f) => sum + f.duration, 0)
            return `${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, '0')}`
          })()}
        </div>
      )}
    </div>
  )
}

export default MergeFileList
