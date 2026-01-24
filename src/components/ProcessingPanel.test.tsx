import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProcessingPanel from './ProcessingPanel';
import { useVideoStore } from '../store/useVideoStore';
import { tauriAPI } from '../lib/tauri-api';

vi.mock('../store/useVideoStore');
vi.mock('../lib/tauri-api');

describe('ProcessingPanel', () => {
  const mockSetError = vi.fn();
  const mockSetProcessing = vi.fn();
  const mockSetProcessingProgress = vi.fn();
  const mockSetCurrentJobId = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tauriAPI.onFFmpegProgress).mockResolvedValue(() => {});
    vi.mocked(tauriAPI.onFFmpegComplete).mockResolvedValue(() => {});
    vi.mocked(tauriAPI.onFFmpegError).mockResolvedValue(() => {});
    vi.mocked(tauriAPI.onFFmpegCancelled).mockResolvedValue(() => {});
  });

  it('should disable process button when no video file', () => {
    vi.mocked(useVideoStore).mockReturnValue({
      videoFile: null,
      subtitleFile: null,
      trimSettings: { startTime: 0, endTime: 0 },
      isProcessing: false,
      processingProgress: null,
      setError: mockSetError,
      setProcessing: mockSetProcessing,
      setProcessingProgress: mockSetProcessingProgress,
      currentJobId: null,
      setCurrentJobId: mockSetCurrentJobId,
    } as any);

    render(<ProcessingPanel />);
    const button = screen.getByText('Start Processing');
    expect(button).toBeDisabled();
  });

  it('should show select output button initially', () => {
    vi.mocked(useVideoStore).mockReturnValue({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      subtitleFile: null,
      trimSettings: { startTime: 0, endTime: 100 },
      isProcessing: false,
      processingProgress: null,
      setError: mockSetError,
      setProcessing: mockSetProcessing,
      setProcessingProgress: mockSetProcessingProgress,
      currentJobId: null,
      setCurrentJobId: mockSetCurrentJobId,
    } as any);

    render(<ProcessingPanel />);
    expect(screen.getByText('Select output location')).toBeInTheDocument();
  });

  it('should display progress during processing', () => {
    vi.mocked(useVideoStore).mockReturnValue({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      subtitleFile: null,
      trimSettings: { startTime: 0, endTime: 100 },
      isProcessing: true,
      processingProgress: { currentTime: 50, percentage: 50.0 },
      setError: mockSetError,
      setProcessing: mockSetProcessing,
      setProcessingProgress: mockSetProcessingProgress,
      currentJobId: 'job-123',
      setCurrentJobId: mockSetCurrentJobId,
    } as any);

    render(<ProcessingPanel />);

    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
  });

  it('should show cancel button during processing', () => {
    vi.mocked(useVideoStore).mockReturnValue({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      subtitleFile: null,
      trimSettings: { startTime: 0, endTime: 100 },
      isProcessing: true,
      processingProgress: { currentTime: 50, percentage: 50.0 },
      setError: mockSetError,
      setProcessing: mockSetProcessing,
      setProcessingProgress: mockSetProcessingProgress,
      currentJobId: 'job-123',
      setCurrentJobId: mockSetCurrentJobId,
    } as any);

    render(<ProcessingPanel />);

    expect(screen.getByText('Cancel Processing')).toBeInTheDocument();
    expect(screen.queryByText('Start Processing')).not.toBeInTheDocument();
  });
});
