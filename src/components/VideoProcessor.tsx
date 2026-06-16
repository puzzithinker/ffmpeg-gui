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

const VideoProcessor: React.FC = () => {
  const { videoFile, subtitleFile, mode, error, isEditingSubtitles } = useVideoStore()

  return (
    <div className="max-w-6xl mx-auto space-y-6">
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
