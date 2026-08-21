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
    // Near-original re-encode default (CRF 8), not the old "delivery" default of 18.
    expect(result.current.qualitySettings).toEqual({ mode: 'copy', crf: 8 });
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
    expect(result.current.qualitySettings).toEqual({ mode: 'copy', crf: 8 });
  });

  it('setQualitySettings merges partial updates and reset restores CRF 8', () => {
    const { result } = renderHook(() => useVideoStore());

    act(() => {
      result.current.setQualitySettings({ mode: 'reencode', crf: 23 });
    });
    expect(result.current.qualitySettings).toEqual({ mode: 'reencode', crf: 23 });

    act(() => {
      result.current.setQualitySettings({ crf: 8 });
    });
    expect(result.current.qualitySettings).toEqual({ mode: 'reencode', crf: 8 });

    act(() => {
      result.current.reset();
    });
    expect(result.current.qualitySettings).toEqual({ mode: 'copy', crf: 8 });
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

  it('requestSeek clamps to duration and bumps seekVersion', () => {
    const { result } = renderHook(() => useVideoStore());

    act(() => {
      result.current.setVideoFile({ path: '/a.mp4', name: 'a.mp4', duration: 10, width: 1280, height: 720 });
      result.current.requestSeek(4.5);
    });
    expect(result.current.currentTime).toBe(4.5);
    expect(result.current.seekTarget).toBe(4.5);
    const version = result.current.seekVersion;

    act(() => {
      result.current.requestSeek(99);
    });
    expect(result.current.currentTime).toBe(10);
    expect(result.current.seekVersion).toBe(version + 1);
  });

  it('markTrimIn/Out use the playhead', () => {
    const { result } = renderHook(() => useVideoStore());

    act(() => {
      result.current.setVideoFile({ path: '/a.mp4', name: 'a.mp4', duration: 20 });
      result.current.setTrimSettings({ startTime: 0, endTime: 20 });
      result.current.setCurrentTime(3);
      result.current.markTrimIn();
      result.current.setCurrentTime(8);
      result.current.markTrimOut();
    });

    expect(result.current.trimSettings).toEqual({ startTime: 3, endTime: 8 });
  });

  it('markSegmentIn/Out create a segment from the playhead window', () => {
    const { result } = renderHook(() => useVideoStore());

    act(() => {
      result.current.setVideoFile({ path: '/a.mp4', name: 'a.mp4', duration: 30 });
      result.current.setCurrentTime(2);
      result.current.markSegmentIn();
      result.current.setCurrentTime(7);
      result.current.markSegmentOut();
    });

    expect(result.current.segments).toHaveLength(1);
    expect(result.current.segments[0].startTime).toBe(2);
    expect(result.current.segments[0].endTime).toBe(7);
    expect(result.current.segmentInPoint).toBeNull();
  });

  it('setCueStartFromPlayhead updates the cue and marks dirty', () => {
    const { result } = renderHook(() => useVideoStore());

    act(() => {
      result.current.setVideoFile({ path: '/a.mp4', name: 'a.mp4', duration: 30 });
      result.current.hydrateSubtitleEntries([
        { id: 'c1', index: 1, startTimeMs: 0, endTimeMs: 4000, text: 'Hi', bilingualText: '' },
      ]);
      result.current.setCurrentTime(1.25);
      result.current.setCueStartFromPlayhead('c1');
    });

    expect(result.current.subtitleEdit.entries[0].startTimeMs).toBe(1250);
    expect(result.current.subtitleEdit.isDirty).toBe(true);
  });

  it('setVideoFile with dimensions seeds a full-frame crop', () => {
    const { result } = renderHook(() => useVideoStore());

    act(() => {
      result.current.setVideoFile({
        path: '/a.mp4',
        name: 'a.mp4',
        duration: 10,
        width: 1280,
        height: 720,
      });
    });

    expect(result.current.cropSettings).toEqual({
      enabled: false,
      width: 1280,
      height: 720,
      x: 0,
      y: 0,
    });
    expect(result.current.currentTime).toBe(0);
  });
});
