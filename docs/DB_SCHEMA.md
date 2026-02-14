# Database Schema Summary

## Core
- **User**: users and org accounts (organizationId when org user).
- **Admin**: admin accounts with roles SUPER_ADMIN/MODERATOR/VERIFIER.
- **Organization**: org profile + plan fields + soft delete fields.
- **Site**: verified URLs and org-backed sites.
- **Country / State**: geo reference data.
- **Category / Tag**: category system (slug, isActive) + tagging joins.

## Requests & review
- **Request**: user/org submissions and review queue.
- **Report**: user report of suspicious/incorrect URLs.

## Analytics
- **AnalyticsEvent / Click / Visit** (varies by implementation)

## Search
- **MeiliSearch** holds indexed docs for sites; DB remains source of truth.

## Security & compliance
- **AuditLog**: tamper-resistant chain with hashes.
- **AuthSession**: admin/org session tracking by jti.
- **SecurityEvent**: suspicious login and failed login bursts.
- **ComplianceIncident / Export / RetentionPolicy** (if enabled).

## Bulk operations
- **BulkImportJob**: status + error reporting for CSV/JSON imports.

## Soft delete fields (Organization)
- `deletedAt`, `deletedBy`, `deleteReason`
