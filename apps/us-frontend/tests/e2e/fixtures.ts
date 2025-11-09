import { test as base, expect, Page } from '@playwright/test';
import { getEnv } from '../src/env';

export interface TestUser {
  email: string;
  password: string;
  walletAddress?: string;
}

export interface TestFixtures {
  page: Page;
  testUser: TestUser;
}

/**
 * Custom test fixture with authentication and utility functions
 */
export const test = base.extend<TestFixtures>({
  testUser: async ({}, use) => {
    // Use test user from environment or create a mock one
    const testUser: TestUser = {
      email: process.env.TEST_USER_EMAIL || 'test@example.com',
      password: process.env.TEST_USER_PASSWORD || 'testpassword123',
      walletAddress: process.env.TEST_WALLET_ADDRESS,
    };
    await use(testUser);
  },

  page: async ({ page }, use) => {
    // Add custom utility functions to page object
    
    // Wait for loading to complete
    page.waitForLoading = async () => {
      await page.waitForLoadState('networkidle');
      // Wait for any loading indicators to disappear
      await page.locator('[data-loading="true"]').waitFor({ state: 'hidden', timeout: 10000 });
    };

    // Check if toast message is visible
    page.hasToast = async (message?: string) => {
      const toastLocator = page.locator('[role="alert"], .toast, [data-toast]');
      if (message) {
        return await toastLocator.filter({ hasText: message }).isVisible();
      }
      return await toastLocator.first().isVisible();
    };

    // Wait for toast to appear and disappear
    page.waitForToast = async (message?: string) => {
      const toastLocator = message 
        ? page.locator('[role="alert"], .toast, [data-toast]').filter({ hasText: message })
        : page.locator('[role="alert"], .toast, [data-toast]').first();
      
      await toastLocator.waitFor({ state: 'visible', timeout: 5000 });
      await toastLocator.waitFor({ state: 'hidden', timeout: 10000 });
    };

    // Connect wallet (mock implementation)
    page.connectWallet = async () => {
      // Look for wallet connection button
      const walletButton = page.locator('button:has-text("Connect"):visible, button:has-text("Wallet"):visible').first();
      if (await walletButton.isVisible()) {
        await walletButton.click();
        
        // Look for MetaMask or wallet option
        const metaMaskOption = page.locator('button:has-text("MetaMask"), div:has-text("MetaMask")').first();
        if (await metaMaskOption.isVisible()) {
          await metaMaskOption.click();
        }
        
        // Wait for connection to complete
        await page.waitForTimeout(2000);
      }
    };

    // Navigate to page and wait for load
    page.gotoAndWait = async (url: string) => {
      await page.goto(url);
      await page.waitForLoading();
    };

    await use(page);
  },
});

export { expect } from '@playwright/test';

// Type augmentation for Page object
declare global {
  module '@playwright/test' {
    interface Page {
      waitForLoading(): Promise<void>;
      hasToast(message?: string): Promise<boolean>;
      waitForToast(message?: string): Promise<void>;
      connectWallet(): Promise<void>;
      gotoAndWait(url: string): Promise<void>;
    }
  }
}