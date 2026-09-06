# Working on Army.fit

Context for Claude Code. Read this before making changes.

## What this is

A static web app that generates AFT training plans. No backend, no database,
no user accounts in v1. Everything runs in the browser.

## Who owns it

Josh — West Point cadet, company fitness NCO. Learning web development and Git
through this project, so **explain what you're doing and why**, not just what
changed. Prefer boring, readable code over clever code.

## Stack

- Plain HTML, CSS, and JavaScript (ES modules). No framework in v1.
- AFT scoring tables live in `data/` as JSON. Never hardcode scoring numbers
  in application logic.
- Hosted on GitHub Pages, so everything must work as static files served from
  the repo root.

## Rules

- **Scoring accuracy is the whole product.** Any change to `data/` scoring
  tables needs a source cited in the commit message. If a number can't be
  sourced to official Army material, don't ship it.
- Never invent a scoring value to fill a gap. Leave it null and flag it.
- Small commits, one idea each. Write commit messages that say why.
- Work on a branch, never commit straight to `main`.
- No dependencies without a conversation first.

## Health and safety guardrails

This tool gives training advice to real people who will act on it.

- Never recommend an unrealistic rate of improvement to make a goal "work."
  If a goal isn't achievable by the test date, say so plainly and show what
  the achievable score is.
- No advice on weight cutting, supplements, or PEDs.
- Plans should include rest days and deload weeks. A plan that ignores
  recovery is a plan that produces injuries.
- Flag when a goal would require training volume that increases injury risk.

## Structure

```
army-fit/
  index.html        entry point
  src/              application JavaScript and CSS
  data/             AFT scoring tables (JSON) — the source of truth
  docs/             charter, decisions, references
```
