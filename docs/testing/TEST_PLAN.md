# VeriLnk Test Plan

This plan is generated from the current routes/components/services in the codebase. It lists the core features, entry points, expected behavior, and primary data stores involved.

## Public / Marketing
- Homepage directory
  - Route: `/`
  - Entry: `frontend/src/app/page.tsx`, `frontend/src/app/HomeClient.tsx`, `frontend/src/components/country/SiteCard.tsx`
  - Expected: country detection drives listing; filters by country/state/category; verified badge and actions; no stale country flash; cards show “Verified Profile” only for eligible orgs; “Official Website ↗” always available.
  - Data: API `/api/sites`, DB `Site`, `Organization`, `Country`, `State`, `Category`; MeiliSearch for search; analytics logs.
- Search
  - Route: `/search`
  - Entry: `frontend/src/app/search/page.tsx`
  - Expected: strict MeiliSearch query; country+state filter; verified profile action only when public org profile exists; external link opens new tab.
  - Data: MeiliSearch `SITES_INDEX` + API `/api/v1/search`.
- Country / Category listing
  - Route: `/country/[iso]`
  - Entry: `frontend/src/app/country/[iso]/page.tsx`
  - Expected: country-specific view by ISO; correct metadata.
  - Data: API `/api/sites`, `/api/countries`, `/api/categories`.
- Public Organization Profile
  - Route: `/org/[id]`
  - Entry: `frontend/src/app/org/[id]/page.tsx`, `OrgProfileClient.tsx`
  - Expected: shows org name, logo, verified badge, about, contact, CTA, verification/trust; gated by entitlements; metadata uses org name when found.
  - Data: API `/api/organizations/:id/public`.
- Public Site Details
  - Route: `/site/[id]`
  - Entry: `frontend/src/app/site/[id]/page.tsx`
  - Expected: display verified site info and official website link.
  - Data: API `/api/sites/:id`.
- SEO pages
  - Routes: `/about`, `/contact`, `/privacy`, `/terms`, `/verification-process`, `/pricing`
  - Entry: `frontend/src/app/*/page.tsx`
  - Expected: static content, metadata/robots/canonical set.
  - Data: none (static).
- Robots/Sitemap
  - Routes: `/robots.txt`, `/sitemap.xml`
  - Entry: `frontend/src/app/robots.ts`, `frontend/src/app/sitemap.ts`
  - Expected: robots disallow admin/dashboard/auth/api; sitemap includes eligible org profiles.
  - Data: API `/api/organizations/public-sitemap`.

## Voice Input
- Voice input on homepage
  - Entry: `frontend/src/components/home/SearchBar.tsx`, `frontend/src/hooks/useSpeechRecognition.ts`, `frontend/src/utils/audioProcessor.ts`, `frontend/src/config/voiceNormalization.ts`
  - Expected: Web Speech primary; WASM fallback; auto-stop on speech end; manual stop; ISO short codes recognized; no “[unk]” output; optional Google Cloud STT when backend key exists.
  - Data: API `/api/speech/provider`, `/api/speech/recognize`, `/api/speech/transcribe`.

## User Auth & Dashboard
- User signup/login/logout
  - Routes: `/auth/*` (login modal + API)
  - Entry: `frontend/src/components/auth/*`, `backend/src/routes/auth.routes.ts`
  - Expected: reCAPTCHA v3 validated; login/session; logout clears.
  - Data: DB `User`, `AdminLog`.
- User dashboard
  - Route: `/dashboard`
  - Entry: `frontend/src/app/dashboard/page.tsx`
  - Expected: request limits, request creation, request status, request ID visible/copy.
  - Data: DB `ChangeRequest`, `User`.
- Request limits
  - Entry: `backend/src/services/request.service.ts`, `user` schema defaults
  - Expected: default 3/day for new users; enforcement on create.
  - Data: DB `User`, `ChangeRequest`.

## Organization Flows
- Organization signup
  - Route: `/organizations/signup` API
  - Entry: `frontend/src/components/auth/SignupModal.tsx`, `backend/src/controllers/organization.controller.ts`
  - Expected: required fields; category required; optional state/about/logo; logo upload/preview; status PENDING.
  - Data: DB `Organization`, `User`, `Site` (pending).
- Organization dashboard
  - Route: `/org/dashboard`
  - Entry: `frontend/src/app/org/dashboard/page.tsx`
  - Expected: pending route; settings update; analytics; plan/billing.
  - Data: DB `Organization`, `OrgAnalytics`, `BillingAccount`, `Invoice`.
