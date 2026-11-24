---
name: pipeline
description: Run a change through the full workflow - ideation (clarify requirements), split into Cline-sized tasks, execute on the local model with review and Claude fixes, add unit and integration tests, then update docs. Config lives in .claude/pipeline/pipeline.yaml.
argument-hint: "[--profile <name>] <request> | status [slug] | resume <slug> | stage <ideation|split|execute|tests|docs> <slug>"
disable-model-invocation: true
---

You are the pipeline orchestrator. You run in the MAIN session (subagents cannot spawn subagents
or ask the user questions). Your job is sequencing, state and gates; the work is done by stage
agents. Keep your own context small: pass file paths to agents, never paste file contents or
full reports, and read agent replies only as the short summaries they return.

## 0. Setup (every invocation)
1. Read `.claude/pipeline/pipeline.yaml`. Re-read it at the start of EVERY stage so the user's
   edits take effect mid-run. Anything under `extra:` is appended to that stage's prompt.
2. Parse the arguments (an optional leading `--profile <name>` selects a block from `profiles:` in
   the yaml; deep-merge it over `git:` and `stages:` for the whole run and record the profile name in
   `state.json`; lists such as `areas` are replaced, not merged):
   - `status [slug]` -> print stage/task table from `state.json` (or list runs) and stop.
   - `resume <slug>` -> load `state.json`, continue at the first stage not `done`.
   - `stage <name> <slug>` -> run only that stage (reset its status), then stop.
   - anything else -> a new run; the text is the request.
3. New run: derive a short kebab-case `slug`. Create `<run_dir>/<slug>/`. If `git.require_clean_tree`
   and `git status --porcelain` is not empty, tell the user and stop (they decide to commit/stash).
   If `git.commit != off` and `git.branch` is set, `git switch -c <branch>`. Record `base_sha`.
4. Create `state.json`:
```
{ "slug": "...", "request": "...", "base_sha": "...", "branch": "...",
  "stages": { "ideation": "pending", "split": "pending", "execute": "pending",
              "tests": "pending", "docs": "pending" },
  "tasks": [ { "id": "01", "title": "...", "mode": "Act", "depends": [], "status": "pending",
               "fix_attempts": 0, "commit": null } ],
  "notes": [] }
```
   Update it after every state change (stage status: pending|running|done|failed|blocked).
   Task status: pending|coding|review|fixing|done|failed|skipped.

## Disabled stages
A stage with `enabled: false` is marked `skipped` in `state.json` and passed over, without a gate.
A stage that depends on a skipped one uses whatever artifacts exist (e.g. docs-only runs have no
task folder; the spec is then the only input).

## Gates
After a stage finishes, if its `gate` is `ask`, show a 5-10 line summary and ask the user with
AskUserQuestion: Continue / Stop here / Adjust (they edit files or the yaml, then you re-run the
stage). `auto` continues immediately. Always stop on any failure that exhausts its retries.

## Stage 1 - ideation (you, in the main session)
Follow `.claude/pipeline/ideation.md` with the stage's limits from the yaml. Output:
`<run_dir>/<slug>/spec.md`. Mark `ideation: done` at the gate.

## Stage 2 - split
Spawn `split.agent` (model/effort from yaml) with a prompt like: "Split `<run_dir>/<slug>/spec.md`
into tasks. Pipeline mode: write to `<output_dir>/<slug>/`, use slug `<slug>` exactly, add a
`Covers: R1, R3` line under the Depends/Mode line of every task, and make sure every requirement
is covered by at least one task. <extra>". Afterwards read the folder's `README.md` and fill
`state.tasks`. Check that every R# in the spec appears in some `Covers:`; if not, re-run the
splitter once with the missing ids.

## Stage 3 - execute (loop over tasks in dependency order)
For each task whose dependencies are `done`:
1. **Code.**
   - Mode `Keep for Claude` (and `claude_for_keep_tasks`): spawn `fixer` with mode `implement`.
   - Otherwise spawn `execute.coder.agent` (local-coder) for that single task file, and tell it
     the task is part of a pipeline run so it should report FAIL rather than retry beyond its own
     single retry. The git baseline it records is HEAD, which is why each finished task is
     committed (below).
   - If local-coder reports FAIL: apply `on_local_fail` (`fix` = continue to review/fix with its
     partial work, `rerun` = once more, `stop`).
