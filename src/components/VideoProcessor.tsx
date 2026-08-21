import React from 'react'
import { useVideoStore } from '../store/useVideoStore'
import FileSelector from './FileSelector'
import VideoPreview from './VideoPreview'
import Timeline from './Timeline'
import ProcessingPanel from './ProcessingPanel'
import ErrorAlert from './ErrorAlert'
import ModeSelector from './ModeSelector'
import SegmentEditor from './SegmentEditor'
import MergeFileList from './MergeFileList'
import CropSettings from './CropSettings'
import SubtitleSettings from './SubtitleSettings'
import SubtitleEditor from './SubtitleEditor'
import { usePlaybackShortcuts } from '../hooks/usePlaybackShortcuts'
import { useFileDrop } from '../hooks/useFileDrop'

const VideoProcessor: React.FC = () => {
  const videoFile = useVideoStore((s) => s.videoFile)
  const subtitleFile = useVideoStore((s) => s.subtitleFile)
  const mode = useVideoStore((s) => s.mode)
  const error = useVideoStore((s) => s.error)
  const isEditingSubtitles = useVideoStore((s) => s.isEditingSubtitles)
  const fileDragActive = useFileDrop()
  usePlaybackShortcuts()

  return (
    <div className="max-w-6xl mx-auto space-y-6 relative">
      {fileDragActive && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary-900/40">
          <div className="rounded-lg bg-white px-8 py-6 text-center shadow-xl">
            <p className="text-lg font-semibold text-gray-900">Drop to load</p>
            <p className="text-sm text-gray-500 mt-1">
              {mode === 'merge'
                ? 'Video files will be added to the merge list'
                : mode === 'trim'
                  ? 'Video and subtitle files are accepted'
                  : 'Drop a video to replace the current file'}
            </p>
          </div>
        </div>
      )}

      {error && <ErrorAlert message={error} />}

      <ModeSelector />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {mode === 'trim' && (
            <>
              <FileSelector />
              {videoFile && <VideoPreview />}
              {videoFile && <Timeline />}
              {videoFile && <CropSettings />}
              {isEditingSubtitles && subtitleFile && <SubtitleEditor />}
              {!isEditingSubtitles && subtitleFile && <SubtitleSettings />}
            </>
          )}

          {mode === 'multi-cut' && (
            <>
              <FileSelector />
              {videoFile && <VideoPreview />}
              {videoFile && <Timeline />}
              {videoFile && <CropSettings />}
              {videoFile && <SegmentEditor />}
            </>
          )}

          {mode === 'merge' && (
            <MergeFileList />
          )}
        </div>

        <div className="space-y-6">
          <ProcessingPanel />
        </div>
      </div>
    </div>
  )
}

export default VideoProcessor
