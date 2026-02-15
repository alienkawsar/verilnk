# Enterprise/Public Website List API Map (Local Verification)

## Auth model
- API-key protected routes are mounted at `/api/v1` via `backend/src/routes/enterprise.api.routes.ts`.
- Header required by middleware (`backend/src/middleware/apikey.middleware.ts`):
  - `Authorization: Bearer <vlnk_...>`
- Session/JWT routes for workspace dashboard are mounted at `/api/enterprise` and use cookie auth (`authenticateUser`), not API keys.

## Website list/search endpoints

1. Enterprise API directory (API key)
- Method/Path: `GET /api/v1/directory`
- Scope required: `read:directory`
- Query params:
  - `country` (optional, expects country code; handler resolves uppercase code)
  - `category` (optional, category slug)
  - `search` (optional text query)
  - `page` (optional, default `1`)
  - `limit` (optional, default `20`, max `100`)
- Response shape:
  - `{ sites: [...], pagination: { page, limit, total, totalPages } }`

2. Public search endpoint (no API key)
- Method/Path: `GET /api/v1/search`
- Query params:
  - `q` (optional query text)
  - `country` (required, valid ISO code)
  - `category` (optional, category id)
  - `stateId` (optional, state id)
  - `page` (optional)
  - `limit` (optional)
- Response shape (Meilisearch):
  - `{ hits: [...], total, limit, offset, ... }`

3. Public sites list endpoint (no API key)
- Method/Path: `GET /api/sites`
- Query params:
  - `countryId`, `stateId`, `categoryId`, `status`, `search`, `organizationId`, `type`
  - optional pagination: `page`, `limit`
- Response shape:
  - paginated: `{ items: [...], page, limit, total, totalPages }`
  - non-paginated: `[...]`

## Example curl (API key directory)
```bash
curl -sS \
  -H "Authorization: Bearer $VERILNK_API_KEY" \
  "http://localhost:8000/api/v1/directory?page=1&limit=10&country=US"
```

