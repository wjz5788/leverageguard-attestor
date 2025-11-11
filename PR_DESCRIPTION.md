# Amount Decimals Standardization

## Summary
This PR standardizes the handling of USDC amounts across the application by converting premiumUSDC decimal values to premiumUSDC_6d string format (micro-USDC integers) in API requests. This change ensures consistency with backend validation and improves precision handling.

## Changes Made

### Backend Changes (us-backend)
1. Updated Zod validation schemas to accept only premiumUSDC_6d field (micro-USDC integers) and reject premiumUSDC field
2. Added specific error messages for field validation mismatches
3. Updated all relevant API endpoint handlers to work with premiumUSDC_6d format

### Frontend Changes (us-frontend)
1. Implemented request interceptor in ApiService to automatically convert premiumUSDC decimal values to premiumUSDC_6d strings
2. Added comprehensive error handling with user-friendly Toast notifications
3. Created conversion utility function with proper rounding
4. Added extensive test coverage for the conversion logic

## Technical Details
- premiumUSDC (decimal): 0.01 (represents 0.01 USDC)
- premiumUSDC_6d (string): "10000" (represents 10000 micro-USDC)

Conversion formula: premiumUSDC_6d = Math.round(premiumUSDC * 1000000).toString()

## Testing
- Added unit tests for conversion utility function
- Added API service tests to verify request transformation
- Verified error handling scenarios
- Tested edge cases and boundary conditions

## Migration Notes
No action required from users - the frontend automatically handles the conversion. Existing integrations using premiumUSDC field will continue to work seamlessly as the conversion happens transparently in the request layer.