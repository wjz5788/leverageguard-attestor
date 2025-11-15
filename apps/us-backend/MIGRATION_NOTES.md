# MIGRATION NOTES – API Key Secret Fragment Hardening

## Summary

This deployment introduces the following security hardening changes:

- Adds `key_id`, `secret_fragment_hash`, and `secret_prefix` columns to the `api_keys` table.
- Requires clients to send both `X-API-Key-Id` and `X-API-Key-Secret` headers.
- Validates secret fragments using SHA-256 hashes compared in constant time.
- Caches API key metadata for ≤60 seconds and invalidates cache entries when keys are disabled or deleted.

## Legacy Key Handling

We adopt **Strategy A (forced rotation)**. Any key missing `secret_fragment_hash` is immediately marked `disabled` on first access. Such keys can no longer authenticate and must be rotated.

Operational steps:

1. After deploying the migration, run an inventory query to identify keys without `secret_fragment_hash` and notify owners:
   ```sql
   SELECT key_id, name, status
   FROM api_keys
   WHERE secret_fragment_hash = '' OR secret_fragment_hash IS NULL;
   ```
2. Issue new credentials for affected clients. When generating a replacement key:
   - Store the SHA-256 hash of the chosen secret fragment.
   - Persist `secret_prefix` (first 3 + last 4 characters) for auditing.
3. Remove or archive disabled legacy keys after rotation is confirmed.

## Cache Invalidation Workflow

- The middleware automatically evicts cache entries when the `disableApiKey` helper is called.
- For service actions that disable, delete, or rotate a key, call `middleware.invalidateKey(<keyId>)` after the database update.
- For emergency revocation, execute:
  ```sql
  UPDATE api_keys SET status = 'disabled', enabled = 0 WHERE key_id = ?;
  ```
  then restart the API process or trigger the cache invalidation hook to ensure immediate enforcement.

## Operations Checklist

1. **Deploy order**: database migration → application → restart API servers.
2. **Smoke test**: send a request with valid headers to confirm `200` response, then retry with a wrong fragment to confirm `401`.
3. **Rotation**: regenerate all pre-existing keys lacking fragment hashes. Communicate the new requirement to API consumers.
4. **Monitoring**: watch logs for `[API_KEY_AUTH][LEGACY_DISABLED]` and `[API_KEY_AUTH][RATE_LIMIT]` to track forced rotations and brute-force attempts.

## Rollback Plan

1. Roll back the application code to the previous version.
2. Execute the down migration `012_api_key_secret_fragment.down.sql` to drop the new columns and index.
3. Keep the backup of `secret_fragment_hash` data until forward deployment is reattempted.
