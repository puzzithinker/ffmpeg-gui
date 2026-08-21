import React, { useEffect, useRef, useState } from 'react'
import { useVideoStore } from '../store/useVideoStore'
import { tauriAPI } from '../lib/tauri-api'
import { logger } from '../lib/logger'
import { findActiveCue } from '../utils/playback'
import { containRect, cropToDisplayRect } from '../utils/cropGeometry'
import SubtitleOverlay from './SubtitleOverlay'
import CropOverlay from './CropOverlay'

const VideoPreview: React.FC = () => {
  const videoFile = useVideoStore((s) => s.videoFile)
  const brightness = useVideoStore((s) => s.brightness)
  const setBrightness = useVideoStore((s) => s.setBrightness)
  const isProcessing = useVideoStore((s) => s.isProcessing)
  const subtitleFile = useVideoStore((s) => s.subtitleFile)
  const subtitleEdit = useVideoStore((s) => s.subtitleEdit)
  const subtitleSettings = useVideoStore((s) => s.subtitleSettings)
  const cropSettings = useVideoStore((s) => s.cropSettings)
  const setCropSettings = useVideoStore((s) => s.setCropSettings)
  const currentTime = useVideoStore((s) => s.currentTime)
  const isScrubbing = useVideoStore((s) => s.isScrubbing)
  const seekTarget = useVideoStore((s) => s.seekTarget)
  const seekVersion = useVideoStore((s) => s.seekVersion)
  const playbackIntent = useVideoStore((s) => s.playbackIntent)
  const playbackIntentVersion = useVideoStore((s) => s.playbackIntentVersion)
  const setCurrentTime = useVideoStore((s) => s.setCurrentTime)
  const setIsPlaying = useVideoStore((s) => s.setIsPlaying)
  const setVideoDimensions = useVideoStore((s) => s.setVideoDimensions)

  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lastStoreWrite = useRef(0)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (isProcessing) {
      el.pause()
    }
  }, [isProcessing])

  const videoPath = videoFile?.path

  useEffect(() => {
    const getVideoUrl = async () => {
      if (videoPath) {
        try {
          await logger.log(`[VideoPreview] Getting video URL for: ${videoPath}`)
          const url = await tauriAPI.getVideoUrl(videoPath)
          await logger.log(`[VideoPreview] Generated video URL: ${url}`)
          setVideoUrl(url)
        } catch (error) {
          await logger.error('[VideoPreview] Failed to get video URL', error)
          setVideoUrl(null)
        }
      } else {
        setVideoUrl(null)
      }
    }

    getVideoUrl()
  }, [videoPath])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setContainerSize({ width: rect.width, height: rect.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [videoUrl])

  useEffect(() => {
    const el = videoRef.current
    if (!el || seekTarget == null) return
    if (Math.abs(el.currentTime - seekTarget) > 0.04) {
      el.currentTime = seekTarget
    }
  }, [seekVersion, seekTarget])

  useEffect(() => {
    const el = videoRef.current
    if (!el || playbackIntentVersion === 0) return
    if (playbackIntent === 'play') {
      void el.play().catch(() => {})
    } else if (playbackIntent === 'pause') {
      el.pause()
    } else if (playbackIntent === 'toggle') {
      if (el.paused) void el.play().catch(() => {})
      else el.pause()
    }
  }, [playbackIntent, playbackIntentVersion])

  if (!videoFile) return null

  const videoWidth = videoFile.width ?? 0
  const videoHeight = videoFile.height ?? 0
  const displayed =
    videoWidth > 0 && videoHeight > 0
      ? containRect(containerSize, { width: videoWidth, height: videoHeight })
      : { x: 0, y: 0, width: containerSize.width, height: containerSize.height }
  const subtitleAnchor =
    cropSettings.enabled && videoWidth > 0 && videoHeight > 0
      ? cropToDisplayRect(cropSettings, { width: videoWidth, height: videoHeight }, displayed)
      : displayed
  const activeCue = subtitleFile
    ? findActiveCue(subtitleEdit.entries, Math.round(currentTime * 1000))
    : null

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Video Preview</h2>

      <div
        ref={containerRef}
        className="relative aspect-video bg-black rounded-lg overflow-hidden"
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            controls
            src={isProcessing ? undefined : videoUrl}
            style={{ filter: `brightness(${1 + brightness / 100})` }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={(e) => {
              if (isScrubbing) return
              const now = performance.now()
              if (now - lastStoreWrite.current < 50) return
              lastStoreWrite.current = now
              setCurrentTime((e.target as HTMLVideoElement).currentTime)
            }}
            onSeeked={(e) => {
              if (isScrubbing) return
              setCurrentTime((e.target as HTMLVideoElement).currentTime)
            }}
            onLoadedMetadata={(e) => {
              const el = e.target as HTMLVideoElement
              void logger.log('[VideoPreview] Video metadata loaded')
              if (el.videoWidth > 0 && el.videoHeight > 0) {
                setVideoDimensions(el.videoWidth, el.videoHeight)
              }
            }}
            onError={async (e) => {
              const target = e.target as HTMLVideoElement
              const errorDetails = {
                code: target.error?.code,
                message: target.error?.message,
                src: videoUrl
              }
              await logger.error('[VideoPreview] Video element error', errorDetails)
            }}
            onLoadStart={async () => await logger.log('[VideoPreview] Video load started')}
            onCanPlay={async () => await logger.log('[VideoPreview] Video can play')}
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

        <CropOverlay
          crop={cropSettings}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          container={containerSize}
          onChange={(next) => setCropSettings(next)}
        />
        <SubtitleOverlay
          cue={activeCue}
          bilingual={subtitleEdit.isBilingual}
          secondaryPosition={subtitleEdit.secondaryLanguagePosition}
          font={subtitleSettings.font}
          fontSize={subtitleSettings.fontSize}
          fontSizeAuto={subtitleSettings.fontSizeAuto}
          anchor={subtitleAnchor}
        />
      </div>

      <div className="mt-4 flex justify-between items-center text-sm text-gray-500">
        <span>File: {videoFile.name}</span>
        <span>
          {videoWidth > 0 && videoHeight > 0 ? `${videoWidth}×${videoHeight} · ` : ''}
          Duration: {Math.floor(videoFile.duration / 60)}:{Math.floor(videoFile.duration % 60).toString().padStart(2, '0')}
        </span>
      </div>

      <div className="mt-4 border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Brightness</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              {brightness > 0 ? `+${brightness}%` : `${brightness}%`}
            </span>
            <button
              onClick={() => setBrightness(0)}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              Reset
            </button>
          </div>
        </div>
        <input
          type="range"
          min="-100"
          max="100"
          step="5"
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>-100%</span>
          <span>0%</span>
          <span>+100%</span>
        </div>
      </div>
    </div>
  )
}

export default VideoPreview
