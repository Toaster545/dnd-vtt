# Maintainability Issues & Inconsistencies

> Auto-generated audit of the D&D VTT codebase. Issues are ranked by severity and grouped by category.

---

## 1. Heavy Reliance on `Record<string, unknown>` and Type Coercions

**Severity: High**

The codebase uses `Record<string, unknown>` extensively — especially in the backend (`characters.service.ts`, `maps.service.ts`, `campaigns.service.ts`) — often followed by `as Record<string, unknown>` or `as unknown as Record<string, unknown>` casts. This effectively bypasses TypeScript's type system, turning the backend into a loosely-typed JavaScript codebase in disguise.

**Examples:**
- `characters.service.ts` (1769 lines): Nearly every method that handles character data receives `body: Record<string, unknown>`, then manually extracts fields with `typeof` checks and `as` casts. The character JSON data blob is stored as `Record<string, unknown>` throughout.
- `campaigns.service.ts`: `deserialize(row: Record<string, unknown>)` is used everywhere.
- `maps.service.ts`: `planOf(token: Record<string, unknown>)`, `deserializeLight(row: Record<string, unknown>)`.
- Test files are full of `as unknown as Record<string, unknown>` patterns to make mocks compile.

**Impact:**
- No compile-time safety for field names or types.
- Typos in field names silently produce `undefined` at runtime.
- Refactoring (renaming a field) won't catch breaking usages.
- New developers cannot rely on types to understand the data shape.

**Recommendation:** Define proper TypeScript interfaces for all domain objects (e.g., `CharacterData`, `TokenData`, `CampaignData`) and use them consistently. The character JSON blob should have a well-defined schema interface.

---

## 2. Massive Monolith Services

**Severity: High**

Several service files are extremely large, combining multiple responsibilities:

| File | Lines | Issues |
|------|-------|--------|
| `dnd_vtt_backend/src/characters/characters.service.ts` | 1769 | Character CRUD, spellcasting, inventory, pact weapon, companions, level-up, rest handling, concentration, granted spells/items |
| `dnd_vtt_backend/src/common/database.service.ts` | 1074 | DB connection, 35+ migration methods, JSON parsing, backup logic |
| `dnd_vtt_backend/src/maps/maps.service.ts` | 975 | Map CRUD, token management, fog, lighting, walls, movement, initiative |
| `dnd_vtt_frontend/src/app/features/battle-map/battle-map.ts` | 1214 | Konva canvas rendering, token interaction, fog, lighting, walls, measurement, movement trails, plan markers |
| `dnd_vtt_frontend/src/app/features/characters/character-play-sheet/character-play-sheet.ts` | 1561 | Full character sheet UI logic: stats, spells, inventory, currency, actions, companions, level-up, avatar editing |

**Impact:**
- Difficult to understand, test, and modify without side effects.
- Long files discourage code review.
- High risk of merge conflicts.
- Single point of failure for any given domain.

**Recommendation:** Split each monolith into focused sub-services or modules. For example, `characters.service.ts` could be split into `CharacterCrudService`, `SpellcastingService`, `InventoryService`, `PactWeaponService`, etc.

---

## 3. Hand-Rolled Migration System (35+ Versions)

**Severity: Medium-High**

The `DatabaseService` has 35+ migration methods (`applyV1` through `applyV35`), each as a separate `private async` method with inline `PRAGMA user_version` checks. The migration chain in `runMigrations()` is a long series of `if` statements.

The version jump from `v22` to `v23` (skipping v22) suggests version drift.

**Impact:**
- Adding a new migration requires editing a growing list of conditionals.
- No migration history tracking (no `migrations` table with timestamps, descriptions).
- Hard to skip versions or apply migrations out of order.
- If a migration fails mid-way, there's no rollback mechanism.

**Recommendation:** Use a proper migration tool like `db-migrate`, `knex migrations`, or at minimum implement a `migrations` table that tracks applied migrations with timestamps and descriptions.

---

## 4. Inconsistent Testing Coverage

**Severity: Medium**

- **Frontend:** 191 TS files, only 26 `*.spec.ts` (~13.6%).
- **Backend:** 122 TS files, 37 `*.spec.ts` (~30.3%).
- Critical services like `character-stats.service.ts` (342 lines) and `spellcasting.ts` have no tests.
- `battle-map.ts` (1214 lines) has no tests despite being the most complex UI component.

**Impact:** Refactoring risky in untested areas; bugs introduced silently.

**Recommendation:** Prioritize testing for core game logic (spellcasting, character stats, inventory rules) and the battle-map canvas.

---

## 5. Hardcoded Environment Values & Duplicate Configuration

**Severity: Medium**

CORS origins are duplicated in 3 places (`main.ts`, `tokens.gateway.ts`, `encounter-presence.gateway.ts`). `JWT_SECRET ?? 'change-me'` in `auth.module.ts` is a dangerous production default.

