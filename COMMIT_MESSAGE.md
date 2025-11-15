# Git Commit Message

## Title
feat: standardize USDC amount fields to premiumUSDC_6d format

## Body
- Update backend Zod validation to accept only premiumUSDC_6d field (micro-USDC integers)
- Implement frontend request interceptor to convert premiumUSDC decimals to premiumUSDC_6d strings
- Add comprehensive error handling with user-friendly Toast notifications
- Create conversion utility function with proper rounding
- Add extensive test coverage for the conversion logic
- Update documentation and examples

## Breaking Changes
- Backend now only accepts premiumUSDC_6d field (string format) instead of premiumUSDC (decimal)
- API responses will only include premiumUSDC_6d field
- Frontend automatically converts premiumUSDC values to premiumUSDC_6d before sending requests

## Migration Notes
No action required from users - the frontend automatically handles the conversion. Existing integrations using premiumUSDC field will continue to work seamlessly as the conversion happens transparently in the request layer.