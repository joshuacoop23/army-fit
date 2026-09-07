# `data/` — the scoring tables

Everything in this folder is a transcription of an official Army document.
Nothing in it is inferred, interpolated, or remembered. If a number here cannot
be pointed at on a page of the source PDF, it is a bug.

## The source

**Army Fitness Test Score Tables** — approved 15 May 2025, effective 1 Jun 2025.

- Downloaded from <https://www.army.mil/e2/downloads/rv7/aft/AFT_Scoring_Scales_250601.pdf>
- Committed here as [`sources/AFT_Scoring_Scales_250601.pdf`](sources/AFT_Scoring_Scales_250601.pdf)
- SHA-256 `572ee5afe149add73e951c404ee2f120cd98a2746b2888746a6012009a7c366d`

The PDF is committed rather than merely linked. A URL can change, be replaced
in place, or 404. A file in the repo can be re-checked years from now, and its
hash proves it is the same file the JSON was built from.

## How the JSON is produced

`aft-scoring.json` is **generated, not typed**. It is the output of:

```bash
python3 tools/extract_scoring_tables.py \
    data/sources/AFT_Scoring_Scales_250601.pdf \
    data/aft-scoring.json
```

Do not hand-edit it. A hand edit is a number with no source, which is the one
thing this project cannot ship. CI re-runs the extractor on every pull request
and fails if the committed JSON is not exactly what the PDF produces:

```bash
python3 tools/extract_scoring_tables.py \
    data/sources/AFT_Scoring_Scales_250601.pdf \
    data/aft-scoring.json --check
```

The extractor refuses to run at all if the PDF stops looking the way it
expects — a changed column header, a row that does not have 22 tokens, a row
whose Points column disagrees with itself, a scale where fewer points demand a
better performance. A revised source document will fail loudly rather than
extract into something plausible and wrong.

## `male_or_combat` — read this before touching the scales

The source prints **one** column per age bracket headed `M | C`, and a second
headed `F`.

That first column serves two populations at once:

- **M** — males scored on the general standard
- **C** — Soldiers of **any sex** in one of the combat MOSs, scored on the
  sex-neutral standard

There is no separate combat table. The Army pointed the sex-neutral combat
standard at the male column. So the scale here is called `male_or_combat`, not
`male` — naming it `male` would hide the single most confusing fact about AFT
scoring, and someone would eventually "fix" the combat path by building a table
that already exists.

This closes an open question in `docs/CHARTER.md`, which assumed the combat
scale would have to be sourced separately. It does not.

What is **not** settled by this file: the passing thresholds. 300 total for the
general population, 350 with a 60-point event minimum for combat MOSs, and the
list of which MOSs those are, all come from Army Directives 2025-06 and
2026-07 — not from this PDF. They are deliberately absent here rather than
filled in from memory.

## Shape of `aft-scoring.json`

```jsonc
{
  "meta":         { /* source, hash, extraction notes */ },
  "scales":       ["male_or_combat", "female"],
  "ageBrackets":  [ { "id": "17-21", "min": 17, "max": 21 }, /* ... */
                    { "id": "62+",   "min": 62, "max": null } ],
  "events": [
    {
      "id": "MDL",
      "name": "3-Repetition Maximum Deadlift",
      "unit": "pounds",        // or "repetitions", or "seconds"
      "valueType": "integer",  // or "duration"
      "better": "higher",      // or "lower", for the timed events
      "scales": {
        "male_or_combat": {
          "17-21": [ [100, 340], [98, 330], [96, 320], /* ... */ [0, 80] ],
          /* ... nine more brackets ... */
        },
        "female": { /* ... */ }
      }
    }
    /* ... four more events ... */
  ]
}
```

Five events: `MDL`, `HRP`, `SDC`, `PLK`, `2MR`. Five — the standing power throw
belonged to the ACFT and is gone.

### Entries are `[points, threshold]`, best first

Each column is a list of pairs, sorted from 100 points down to 0. The value is
the performance that **earns** that many points.

To score a performance, walk from the top and take the first entry it meets —
`raw >= value` for `better: "higher"`, `raw <= value` for `better: "lower"`.
That is all `pointsFrom()` in `src/scoring.js` does.

### Missing point values are missing on purpose

The PDF prints `---` where a point value is unreachable in that column. Those
cells are **omitted** from the JSON rather than stored as null.

Example — Max Deadlift, 17-21, `male_or_combat`:

| Points | Source | JSON |
|--------|--------|------|
| 100 | 340 | `[100, 340]` |
| 99 | `---` | *(absent)* |
| 98 | 330 | `[98, 330]` |

So a 339 lb deadlift scores **98**, not 99. There is no 99 to score. Any lookup
that assumes point values are contiguous, or that indexes the array by points,
will be wrong here — which is why there is a test for exactly this case.

Two consequences worth knowing:

- **MDL and HRP are coarse below 60 points.** The source lists only
  50, 40, 30, 20, 10 and 0 beneath the 60-point row. A deadlift between the
  60-point and 50-point rows scores 50.
- **Timed events are dense.** SDC, PLK and 2MR list nearly every point value
  from 100 to 0.

### Times are stored as whole seconds

`13:22` in the PDF is `802` in the JSON. Formatting is a display concern —
`formatDuration()` turns it back. Storing `"13:22"` as text would mean every
comparison had to parse a string first, and one of those parses would
eventually be wrong.

## What is not in here

- **Alternate aerobic events** (2.5-mile walk, 12 km bike, 1 km swim, 5 km
  row), page 9 of the source. They are go/no-go, not point scales, so they do
  not fit this file's shape. They will need their own.
- **Passing thresholds and the combat MOS list** — see above. Directive-sourced,
  not in this PDF.

## Re-checking this by hand

You do not have to trust the extractor. Open the PDF to page 1 and compare the
100-point row against `aft-scoring.json`. The tests in `tests/scoring.test.js`
carry a page citation on every block for exactly this purpose — their expected
values were read off the PDF, not read out of this JSON, so the two are
independent of each other.
