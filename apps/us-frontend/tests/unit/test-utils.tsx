import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ApiProvider } from '../../src/contexts/ApiContext';
import { LoadingProvider } from '../../src/contexts/LoadingContext';
import { ToastProvider } from '../../src/contexts/ToastContext';

// Test utilities
export const renderWithProviders = (ui: React.ReactElement, options = {}) => {
  return render(
    <BrowserRouter>
      <ApiProvider>
        <LoadingProvider>
          <ToastProvider>
            {ui}
          </ToastProvider>
        </LoadingProvider>
      </ApiProvider>
    </BrowserRouter>,
    options
  );
};

export const createMockContextValue = (overrides = {}) => {
  return {
    loading: false,
    error: null,
    data: null,
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
    pushToast: vi.fn(),
    ...overrides,
  };
};

export const mockApiCall = (response: any, shouldReject = false) => {
  const mockFetch = vi.fn();
  
  if (shouldReject) {
    mockFetch.mockRejectedValueOnce(new Error('API Error'));
  } else {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response)),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });
  }
  
  global.fetch = mockFetch;
  return mockFetch;
};

// Common test data
export const testData = {
  paymentLink: {
    id: 'test-payment-123',
    amount: '100',
    currency: 'USD',
    description: 'Test Payment',
    status: 'pending',
    createdAt: new Date().toISOString(),
  },
  
  wallet: {
    address: '0x1234567890123456789012345678901234567890',
    balance: '1.5',
    chainId: 1,
  },
  
  user: {
    id: 'test-user-123',
    email: 'test@example.com',
    walletAddress: '0x1234567890123456789012345678901234567890',
  },
};

export const selectors = {
  loading: '[data-testid="loading"], .loading, [data-loading="true"]',
  error: '[data-testid="error"], .error, [role="alert"]',
  success: '[data-testid="success"], .success, [data-success="true"]',
  button: 'button:not([disabled])',
  disabledButton: 'button[disabled]',
  input: 'input:not([disabled])',
  form: 'form',
  link: 'a[href]',
  toast: '[role="alert"], .toast, [data-toast]',
};

describe('Test Utilities', () => {
  it('should render with providers without errors', () => {
    const TestComponent = () => <div>Test</div>;
    
    expect(() => {
      renderWithProviders(<TestComponent />);
    }).not.toThrow();
  });

  it('should create mock context values', () => {
    const mockContext = createMockContextValue({ loading: true });
    
    expect(mockContext.loading).toBe(true);
    expect(mockContext.showLoading).toBeInstanceOf(Function);
    expect(mockContext.pushToast).toBeInstanceOf(Function);
  });

  it('should mock API calls successfully', async () => {
    const mockResponse = { data: 'test' };
    const mockFetch = mockApiCall(mockResponse);
    
    const response = await fetch('/api/test');
    const data = await response.json();
    
    expect(mockFetch).toHaveBeenCalledWith('/api/test');
    expect(data).toEqual(mockResponse);
  });

  it('should mock API call failures', async () => {
    const mockFetch = mockApiCall(null, true);
    
    await expect(fetch('/api/test')).rejects.toThrow('API Error');
    expect(mockFetch).toHaveBeenCalledWith('/api/test');
  });
});