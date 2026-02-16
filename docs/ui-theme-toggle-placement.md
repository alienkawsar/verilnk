# Theme Toggle Placement Matrix

This documents the required placement behavior for the global theme toggle in `frontend/src/components/layout/Navbar.tsx`.

| Breakpoint | Auth State | Placement |
| --- | --- | --- |
| `< md` | Logged out | Mobile menu panel only |
| `< md` | Logged in (user/org/enterprise/admin) | Mobile menu panel only |
| `>= md` | Logged out | Navbar (directly visible) |
| `>= md` | Logged in (user/org/enterprise/admin) | Navbar (directly visible) |

Rules:
- Never render the toggle inside desktop profile dropdown menus.
- Ensure exactly one visible toggle per breakpoint.
