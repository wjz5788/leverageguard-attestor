# LiqPass Frontend - Testing Setup

This project now includes comprehensive testing infrastructure with both unit tests (Vitest) and end-to-end tests (Playwright).

## 🧪 Testing Technologies

### Unit Testing
- **Vitest**: Fast unit test runner compatible with Jest
- **React Testing Library**: Component testing utilities
- **@testing-library/jest-dom**: Additional DOM matchers
- **@testing-library/user-event**: User interaction simulation
- **jsdom**: DOM implementation for testing

### End-to-End Testing
- **Playwright**: Modern E2E testing framework
- **Multi-browser Support**: Chrome, Firefox, Safari, Mobile browsers
- **Custom Fixtures**: Extended test utilities for wallet connection, loading states
- **Visual Testing**: Screenshot and video capture

## 🚀 Quick Start

### Install Dependencies
```bash
cd /Users/zhaomosheng/Desktop/LiqPass-clean/apps/us-frontend
npm install
```

### Run All Tests
```bash
npm test
```

### Unit Tests Only
```bash
# Run once
npm run test:unit

# Watch mode
npm run test:unit:watch

# With coverage
npm run test:unit:coverage
```

### E2E Tests Only
```bash
# Run headless
npm run test:e2e

# Run with browser visible
npm run test:e2e:headed

# Debug mode
npm run test:e2e:debug

# Interactive UI
npm run test:e2e:ui
```

### Coverage Report
```bash
npm run test:coverage
```

## 📁 Test Structure

```
tests/
├── e2e/                    # End-to-end tests
│   ├── fixtures.ts         # Custom test fixtures
│   ├── landing.spec.ts     # Landing page tests
│   └── payments.spec.ts    # Payment functionality tests
├── unit/                   # Unit tests
│   ├── setup.ts           # Test environment setup
│   ├── test-utils.tsx     # Testing utilities
│   └── hooks/             # Hook tests
│       └── useApi.test.ts # API hook tests
└── TESTING_GUIDE.md       # Comprehensive testing guide
```

## 🛠️ What's Been Added

### 1. Environment Variables Validation (`src/env.ts`)
- Type-safe environment variable access
- Runtime validation
- Default values and error handling

### 2. Unified API Service (`src/services/api.ts`)
- Centralized API client with TypeScript support
- Error handling and retry logic
- Authentication token management
- File upload support
- Batch request handling

### 3. Global Error Handling (`src/services/errorHandler.ts`)
- Error boundary component
- Global error handlers for unhandled rejections
- Categorized error types (Network, Auth, Validation, etc.)
- Integration with toast notifications

### 4. Loading State Management (`src/contexts/LoadingContext.tsx`)
- Global loading state management
- Component-level loading states
- Loading indicators and progress bars
- Integration with API calls

### 5. API Hooks (`src/hooks/useApi.ts`)
- React hooks for API calls
- Automatic loading state management
- Error handling integration
- Support for all HTTP methods

### 6. TailwindCSS Utilities (`src/utils/styles.ts`, `src/utils/tailwindHelpers.ts`)
- Consistent class name merging with `cn()` function
- Predefined style constants for common components
- TailwindCSS configuration validation
- Style scanning and auto-fixing tools

### 7. Comprehensive Test Suite
- **E2E Tests**: Landing page, payment flows, responsive design
- **Unit Tests**: API hooks, utilities, error handling
- **Custom Fixtures**: Wallet connection, loading states, toast messages
- **Multi-browser Support**: Chrome, Firefox, Safari, Mobile browsers

## 🎯 Key Features

### Enhanced API Integration
```typescript
// Before: Direct fetch calls with manual error handling
const response = await fetch('/api/payments', {
  headers: { 'Authorization': `Bearer ${token}` }
});
if (!response.ok) throw new Error('API Error');

// After: Type-safe API client with automatic error handling
const { data, loading, error } = useApi();
const payments = await get('/api/payments');
```

### Global Error Boundaries
```typescript
// Wrap your app with error boundary
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

### Loading State Management
```typescript
// Automatic loading states
const { loading, get } = useApi();
// Loading indicator shows automatically during API calls
```

### Consistent Styling
```typescript
// Use predefined styles
import { STYLES } from '@/utils/styles';

<button className={cn(STYLES.button.primary, STYLES.button.sizes.md)}>
  Pay Now
</button>
```

## 🔧 Configuration Files

### Playwright Config (`playwright.config.ts`)
- Multi-project setup for different browsers
- Automatic dev server startup
- Screenshot and video capture on failure
- Trace collection for debugging

### Vitest Config (`vitest.config.ts`)
- React and TypeScript support
- Coverage reporting with thresholds
- Path aliases for clean imports
- jsdom environment for DOM testing

## 🚨 Testing Best Practices

1. **Write Tests First**: Follow TDD when possible
2. **Test User Behavior**: Focus on what users see and do
3. **Use Descriptive Names**: Test names should explain the behavior
4. **Keep Tests Independent**: Each test should set up its own state
5. **Mock External Dependencies**: Don't rely on real APIs in unit tests
6. **Test Edge Cases**: Include error states and boundary conditions
7. **Maintain Test Performance**: Keep tests fast and reliable

## 📊 Coverage Goals

- **Lines**: 80%
- **Functions**: 80%
- **Branches**: 70%
- **Statements**: 80%

## 🔍 Debugging Tests

### E2E Test Debugging
```bash
# Debug mode with inspector
npm run test:e2e:debug

# View test report
npm run test:report

# Check screenshots and videos in test-results/
```

### Unit Test Debugging
```bash
# Interactive UI
npm run test:unit:watch

# Coverage report
open coverage/index.html
```

## 📚 Next Steps

1. **Run the existing tests** to ensure everything works
2. **Add more test cases** for your specific components
3. **Set up CI/CD integration** for automated testing
4. **Monitor test coverage** and improve uncovered areas
5. **Add visual regression testing** for UI consistency
6. **Implement performance testing** for critical user flows

## 🤝 Contributing

When adding new features:
1. Write tests first (TDD approach)
2. Ensure all tests pass
3. Maintain coverage thresholds
4. Update documentation
5. Test on multiple browsers (for E2E tests)

## 📖 Documentation

For detailed testing information, see:
- [Complete Testing Guide](tests/TESTING_GUIDE.md)
- [Playwright Documentation](https://playwright.dev/)
- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)