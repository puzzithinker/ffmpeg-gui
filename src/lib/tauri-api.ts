import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';

export interface ProcessVideoParams {
  inputFile: string;
  outputFile: string;
  startTime?: number;
  endTime?: number;
  subtitleFile?: string;
}

export interface ProgressEvent {
  jobId: string;
  seconds: number;
  percent: number;
}

export interface CompleteEvent {
  jobId: string;
}

export interface ErrorEvent {
  jobId: string;
  error: string;
}

const normalizeDialogSelection = (selected: string | string[] | null): string | null => {
  if (!selected) return null;
  return Array.isArray(selected) ? selected[0] : selected;
};

export const tauriAPI = {
  // Dialog operations
  selectVideoFile: async (): Promise<string | null> => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: 'Video Files',
          extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'],
        },
      ],
    });
    return normalizeDialogSelection(selected);
  },

  selectSubtitleFile: async (): Promise<string | null> => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: 'Subtitle Files',
          extensions: ['srt', 'vtt', 'ass', 'ssa'],
        },
      ],
    });
    return normalizeDialogSelection(selected);
  },

  selectOutputFile: async (): Promise<string | null> => {
    const selected = await save({
      filters: [
        {
          name: 'Video Files',
          extensions: ['mp4', 'avi', 'mov', 'mkv'],
        },
      ],
    });
    return normalizeDialogSelection(selected);
  },

  // Video operations
  getVideoDuration: async (filePath: string): Promise<number> => {
    return await invoke<number>('get_duration', { file_path: filePath });
  },

  getVideoUrl: async (filePath: string): Promise<string> => {
    return convertFileSrc(filePath);
  },

  checkFfmpegAvailability: async (): Promise<boolean> => {
    try {
      return await invoke<boolean>('check_ffmpeg_availability');
    } catch (error) {
      throw new Error(error as string);
    }
  },

  // Processing operations
  processVideo: async (params: ProcessVideoParams): Promise<string> => {
    return await invoke<string>('process_video', {
      params: {
        input_file: params.inputFile,
        output_file: params.outputFile,
        start_time: params.startTime,
        end_time: params.endTime,
        subtitle_file: params.subtitleFile,
      },
    });
  },

  cancelProcess: async (jobId: string): Promise<void> => {
    return await invoke<void>('cancel_process', { job_id: jobId });
  },

  // Event listeners
  onFFmpegProgress: (callback: (event: ProgressEvent) => void) => {
    return listen<ProgressEvent>('ffmpeg-progress', (event) => {
      callback(event.payload);
    });
  },

  onFFmpegComplete: (callback: (jobId: string) => void) => {
    return listen<CompleteEvent>('ffmpeg-complete', (event) => {
      callback(event.payload.jobId);
    });
  },

  onFFmpegError: (callback: (jobId: string, error: string) => void) => {
    return listen<ErrorEvent>('ffmpeg-error', (event) => {
      callback(event.payload.jobId, event.payload.error);
    });
  },

  onFFmpegCancelled: (callback: (jobId: string) => void) => {
    return listen<CompleteEvent>('ffmpeg-cancelled', (event) => {
      callback(event.payload.jobId);
    });
  },
};
