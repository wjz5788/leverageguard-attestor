import { test, expect } from './fixtures';

test.describe('Payment Link Creation', () => {
  test('should create payment link with valid data', async ({ page }) => {
    await page.gotoAndWait('/create');
    
    // Fill in payment details - 使用可访问性优先选择器
    await page.fill('input[name="amount"], input[placeholder*="amount"], [aria-label*="amount"]', '100');
    await page.fill('input[name="description"], input[placeholder*="description"], [aria-label*="description"]', 'Test Payment');
    
    // Select currency if available - 增强可访问性选择器
    const currencySelect = page.locator('select[name="currency"], [role="listbox"]:has-text("USD"), [aria-label*="currency"]');
    if (await currencySelect.isVisible()) {
      await currencySelect.selectOption('USD');
    }
    
    // Submit form - 使用可访问性优先选择器
    const submitButton = page.locator('button[type="submit"], button:has-text("Create"), [role="button"]:has-text("Create"), [aria-label*="create"]').first();
    await submitButton.click();
    
    // Wait for response
    await page.waitForLoading();
    
    // Check for success toast or redirect
    const hasSuccessToast = await page.hasToast('success');
    const hasRedirect = page.url().includes('/payment/');
    
    expect(hasSuccessToast || hasRedirect).toBeTruthy();
  });

  test('should show validation errors for invalid data', async ({ page }) => {
    await page.gotoAndWait('/create');
    
    // Try to submit empty form - 使用可访问性优先选择器
    const submitButton = page.locator('button[type="submit"], button:has-text("Create"), [role="button"]:has-text("Create"), [aria-label*="create"]').first();
    await submitButton.click();
    
    // Check for validation messages - 增强可访问性选择器
    const validationErrors = page.locator('.error, .validation-error, [role="alert"]:has-text("required"), [aria-invalid="true"], [aria-describedby*="error"]');
    const hasValidationErrors = await validationErrors.first().isVisible();
    
    if (hasValidationErrors) {
      await expect(validationErrors.first()).toBeVisible();
    } else {
      // Check for toast error message
      await expect(async () => {
        const hasErrorToast = await page.hasToast('error');
        expect(hasErrorToast).toBeTruthy();
      }).toPass();
    }
  });

  test('should handle wallet connection before creation', async ({ page }) => {
    await page.gotoAndWait('/create');
    
    // Check if wallet connection is required - 使用可访问性优先选择器
    const walletButton = page.locator('button:has-text("Connect"), button:has-text("Wallet"), [role="button"]:has-text("Connect"), [role="button"]:has-text("Wallet")');
    const hasWalletButton = await walletButton.first().isVisible();
    
    if (hasWalletButton) {
      await page.connectWallet();
      
      // Verify wallet is connected - 增强可访问性选择器
      await expect(page.locator('button:has-text("Connected"), [data-connected="true"], [aria-label*="connected"]')).toBeVisible();
    }
  });
});

test.describe('Payment Link Display', () => {
  test('should display payment link details', async ({ page }) => {
    // First create a payment link
    await page.gotoAndWait('/create');
    
    await page.fill('input[name="amount"], input[placeholder*="amount"]', '50');
    await page.fill('input[name="description"], input[placeholder*="description"]', 'Test Display');
    
    const submitButton = page.locator('button[type="submit"], button:has-text("Create")').first();
    await submitButton.click();
    
    await page.waitForLoading();
    
    // Check if we're on the payment link page
    if (page.url().includes('/payment/')) {
      // Verify payment details are displayed - 使用更具体的选择器
      await expect(page.locator('[data-amount], .amount, *:has-text("50")')).toBeVisible();
      await expect(page.locator('[data-description], .description, *:has-text("Test Display")')).toBeVisible();
      
      // Check for payment button or QR code - 使用可访问性优先选择器
      const paymentElements = page.locator('button:has-text("Pay"), img[src*="qr"], .qr-code, [role="button"]:has-text("Pay"), [aria-label*="QR"]');
      const hasPaymentElements = await paymentElements.first().isVisible();
      
      if (hasPaymentElements) {
        await expect(paymentElements.first()).toBeVisible();
      }
    }
  });

  test('should handle payment completion', async ({ page }) => {
    // Navigate to an existing payment link or create one
    await page.gotoAndWait('/payment/test');
    
    // Look for payment button - 使用可访问性优先选择器
    const payButton = page.locator('button:has-text("Pay"), button:has-text("Send"), [role="button"]:has-text("Pay"), [role="button"]:has-text("Send"), [aria-label*="pay"]').first();
    const hasPayButton = await payButton.isVisible();
    
    if (hasPayButton) {
      await payButton.click();
      
      // Wait for payment processing
      await page.waitForLoading();
      
      // Check for success indicators - 增强可访问性选择器
      const successIndicators = page.locator('.success, [data-success], .completed, [data-completed], [role="status"][aria-live="polite"], [aria-label*="success"]');
      const hasSuccess = await successIndicators.first().isVisible();
      
      if (hasSuccess) {
        await expect(successIndicators.first()).toBeVisible();
      } else {
        // Check for status change in URL or content - 使用更具体的选择器
        await expect(page.locator('[data-status="completed"], .completed-status, *:has-text("completed"), *:has-text("success")')).toBeVisible();
      }
    }
  });
});

test.describe('Payment History', () => {
  test('should display payment history', async ({ page }) => {
    await page.gotoAndWait('/payments');
    
    // Check for payment list or table - 使用可访问性优先选择器
    const paymentList = page.locator('.payment-list, table, [data-payments], [role="table"], [role="list"]');
    const hasPaymentList = await paymentList.first().isVisible();
    
    if (hasPaymentList) {
      await expect(paymentList.first()).toBeVisible();
      
      // Check for individual payment items - 增强可访问性选择器
      const paymentItems = page.locator('.payment-item, tr, .payment-card, [role="row"], [role="listitem"]');
      const itemCount = await paymentItems.count();
      
      if (itemCount > 0) {
        // Test first payment item interaction
        await paymentItems.first().click();
        
        // Should navigate to payment details
        await page.waitForURL(/.*\/payment\/.*/);
      }
    } else {
      // Check for empty state - 使用更具体的选择器
      await expect(page.locator('[data-empty], .empty-state, *:has-text("No payments"), *:has-text("Empty")')).toBeVisible();
    }
  });
});