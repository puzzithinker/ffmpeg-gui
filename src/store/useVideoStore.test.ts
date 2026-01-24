import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVideoStore } from './useVideoStore';
import type { VideoFile, SubtitleFile } from '../types';

describe('useVideoStore', () => {
  beforeEach(() => {
    // Reset store before each test
    const { result } = renderHook(() => useVideoStore());
    act(() => {
      result.current.reset();
    });
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useVideoStore());

    expect(result.current.videoFile).toBeNull();
    expect(result.current.subtitleFile).toBeNull();
    expect(result.current.trimSettings).toEqual({ startTime: 0, endTime: 0 });
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.processingProgress).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.currentJobId).toBeNull();
  });

  it('should set video file', () => {
    const { result } = renderHook(() => useVideoStore());
    const videoFile: VideoFile = {
      path: '/test/video.mp4',
      name: 'video.mp4',
      duration: 120,
    };

    act(() => {
      result.current.setVideoFile(videoFile);
    });

    expect(result.current.videoFile).toEqual(videoFile);
  });

  it('should set subtitle file', () => {
    const { result } = renderHook(() => useVideoStore());
    const subtitleFile: SubtitleFile = {
      path: '/test/subtitle.srt',
      name: 'subtitle.srt',
    };

    act(() => {
      result.current.setSubtitleFile(subtitleFile);
    });

    expect(result.current.subtitleFile).toEqual(subtitleFile);
  });

  it('should update trim settings partially', () => {
    const { result } = renderHook(() => useVideoStore());

    act(() => {
      result.current.setTrimSettings({ startTime: 10 });
    });

    expect(result.current.trimSettings).toEqual({ startTime: 10, endTime: 0 });

    act(() => {
      result.current.setTrimSettings({ endTime: 60 });
    });

    expect(result.current.trimSettings).toEqual({ startTime: 10, endTime: 60 });
  });

  it('should set processing state', () => {
    const { result } = renderHook(() => useVideoStore());

    act(() => {
      result.current.setProcessing(true);
    });

    expect(result.current.isProcessing).toBe(true);

    act(() => {
      result.current.setProcessing(false);
    });

    expect(result.current.isProcessing).toBe(false);
  });

  it('should set processing progress', () => {
    const { result } = renderHook(() => useVideoStore());
    const progress = { currentTime: 30, percentage: 50 };

    act(() => {
      result.current.setProcessingProgress(progress);
    });

    expect(result.current.processingProgress).toEqual(progress);
  });

  it('should set error', () => {
    const { result } = renderHook(() => useVideoStore());
    const errorMessage = 'Test error message';

    act(() => {
      result.current.setError(errorMessage);
    });

    expect(result.current.error).toBe(errorMessage);

    act(() => {
      result.current.setError(null);
    });

    expect(result.current.error).toBeNull();
  });

  it('should set current job ID', () => {
    const { result } = renderHook(() => useVideoStore());
    const jobId = 'test-job-id-123';

    act(() => {
      result.current.setCurrentJobId(jobId);
    });

    expect(result.current.currentJobId).toBe(jobId);
  });

  it('should reset to initial state', () => {
    const { result } = renderHook(() => useVideoStore());
    const videoFile: VideoFile = {
      path: '/test/video.mp4',
      name: 'video.mp4',
      duration: 120,
    };

    // Set various state values
    act(() => {
      result.current.setVideoFile(videoFile);
      result.current.setProcessing(true);
      result.current.setError('Test error');
      result.current.setTrimSettings({ startTime: 10, endTime: 60 });
      result.current.setCurrentJobId('job-123');
    });

    // Verify state was set
    expect(result.current.videoFile).toEqual(videoFile);
    expect(result.current.isProcessing).toBe(true);
    expect(result.current.error).toBe('Test error');

    // Reset
    act(() => {
      result.current.reset();
    });

    // Verify all state is back to initial values
    expect(result.current.videoFile).toBeNull();
    expect(result.current.subtitleFile).toBeNull();
    expect(result.current.trimSettings).toEqual({ startTime: 0, endTime: 0 });
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.processingProgress).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.currentJobId).toBeNull();
  });

  it('should handle multiple state updates in sequence', () => {
    const { result } = renderHook(() => useVideoStore());

    act(() => {
      result.current.setVideoFile({
        path: '/video1.mp4',
        name: 'video1.mp4',
        duration: 100,
      });
      result.current.setTrimSettings({ startTime: 5 });
      result.current.setTrimSettings({ endTime: 95 });
      result.current.setProcessing(true);
    });

    expect(result.current.videoFile?.name).toBe('video1.mp4');
    expect(result.current.trimSettings).toEqual({ startTime: 5, endTime: 95 });
    expect(result.current.isProcessing).toBe(true);
  });
});
