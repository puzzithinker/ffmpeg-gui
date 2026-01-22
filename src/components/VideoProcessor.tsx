import React from 'react'
import { useVideoStore } from '../store/useVideoStore'
import FileSelector from './FileSelector'
import VideoPreview from './VideoPreview'
import Timeline from './Timeline'
import ProcessingPanel from './ProcessingPanel'
import ErrorAlert from './ErrorAlert'

const VideoProcessor: React.FC = () => {
  const { videoFile, error } = useVideoStore()

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {error && <ErrorAlert message={error} />}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <FileSelector />
          {videoFile && <VideoPreview />}
          {videoFile && <Timeline />}
        </div>
        
        <div className="space-y-6">
          <ProcessingPanel />
        </div>
      </div>
    </div>
  )
}

export default VideoProcessor