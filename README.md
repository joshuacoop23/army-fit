# Army.fit

A free tool that turns an AFT score goal into a training plan.

A Soldier enters their current Army Fitness Test scores, the score they want,
and their next test date. Army.fit tells them whether that goal is realistic in
the time available, and generates a week-by-week plan to get there.

## Why

I'm the fitness NCO for my company. Soldiers ask me the same question
constantly: "I got a 62 on my run, what do I do?" The honest answer depends on
their timeline, their other events, and what else they're training for. That's
a repeatable calculation, so it should be a tool — not a conversation I have
forty times.

## Status

Early. Nothing works yet. See `docs/CHARTER.md` for the plan.

## The AFT (as of 2026)

Five events, 100 points each, 500 max:

1. 3-Rep Max Deadlift (MDL)
2. Hand-Release Push-Up (HRP) — 2 minutes
3. Sprint-Drag-Carry (SDC) — 5 x 50m shuttles
4. Plank (PLK)
5. Two-Mile Run (2MR)

General population: 300 total, minimum 60 per event, age- and sex-normed.
The 24 combat-arms MOSs: 350 total, minimum 60 per event, sex-neutral and
age-normed. Combat standard took effect 1 Jan 2026 for Active Component,
1 Jun 2026 for Reserve and Guard. (Army Directive 2025-06 designated 21 MOSs;
AD 2026-07 added 12D, 89D, and 89E.)

Separately, AD 2026-07 established the Combat Field Test (CFT) for those same
24 MOSs. It does not replace the AFT -- combat-MOS Soldiers pass both. Seven
events run as one continuous sequence, scored pass/fail on cumulative time,
age- and sex-neutral. Out of scope for v1, but see the charter.

## Running it locally

Nothing to install yet. Once there's a page, open `index.html` in a browser.

## License

MIT — see LICENSE.
