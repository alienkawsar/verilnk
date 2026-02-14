# Search & Ranking

## Index source
- Primary source: PostgreSQL (Prisma).
- Indexed in MeiliSearch for fast public search and directory listing.

## Required fields in index
- `name`, `url`
- `country_code`, `state_id`, `category_id`
- `categorySlug`, `categoryName`
- `organizationId`, `organizationSlug` (if org-backed)
- `priorityRank` (numeric)
- `isApproved` / `status`

## Filters
- Country is mandatory for search.
- State and category filters applied when present.

## Ranking
- Sort by `priorityRank` desc (Business > Pro > Basic > Free).
- Then by MeiliSearch relevance.

## Sync triggers
- Site/organization create/update.
- Bulk import completion.
- Deletion/restore.

## Pagination
- Enforced limit (15) for public directory results.
