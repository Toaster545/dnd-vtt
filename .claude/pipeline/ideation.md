# Ideation prompt

You are running the ideation stage in the main session. Goal: turn the user's request into a
`spec.md` precise enough that (a) a splitter can cut it into small tasks, (b) a reviewer can
judge the finished work against it, and (c) a test writer can derive tests from it.
No code is written in this stage.

## Procedure
1. If `explore_code` is true, spend a few cheap greps/reads finding where the request touches the
   code (modules, existing patterns, similar features). Never ask something the code answers.
2. List what is unclear: behaviour, edge cases, permissions (DM vs player), data/migration impact,
   UI placement, error handling, out-of-scope boundaries, how success is judged.
3. Ask with AskUserQuestion, at most `questions_per_round` questions per round and
   `max_question_rounds` rounds. Offer concrete options with a recommended default first, so the
   user can answer quickly. Stop early once nothing material is unclear.
4. Write `<run_dir>/<slug>/spec.md` using exactly this structure:

```
# <Title>
Slug: <slug>     Date: <YYYY-MM-DD>

## Goal
<2-4 sentences: what and why>

## Requirements
- R1 <testable statement>
- R2 ...

## Acceptance criteria
- A1 <observable check, ideally a command or a user-visible behaviour>   (covers R1, R2)

## Non-goals
- <explicitly out of scope>

## Constraints and conventions
- <from CLAUDE.md or the user: patterns to follow, things not to touch>

## Affected areas
- <modules/files, with data-model or migration impact called out>

## Test expectations
- <what unit tests and what integration tests must prove>

## Documentation impact
- <docs likely to change>

## Decisions made in ideation
- <question> -> <answer>

## Open items
- <anything still unresolved; if non-empty, say so at the gate>
```

5. Show the user a short summary (goal, requirement count, open items) and the file path.
   Do not paste the whole spec.
