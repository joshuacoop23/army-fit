#!/usr/bin/env python3
"""
Turn the Army's AFT scoring-scale PDF into data/aft-scoring.json.

Why this exists as a script instead of a one-time copy-paste: a scoring table
that a human retyped is a table nobody can re-check. This script can be re-run
against the source PDF at any time, and its output diffed against what is
committed. If they differ, something is wrong and the diff says where.

Source
------
Army Fitness Test Score Tables
Approved 15 May 2025, effective 1 June 2025
https://www.army.mil/e2/downloads/rv7/aft/AFT_Scoring_Scales_250601.pdf

What the source looks like
--------------------------
Each event is a grid: one row per point value, and twenty value columns --
ten age brackets, each split into "M | C" and "F".

"M | C" is one column serving two populations: males scored on the general
standard, and Soldiers of any sex in a combat MOS scored on the sex-neutral
standard. The Army did not build a separate combat table; it pointed the
combat standard at the male column. This file stores it once, under the name
"male_or_combat", so that fact is visible in the data rather than buried in
application logic.

A cell of "---" means that point value is not reachable in that column -- the
scale steps past it. Those cells are omitted from the output entirely, which
is what makes the lookup in src/scoring.js a simple threshold walk.

Usage
-----
    # regenerate the JSON from the PDF
    python3 tools/extract_scoring_tables.py \
        data/sources/AFT_Scoring_Scales_250601.pdf \
        data/aft-scoring.json

    # verify the committed JSON still matches the committed PDF, changing
    # nothing (this is what CI runs)
    python3 tools/extract_scoring_tables.py \
        data/sources/AFT_Scoring_Scales_250601.pdf \
        data/aft-scoring.json --check
"""

import hashlib
import json
import re
import sys
from datetime import datetime, timezone

import pdfplumber

# ---------------------------------------------------------------------------
# What we expect to find. Every one of these is asserted against the PDF, so a
# revised source document fails loudly instead of extracting into nonsense.
# ---------------------------------------------------------------------------

AGE_BRACKETS = [
    {"id": "17-21", "min": 17, "max": 21},
    {"id": "22-26", "min": 22, "max": 26},
    {"id": "27-31", "min": 27, "max": 31},
    {"id": "32-36", "min": 32, "max": 36},
    {"id": "37-41", "min": 37, "max": 41},
    {"id": "42-46", "min": 42, "max": 46},
    {"id": "47-51", "min": 47, "max": 51},
    {"id": "52-56", "min": 52, "max": 56},
    {"id": "57-61", "min": 57, "max": 61},
    {"id": "62+", "min": 62, "max": None},
]

EXPECTED_BRACKET_HEADER = (
    "17-21 22-26 27-31 32-36 37-41 42-46 47-51 52-56 57-61 Over 62"
)
EXPECTED_COLUMN_HEADER = (
    "Points " + "M | C F " * 10 + "Points"
).strip()

SCALES = ["male_or_combat", "female"]

# Pages are 0-indexed here. Events split across two pages list both.
EVENTS = [
    {
        "id": "MDL",
        "name": "3-Repetition Maximum Deadlift",
        "pages": [0],
        "title_startswith": "Max Deadlift (MDL)",
        "unit": "pounds",
        "value_type": "integer",
        "better": "higher",
    },
    {
        "id": "HRP",
        "name": "Hand-Release Push-Up",
        "pages": [1],
        "title_startswith": "Hand-release Push-up (HRP)",
        "unit": "repetitions",
        "value_type": "integer",
        "better": "higher",
    },
    {
        "id": "SDC",
        "name": "Sprint-Drag-Carry",
        "pages": [2, 3],
        "title_startswith": "Sprint / Drag / Carry",
        "unit": "seconds",
        "value_type": "duration",
        "better": "lower",
    },
    {
        "id": "PLK",
        "name": "Plank",
        "pages": [4, 5],
        "title_startswith": "Plank (PLK)",
        "unit": "seconds",
        "value_type": "duration",
        "better": "higher",
    },
    {
        "id": "2MR",
        "name": "Two-Mile Run",
        "pages": [6, 7],
        "title_startswith": "Two-Mile Run (2MR)",
        "unit": "seconds",
        "value_type": "duration",
        "better": "lower",
    },
]

GAP = "---"
DURATION_RE = re.compile(r"^(\d+):([0-5]\d)$")
INTEGER_RE = re.compile(r"^\d+$")


