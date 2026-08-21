import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { MultiCutMergeParams, MergeVideosParams } from '../types';

export interface ProcessVideoParams {
  inputFile: string;
  outputFile: string;
  startTime?: number;
  endTime?: number;
  subtitleFile?: string;
  subtitleFont?: string;
  subtitleFontSize?: number;
  brightness?: number;
  cropWidth?: number;
  cropHeight?: number;
  cropX?: number;
  cropY?: number;
  qualityMode?: string;
  crf?: number;
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

const normalizeJobId = (payload: any): string | undefined => {
  return payload?.jobId ?? payload?.job_id ?? payload?.jobID;
};

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
    return await invoke<number>('get_duration', { filePath });
  },

  getMediaInfo: async (
    filePath: string
  ): Promise<{ duration: number; width: number; height: number }> => {
    return await invoke<{ duration: number; width: number; height: number }>(
      'get_media_info',
      { filePath }
    );
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
        subtitle_font: params.subtitleFont,
        subtitle_font_size: params.subtitleFontSize,
        brightness: params.brightness,
        crop_width: params.cropWidth,
        crop_height: params.cropHeight,
        crop_x: params.cropX,
        crop_y: params.cropY,
        quality_mode: params.qualityMode,
        crf: params.crf,
      },
    });
  },

  cancelProcess: async (jobId: string): Promise<void> => {
    return await invoke<void>('cancel_process', { jobId });
  },

  /** Kill every active ffmpeg job (used when UI is processing but job id is not set yet). */
  cancelAllProcesses: async (): Promise<number> => {
    return await invoke<number>('cancel_all_processes');
  },

  // Event listeners
  onFFmpegProgress: (callback: (event: ProgressEvent) => void) => {
    return listen<ProgressEvent>('ffmpeg-progress', (event) => {
      const payload: any = event.payload;
      callback({
        jobId: normalizeJobId(payload) ?? '',
        seconds: payload.seconds,
        percent: payload.percent,
      });
    });
  },

  onFFmpegComplete: (callback: (jobId: string) => void) => {
    return listen<CompleteEvent>('ffmpeg-complete', (event) => {
      const payload: any = event.payload;
      callback(normalizeJobId(payload) ?? '');
    });
  },

  onFFmpegError: (callback: (jobId: string, error: string) => void) => {
    return listen<ErrorEvent>('ffmpeg-error', (event) => {
      const payload: any = event.payload;
      callback(normalizeJobId(payload) ?? '', payload.error);
    });
  },

  onFFmpegCancelled: (callback: (jobId: string) => void) => {
    return listen<CompleteEvent>('ffmpeg-cancelled', (event) => {
      const payload: any = event.payload;
      callback(normalizeJobId(payload) ?? '');
    });
  },

  multiCutMerge: async (params: MultiCutMergeParams): Promise<string> => {
    return await invoke<string>('multi_cut_merge', {
      params: {
        input_file: params.inputFile,
        output_file: params.outputFile,
        segments: params.segments.map(s => ({ start_time: s.startTime, end_time: s.endTime })),
        crop_width: params.cropWidth,
        crop_height: params.cropHeight,
        crop_x: params.cropX,
        crop_y: params.cropY,
        crf: params.crf,
        prefer_copy: params.preferCopy ?? true,
      },
    });
  },

  mergeVideos: async (params: MergeVideosParams): Promise<string> => {
    return await invoke<string>('merge_videos', {
      params: {
        input_files: params.inputFiles,
        output_file: params.outputFile,
        crf: params.crf,
      },
    });
  },

  selectMultipleVideoFiles: async (): Promise<string[] | null> => {
    const selected = await open({
      multiple: true,
      filters: [
        {
          name: 'Video Files',
          extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'],
        },
      ],
    });
    if (!selected) return null;
    return Array.isArray(selected) ? selected : [selected];
  },

  readSubtitleFile: async (filePath: string): Promise<string> => {
    return await invoke<string>('read_subtitle_file', { filePath });
  },

  writeSubtitleFile: async (content: string, originalPath: string | null): Promise<string> => {
    return await invoke<string>('write_subtitle_file', { content, originalPath });
  },

  writeTempSubtitle: async (content: string): Promise<string> => {
    return await invoke<string>('write_temp_subtitle', { content });
  },
};
