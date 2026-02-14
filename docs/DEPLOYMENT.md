# Deployment

## Requirements
- Node.js 18–21
- PostgreSQL
- MeiliSearch

## Environment variables
- `DATABASE_URL`
- `JWT_SECRET`
- `FRONTEND_URL`
- `BACKEND_URL`
- `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`
- `NEXT_PUBLIC_SITE_URL`

## Build
Backend:
- `cd backend && npm run build`

Frontend:
- `cd frontend && npm run build`

## Run
Backend:
- `cd backend && npm start`

Frontend:
- `cd frontend && npm start`

## Health checks
- `GET /health`
