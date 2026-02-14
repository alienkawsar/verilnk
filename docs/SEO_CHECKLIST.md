# SEO Checklist

## What Was Added
- Global metadata base and canonical defaults.
- Per‑page metadata for public pages including `/verification-process`.
- Noindex on search, admin, dashboard, and auth areas.
- Robots and sitemap updates with dynamic org pages.
- Structured data:
  - WebSite schema on homepage
  - WebPage schema on `/verification-process`
  - Organization schema on public org pages

## How to Verify robots.txt / sitemap.xml
1) Open:
   - `/robots.txt`
   - `/sitemap.xml`
2) Confirm:
   - Disallow includes `/admin`, `/dashboard`, `/api`, `/org/dashboard`, `/org/upgrade`, `/auth`
   - Sitemap includes core public pages and public org pages.

## How to Validate Metadata
1) Check HTML head:
   - Title template applied (`<title>Page | VeriLnk</title>`).
   - Meta description exists.
   - Canonical exists.
2) Check that `/search` includes `noindex`.

## How to Validate Structured Data
1) Use Google Rich Results Test or Schema validator.
2) Confirm:
   - Home page includes WebSite schema.
   - Verification page includes WebPage schema.
   - Org pages include Organization schema with name + URL.
