# Feature: accounts and settings — registering, signing in, and the Settings dialog (appearance, app install, admin user management).

Last updated: 2026-10-28 (commit 00cb49a)

## Register and sign in

**What the user sees.** `/auth/register` asks for username (min 3 characters), email and password (min 6). On success the page shows "Account created!" with a link to sign in; it does not sign the user in. `/auth/login` asks for email and password and, on success, navigates to `/dashboard`, which redirects to `/home/dashboard`.

**Flow.**
1. `RegisterComponent.submit` calls `AuthService.signUp`; `LoginComponent.submit` calls `AuthService.signIn`. Errors are shown with `getErrorMessage`.
2. The REST calls are `POST /api/auth/register` and `POST /api/auth/login` ([api/auth.md](../api/auth.md)). Token storage, refresh and the interceptor are in [architecture/auth.md](../architecture/auth.md) and [architecture/frontend.md](../architecture/frontend.md#http-interceptor).
3. Both routes are outside the `home` shell. The `''` and `**` routes use `homeRedirectGuard` (logged out → `/auth/login`, logged in → `/home/dashboard`); see [architecture/frontend.md](../architecture/frontend.md#guards).

**Limitations.** The frontend has no password-reset, e-mail verification or "forgot password" screen (none under `features/auth/`). Promoting an account to admin is done with a script (see [overview.md](../overview.md)) or by an admin in Settings.

Sources: `dnd_vtt_frontend/src/app/features/auth/login/login.ts`, `dnd_vtt_frontend/src/app/features/auth/register/register.ts`, `dnd_vtt_frontend/src/app/app.routes.ts`, `dnd_vtt_frontend/src/app/core/services/auth.service.ts`.

## Settings dialog

**What the user sees.** A `MatDialog` (700 px wide) opened from the shell header (`ShellComponent.goToSettings()`), floating over the current page rather than routed. Sections, from `settings-dialog.html`:

| Section | Content | Backing service |
|---|---|---|
| Account | Read-only username and email of the signed-in profile | `AuthService.profile()` |
| Appearance | Interface size (`UI_SCALE_OPTIONS`), Color Scheme (`COLOR_SCHEME_OPTIONS`), app Background picker (including custom background images) | `UiScaleService`, `ColorSchemeService`, `BackgroundService` |
| NatOne App | Install button for the PWA, or a hint to use the browser menu; an "Installed" badge when installed | `PwaService` |
| Users & Accounts | Admin only (`auth.isAdmin()`): list accounts, edit username, email, role and password, delete an account (with confirmation) | `UserAdminService` → `/api/users` ([api/users.md](../api/users.md)) |

Appearance values are client-side preferences handled by the services above; shared storage keys are in `core/utils/storage-keys.ts` ([architecture/frontend-core.md](../architecture/frontend-core.md)). The list of background images comes from `GET /api/backgrounds` ([api/backgrounds.md](../api/backgrounds.md)). The PWA and service worker are described in [architecture/frontend-ui.md](../architecture/frontend-ui.md).

**Limitations.** An admin edit sends only the fields that changed; an empty password field leaves the password unchanged. Non-admins cannot edit their profile here (the Account section is display-only).

Sources: `dnd_vtt_frontend/src/app/features/settings/settings-dialog.ts` (`SettingsDialogComponent`, `saveEditUser`, `deleteUser`, `installNatOne`), `dnd_vtt_frontend/src/app/features/settings/settings-dialog.html`, `dnd_vtt_backend/src/users/`, `dnd_vtt_backend/src/backgrounds/`.
