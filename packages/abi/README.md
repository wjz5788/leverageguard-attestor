# @liqpass/abi

Single source of truth for LiqPass contract ABIs and addresses.

- Exported files:
  - `checkoutUSDC` → `CheckoutUSDC.min.json` (minimal: events only)
  - `addresses` → `addresses.json` (placeholder; fill per network)

Usage (not yet wired into apps):

```ts
import checkout from '@liqpass/abi/checkoutUSDC';
import addresses from '@liqpass/abi/addresses';
```

Note: Existing services are unchanged. Migrate when ready via a small PR.

