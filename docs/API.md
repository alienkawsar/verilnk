# API Overview

Base URL: `/api`

## Auth
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/admin/login`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `PATCH /api/auth/me`

## Public search/directory
- `GET /api/v1/search` (country required)
- `GET /api/sites` (supports pagination)
- `GET /api/organizations/public-sitemap`
- `GET /api/organizations/:id/public`

## Uploads
- `POST /api/upload` (auth)
- `POST /api/upload/public`
- `POST /api/upload/org-logo` (auth)
- `POST /api/upload/public/org-logo`

## Admin (role-guarded)
- `GET /api/admin` (admins)
- `POST /api/admin` (create admin)
- `PATCH /api/admin/:id`
- `DELETE /api/admin/:id`
- `POST /api/admin/reindex`
- `DELETE /api/admin/sites/bulk-delete`
- `GET /api/admin/sessions`
- `POST /api/admin/sessions/:id/revoke`
- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `PUT /api/admin/categories/:id`
- `DELETE /api/admin/categories/:id`
- `GET /api/admin/tags`
- `POST /api/admin/tags`
- `PUT /api/admin/categories/:id/tags`

## Organizations
- `POST /api/organizations` (signup)
- `PATCH /api/organizations/:id`
- `POST /api/admin/org/:id/restore`
- `POST /api/admin/org/:id/permanent-delete`

## Requests/Review
- `GET /api/requests`
- `POST /api/requests`
- `PATCH /api/requests/:id`

## Analytics
- `GET /api/analytics`

## Compliance
- `GET /api/admin/compliance/*`
- `POST /api/admin/compliance/*`
