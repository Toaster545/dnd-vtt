# Authentication and authorization: JWT access tokens, refresh sessions, guards, roles and the dev bypass.

Last updated: 2026-10-28 (commit 00cb49a)

Everything lives in `dnd_vtt_backend/src/auth/`. `AuthModule` provides and exports `JwtGuard`, `AdminGuard`, `SocketAuthService`, `DatabaseService`, `CampaignAccessService` and `JwtModule` (see [backend](backend.md#modules)).

## Tokens

| Token | Format | Lifetime | Storage |
|---|---|---|---|
| Access token | JWT, payload `{ sub: <profile id> }`, signed with the resolved secret | 15 minutes (`signOptions.expiresIn: '15m'` in `AuthModule`) | Client; sent as `Authorization: Bearer <token>` |
| Refresh token | `<session id>.<32 random bytes, base64url>` | 30 days (`REFRESH_LIFETIME_MS`) | Only its SHA-256 hash is stored, in table `auth_sessions` (`token_hash`) |

Passwords are hashed with `bcrypt` (cost 10) into `profiles.password_hash`.

**JWT secret.** `resolveJwtSecret()` returns `JWT_SECRET` unless it is missing or one of three known placeholder values. In that case it falls back to a built-in development secret only when `isDevRun()` is true (`DEV_BYPASS=true`, or `NODE_ENV` of `development` or `test`); otherwise it throws at startup. `AuthModule` calls it in the `JwtModule.registerAsync` factory.

Sources: `dnd_vtt_backend/src/auth/auth.module.ts`, `dnd_vtt_backend/src/auth/auth.service.ts` (`createRefreshSession`, `hashToken`), `dnd_vtt_backend/src/auth/jwt-secret.ts` (`resolveJwtSecret`), `dnd_vtt_backend/src/config.ts` (`isDevRun`).

## Auth endpoints and refresh flow

`AuthController` (`/api/auth`): `POST register`, `POST login`, `POST refresh`, `POST logout`, `GET me` (the only route with `@UseGuards(JwtGuard)`; the controller has no class-level guard, so the others are open). Request and response shapes belong in the API docs.

- `register` rejects an existing email or username; new profiles get the database default role `player` (`profiles.role` is `CHECK(role IN ('admin','player'))`, default `'player'`).
- `login` takes an optional `client_type` of `web` (default) or `native`.
- **Web clients:** the refresh token is delivered as the cookie `dnd_refresh_token` (`httpOnly`, `sameSite: strict`, path `/api/auth`, 30-day max age, `secure` when `NODE_ENV=production`). The JSON body omits the refresh token.
- **Native clients:** the refresh token is returned in the JSON body. `refresh` and `logout` accept it in the body (`refresh_token`) or fall back to the cookie.
- `refresh` rotates: the presented session row is marked revoked (`revoked_at`), a new `auth_sessions` row is created, and a reused or already-rotated token gets `401`.
- `logout` revokes the session and clears the cookie; it is idempotent, including for invalid tokens.

Sources: `dnd_vtt_backend/src/auth/auth.controller.ts`, `dnd_vtt_backend/src/auth/auth.service.ts`, `dnd_vtt_backend/src/common/migrations/v001.ts` (`profiles.role`).

## `JwtGuard`

`JwtGuard` (`jwt.guard.ts`) is applied per controller with `@UseGuards(JwtGuard)`; there is no global guard registered in `AppModule`. Order of checks in `canActivate`:

1. If the handler or class has `@Public()` metadata (`IS_PUBLIC_KEY`), allow.
2. Require an `Authorization: Bearer …` header, else `401`.
3. If the token is the literal `dev` and `isDevBypass()` is true, load the first `profiles` row with `role = 'admin'` (`401 'No admin account found — register one first'` if none).
4. Otherwise `JwtService.verify`; failure gives `401 'Invalid or expired token'`.
5. Load the profile by `sub` (`401 'User not found'` if deleted) and set `req.user = { id, email, role }` (`RequestUser`, typed through `src/types/express.d.ts`).

The user is re-read from the database on every request, so a role change or deletion applies to existing access tokens immediately.

`@Public()` (`public.decorator.ts`) is used on the static game-content reads in `ContentController` (see [content](content.md#endpoints-and-access)). `BackgroundsController` and the `auth` routes other than `me` have no guard at all.

Sources: `dnd_vtt_backend/src/auth/jwt.guard.ts`, `dnd_vtt_backend/src/auth/public.decorator.ts`, `dnd_vtt_backend/src/types/express.d.ts`, `dnd_vtt_backend/src/content/content.controller.ts`, `dnd_vtt_backend/src/backgrounds/backgrounds.controller.ts`.

## Roles and `AdminGuard`

Roles are `admin` (the app-wide administrator, also called DM) and `player`. `AdminGuard` (`admin.guard.ts`) throws `403 'Admin only'` unless `req.user.role === 'admin'`; it must run after `JwtGuard`. It is used only by `UsersController` (`@UseGuards(JwtGuard, AdminGuard)`).

Campaign-scoped actions are not role-gated. They check `campaign.dm_id === user.id` in services, so any registered user can run their own campaign. Active membership and map visibility rules are centralised in `CampaignAccessService` (`isActiveMember`, `assertActiveMember`, `isMapRevealedToPlayers`, `mapRole`, `socketMapRole`, `encounterFor`), used by both REST services and the gateways. A non-DM may see a map only if the user is an active member (`campaign_members.status = 'active'`) and the map is a level of an encounter whose session and encounter are both `visible_to_players = 1`.

Promoting a user to admin is done out of band with `node scripts/make-admin.mjs <email>` (it updates `profiles.role`; see [overview.md](../overview.md) for commands).

Sources: `dnd_vtt_backend/src/auth/admin.guard.ts`, `dnd_vtt_backend/src/users/users.controller.ts`, `dnd_vtt_backend/src/campaigns/campaign-access.service.ts`, `dnd_vtt_backend/scripts/make-admin.mjs`.

## `DEV_BYPASS`

`DEV_BYPASS=true` (exact string) makes `isDevBypass()` true. Effects, all verified in code:

- REST: bearer token `dev` resolves to the first admin profile (`JwtGuard`).
- Sockets: handshake `auth.token = 'dev'` resolves to the first admin profile (`SocketAuthService`).
- Static frontend assets are served with `Cache-Control: no-store` (`main.ts`).
- The JWT secret may fall back to a built-in value (via `isDevRun`).
- A startup warning is logged.

The backend `start:dev` npm script sets it (`dnd_vtt_backend/package.json`; commands are listed in [overview.md](../overview.md)). A server running with it must not be exposed publicly.

Sources: `dnd_vtt_backend/src/config.ts`, `dnd_vtt_backend/src/auth/jwt.guard.ts`, `dnd_vtt_backend/src/auth/socket-auth.service.ts`, `dnd_vtt_backend/src/main.ts`.

## Socket authentication

`SocketAuthService.install(server)` registers a socket.io middleware (called from `afterInit` of `TokensGateway` and `EncounterPresenceGateway`). The middleware reads `socket.handshake.auth.token`, accepts a JWT (or `dev` under the bypass), loads `id, email, role` from `profiles`, and stores it in `socket.data.user`. Any failure rejects the connection with `Error('unauthorized')`. Gateway handlers read the user with `SocketAuthService.user(socket)`. Authorization of individual room joins is described in [realtime](realtime.md).

Sources: `dnd_vtt_backend/src/auth/socket-auth.service.ts`.
