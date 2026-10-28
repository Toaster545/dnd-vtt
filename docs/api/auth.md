# API: authentication routes under `/api/auth` (register, login, refresh, logout, current profile).

Last updated: 2026-10-28 (commit 00cb49a)

Token formats, lifetimes, cookie attributes and the rotation rules are in [architecture/auth.md](../architecture/auth.md#auth-endpoints-and-refresh-flow); this file only lists the routes. Conventions: [README.md](README.md#conventions).

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/auth/register` | none | JSON `{ email, password (min 6), username (min 3) }` | `{ message }`; `400` if email or username is taken |
| POST | `/auth/login` | none | JSON `{ email, password, client_type? }` (`client_type` is `web` or `native`, default `web`) | Web: `{ access_token, refresh_expires_at, client_type, profile }` and the refresh token in cookie `dnd_refresh_token`. Native: the full service result including `refresh_token` in the body |
| POST | `/auth/refresh` | none | JSON `{ refresh_token? }`; falls back to the `dnd_refresh_token` cookie | Same shape as login; rotates the refresh session |
| POST | `/auth/logout` | none | JSON `{ refresh_token? }` or the cookie | `{ logged_out: true }`; clears the cookie (path `/api/auth`) |
| GET | `/auth/me` | JWT | none | Profile `{ id, email, username, role }` |

`profile` in the login and refresh responses has the same fields as `/auth/me`.

Sources: `dnd_vtt_backend/src/auth/auth.controller.ts` (`RegisterDto`, `LoginDto`, `RefreshDto`, `deliverRefreshCredential`), `dnd_vtt_backend/src/auth/auth.service.ts` (`register`, `logout`, `getProfile`).
