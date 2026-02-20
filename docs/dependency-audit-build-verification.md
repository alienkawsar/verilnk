# Dependency Audit + Build Verification (2026-02-20)

## Scope and constraints
- Repository: VeriLnk (`backend`, `frontend`)
- Package manager: npm (lockfiles: `backend/package-lock.json`, `frontend/package-lock.json`)
- Prisma constraint: **no Prisma version change**
  - `prisma@7.4.0`
  - `@prisma/client@7.4.0`

## What changed
- Updated direct dependencies to latest compatible patch/minor versions where safe (no Prisma changes).
- Kept/used npm overrides for transitive security fixes:
  - Backend: `hono@4.12.0`, `lodash@4.17.23`, `qs@6.15.0`
  - Frontend: `minimatch@10.2.2`, `vite -> esbuild@0.25.0`
- Removed unused packages:
  - Backend: `axios-cookiejar-support`, `tough-cookie`, `@types/vosk`, `@types/bcryptjs`
  - Frontend: `@testing-library/user-event`, `@types/react-google-recaptcha`
- Build reliability config fix:
  - Backend `build` script now runs `prisma generate && tsc`

## Audit summary
### Baseline (Phase 1, at start of this remediation sequence)
- Backend `npm audit`: **0** vulnerabilities
- Frontend `npm audit`: **10 moderate** vulnerabilities
- Backend `npm audit --omit=dev`: **0** vulnerabilities
- Frontend `npm audit --omit=dev`: **0** vulnerabilities

### Final (Phase 5)
- Backend `npm audit`: **0** vulnerabilities
- Frontend `npm audit`: **10 moderate** vulnerabilities
- Backend `npm audit --omit=dev`: **0** vulnerabilities
- Frontend `npm audit --omit=dev`: **0** vulnerabilities

## Remaining advisories and rationale
- Remaining frontend advisories are in the ESLint toolchain (`eslint`, `@eslint/eslintrc`, `typescript-eslint`, `ajv`) and are **dev-only tooling**.
- `npm audit` recommends breaking changes/major shifts (including invalid downgrade guidance for eslint in this tree).
- Forcing `ajv >= 8.18.0` was tested and is not currently safe with this stack (`@eslint/eslintrc` runtime failure with `defaultMeta` / `missingRefs` assumptions).

## Build verification
- Backend: `npm run build` ✅
- Frontend: `npm run build` ✅

