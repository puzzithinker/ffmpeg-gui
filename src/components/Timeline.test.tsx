import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Timeline from './Timeline';
import { useVideoStore } from '../store/useVideoStore';

describe('Timeline', () => {
  beforeEach(() => {
    useVideoStore.getState().reset();
  });

  it('should render null when no video file', () => {
    const { container } = render(<Timeline />);
    expect(container.firstChild).toBeNull();
  });

  it('should render timeline when video file exists', () => {
    useVideoStore.setState({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      trimSettings: { startTime: 0, endTime: 100 },
    });

    render(<Timeline />);
    expect(screen.getByText('Trim Timeline')).toBeInTheDocument();
  });

  it('should display formatted times correctly', () => {
    useVideoStore.setState({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 125 },
      trimSettings: { startTime: 10, endTime: 70 },
    });

    render(<Timeline />);
    expect(screen.getByText('1:00 selected')).toBeInTheDocument();
  });

  it('I / O buttons mark trim from the playhead', () => {
    useVideoStore.setState({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      trimSettings: { startTime: 0, endTime: 100 },
      currentTime: 12,
    });

    render(<Timeline />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /I · Start/i }));
    });
    expect(useVideoStore.getState().trimSettings.startTime).toBe(12);

    act(() => {
      useVideoStore.setState({ currentTime: 40 });
      fireEvent.click(screen.getByRole('button', { name: /O · End/i }));
    });
    expect(useVideoStore.getState().trimSettings.endTime).toBe(40);
  });

  it('should calculate percentage positions correctly', () => {
    useVideoStore.setState({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      trimSettings: { startTime: 25, endTime: 75 },
      currentTime: 50,
    });

    const { container } = render(<Timeline />);
    const highlightDiv = container.querySelector('.bg-primary-500') as HTMLElement;

    expect(highlightDiv.style.left).toBe('25%');
    expect(highlightDiv.style.width).toBe('50%');
    const playhead = screen.getByTestId('playhead') as HTMLElement;
    expect(playhead.style.left).toBe('50%');
  });

  it('clicking the bar seeks to that time', () => {
    useVideoStore.setState({
      videoFile: { path: '/test.mp4', name: 'test.mp4', duration: 100 },
      trimSettings: { startTime: 0, endTime: 100 },
    });

    const { container } = render(<Timeline />);
    const bar = container.querySelector('.cursor-pointer') as HTMLElement;
    Object.defineProperty(bar, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200, top: 0, height: 48, right: 200, bottom: 48, x: 0, y: 0, toJSON: () => {} }),
    });

    fireEvent.mouseDown(bar, { clientX: 50, button: 0 });
    expect(useVideoStore.getState().currentTime).toBe(25);
    expect(useVideoStore.getState().isScrubbing).toBe(true);
  });
});
