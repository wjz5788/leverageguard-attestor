import { test, expect } from './fixtures';

test.describe('Landing Page', () => {
  test('should load landing page successfully', async ({ page }) => {
    await page.gotoAndWait('/');
    
    // Check page title
    await expect(page).toHaveTitle(/LiqPass/);
    
    // Check main heading
    await expect(page.locator('h1')).toContainText(['LiqPass', 'Payment', 'Link']);
    
    // Check navigation elements
    await expect(page.locator('nav')).toBeVisible();
    
    // Check CTA buttons
    const ctaButtons = page.locator('button:visible, a[href*="/create"]:visible');
    await expect(ctaButtons.first()).toBeVisible();
  });

  test('should navigate to create payment link', async ({ page }) => {
    await page.gotoAndWait('/');
    
    // Find and click create link button
    const createButton = page.locator('a[href*="/create"], button:has-text("Create"):visible').first();
    await createButton.click();
    
    // Wait for navigation
    await page.waitForURL('**/create');
    
    // Check we're on create page
    await expect(page).toHaveURL(/.*\/create/);
    await expect(page.locator('h1, h2')).toContainText(['Create', 'Payment', 'Link']);
  });

  test('should show wallet connection option', async ({ page }) => {
    await page.gotoAndWait('/');
    
    // Look for wallet connection elements
    const walletElements = page.locator('button:has-text("Connect"), button:has-text("Wallet")');
    const hasWalletButton = await walletElements.first().isVisible();
    
    if (hasWalletButton) {
      await walletElements.first().click();
      
      // Check if wallet connection modal appears
      const modal = page.locator('[role="dialog"], .modal, .wallet-modal');
      const hasModal = await modal.first().isVisible();
      
      if (hasModal) {
        await expect(modal).toBeVisible();
        
        // Check for wallet options
        await expect(page.locator('button:has-text("MetaMask"), div:has-text("MetaMask")')).toBeVisible();
      }
    }
  });
});

test.describe('Navigation', () => {
  test('should have working navigation links', async ({ page }) => {
    await page.gotoAndWait('/');
    
    // Get all navigation links
    const navLinks = page.locator('nav a[href], header a[href]');
    const linkCount = await navLinks.count();
    
    expect(linkCount).toBeGreaterThan(0);
    
    // Test each link
    for (let i = 0; i < Math.min(linkCount, 5); i++) {
      const link = navLinks.nth(i);
      const href = await link.getAttribute('href');
      
      if (href && !href.startsWith('#') && !href.startsWith('http')) {
        // Test navigation
        await link.click();
        await page.waitForLoading();
        
        // Check URL changed
        if (href !== '/') {
          await expect(page).toHaveURL(new RegExp(href.replace('/', '\\/')));
        }
        
        // Go back to test next link
        await page.gotoAndWait('/');
      }
    }
  });
});

test.describe('Responsive Design', () => {
  const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 720 },
  ];

  viewports.forEach(({ name, width, height }) => {
    test(`should display correctly on ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.gotoAndWait('/');
      
      // Check main content is visible
      await expect(page.locator('main, .main-content')).toBeVisible();
      
      // Check navigation adapts to viewport
      const nav = page.locator('nav, header nav');
      await expect(nav).toBeVisible();
      
      // Check for mobile menu button on small screens
      if (width < 768) {
        const mobileMenuButton = page.locator('button[aria-label*="menu"], .mobile-menu-button');
        const hasMobileMenu = await mobileMenuButton.isVisible();
        
        if (hasMobileMenu) {
          await mobileMenuButton.click();
          // Check if mobile menu opens
          await expect(page.locator('.mobile-menu, [data-mobile-menu]')).toBeVisible();
        }
      }
    });
  });
});