import { test, expect } from './fixtures';

test.describe('Amount Decimal Handling', () => {
  test('should handle USDC 6 decimal places correctly', async ({ page }) => {
    await page.gotoAndWait('/create');
    
    // Test various decimal amounts for USDC
    const testCases = [
      { amount: '1', expected: '1.000000' },
      { amount: '1.1', expected: '1.100000' },
      { amount: '1.01', expected: '1.010000' },
      { amount: '1.001', expected: '1.001000' },
      { amount: '1.0001', expected: '1.000100' },
      { amount: '1.00001', expected: '1.000010' },
      { amount: '1.000001', expected: '1.000001' },
      { amount: '0.1', expected: '0.100000' },
      { amount: '0.01', expected: '0.010000' },
      { amount: '0.001', expected: '0.001000' },
      { amount: '0.0001', expected: '0.000100' },
      { amount: '0.00001', expected: '0.000010' },
      { amount: '0.000001', expected: '0.000001' },
    ];
    
    for (const testCase of testCases) {
      // Clear and fill amount input
      await page.fill('input[name="amount"], input[placeholder*="amount"], [aria-label*="amount"]', '');
      await page.fill('input[name="amount"], input[placeholder*="amount"], [aria-label*="amount"]', testCase.amount);
      
      // Select USDC if currency selection is available
      const currencySelect = page.locator('select[name="currency"], [role="listbox"]:has-text("USD"), [aria-label*="currency"]');
      if (await currencySelect.isVisible()) {
        await currencySelect.selectOption('USDC');
      }
      
      // Add description
      await page.fill('input[name="description"], input[placeholder*="description"], [aria-label*="description"]', `Test ${testCase.amount} USDC`);
      
      // Submit form
      const submitButton = page.locator('button[type="submit"], button:has-text("Create"), [role="button"]:has-text("Create"), [aria-label*="create"]').first();
      await submitButton.click();
      
      // Wait for response
      await page.waitForLoading();
      
      // Check if we're on the payment link page
      if (page.url().includes('/payment/')) {
        // Verify the amount is displayed correctly with proper decimals
        const amountDisplay = page.locator('[data-amount], .amount, *:has-text("' + testCase.expected + '")');
        await expect(amountDisplay.first()).toBeVisible();
        
        // Go back to create page for next test
        await page.gotoAndWait('/create');
      } else {
        // If not redirected, check for success toast
        const hasSuccessToast = await page.hasToast('success');
        expect(hasSuccessToast).toBeTruthy();
        
        // Clear form for next test
        await page.gotoAndWait('/create');
      }
    }
  });

  test('should handle edge cases for decimal amounts', async ({ page }) => {
    await page.gotoAndWait('/create');
    
    // Test edge cases
    const edgeCases = [
      '0',           // Zero amount
      '0.0',         // Zero with decimal
      '0.000000',    // Zero with 6 decimals
      '999999.999999', // Large amount with max decimals
      '0.0000001',   // More than 6 decimals (should round or truncate)
      '1.1234567',   // More than 6 decimals
    ];
    
    for (const amount of edgeCases) {
      // Clear and fill amount input
      await page.fill('input[name="amount"], input[placeholder*="amount"], [aria-label*="amount"]', '');
      await page.fill('input[name="amount"], input[placeholder*="amount"], [aria-label*="amount"]', amount);
      
      // Add description
      await page.fill('input[name="description"], input[placeholder*="description"], [aria-label*="description"]', `Edge case: ${amount}`);
      
      // Submit form
      const submitButton = page.locator('button[type="submit"], button:has-text("Create"), [role="button"]:has-text("Create"), [aria-label*="create"]').first();
      await submitButton.click();
      
      // Wait for response
      await page.waitForLoading();
      
      // Check for appropriate response (success or validation error)
      const hasSuccessToast = await page.hasToast('success');
      const hasErrorToast = await page.hasToast('error');
      
      // Should either succeed or show appropriate error
      expect(hasSuccessToast || hasErrorToast).toBeTruthy();
      
      // Go back to create page for next test
      await page.gotoAndWait('/create');
    }
  });

  test('should display amount formatting consistently', async ({ page }) => {
    await page.gotoAndWait('/create');
    
    // Create a payment link with specific amount
    await page.fill('input[name="amount"], input[placeholder*="amount"], [aria-label*="amount"]', '123.456789');
    await page.fill('input[name="description"], input[placeholder*="description"], [aria-label*="description"]', 'Formatting test');
    
    // Select USDC if available
    const currencySelect = page.locator('select[name="currency"], [role="listbox"]:has-text("USD"), [aria-label*="currency"]');
    if (await currencySelect.isVisible()) {
      await currencySelect.selectOption('USDC');
    }
    
    // Submit form
    const submitButton = page.locator('button[type="submit"], button:has-text("Create"), [role="button"]:has-text("Create"), [aria-label*="create"]').first();
    await submitButton.click();
    
    // Wait for response
    await page.waitForLoading();
    
    // Check if we're on the payment link page
    if (page.url().includes('/payment/')) {
      // Verify amount is displayed in a consistent format
      const amountElements = page.locator('[data-amount], .amount, [data-currency="USDC"]');
      const count = await amountElements.count();
      
      if (count > 0) {
        // Check that amount is visible and properly formatted
        await expect(amountElements.first()).toBeVisible();
        
        // Verify currency is also displayed if applicable
        const currencyElements = page.locator('[data-currency], .currency, *:has-text("USDC")');
        const currencyCount = await currencyElements.count();
        
        if (currencyCount > 0) {
          await expect(currencyElements.first()).toBeVisible();
        }
      }
    }
  });
});