- Organization upgrade
  - Route: `/org/upgrade`
  - Entry: `frontend/src/app/org/upgrade/page.tsx`
  - Expected: mock checkout; plan applied; trial logic.
  - Data: DB `BillingAccount`, `Invoice`, `Subscription`, `TrialSession`.

## Admin Auth + Roles
- Admin login
  - Route: `/admin/login`
  - Entry: `frontend/src/app/admin/login/page.tsx`, `backend/src/routes/auth.routes.ts`
  - Expected: SUPER_ADMIN/VERIFIER/MODERATOR permissions enforced.
  - Data: DB `Admin`, `AdminLog`.

## Admin Features
- Manage Organizations
  - Route: `/admin/dashboard` (section)
  - Entry: `frontend/src/components/admin/sections/OrganizationsSection.tsx`, `backend/src/controllers/organization.controller.ts`
  - Expected: create/edit/delete (soft), restore, permanent delete; plan updates; priority; audit logs.
  - Data: DB `Organization`, `Site`, `AdminLog`; MeiliSearch indexing.
- Manage Users
  - Entry: `frontend/src/components/admin/sections/UsersSection.tsx`, `backend/src/controllers/user.controller.ts`
  - Expected: create/edit/delete; restrict/unrestrict; limits.
  - Data: DB `User`, `AdminLog`.
- Manage Admins
  - Entry: `frontend/src/components/admin/sections/AdminsSection.tsx`, `backend/src/controllers/admin.controller.ts`
  - Expected: create/edit/delete admin.
  - Data: DB `Admin`, `AdminLog`.
- Review Queue
  - Entry: `frontend/src/components/admin/sections/ReviewQueueSection.tsx`, `backend/src/controllers/site.controller.ts`, `request.controller.ts`
  - Expected: approve/reject sites and org/user requests; bulk actions.
  - Data: DB `Site`, `ChangeRequest`, `VerificationLog`, `AdminLog`.
- Request Hub
  - Entry: `frontend/src/components/admin/sections/RequestHubSection.tsx`, `backend/src/controllers/request.controller.ts`
  - Expected: handle org website updates and change requests.
  - Data: DB `ChangeRequest`.
- URL Manager
  - Entry: `frontend/src/components/admin/sections/UrlsSection.tsx`, `backend/src/controllers/site.controller.ts`
  - Expected: CRUD sites; bulk delete.
  - Data: DB `Site`, MeiliSearch.
- Countries/States/Categories
  - Entry: `frontend/src/components/admin/sections/CountriesSection.tsx`, `StatesSection.tsx`, `CategoriesSection.tsx`
  - Expected: create/edit/delete; flag upload/url; enable/disable.
  - Data: DB `Country`, `State`, `Category`.
- Reports
  - Entry: `frontend/src/components/admin/sections/ReportsSection.tsx`, `backend/src/controllers/report.controller.ts`
  - Expected: list/remove reports.
  - Data: DB `Report`.
- Bulk Import
  - Entry: `frontend/src/components/admin/sections/BulkImportSection.tsx`, `backend/src/controllers/bulk-import.controller.ts`
  - Expected: CSV/JSON upload, dry-run, progress tracking.
  - Data: DB `BulkImportJob`.
- Audit Logs / All Logs
  - Entry: `frontend/src/components/admin/sections/AuditLogsSection.tsx`, `backend/src/controllers/audit.controller.ts`
  - Expected: append-only, hash chain integrity, compliance exports.
  - Data: DB `AdminLog`, `ComplianceExport`.
- Compliance Dashboard
  - Route: `/admin/compliance`
  - Entry: `frontend/src/app/admin/compliance/page.tsx`, `backend/src/controllers/compliance.controller.ts`
  - Expected: read-only metrics; export evidence; retention policies.
  - Data: DB `AdminLog`, `ComplianceIncident`, `ComplianceExport`, `RetentionPolicy`.

## Search & Indexing
- MeiliSearch indexing and search
  - Entry: `backend/src/services/meilisearch.service.ts`
  - Expected: index includes country/state/category, org public status, priority score; search filters by country+state and sorts by priority.
  - Data: MeiliSearch `SITES_INDEX` + DB `Site`.

## Testing Checklist (Automated/Lightweight)
- Backend route checks: auth roles, request approve/reject, bulk delete atomicity, upload validation, request limits, audit log creation.
- MeiliSearch checks: index fields, filters, priority sort.

