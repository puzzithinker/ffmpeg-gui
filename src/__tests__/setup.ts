import '@testing-library/jest-dom';
import { beforeEach, vi } from 'vitest';
import { setupTauriMocks } from './mocks/tauriMocks';

// Setup default mocks
beforeEach(() => {
  setupTauriMocks();
});

// Global test utilities
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
