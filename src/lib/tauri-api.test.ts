import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tauriAPI } from './tauri-api';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

describe('tauriAPI dialog helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns string path from open result', async () => {
    vi.mocked(open).mockResolvedValue('C:\\\\video.mp4');

    const result = await tauriAPI.selectVideoFile();

    expect(result).toBe('C:\\\\video.mp4');
  });

  it('returns first item when open resolves to array', async () => {
    vi.mocked(open).mockResolvedValue(['C:\\\\first.mp4', 'C:\\\\second.mp4']);

    const result = await tauriAPI.selectVideoFile();

    expect(result).toBe('C:\\\\first.mp4');
  });

  it('returns null when open resolves to nullish', async () => {
    vi.mocked(open).mockResolvedValue(null);

    const result = await tauriAPI.selectVideoFile();

    expect(result).toBeNull();
  });

  it('maps process params to snake_case for backend', async () => {
    vi.mocked(invoke).mockResolvedValue('job-id-123');

    const params = {
      inputFile: 'input.mp4',
      outputFile: 'output.mp4',
      startTime: 1,
      endTime: 2,
      subtitleFile: 'subs.srt',
    };

    const jobId = await tauriAPI.processVideo(params);

    expect(jobId).toBe('job-id-123');
    expect(invoke).toHaveBeenCalledWith('process_video', {
      params: {
        input_file: 'input.mp4',
        output_file: 'output.mp4',
        start_time: 1,
        end_time: 2,
        subtitle_file: 'subs.srt',
      },
    });
  });

  it('passes camelCase keys for duration and cancel commands', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await tauriAPI.getVideoDuration('foo.mp4');
    await tauriAPI.cancelProcess('job-1');

    expect(invoke).toHaveBeenNthCalledWith(1, 'get_duration', { filePath: 'foo.mp4' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'cancel_process', { jobId: 'job-1' });
  });

  it('returns string path from save result', async () => {
    vi.mocked(save).mockResolvedValue('C:\\\\output.mp4');

    const result = await tauriAPI.selectOutputFile();

    expect(result).toBe('C:\\\\output.mp4');
  });
});
