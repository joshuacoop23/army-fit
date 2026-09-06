# Army.fit — Project Charter

Last updated: 1 Sep 2026

## The problem

A Soldier knows their AFT score and knows the score they want. What they don't
know is whether the gap is closeable before their next test, and what to
actually do in the weeks between now and then. Generic PT doesn't target the
event they're failing, and most online plans ignore the test date entirely.

## The one sentence

Army.fit takes a current AFT score, a goal score, and a test date, and returns
an honest verdict plus a week-by-week plan.

## v1 scope — what ships first

Three things, nothing else:

1. **Score it.** Enter raw performance per event (weight lifted, reps, times).
   Get points per event and a total, using the correct age/sex table, or the
   sex-neutral combat table if the user is in one of the 24 combat MOSs.
2. **Judge it.** Given a goal score and a test date, say whether the goal is
   realistic. Achievable / aggressive / not happening — with the reasoning
   shown, not just a verdict.
3. **Plan it.** Produce a week-by-week plan that puts the training volume
   where the points actually are.

## Explicitly not in v1

Cutting these keeps v1 finishable. They are not cancelled, just later.

- User accounts, logins, saved history
- A backend or database
- Merging into an existing workout schedule
- Nutrition and sleep programming
- Combat Field Test preparation (different test, pass/fail, needs its own model)
- Mobile apps
- Anything requiring a server to run

## The interesting problem

Most AFT calculators score a test. Almost none answer "can I get there from
here." That verdict is the actual product, and it's where the reasoning has to
be honest. Telling a Soldier their goal is out of reach in four weeks is more
useful than a plan that pretends otherwise.

Improvement rates differ sharply by event. Two-mile run time and push-up
volume respond to a training block. Deadlift 3RM moves more slowly. Plank
improves fast from a low base and then stalls. The verdict engine has to model
per-event realistic gain rates, not a single flat percentage.

## Roadmap

**Phase 1 — Foundation (now)**
Repo, Git workflow, project docs. Deploy an empty page to GitHub Pages so the
publish pipeline is proven before there's anything to publish.

**Phase 2 — Scoring engine**
Full AFT scoring tables as JSON, both normed and sex-neutral. Unit tests
against known score conversions. This has to be exactly right.

**Phase 3 — The calculator UI**
A single page: enter performance, see points. Ship it. Get Soldiers using it.

**Phase 4 — Gap analysis and verdict**
Goal score plus test date in, achievability verdict out, with reasoning.

**Phase 5 — Plan generation**
Week-by-week training plan targeting the weakest-scoring events, with rest and
deload weeks built in.

**Phase 6 — Holistic H2F content**
Sleep, nutrition, recovery, and injury-prevention guidance tied to the plan.

**Phase 7 — Schedule integration**
Fold AFT training into an existing program (Ranger prep, powerlifting,
hypertrophy) instead of replacing it.

## How I'll know it worked

Phase 3: five Soldiers in the company use it without me explaining it.
Phase 5: someone follows a generated plan through a real test and their score
goes up.

## Stack decision

Plain HTML/CSS/JavaScript, hosted free on GitHub Pages.

Chosen because: no server means no cost, no accounts, and no maintenance; the
whole product is a calculation that runs fine in a browser; and it keeps the
learning curve on Git and JavaScript instead of on deployment infrastructure.

Revisit this at Phase 6. If saved history or accounts become necessary, that's
the moment to move to a framework with a backend — not before.

## Open questions

- Where do the official scoring tables come from in machine-readable form?
  They may have to be transcribed from the Army's PDF by hand and verified
  twice.
- The authoritative list of the 24 combat-standard MOSs. AD 2025-06 named 21;
  AD 2026-07 added 12D, 89D, and 89E. Note that army.mil/aft still says 21, so
  cite the directives, not the landing page.
- How much of the Combat Field Test belongs in this product, and when? It is a
  separate pass/fail event for the same 24 MOSs, cumulative-time scored, with
  administrative action starting around April 2027. It has no point scale, so
  it does not fit the "current score to goal score" model at all -- which is
  exactly why it needs its own decision rather than being quietly folded in.
- What are defensible per-event improvement rates? This needs real sourcing,
  not guesses — it's the part of the product most likely to mislead someone.
