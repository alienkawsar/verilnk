# Operational Runbook

## Common tasks
- Reindex search: `POST /api/admin/reindex`
- Bulk import: `/api/admin/bulk-import/upload`
- Review queue: `/admin/dashboard` → Review Queue

## Incidents
- Auth/session issues: check `AuthSession` table and `/api/admin/sessions`.
- Search staleness: confirm MeiliSearch is running; reindex if required.
- Upload failures: check `/uploads` permissions and multer limits.

## Recovery
- Restore org: `POST /api/admin/org/:id/restore`
- Permanent delete: `POST /api/admin/org/:id/permanent-delete`

## Backups
- Database snapshots daily (external).
- MeiliSearch reindexable from DB.
