# 0008 Standalone Angular components only

Purpose: records the no-NgModule frontend convention.

Last updated: 2026-10-28 (commit 00cb49a)

## Context
CLAUDE.md lists the convention. The commit that first adopted it was not identified.

## Decision
"Standalone Angular components throughout — no `NgModule`-based features." `main.ts` calls `bootstrapApplication(App, appConfig)`, and routes use `loadComponent` per route.

## Consequences
- No feature modules; lazy loading is per component ([frontend](../architecture/frontend.md)).

Date: not determined (convention present at 2026-10-26)
Commit: `00cb49a` (state documented)

Sources: `CLAUDE.md` (Conventions), `dnd_vtt_frontend/src/main.ts`, `dnd_vtt_frontend/src/app/app.routes.ts`.
