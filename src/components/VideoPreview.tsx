import React, { useState, useEffect } from 'react'
import { useVideoStore } from '../store/useVideoStore'
import { tauriAPI } from '../lib/tauri-api'

const VideoPreview: React.FC = () => {
  const { videoFile } = useVideoStore()
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  useEffect(() => {
    const getVideoUrl = async () => {
      if (videoFile) {
        try {
          console.log('[VideoPreview] Getting video URL for:', videoFile.path)
          const url = await tauriAPI.getVideoUrl(videoFile.path)
          console.log('[VideoPreview] Generated video URL:', url)
          setVideoUrl(url)
        } catch (error) {
          console.error('[VideoPreview] Failed to get video URL:', error)
          setVideoUrl(null)
        }
      } else {
        setVideoUrl(null)
      }
    }

    getVideoUrl()
  }, [videoFile])

  if (!videoFile) return null

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Video Preview</h2>
      
      <div className="aspect-video bg-black rounded-lg overflow-hidden">
        {videoUrl ? (
          <video
            className="w-full h-full"
            controls
            src={videoUrl}
            onError={(e) => {
              const target = e.target as HTMLVideoElement
              console.error('[VideoPreview] Video element error:', {
                error: target.error,
                code: target.error?.code,
                message: target.error?.message,
                src: videoUrl
              })
            }}
            onLoadStart={() => console.log('[VideoPreview] Video load started')}
            onLoadedMetadata={() => console.log('[VideoPreview] Video metadata loaded')}
            onCanPlay={() => console.log('[VideoPreview] Video can play')}
          >
            Your browser does not support the video tag.
          </video>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
              <p>Loading video...</p>
            </div>
          </div>
        )}
      </div>
      
      <div className="mt-4 flex justify-between items-center text-sm text-gray-500">
        <span>File: {videoFile.name}</span>
        <span>
          Duration: {Math.floor(videoFile.duration / 60)}:{Math.floor(videoFile.duration % 60).toString().padStart(2, '0')}
        </span>
      </div>
    </div>
  )
}

export default VideoPreview