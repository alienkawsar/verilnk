# VeriLnk Manual Runbook

This runbook is step-by-step for manual verification. Record outcomes as you execute.

## A) Public UX
1) Homepage load
- Expected: no wrong country flash; country resolves correctly; flag visible.
  - Note: country codes follow DB values (e.g., United States uses `USA`, not `US`).
2) Country switch
- Expected: listing updates immediately; previous country data not shown.
3) Search
- Expected: results constrained to selected country/state; “Verified Profile” only when org profile exists; “Official Website ↗” always opens external.

## B) Voice Input
1) Start voice input
- Expected: does not instantly stop; auto-stop after speech end; transcript applied.
2) Manual stop
- Expected: click mic again stops and processes.
3) Transcript quality
- Expected: no “[unk]”; common ISO short codes recognized (uae/ksa/sa/it/in/ng).

## C) User Flows
1) Signup with reCAPTCHA v3
- Expected: valid token success; invalid token blocked.
2) Dashboard
- Expected: request ID visible + copy; optional state field; default request limit 3/day enforced.
3) Account updates
- Expected: updates reflect immediately.

## D) Organization Flows
1) Org signup
- Expected: required fields enforced; category required; logo <=1MB; preview works.
2) Pending org login
- Expected: always org dashboard.
3) Org updates
- Expected: edits reindex and reflect on homepage/search.
4) Priority
- Expected: ordering reflects priority on homepage/search.

## E) Admin Flows
1) Login
- Expected: session respected; route guard ok.
2) Review Queue + Request Hub
- Expected: approve/reject (single + bulk) works for user/org requests.
3) Manage Orgs
- Expected: create org includes plan selection; delete bulk atomic; restore works; audit logs written.
4) Audit Logs / All Logs
- Expected: updates without manual refresh or proper revalidation.
5) Country disable
- Expected: disabled country hidden on frontend; detection falls back to global.

Record results in docs/FINAL_STATUS.md.
