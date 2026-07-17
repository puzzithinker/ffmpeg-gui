import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProcessingPanel from './ProcessingPanel';
import { useVideoStore } from '../store/useVideoStore';
import { tauriAPI } from '../lib/tauri-api';

vi.mock('../lib/tauri-api');

const baseState = () => {
  // Reset store between tests via real setters
  useVideoStore.setState({
    mode: 'trim',
    videoFile: null,
    subtitleFile: null,
    trimSettings: { startTime: 0, endTime: 0 },
    brightness: 0,
    cropSettings: { enabled: false, width: 1920, height: 1080, x: 0, y: 0 },
    subtitleSettings: { font: '', fontSize: 24, fontSizeAuto: true },
    subtitleEdit: {
      entries: [],
      isDirty: false,
      isBilingual: false,
      primaryLanguage: 'Chinese',
      secondaryLanguage: 'Portuguese',
      secondaryLanguagePosition: 'after',
      editedFilePath: null,
    },
    segments: [],
    mergeVideoFiles: [],
    isProcessing: false,
    processingProgress: null,
    currentJobId: null,
    qualitySettings: { mode: 'copy', crf: 8 },
    error: null,
    isEditingSubtitles: false,
  });
};

describe('ProcessingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    baseState();
    vi.mocked(tauriAPI.onFFmpegProgress).mockResolvedValue(() => {});
    vi.mocked(tauriAPI.onFFmpegComplete).mockResolvedValue(() => {});
    vi.mocked(tauriAPI.onFFmpegError).mockResolvedValue(() => {});
    vi.mocked(tauriAPI.onFFmpegCancelled).mockResolvedValue(() => {});
  });

  it('should disable process button when no video file', () => {
    render(<ProcessingPanel />);
    const button = screen.getByText('Start Processing');
    expect(button).toBeDisabled();
  });

  it('should show select output button initially', () => {
    useVideoStore.setState({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      trimSettings: { startTime: 0, endTime: 100 },
    });
    render(<ProcessingPanel />);
    expect(screen.getByText('Select output location')).toBeInTheDocument();
  });

  it('should display progress during processing', () => {
    useVideoStore.setState({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      trimSettings: { startTime: 0, endTime: 100 },
      isProcessing: true,
      processingProgress: { currentTime: 50, percentage: 50.0 },
      currentJobId: 'job-123',
    });
    render(<ProcessingPanel />);
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getAllByText('50.0%').length).toBeGreaterThanOrEqual(1);
  });

  it('should show cancel button during processing', () => {
    useVideoStore.setState({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      trimSettings: { startTime: 0, endTime: 100 },
      isProcessing: true,
      processingProgress: { currentTime: 50, percentage: 50.0 },
      currentJobId: 'job-123',
    });
    render(<ProcessingPanel />);
    expect(screen.getByText('Cancel Processing')).toBeInTheDocument();
    expect(screen.queryByText('Start Processing')).not.toBeInTheDocument();
  });

  it('multi-cut without crop offers stream copy (not forced re-encode filters)', () => {
    useVideoStore.setState({
      mode: 'multi-cut',
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      segments: [{ id: '1', startTime: 0, endTime: 10 }],
      cropSettings: { enabled: false, width: 1920, height: 1080, x: 0, y: 0 },
      qualitySettings: { mode: 'copy', crf: 8 },
    });
    render(<ProcessingPanel />);
    expect(screen.getByText(/Exact copy \(keyframe cuts\)/i)).toBeInTheDocument();
    // CRF slider not shown when multi-cut has no crop
    expect(screen.queryByText(/CRF:/)).not.toBeInTheDocument();
  });

  it('merge does not claim filters force re-encode', () => {
    useVideoStore.setState({
      mode: 'merge',
      mergeVideoFiles: [
        { path: '/a.mp4', name: 'a.mp4', duration: 10 },
        { path: '/b.mp4', name: 'b.mp4', duration: 10 },
      ],
    });
    render(<ProcessingPanel />);
    expect(screen.getByText(/stream copy when sources match/i)).toBeInTheDocument();
    // CRF available for fallback re-encode
    expect(screen.getByText(/CRF:/)).toBeInTheDocument();
  });
});
