# VeriLnk Project Walkthrough

This document gives a practical, code‑level overview of how VeriLnk works today.

## Architecture Overview
- Frontend: Next.js App Router (`frontend/src/app`), client UI in components, shared contexts in `frontend/src/context`.
- Backend: Express API in `backend/src`, Prisma ORM for database access, Meilisearch for public search.
- Storage: Prisma models in `backend/prisma/schema.prisma`.
- Search: Meilisearch index with strict country/state/category filtering in `backend/src/services/meilisearch.service.ts`.

## Country and State Detection
- Detection hook: `frontend/src/hooks/useCountryDetection.ts`.
  - Primary IP provider: `ipapi.co` (no key).
  - Fallback provider: `ipwho.is`.
  - Final fallback: browser locale.
  - Returns `countryCode`, `countryName`, and optional `stateName`, `stateCode`.
- Context storage and normalization: `frontend/src/context/CountryContext.tsx`.
  - Resolves detected country ID and optional state ID by matching against DB lists.
  - Stores country/state in context, persists overrides to localStorage.

## Search Pipeline (End‑to‑End)
1) UI input and filters
   - Homepage search uses `frontend/src/components/common/SearchComponent.tsx`.
   - Country/state filters sourced from `CountryContext`.
2) Frontend API call
   - Calls `searchSites` in `frontend/src/lib/api.ts` (GET `/v1/search`).
   - Debounce and dedup guard to prevent request storms.
3) Backend controller
   - `backend/src/controllers/search.controller.ts` validates inputs and builds filters.
4) Meilisearch query
   - `backend/src/services/meilisearch.service.ts` applies strict filters:
     - `country_code` (required)
     - `state_id` (optional)
     - `category_id` (optional)
     - `isApproved = true` (required)
5) Response rendering
   - Results returned to UI; cards rendered in `SearchComponent`.

## Admin Dashboard Modules
Located in `frontend/src/components/admin/sections` and rendered by `frontend/src/app/admin/dashboard/page.tsx`:
- Review Queue: approvals for pending organizations/sites.
- Request Hub: handles change requests and updates.
- Manage Organizations / Users / Admins: CRUD and role controls.
- Reports and Logs: moderation events and audit trails.

## User Dashboard
`frontend/src/app/dashboard/page.tsx`:
- Recommend website flow (creates requests in backend).
- Request limits and usage counters.
- Status updates for submitted requests.

## Organization Dashboard
`frontend/src/app/org/dashboard/page.tsx`:
- Signup → PENDING (manual review) → APPROVED.
- Organization profile edits:
  - Critical updates (e.g., website) go through the review queue.
  - Non‑critical updates apply immediately.
- Analytics display is gated by entitlements.
- Priority is derived from plan plus any manual override.

## Plan & Entitlements
- Core logic: `backend/src/services/entitlement.service.ts`.
- Plan fields are stored on `Organization` (e.g., `planType`, `planStatus`, `planStartAt`, `planEndAt`).
- Entitlements determine:
  - Verified badge visibility
  - Public org page access
  - Analytics level
  - Priority level

## Key Environment Variables (names only)
Backend:
- `DATABASE_URL`, `JWT_SECRET`, `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`
- `FRONTEND_URL`, `BACKEND_URL`, `PORT`
- `PAYMENT_MODE`, `PAYMENT_WEBHOOK_SECRET`
- `RECAPTCHA_SECRET_KEY`
Frontend:
- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`
- `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

## Local Run / Build
Backend:
- `npm run build`
- `npm run dev` (or `npm start` depending on your setup)
Frontend:
- `npm run build`
- `npm run dev`

## Troubleshooting
- Meilisearch results empty: ensure Meilisearch is running and indexed.
- Country detection failing: check IP provider availability.
- 401/403 errors: verify session cookie and correct API base URL.
- Missing org page: ensure org is approved and has an active paid plan.
