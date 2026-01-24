import { vi } from 'vitest';

export const mockInvoke = vi.fn();
export const mockListen = vi.fn();
export const mockOpen = vi.fn();
export const mockSave = vi.fn();
export const mockConvertFileSrc = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
  convertFileSrc: mockConvertFileSrc,
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: mockOpen,
  save: mockSave,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
}));

// Helper to setup common mocks
export function setupTauriMocks() {
  mockInvoke.mockImplementation((cmd: string, _args?: any) => {
    switch (cmd) {
      case 'get_duration':
        return Promise.resolve(120.5);
      case 'check_ffmpeg_availability':
        return Promise.resolve(true);
      case 'process_video':
        return Promise.resolve('job-uuid-123');
      case 'cancel_process':
        return Promise.resolve();
      default:
        return Promise.reject(new Error(`Unknown command: ${cmd}`));
    }
  });

  mockConvertFileSrc.mockImplementation((path: string) => `asset://${path}`);

  mockOpen.mockResolvedValue({ path: '/selected/file.mp4' });
  mockSave.mockResolvedValue({ path: '/output/file.mp4' });

  mockListen.mockImplementation((_event: string, _callback: any) => {
    return Promise.resolve(() => {}); // unlisten function
  });
}

export function resetTauriMocks() {
  mockInvoke.mockReset();
  mockListen.mockReset();
  mockOpen.mockReset();
  mockSave.mockReset();
  mockConvertFileSrc.mockReset();
}
