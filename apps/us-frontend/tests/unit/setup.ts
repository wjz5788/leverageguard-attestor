import React from 'react';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, vi, beforeAll, expect } from 'vitest';

expect.extend(matchers);

// 添加React JSX支持
beforeAll(() => {
  // 确保React环境正确设置
  (globalThis as any).React = React;
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock window.ethereum (MetaMask)
global.window.ethereum = {
  request: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  enable: vi.fn(),
  selectedAddress: '0x1234567890123456789012345678901234567890',
  chainId: '0x1',
  networkVersion: '1',
};

// Mock fetch API
global.fetch = vi.fn();

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: vi.fn(),
  warn: vi.fn(),
};

// Clean up after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Helper function to mock API responses
export const mockApiResponse = (data: any, status = 200) => {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers({
      'Content-Type': 'application/json',
    }),
  });
};

// Helper function to mock API errors
export const mockApiError = (message: string, status = 400) => {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ error: message }),
    text: () => Promise.resolve(JSON.stringify({ error: message })),
    headers: new Headers({
      'Content-Type': 'application/json',
    }),
  });
};

// Helper to wait for async operations
export const waitForAsync = async (ms = 0) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};
