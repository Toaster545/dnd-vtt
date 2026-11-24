# API index: REST endpoints per backend module, with the conventions they all share, and a pointer to the socket.io events.

Last updated: 2026-10-28 (commit 00cb49a)

## Modules

| Doc | Base path | Controller |
|---|---|---|
| [auth.md](auth.md) | `/api/auth` | `src/auth/auth.controller.ts` |
| [users.md](users.md) | `/api/users` | `src/users/users.controller.ts` |
| [campaigns.md](campaigns.md) | `/api/campaigns` | `src/campaigns/campaigns.controller.ts` |
| [sessions.md](sessions.md) | `/api/sessions` | `src/sessions/sessions.controller.ts` |
| [encounters.md](encounters.md) | `/api/encounters` | `src/encounters/encounters.controller.ts` |
| [maps.md](maps.md) | `/api/maps` | `src/maps/maps.controller.ts` |
| [characters.md](characters.md) | `/api/characters` | `src/characters/characters.controller.ts` |
| [companions.md](companions.md) | `/api/characters/:characterId/companions` | `src/companions/companions.controller.ts` |
| [content.md](content.md) | `/api/content` | `src/content/content.controller.ts` |
| [wiki.md](wiki.md) | `/api/wiki` | `src/wiki/wiki.controller.ts` |
| [player.md](player.md) | `/api/player` | `src/player/player.controller.ts` |
| [backgrounds.md](backgrounds.md) | `/api/backgrounds` | `src/backgrounds/backgrounds.controller.ts` |

## Conventions

- **Prefix.** All routes are under the global prefix `/api` (`app.setGlobalPrefix('api')` in `main.ts`). Paths in the tables omit the `/api` prefix (for example `/auth/login` means `POST /api/auth/login`).
- **Authentication.** `Authorization: Bearer <access token>`. Controllers apply `JwtGuard` at class level (details and `DEV_BYPASS` in [architecture/auth.md](../architecture/auth.md#jwtguard)). The "Auth" column in each table says `JWT` (any authenticated user), `JWT + admin` (`AdminGuard` as well), `Public` (no token needed) or `none` (no guard on the controller).
- **Authorization beyond the guard.** There is no role check on campaign-scoped routes. The services compare the caller with `campaigns.dm_id` ("DM" in the tables) or check for an active `campaign_members` row ("member"). Rules are noted per route; see also [architecture/auth.md](../architecture/auth.md#roles-and-adminguard).
- **Validation.** A global `ValidationPipe({ whitelist: true, transform: true })` is registered in `main.ts`: undeclared body properties are stripped and invalid bodies get `400`. The exception is the character body, which uses `ValidateOnlyPipe` and keeps unknown keys ([characters.md](characters.md)).
- **Errors.** Standard Nest exceptions: `400` bad input or rule violation, `401` missing or invalid token, `403` not allowed, `404` not found (sometimes used to avoid leaking existence), `409` conflict (stale revision, active encounter, ...). Bodies are Nest's default `{ statusCode, message, error }`.
- **Field casing.** Fields that mirror database columns are `snake_case` (`campaign_id`, `visible_to_players`); some character, inventory, spell and companion payloads are `camelCase` (`itemIndex`, `spellIndex`, `requestId`). The tables copy the DTO field names exactly.
- **File uploads.** `multipart/form-data` with the file in field `file` (`FileInterceptor('file')`). Storage locations: [architecture/storage.md](../architecture/storage.md#uploads).
- **Responses.** Controllers return service results directly (rows or small objects). Shapes are given in brief; the service named in each section is the authority.

## Socket events

Not duplicated here. The gateways (`TokensGateway`, `EncounterPresenceGateway`, `CompanionsGateway`), their rooms, client and server events and authentication are documented in [architecture/realtime.md](../architecture/realtime.md). REST mutations on maps, encounters and companions also trigger broadcasts; the per-route notes below only say so where the controller or service calls a gateway.

Sources: `dnd_vtt_backend/src/main.ts` (`setGlobalPrefix`, `ValidationPipe`), `dnd_vtt_backend/src/auth/jwt.guard.ts`, `dnd_vtt_backend/src/auth/admin.guard.ts`, `dnd_vtt_backend/src/characters/characters.controller.ts` (`characterBody`).
