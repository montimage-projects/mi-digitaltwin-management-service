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

// Newer Node releases ship their own (file-backed) Web Storage globals, which
// shadow jsdom's and are unusable without --localstorage-file. Install an
// in-memory Storage when the global one is missing or broken so persisted
// zustand stores work in tests. jsdom's own storage is left untouched.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

function hasWorkingStorage(name: 'localStorage' | 'sessionStorage') {
  try {
    return typeof globalThis[name]?.setItem === 'function';
  } catch {
    return false;
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (hasWorkingStorage(name)) continue;
  const storage = new MemoryStorage();
  const targets =
    typeof window !== 'undefined' && window !== globalThis ? [globalThis, window] : [globalThis];
  for (const target of targets) {
    Object.defineProperty(target, name, { value: storage, configurable: true, writable: true });
  }
}

// Automatically cleanup after each test
afterEach(() => {
  cleanup();
});
