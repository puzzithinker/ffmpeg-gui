import { describe, it, expect } from 'vitest';
import { formatTime } from './timeFormatting';

describe('formatTime', () => {
  it('should format zero seconds', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('should format seconds less than 60', () => {
    expect(formatTime(45)).toBe('0:45');
    expect(formatTime(5)).toBe('0:05');
  });

  it('should format exactly 60 seconds', () => {
    expect(formatTime(60)).toBe('1:00');
  });

  it('should format minutes and seconds', () => {
    expect(formatTime(125)).toBe('2:05');
    expect(formatTime(3661)).toBe('61:01');
  });

  it('should handle fractional seconds by flooring', () => {
    expect(formatTime(125.9)).toBe('2:05');
    expect(formatTime(59.5)).toBe('0:59');
  });

  it('should handle large durations', () => {
    expect(formatTime(7200)).toBe('120:00');
  });

  it('should handle negative numbers', () => {
    expect(formatTime(-30)).toBe('-1:-30');
  });
});
