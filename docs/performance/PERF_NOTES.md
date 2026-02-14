# Performance & Reliability Notes

## Observed in code
- Search debounce + request de-dup: `frontend/src/lib/api.ts` (search cache + dedup map), `useDebounce` in admin search.
- Timeout middleware: `backend/src/middleware/timeout.middleware.ts` (20s default).
- Rate limiting configured in `backend/src/middleware/rateLimit.middleware.ts`.
- MeiliSearch indexing for sites and priority: `backend/src/services/meilisearch.service.ts`.

## Items to verify
- No excessive render loops / console spam in dev.
- Country detection doesn't flash incorrect country.
- MeiliSearch indexing after org/site create/update/delete.
- Next/Image remote patterns for backend uploads to avoid 400s.
- Build warnings resolved (middleware deprecation, backend fetch during build).

## Findings
- Frontend build succeeded but logged ECONNREFUSED for country/category when backend not running.
- Next.js build warns about `middleware` vs `proxy` (deprecation). No functional issue but should be scheduled for upgrade.