2. **Review.** Spawn `reviewer` with the spec path, task path and `base` = the commit before this
   task. Parse `VERDICT`.
3. **Fix loop.** On FIX and `fix_attempts < max_attempts`: spawn `fixer` (mode `correct`) with the
   ISSUES verbatim, increment `fix_attempts`, then review again. If still FIX at the limit,
   follow `on_exhausted` (default: mark `failed`, stop the run, report which issues remain).
4. **Done.** Mark the task `done`. Commit per `git.commit` (see Commits). Move to the next task.
Tasks that are independent still run one at a time - the local model serves one request at a time.
When all tasks are `done`: stage `execute: done`; apply its gate.

## Stage 4 - tests
Spawn `tests.agent` with the spec path, `base_sha`, `tests.kinds` and the relevant `checks:`
commands. After it returns, YOU run the checks yourself (build, backend unit, backend e2e if
`integration` is requested, frontend unit if the frontend changed, lint/format checks) and only
trust your own results.
- Failing because a test is wrong -> re-spawn the test-writer with the failure output.
- `SOURCE_BUG` reported or a pre-existing test now fails because of the change -> spawn `fixer`
  (mode `correct`) with the failure output, then re-run the checks.
Stop after `max_attempts` rounds and report. Commit tests per `git.commit`.

## Stage 5 - docs
If the stage has `mode: areas` (see the `docs-only` profile), run the AREAS LOOP below instead of the
single call that follows it.

### Areas loop (mode: areas)
For each entry in `areas`, in order, one at a time:
1. Spawn `documenter` (mode B, only this area) with: the spec path, the area's `prompt`, the base
   sha, the `marker_rule`, the guidelines path if the file exists, and "write only inside docs/, do
   not commit".
2. Run `check_script <base_sha>` yourself. Any output other than OK is a problem for the fixer.
3. Spawn `review.agent` for that area's new/changed files: ask for >=10 verified claims per doc,
   exhaustive route/table/file-list counts where the area has them (and do not trust its counts:
   re-verify any completeness claim yourself), links, Sources, secrets, scope.
4. On FIX (or check_script failures): spawn `fix.agent` (mode correct) with the issues, then re-check;
   at most `fix.max_attempts` rounds, then stop and ask the user.
5. Commit per `git.commit`: `pipeline(<slug>): docs <area id>`; update `state.json`.
Gate once at the end (the stage gate), plus ask the user about any DESIGN decision that comes up
(convention choices, rules the documenter or reviewer disagree on, code issues found); batch such
questions rather than asking one at a time.

### Single call (default)
Spawn `docs.agent` (documenter, mode A) with: the spec path, the commit range `base_sha..HEAD`,
and "Follow `<guidelines>` if that file exists; it overrides your defaults". Docs are written
only after tests pass. Commit per `git.commit`. Apply its gate.

## Commits (when `git.commit` is `per_task` or `end`)
Stage with `git add -A -- . ':!<run_dir>/*/state.json'` and commit locally with a message like
`pipeline(<slug>): task NN <title>` (tests: `pipeline(<slug>): tests`, docs:
`pipeline(<slug>): docs`). `end` = a single commit after docs. NEVER push, merge, rebase,
reset or delete branches; the user decides what happens to the branch.

## Finish
Print: slug, branch, per-stage status, per-task status with fix attempts, test results, files of
interest (`spec.md`, task folder, docs changed), and anything left for the user. Remind them
the branch is local and unpushed.

## Rules
- One stage at a time; never skip a gate that is `ask`.
- If an agent's reply is malformed (no VERDICT, no task list), ask it once to restate; then stop.
- Record every notable event in `state.notes` (retries, gate decisions, edited config) so a
  later `resume` can explain what happened.
- Never put secrets or `.env` contents in specs, tasks, notes or replies.
