import { describe, it, expect } from 'vitest';
import { extractFileName } from './pathParsing';

describe('extractFileName', () => {
  it('should extract filename from Unix path', () => {
    expect(extractFileName('/home/user/video.mp4')).toBe('video.mp4');
  });

  it('should extract filename from Windows path', () => {
    expect(extractFileName('C:\\Users\\Name\\video.mp4')).toBe('video.mp4');
  });

  it('should extract filename from mixed separators', () => {
    expect(extractFileName('C:/Users/Name\\video.mp4')).toBe('video.mp4');
  });

  it('should handle filename without path', () => {
    expect(extractFileName('video.mp4')).toBe('video.mp4');
  });

  it('should handle empty string', () => {
    expect(extractFileName('')).toBe('');
  });

  it('should handle path ending with separator', () => {
    expect(extractFileName('/home/user/')).toBe('');
  });

  it('should handle special characters in filename', () => {
    expect(extractFileName('/path/to/my video [1080p].mp4')).toBe('my video [1080p].mp4');
  });
});
