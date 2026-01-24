import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Timeline from './Timeline';
import { useVideoStore } from '../store/useVideoStore';

vi.mock('../store/useVideoStore');

describe('Timeline', () => {
  const mockSetTrimSettings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render null when no video file', () => {
    vi.mocked(useVideoStore).mockReturnValue({
      videoFile: null,
      trimSettings: { startTime: 0, endTime: 0 },
      setTrimSettings: mockSetTrimSettings,
    } as any);

    const { container } = render(<Timeline />);
    expect(container.firstChild).toBeNull();
  });

  it('should render timeline when video file exists', () => {
    vi.mocked(useVideoStore).mockReturnValue({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      trimSettings: { startTime: 0, endTime: 100 },
      setTrimSettings: mockSetTrimSettings,
    } as any);

    render(<Timeline />);
    expect(screen.getByText('Trim Timeline')).toBeInTheDocument();
  });

  it('should display formatted times correctly', () => {
    vi.mocked(useVideoStore).mockReturnValue({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 125 },
      trimSettings: { startTime: 10, endTime: 70 },
      setTrimSettings: mockSetTrimSettings,
    } as any);

    render(<Timeline />);
    expect(screen.getByText('0:10')).toBeInTheDocument();
    expect(screen.getByText('1:10')).toBeInTheDocument();
    expect(screen.getByText('1:00 selected')).toBeInTheDocument();
  });

  it('should constrain start time input to valid range', () => {
    vi.mocked(useVideoStore).mockReturnValue({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      trimSettings: { startTime: 20, endTime: 80 },
      setTrimSettings: mockSetTrimSettings,
    } as any);

    const { container } = render(<Timeline />);
    const inputs = container.querySelectorAll('input[type="number"]');
    const startInput = inputs[0] as HTMLInputElement;

    fireEvent.change(startInput, { target: { value: '85' } });

    // Should constrain to endTime - 1 = 79
    expect(mockSetTrimSettings).toHaveBeenCalledWith({ startTime: 79 });
  });

  it('should constrain end time input to valid range', () => {
    vi.mocked(useVideoStore).mockReturnValue({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      trimSettings: { startTime: 20, endTime: 80 },
      setTrimSettings: mockSetTrimSettings,
    } as any);

    const { container } = render(<Timeline />);
    const inputs = container.querySelectorAll('input[type="number"]');
    const endInput = inputs[1] as HTMLInputElement;

    fireEvent.change(endInput, { target: { value: '15' } });

    // Should constrain to startTime + 1 = 21
    expect(mockSetTrimSettings).toHaveBeenCalledWith({ endTime: 21 });
  });

  it('should calculate percentage positions correctly', () => {
    vi.mocked(useVideoStore).mockReturnValue({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      trimSettings: { startTime: 25, endTime: 75 },
      setTrimSettings: mockSetTrimSettings,
    } as any);

    const { container } = render(<Timeline />);
    const highlightDiv = container.querySelector('.bg-primary-500') as HTMLElement;

    expect(highlightDiv.style.left).toBe('25%');
    expect(highlightDiv.style.width).toBe('50%');
  });
});
