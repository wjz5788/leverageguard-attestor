# LiqPass Frontend Testing Guide

This document provides comprehensive information about the testing setup and practices for the LiqPass frontend application.

## Test Structure

```
tests/
├── e2e/                    # End-to-end tests
│   ├── fixtures.ts         # Custom test fixtures and utilities
│   ├── landing.spec.ts     # Landing page tests
│   └── payments.spec.ts    # Payment functionality tests
├── unit/                   # Unit tests
│   ├── setup.ts           # Test environment setup
│   ├── test-utils.tsx     # Testing utilities and helpers
│   └── hooks/             # Hook tests
│       └── useApi.test.ts # API hook tests
```

## Testing Technologies

### End-to-End Testing
- **Playwright**: Modern E2E testing framework
- **Custom Fixtures**: Extended test utilities for wallet connection, loading states, and toast messages
- **Multi-browser Support**: Chrome, Firefox, Safari, and mobile browsers
- **Visual Testing**: Screenshot comparison capabilities

### Unit Testing
- **Vitest**: Fast unit test runner
- **React Testing Library**: Component testing utilities
- **@testing-library/jest-dom**: Additional DOM matchers
- **@testing-library/user-event**: User interaction simulation

## Running Tests

### End-to-End Tests
```bash
# Run all E2E tests
npm run test:e2e

# Run tests in headed mode (see browser)
npm run test:e2e -- --headed

# Run specific test file
npm run test:e2e -- tests/e2e/landing.spec.ts

# Run tests on specific browser
npm run test:e2e -- --project=chromium

# Generate test report
npm run test:e2e -- --reporter=html
```

### Unit Tests
```bash
# Run all unit tests
npm run test:unit

# Run tests in watch mode
npm run test:unit -- --watch

# Run with coverage
npm run test:unit -- --coverage

# Run specific test file
npm run test:unit -- tests/unit/hooks/useApi.test.ts
```

### All Tests
```bash
# Run both E2E and unit tests
npm test

# Run tests with coverage for both
npm run test:coverage
```

## Test Configuration

### Playwright Configuration (`playwright.config.ts`)
- **Base URL**: `http://localhost:5173`
- **Test Directory**: `./tests/e2e`
- **Browser Projects**: Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari
- **Retries**: 2 retries on CI, 0 locally
- **Screenshots**: Captured on failure
- **Videos**: Retained on failure
- **Trace**: Collected on first retry

### Vitest Configuration (`vitest.config.ts`)
- **Environment**: jsdom
- **Setup File**: `./tests/unit/setup.ts`
- **Coverage**: V8 provider with 80% thresholds
- **Path Aliases**: `@` for src, `@tests` for tests

## Writing Tests

### E2E Test Best Practices

1. **Use Custom Fixtures**: Leverage the extended page object with utility methods:
   ```typescript
   test('example test', async ({ page }) => {
     await page.gotoAndWait('/');
     await page.connectWallet();
     await page.waitForToast('Success');
   });
   ```

2. **Wait for Loading States**: Always wait for network idle and loading indicators:
   ```typescript
   await page.waitForLoading();
   ```

3. **Handle Wallet Connection**: Use the built-in wallet connection helper:
   ```typescript
   await page.connectWallet();
   ```

4. **Test Responsive Design**: Test on multiple viewport sizes:
   ```typescript
   await page.setViewportSize({ width: 375, height: 667 }); // Mobile
   ```

5. **Check Toast Messages**: Verify success/error messages:
   ```typescript
   await page.waitForToast('Payment created successfully');
   ```

### Unit Test Best Practices

1. **Use Test Utilities**: Import helpers from `test-utils.tsx`:
   ```typescript
   import { renderWithProviders, mockApiCall } from '../test-utils';
   ```

2. **Mock API Calls**: Use the mock API utilities:
   ```typescript
   const mockFetch = mockApiCall({ data: 'test' });
   ```

3. **Test Custom Hooks**: Use `renderHook` from React Testing Library:
   ```typescript
   const { result } = renderHook(() => useApi());
   ```

4. **Wait for Async Operations**: Use `waitFor` for async assertions:
   ```typescript
   await waitFor(() => {
     expect(result.current.data).toEqual(expectedData);
   });
   ```

## Test Coverage

### Current Coverage Areas
- ✅ API Service Layer (`src/services/api.ts`)
- ✅ Error Handling (`src/services/errorHandler.ts`)
- ✅ Loading State Management (`src/contexts/LoadingContext.tsx`)
- ✅ API Hooks (`src/hooks/useApi.ts`)
- ✅ Environment Variables (`src/env.ts`)
- ✅ Utility Functions (`src/utils/styles.ts`, `src/utils/tailwindHelpers.ts`)

### Coverage Goals
- **Lines**: 80%
- **Functions**: 80%
- **Branches**: 70%
- **Statements**: 80%

## Common Test Patterns

### Testing API Integration
```typescript
// Mock successful API call
mockApiCall({ success: true });

// Mock API error
mockApiCall({ error: 'Not found' }, false);

// Test with loading states
const { result } = renderHook(() => useApi());
await result.current.get('/endpoint');
expect(result.current.loading).toBe(false);
```

### Testing User Interactions
```typescript
const user = userEvent.setup();
await user.click(screen.getByRole('button', { name: 'Submit' }));
await user.type(screen.getByLabelText('Amount'), '100');
```

### Testing Error States
```typescript
// Test error boundary
const ThrowError = () => {
  throw new Error('Test error');
};

render(<ErrorBoundary><ThrowError /></ErrorBoundary>);
expect(screen.getByRole('alert')).toBeInTheDocument();
```

## Continuous Integration

Tests run automatically on:
- Pull requests
- Main branch pushes
- Nightly builds

CI Configuration:
- Parallel test execution
- Coverage reporting
- Artifact collection (screenshots, videos, traces)
- Performance monitoring

## Debugging Tests

### E2E Test Debugging
1. **Use Playwright Inspector**: `npm run test:e2e -- --debug`
2. **Check Trace Viewer**: Open `playwright-report/index.html`
3. **View Screenshots**: Located in `test-results/` directory
4. **Watch Videos**: Available for failed tests

### Unit Test Debugging
1. **Use Vitest UI**: `npm run test:unit -- --ui`
2. **Check Coverage Report**: Open `coverage/index.html`
3. **Use Console Logs**: Tests run in Node.js environment
4. **Debug in VS Code**: Use the built-in debugger

## Best Practices Summary

1. **Write Tests First**: Follow TDD approach when possible
2. **Test User Behavior**: Focus on what users see and do
3. **Use Descriptive Names**: Test names should explain the behavior
4. **Keep Tests Independent**: Each test should set up its own state
5. **Use Test Data Builders**: Create reusable test data factories
6. **Mock External Dependencies**: Don't rely on real APIs in unit tests
7. **Test Edge Cases**: Include error states and boundary conditions
8. **Maintain Test Performance**: Keep tests fast and reliable

## Troubleshooting

### Common Issues

1. **Tests Timing Out**: Increase timeout or check for infinite loops
2. **Element Not Found**: Use proper selectors and wait for elements
3. **Network Issues**: Mock API calls properly in unit tests
4. **Wallet Connection**: Mock Web3 providers in unit tests
5. **Mobile Tests**: Ensure responsive design is implemented

### Getting Help

- Check existing tests for patterns
- Review test documentation
- Run tests locally before pushing
- Use debug tools and logs
- Ask team members for code review

## Future Improvements

- Add visual regression testing
- Implement performance testing
- Add accessibility testing
- Create test data factories
- Add mutation testing
- Implement contract testing for APIs