class ExtractionError(Exception):
    """Raised when the PDF does not look the way this script expects."""


def parse_cell(token, value_type, where):
    """Turn one table cell into a number, or None for a '---' gap."""
    if token == GAP:
        return None
    if value_type == "integer":
        if not INTEGER_RE.match(token):
            raise ExtractionError(f"{where}: expected an integer, got {token!r}")
        return int(token)
    match = DURATION_RE.match(token)
    if not match:
        raise ExtractionError(f"{where}: expected m:ss, got {token!r}")
    return int(match.group(1)) * 60 + int(match.group(2))


def page_lines(page):
    return [line.strip() for line in (page.extract_text() or "").split("\n") if line.strip()]


def check_headers(lines, event, page_number):
    """Refuse to extract a page whose headers are not the ones we expect."""
    if not lines[1].startswith(event["title_startswith"]):
        raise ExtractionError(
            f"page {page_number}: expected {event['title_startswith']!r}, got {lines[1]!r}"
        )
    if lines[2] != EXPECTED_BRACKET_HEADER:
        raise ExtractionError(
            f"page {page_number}: age-bracket header changed\n"
            f"  expected {EXPECTED_BRACKET_HEADER!r}\n  found    {lines[2]!r}"
        )
    if lines[3] != EXPECTED_COLUMN_HEADER:
        raise ExtractionError(
            f"page {page_number}: column header changed\n"
            f"  expected {EXPECTED_COLUMN_HEADER!r}\n  found    {lines[3]!r}"
        )


def extract_event(pdf, event):
    """Read one event's grid into {scale: {bracket_id: [[points, value], ...]}}."""
    # rows[points] = list of 20 raw cell tokens
    rows = {}

    for page_index in event["pages"]:
        page_number = page_index + 1
        lines = page_lines(pdf.pages[page_index])
        check_headers(lines, event, page_number)

        for line in lines:
            tokens = line.split()
            if not tokens or not INTEGER_RE.match(tokens[0]):
                continue
            if len(tokens) != 22:
                raise ExtractionError(
                    f"page {page_number}: expected 22 tokens, got {len(tokens)}: {line!r}"
                )
            # The Points column is printed on both ends of every row. That
            # redundancy is a free per-row checksum: if the two disagree, the
            # row did not come out of the PDF in one piece.
            if tokens[0] != tokens[-1]:
                raise ExtractionError(
                    f"page {page_number}: row starts at {tokens[0]} but ends at {tokens[-1]}"
                )
            points = int(tokens[0])
            cells = tokens[1:-1]
            # SDC, PLK and 2MR print the 60-point row on both of their pages.
            # The two copies must be identical.
            if points in rows and rows[points] != cells:
                raise ExtractionError(
                    f"{event['id']}: the {points}-point row differs between pages\n"
                    f"  {rows[points]}\n  {cells}"
                )
            rows[points] = cells

    if not rows:
        raise ExtractionError(f"{event['id']}: no data rows found")

    scales = {scale: {b["id"]: [] for b in AGE_BRACKETS} for scale in SCALES}
    for points in sorted(rows, reverse=True):
        cells = rows[points]
        for bracket_index, bracket in enumerate(AGE_BRACKETS):
            for scale_index, scale in enumerate(SCALES):
                token = cells[bracket_index * 2 + scale_index]
                where = f"{event['id']} {points}pt {bracket['id']} {scale}"
                value = parse_cell(token, event["value_type"], where)
                if value is not None:
                    scales[scale][bracket["id"]].append([points, value])
    return scales


def check_monotonic(event, scales):
    """
    Fewer points must never require a better performance.

    This is the check that catches a shifted column -- the failure mode where
    every number is individually plausible and the table is silently wrong.
    """
    better = event["better"]
    for scale, brackets in scales.items():
        for bracket_id, entries in brackets.items():
            where = f"{event['id']} {scale} {bracket_id}"
            if not entries:
                raise ExtractionError(f"{where}: no entries")
            points = [p for p, _ in entries]
            if points != sorted(points, reverse=True):
                raise ExtractionError(f"{where}: points are not descending")
            for (hi_pts, hi_val), (lo_pts, lo_val) in zip(entries, entries[1:]):
                if better == "higher" and lo_val > hi_val:
                    raise ExtractionError(
                        f"{where}: {lo_pts} points needs {lo_val}, "
                        f"but {hi_pts} points only needs {hi_val}"
                    )
                if better == "lower" and lo_val < hi_val:
                    raise ExtractionError(
                        f"{where}: {lo_pts} points needs {lo_val}s, "
                        f"but {hi_pts} points allows {hi_val}s"
                    )
            if points[0] != 100:
                raise ExtractionError(f"{where}: no 100-point entry")
            if points[-1] != 0:
                raise ExtractionError(f"{where}: no 0-point entry")
            if 60 not in points:
                raise ExtractionError(f"{where}: no 60-point entry")


