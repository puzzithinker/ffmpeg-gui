import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProcessingPanel from './ProcessingPanel';
import { useVideoStore } from '../store/useVideoStore';
import { tauriAPI } from '../lib/tauri-api';

vi.mock('../store/useVideoStore');
vi.mock('../lib/tauri-api');

const baseStore = {
  mode: 'trim' as const,
  videoFile: null as any,
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
    secondaryLanguagePosition: 'after' as const,
    editedFilePath: null,
  },
  segments: [],
  mergeVideoFiles: [],
  isProcessing: false,
  processingProgress: null as any,
  currentJobId: null as string | null,
  qualitySettings: { mode: 'copy' as const, crf: 18 },
  setError: vi.fn(),
  setProcessing: vi.fn(),
  setProcessingProgress: vi.fn(),
  setCurrentJobId: vi.fn(),
  setQualitySettings: vi.fn(),
};

describe('ProcessingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tauriAPI.onFFmpegProgress).mockResolvedValue(() => {});
    vi.mocked(tauriAPI.onFFmpegComplete).mockResolvedValue(() => {});
    vi.mocked(tauriAPI.onFFmpegError).mockResolvedValue(() => {});
    vi.mocked(tauriAPI.onFFmpegCancelled).mockResolvedValue(() => {});
    // getState used by cancel handler and progress listeners
    (useVideoStore as any).getState = vi.fn(() => baseStore);
  });

  it('should disable process button when no video file', () => {
    vi.mocked(useVideoStore).mockReturnValue({
      ...baseStore,
      videoFile: null,
    } as any);

    render(<ProcessingPanel />);
    const button = screen.getByText('Start Processing');
    expect(button).toBeDisabled();
  });

  it('should show select output button initially', () => {
    vi.mocked(useVideoStore).mockReturnValue({
      ...baseStore,
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      trimSettings: { startTime: 0, endTime: 100 },
    } as any);

    render(<ProcessingPanel />);
    expect(screen.getByText('Select output location')).toBeInTheDocument();
  });

  it('should display progress during processing', () => {
    vi.mocked(useVideoStore).mockReturnValue({
      ...baseStore,
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      trimSettings: { startTime: 0, endTime: 100 },
      isProcessing: true,
      processingProgress: { currentTime: 50, percentage: 50.0 },
      currentJobId: 'job-123',
    } as any);

    render(<ProcessingPanel />);

    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getAllByText('50.0%').length).toBeGreaterThanOrEqual(1);
  });

  it('should show cancel button during processing', () => {
    vi.mocked(useVideoStore).mockReturnValue({
      ...baseStore,
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      trimSettings: { startTime: 0, endTime: 100 },
      isProcessing: true,
      processingProgress: { currentTime: 50, percentage: 50.0 },
      currentJobId: 'job-123',
    } as any);

    render(<ProcessingPanel />);

    expect(screen.getByText('Cancel Processing')).toBeInTheDocument();
    expect(screen.queryByText('Start Processing')).not.toBeInTheDocument();
  });
});
