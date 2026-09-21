import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';

// Polyfill ResizeObserver for Radix UI components
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Automatically cleanup after each test
afterEach(() => {
  cleanup();
});