def main(pdf_path, out_path, check_only=False):
    with open(pdf_path, "rb") as handle:
        digest = hashlib.sha256(handle.read()).hexdigest()

    with pdfplumber.open(pdf_path) as pdf:
        events = []
        for event in EVENTS:
            scales = extract_event(pdf, event)
            check_monotonic(event, scales)
            events.append(
                {
                    "id": event["id"],
                    "name": event["name"],
                    "unit": event["unit"],
                    "valueType": event["value_type"],
                    "better": event["better"],
                    "scales": scales,
                }
            )

    document = {
        "meta": {
            "title": "Army Fitness Test Score Tables",
            "source": {
                "document": "AFT_Scoring_Scales_250601.pdf",
                "publisher": "U.S. Army",
                "url": "https://www.army.mil/e2/downloads/rv7/aft/AFT_Scoring_Scales_250601.pdf",
                "approved": "2025-05-15",
                "effective": "2025-06-01",
                "localCopy": "data/sources/AFT_Scoring_Scales_250601.pdf",
                "sha256": digest,
            },
            "extractedBy": "tools/extract_scoring_tables.py",
            "extractedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "scaleNote": (
                "The source prints one column headed 'M | C' per age bracket. It "
                "serves two populations: males on the general standard, and "
                "Soldiers of any sex in a combat MOS on the sex-neutral standard. "
                "There is no separate combat table. It is stored here once, as "
                "'male_or_combat'."
            ),
            "gapNote": (
                "Point values a column cannot reach are printed '---' in the "
                "source and are omitted here. Look up a raw performance by "
                "walking entries from the top and taking the first one it meets."
            ),
            "notIncluded": (
                "The alternate aerobic events (2.5-mile walk, 12km bike, 1km "
                "swim, 5km row) on page 9 are go/no-go, not point scales, and "
                "are out of scope for this file."
            ),
        },
        "scales": SCALES,
        "ageBrackets": AGE_BRACKETS,
        "events": events,
    }

    # Indented JSON, except that each [points, value] pair is collapsed onto a
    # single line. Left alone, indent=2 puts every number on its own line and
    # the file runs to 27,000 of them, which no one reviews. One pair per line
    # means a wrong cell shows up in a diff as exactly one changed line.
    text = json.dumps(document, indent=2, ensure_ascii=False)
    text = re.sub(r"\[\n\s+(\d+),\n\s+(\d+)\n\s+\]", r"[\1, \2]", text)

    if check_only:
        # Prove the committed JSON is what this PDF produces. Everything is
        # compared except the extraction timestamp, which is expected to differ
        # and means nothing.
        with open(out_path, encoding="utf-8") as handle:
            committed = json.load(handle)
        fresh = json.loads(text)
        for copy in (committed, fresh):
            copy["meta"].pop("extractedAt", None)
        if committed != fresh:
            raise ExtractionError(
                f"{out_path} does not match what {pdf_path} produces.\n"
                "Regenerate it (drop the --check flag) and review the diff.\n"
                "If the diff is not one you meant to make, the JSON was edited "
                "by hand and the edit is not in the source document."
            )
        print(f"OK: {out_path} matches {pdf_path}")
        return

    with open(out_path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text + "\n")

    total = sum(
        len(entries)
        for event in events
        for brackets in event["scales"].values()
        for entries in brackets.values()
    )
    print(f"wrote {out_path}")
    print(f"  events   {len(events)}")
    print(f"  columns  {len(events) * len(SCALES) * len(AGE_BRACKETS)}")
    print(f"  entries  {total}")
    print(f"  sha256   {digest}")


if __name__ == "__main__":
    args = sys.argv[1:]
    check = "--check" in args
    positional = [arg for arg in args if arg != "--check"]
    if len(positional) != 2:
        sys.exit(__doc__)
    try:
        main(positional[0], positional[1], check_only=check)
    except ExtractionError as error:
        sys.exit(f"EXTRACTION FAILED\n{error}")