**Impact:** Changing CORS requires editing 3 files; risk of accidental deployment with weak JWT secret.

**Recommendation:** Create a shared configuration module; use `.env` validation at startup.

---

## 6. Inconsistent Naming Conventions

**Severity: Low-Medium**

| Pattern | Examples |
|---------|----------|
| `snake_case` vs `camelCase` | `campaign_id` (DB) vs `campaignId` (TS), `max_hp` vs `maxHp` |
| `toIndex()` vs `toContentIndex()` | Two similar functions with different names |
| `itemDisplayName()` | Defined in both backend and frontend with slight differences |

**Recommendation:** Standardize on `camelCase` for TS; use a serialization layer for snake_case/camelCase conversion.

---

## 7. Frontend `localStorage` Abuse

**Severity: Medium**

At least 12 different services/components use `localStorage` with inconsistent key naming and no central abstraction. Some catch errors (private browsing), some don't.

**Impact:** Risk of key collisions; no migration/cleanup strategy; hard to test.

**Recommendation:** Create a single `StorageService` with namespaced keys, automatic cleanup, and consistent error handling.

---

## 8. No Centralized Error Handling

**Severity: Medium**

Error handling is ad-hoc across services and components. `getErrorMessage()` utility exists but isn't consistently used. No global Angular error interceptor.

**Impact:** Inconsistent user-facing errors; harder debugging; silent failures.

**Recommendation:** Implement a global Angular error interceptor and a shared `ErrorService`.

---

## 9. Dev Bypass Mechanism in Production-Adjacent Code

**Severity: High (Security)**

`DEV_BYPASS` allows auth bypass in `jwt.guard.ts`, `socket-auth.service.ts`, and `main.ts`. This code lives in the same files as production authentication logic.

**Impact:** Risk of accidental deployment with `DEV_BYPASS=true`; security audit finding.

**Recommendation:** Move dev bypass into a separate module only loaded in dev mode; add startup warning if `DEV_BYPASS=true` in non-dev environment.

---

## 10. Duplicate/Overlapping Utility Functions

**Severity: Low**

`toIndex()` / `toContentIndex()`, `itemDisplayName()`, `characterContentEnabled()`, `normalizeAvatarRecipe()` / `parseAvatarRecipe()` all exist in multiple places.

**Recommendation:** Consolidate duplicate utilities; share interface/type definitions across frontend and backend.

---

## 11. Mixed Styling Approach

**Severity: Low**

Uses SCSS, Tailwind CSS utility classes, and Angular Material simultaneously without clear boundaries.

**Recommendation:** Define clear boundaries (e.g., Tailwind for layout, SCSS for component-specific styling).

---

## 12. Large Frontend Components with Complex State Management

**Severity: Medium**

`battle-map.ts` (1214 lines) and `character-play-sheet.ts` (1561 lines) mix signals, effects, RxJS subscriptions, and private fields.

**Impact:** Hard to follow data flow; risk of stale state or memory leaks.

**Recommendation:** Extract business logic into dedicated services; use consistent state management.

---

## 13. Missing `environment.prod.ts`

**Severity: Low-Medium**

Only `environment.ts` (development) exists. No clear production environment file.

**Recommendation:** Create `environment.prod.ts` with production defaults.

---

## 14. TODO.md as Informal Project Board

**Severity: Low**

Mixes bugs, features, and personal tasks with assignee names. Completed items mixed with open ones.

**Recommendation:** Move tasks to GitHub Issues; use TODO.md only for immediate priorities.

---

## 15. No API Versioning

**Severity: Low-Medium**

Single `/api` prefix with no versioning. 35+ database migrations suggest frequent schema changes.

**Recommendation:** Add API versioning (e.g., `/api/v1/`, `/api/v2/`) for backward compatibility.

---

## Summary Priority Matrix

| Priority | Issue | Effort |
|----------|-------|--------|
| 🔴 P0 | #1 `Record<string, unknown>` overuse | High |
| 🔴 P0 | #2 Monolith services | High |
| 🔴 P0 | #9 Dev bypass security | Low |
| 🟠 P1 | #3 Migration system | Medium |
| 🟠 P1 | #5 Duplicate configuration | Low |
| 🟠 P1 | #8 Error handling | Medium |
| 🟡 P2 | #4 Testing coverage | High |
| 🟡 P2 | #6 Naming conventions | Medium |
| 🟡 P2 | #7 localStorage abstraction | Medium |
| 🟢 P3 | #10 Duplicate utilities | Low |
| 🟢 P3 | #11 Mixed styling | Medium |
| 🟢 P3 | #12 Component state management | Medium |
| 🟢 P3 | #13 Environment strategy | Low |
| 🟢 P3 | #14 TODO.md tracking | Low |
| 🟢 P3 | #15 API versioning | Medium |

