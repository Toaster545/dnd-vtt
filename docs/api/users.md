# API: admin-only account management routes under `/api/users`.

Last updated: 2026-10-28 (commit 00cb49a)

`UsersController` has `@UseGuards(JwtGuard, AdminGuard)` at class level, so every route requires `role = 'admin'` (`403 'Admin only'` otherwise). Conventions: [README.md](README.md#conventions).

| Method | Path | Auth | Request | Response / rules |
|---|---|---|---|---|
| GET | `/users` | JWT + admin | none | All profiles `{ id, email, username, role, created_at }`, oldest first |
| PATCH | `/users/:id` | JWT + admin | JSON, all optional: `username` (min 3), `email`, `role` (`admin` or `player`), `password` (min 6) | Updated user. `400` if email/username already used by another user, if the caller removes their own admin role, or if the change would leave no admin |
| DELETE | `/users/:id` | JWT + admin | none | `400` if the caller deletes their own account or the target is the last admin |

Sources: `dnd_vtt_backend/src/users/users.controller.ts`, `dnd_vtt_backend/src/users/users.service.ts` (`findAll`, `update`, `remove`), `dnd_vtt_backend/src/users/dto/update-user.dto.ts`.
