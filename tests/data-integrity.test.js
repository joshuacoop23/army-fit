/**
 * Structural tests on data/aft-scoring.json.
 *
 * These do not check that any particular number is right -- scoring.test.js
 * does that against the PDF. These check that the file is *shaped* like a
 * scoring table, and would catch the failure that matters most: a column that
 * shifted, truncated, or lost rows during extraction or a later hand edit.
 *
 * A shifted column is the dangerous kind of wrong. Every number in it is a
 * real number from a real table, so nothing looks broken. Monotonicity is what
 * catches it: on a shifted column, somewhere a lower point value will demand a
 * better performance than a higher one, which cannot happen in a real scale.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { tables } from './helpers.js';

const EXPECTED_EVENTS = ['MDL', 'HRP', 'SDC', 'PLK', '2MR'];
const EXPECTED_SCALES = ['male_or_combat', 'female'];
const EXPECTED_BRACKETS = [
  '17-21', '22-26', '27-31', '32-36', '37-41',
  '42-46', '47-51', '52-56', '57-61', '62+',
];

/** Every (event, scale, bracket) column in the file, as a flat list. */
function everyColumn() {
  const columns = [];
  for (const event of tables.events) {
    for (const scale of EXPECTED_SCALES) {
      for (const bracket of EXPECTED_BRACKETS) {
        columns.push({
          label: `${event.id}/${scale}/${bracket}`,
          event,
          entries: event.scales[scale][bracket],
        });
      }
    }
  }
  return columns;
}

describe('provenance', () => {
  test('the file says where it came from', () => {
    const { source } = tables.meta;
    assert.equal(source.document, 'AFT_Scoring_Scales_250601.pdf');
    assert.match(source.url, /^https:\/\/www\.army\.mil\//);
    assert.equal(source.effective, '2025-06-01');
    assert.match(source.sha256, /^[0-9a-f]{64}$/);
    assert.equal(tables.meta.extractedBy, 'tools/extract_scoring_tables.py');
  });

  test('a local copy of the source is committed alongside it', () => {
    assert.equal(tables.meta.source.localCopy, 'data/sources/AFT_Scoring_Scales_250601.pdf');
  });
});

describe('shape', () => {
  test('the AFT has five events — not the ACFT six', () => {
    // The standing power throw was cut. This test exists because that mistake
    // was made once already, in an early draft of data/README.md.
    assert.equal(tables.events.length, 5);
    assert.deepEqual(tables.events.map((event) => event.id), EXPECTED_EVENTS);
  });

  test('ten age brackets, contiguous, open-ended at the top', () => {
    assert.deepEqual(tables.ageBrackets.map((bracket) => bracket.id), EXPECTED_BRACKETS);
    assert.equal(tables.ageBrackets[0].min, 17);
    assert.equal(tables.ageBrackets.at(-1).max, null);
    for (const [lower, upper] of tables.ageBrackets.slice(0, -1).map((b, i) => [b, tables.ageBrackets[i + 1]])) {
      assert.equal(upper.min, lower.max + 1, `gap between ${lower.id} and ${upper.id}`);
    }
  });

  test('every event declares its unit and which direction is better', () => {
    for (const event of tables.events) {
      assert.ok(['higher', 'lower'].includes(event.better), event.id);
      assert.ok(['integer', 'duration'].includes(event.valueType), event.id);
    }
    const better = Object.fromEntries(tables.events.map((event) => [event.id, event.better]));
    assert.deepEqual(better, {
      MDL: 'higher', HRP: 'higher', PLK: 'higher', SDC: 'lower', '2MR': 'lower',
    });
  });

  test('all 100 columns are present and non-empty', () => {
    const columns = everyColumn();
    assert.equal(columns.length, 100);
    for (const column of columns) {
      assert.ok(Array.isArray(column.entries) && column.entries.length > 0, column.label);
    }
  });
});

describe('every column is a well-formed scale', () => {
  test('points descend, without repeats, from 100 to 0', () => {
    for (const { label, entries } of everyColumn()) {
      const points = entries.map(([point]) => point);
      assert.equal(points[0], 100, `${label}: does not start at 100`);
      assert.equal(points.at(-1), 0, `${label}: does not end at 0`);
      assert.ok(points.includes(60), `${label}: no 60-point row`);
      for (let i = 1; i < points.length; i += 1) {
        assert.ok(points[i] < points[i - 1], `${label}: points not descending at ${points[i]}`);
      }
    }
  });

  test('fewer points never requires a better performance', () => {
    // The shifted-column check. On a correct scale this can never fail.
    for (const { label, event, entries } of everyColumn()) {
      for (let i = 1; i < entries.length; i += 1) {
        const [highPoints, highValue] = entries[i - 1];
        const [lowPoints, lowValue] = entries[i];
        const message = `${label}: ${lowPoints} pts wants ${lowValue}, ${highPoints} pts wants ${highValue}`;
        if (event.better === 'higher') {
          assert.ok(lowValue <= highValue, message);
        } else {
          assert.ok(lowValue >= highValue, message);
        }
      }
    }
  });

  test('every value is a positive whole number', () => {
    // Catches nulls, NaN, and any "---" that leaked through as a string.
    for (const { label, entries } of everyColumn()) {
      for (const [points, value] of entries) {
        assert.ok(Number.isInteger(points) && points >= 0 && points <= 100, `${label}: bad points ${points}`);
        assert.ok(Number.isInteger(value) && value > 0, `${label}: bad value ${value} at ${points} pts`);
      }
    }
  });
});

describe('values are in a physically sensible range', () => {
  // Loose bounds. These are not standards -- they are a tripwire for a decimal
  // point in the wrong place or a column read from the wrong event.
  const bounds = {
    MDL: [60, 400],       // pounds
    HRP: [1, 100],        // repetitions
    SDC: [60, 400],       // seconds — 1:00 to 6:40
    PLK: [30, 400],       // seconds
    '2MR': [600, 1800],   // seconds — 10:00 to 30:00
  };

  test('nothing is absurd', () => {
    for (const { label, event, entries } of everyColumn()) {
      const [low, high] = bounds[event.id];
      for (const [points, value] of entries) {
        assert.ok(value >= low && value <= high, `${label}: ${value} at ${points} pts is outside ${low}-${high}`);
      }
    }
  });
});

describe('event scales below 60 points', () => {
  test('the lift and push-up scales are coarse below 60, and that is intentional', () => {
    // The source lists only 50/40/30/20/10/0 beneath the 60-point row for MDL
    // and HRP. Asserting it means a future table that fills those in gets
    // noticed rather than silently changing how sub-60 scores come out.
    for (const eventId of ['MDL', 'HRP']) {
      const event = tables.events.find((candidate) => candidate.id === eventId);
      for (const scale of EXPECTED_SCALES) {
        for (const bracket of EXPECTED_BRACKETS) {
          const below = event.scales[scale][bracket]
            .map(([points]) => points)
            .filter((points) => points < 60);
          assert.deepEqual(below, [50, 40, 30, 20, 10, 0], `${eventId}/${scale}/${bracket}`);
        }
      }
    }
  });
});
