/**
 * Scoring engine tests.
 *
 * The expected values in this file were read off the source PDF by hand --
 * Army Fitness Test Score Tables, approved 15 May 2025, effective 1 Jun 2025.
 * They are deliberately NOT read from data/aft-scoring.json. A test that gets
 * its expectations from the same file it is checking will pass no matter how
 * wrong that file is.
 *
 * Page and row are cited on each block so any number here can be checked
 * against data/sources/AFT_Scoring_Scales_250601.pdf in a few seconds.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createScorer, parseDuration, formatDuration, findAgeBracket, ScoringError } from '../src/scoring.js';
import { tables } from './helpers.js';

const scorer = createScorer(tables);

/** Small helper so the cases below read like the table they came from. */
function points(event, age, scale, raw) {
  return scorer.scoreEvent(event, { age, scale, raw }).points;
}

describe('Max Deadlift — PDF page 1', () => {
  // Row 100:  17-21  M|C 340   F 220
  // Row  99:  17-21  M|C ---   F ---
  // Row  98:  17-21  M|C 330   F 210
  test('a maximum lift scores 100', () => {
    assert.equal(points('MDL', 20, 'male_or_combat', 340), 100);
    assert.equal(points('MDL', 20, 'female', 220), 100);
  });

  test('one pound short of 100 skips the empty 99 row and scores 98', () => {
    // This is the case that catches a lookup written as "points = index".
    // The 99-point row is "---" for this column: 99 is unreachable, so 339 lb
    // scores 98, not 99.
    assert.equal(points('MDL', 20, 'male_or_combat', 339), 98);
    assert.equal(points('MDL', 20, 'male_or_combat', 330), 98);
    assert.equal(points('MDL', 20, 'female', 219), 98);
  });

  // Row 60:  17-21  M|C 150   F 120
  // Row 50:  17-21  M|C 130   F 110
  test('the 60-point minimum', () => {
    assert.equal(points('MDL', 20, 'male_or_combat', 150), 60);
    assert.equal(points('MDL', 20, 'female', 120), 60);
  });

  test('below 60 the scale is coarse — there is no 59, 58, 57', () => {
    // The source lists only 50/40/30/20/10/0 under 60 points. A lift between
    // the 60-point and 50-point rows scores 50.
    assert.equal(points('MDL', 20, 'male_or_combat', 149), 50);
    assert.equal(points('MDL', 20, 'male_or_combat', 130), 50);
  });

  // Row 0:  17-21  M|C 80   F 60
  test('the floor is zero, not a negative number', () => {
    assert.equal(points('MDL', 20, 'male_or_combat', 80), 0);
    assert.equal(points('MDL', 20, 'male_or_combat', 79), 0);
    assert.equal(points('MDL', 20, 'male_or_combat', 0), 0);
  });
});

describe('Hand-Release Push-Up — PDF page 2', () => {
  // Row 100:  27-31 M|C 62   |  22-26 F 50
  // Row  60:  17-21 M|C 15   |  17-21 F 11
  // Row   0:  every column 4
  test('known conversions', () => {
    assert.equal(points('HRP', 30, 'male_or_combat', 62), 100);
    assert.equal(points('HRP', 24, 'female', 50), 100);
    assert.equal(points('HRP', 20, 'male_or_combat', 15), 60);
    assert.equal(points('HRP', 20, 'female', 11), 60);
    assert.equal(points('HRP', 20, 'male_or_combat', 4), 0);
    assert.equal(points('HRP', 20, 'male_or_combat', 3), 0);
  });

  test('more reps than the table tops out at still scores 100', () => {
    assert.equal(points('HRP', 30, 'male_or_combat', 200), 100);
  });
});

describe('Sprint-Drag-Carry — PDF pages 3-4', () => {
  // Row 100:  17-21  M|C 1:29   F 1:55
  // Row  99:  17-21  M|C 1:31   F 1:59
  // Row  60:  17-21  M|C 2:28   F 3:15
  // Row   0:  17-21  M|C 3:28   F 4:15
  test('faster is better — the comparison runs the other way', () => {
    assert.equal(points('SDC', 20, 'male_or_combat', '1:29'), 100);
    assert.equal(points('SDC', 20, 'male_or_combat', '1:20'), 100);
    assert.equal(points('SDC', 20, 'male_or_combat', '1:30'), 99);
    assert.equal(points('SDC', 20, 'male_or_combat', '1:31'), 99);
    assert.equal(points('SDC', 20, 'male_or_combat', '2:28'), 60);
    assert.equal(points('SDC', 20, 'female', '3:15'), 60);
  });

  test('slower than the 0-point row still scores 0', () => {
    assert.equal(points('SDC', 20, 'male_or_combat', '3:28'), 0);
    assert.equal(points('SDC', 20, 'male_or_combat', '5:00'), 0);
  });

  test('the 60-point row is printed on both pages and must agree', () => {
    // Pages 3 and 4 each print the 60-point row. The extractor refuses to run
    // if the two copies differ; this asserts the surviving value is the right
    // one for every bracket in the M|C column.
    const expected = ['2:28', '2:31', '2:32', '2:36', '2:41', '2:45', '2:53', '3:00', '3:12', '3:16'];
    const ages = [20, 24, 29, 34, 39, 44, 49, 54, 59, 65];
    ages.forEach((age, index) => {
      assert.equal(points('SDC', age, 'male_or_combat', expected[index]), 60, `age ${age}`);
    });
  });
});

describe('Plank — PDF pages 5-6', () => {
  // Row 100:  17-21 3:40  |  37-41 3:20
  // Row  60:  17-21 1:30  |  37-41 1:10
  // Row   0:  17-21 1:00  |  37-41 0:40
  test('longer is better', () => {
    assert.equal(points('PLK', 20, 'male_or_combat', '3:40'), 100);
    assert.equal(points('PLK', 20, 'male_or_combat', '4:00'), 100);
    assert.equal(points('PLK', 20, 'male_or_combat', '1:30'), 60);
    assert.equal(points('PLK', 20, 'male_or_combat', '1:00'), 0);
    assert.equal(points('PLK', 20, 'male_or_combat', '0:59'), 0);
  });

  test('the plank standard is the same for both scales', () => {
    // Every plank column in the source prints the same value under M|C and F.
    // If a future table revision changes that, this test fails and someone
    // finds out on purpose rather than by accident.
    for (const age of [20, 24, 29, 34, 39, 44, 49, 54, 59, 65]) {
      for (const time of ['3:40', '2:00', '1:10', '0:40']) {
        assert.equal(
          points('PLK', age, 'male_or_combat', time),
          points('PLK', age, 'female', time),
          `age ${age}, ${time}`,
        );
      }
    }
  });
});

describe('Two-Mile Run — PDF pages 7-8', () => {
  // Row 100:  17-21  M|C 13:22   F 16:00
  // Row  99:  17-21  M|C 13:47   F 16:28
  // Row  60:  17-21  M|C 19:57   F 22:55
  // Row   0:  17-21  M|C 22:45   F 25:50
  test('known conversions', () => {
    assert.equal(points('2MR', 20, 'male_or_combat', '13:22'), 100);
    assert.equal(points('2MR', 20, 'male_or_combat', '13:23'), 99);
    assert.equal(points('2MR', 20, 'male_or_combat', '13:47'), 99);
    assert.equal(points('2MR', 20, 'male_or_combat', '19:57'), 60);
    assert.equal(points('2MR', 20, 'female', '22:55'), 60);
    assert.equal(points('2MR', 20, 'male_or_combat', '22:45'), 0);
    assert.equal(points('2MR', 20, 'male_or_combat', '30:00'), 0);
  });

  test('a time may be given as seconds instead of "m:ss"', () => {
    assert.equal(points('2MR', 20, 'male_or_combat', 13 * 60 + 22), 100);
  });
});

describe('age brackets', () => {
  test('boundaries land in the right bracket', () => {
    assert.equal(findAgeBracket(17, tables.ageBrackets).id, '17-21');
    assert.equal(findAgeBracket(21, tables.ageBrackets).id, '17-21');
    assert.equal(findAgeBracket(22, tables.ageBrackets).id, '22-26');
    assert.equal(findAgeBracket(61, tables.ageBrackets).id, '57-61');
    assert.equal(findAgeBracket(62, tables.ageBrackets).id, '62+');
  });

  test('the oldest bracket has no upper bound', () => {
    assert.equal(findAgeBracket(75, tables.ageBrackets).id, '62+');
  });

  test('an age the tables do not cover is an error, not a guess', () => {
    assert.throws(() => findAgeBracket(16, tables.ageBrackets), ScoringError);
  });

  test('the bracket boundary actually changes the standard', () => {
    // 62+ M|C deadlift for 100 points is 230 lb; 57-61 is 250 lb (page 1).
    // If bracket selection were off by one, this would not hold.
    assert.equal(points('MDL', 65, 'male_or_combat', 230), 100);
    assert.ok(points('MDL', 59, 'male_or_combat', 230) < 100);
  });
});

describe('the combat scale is the male column', () => {
  // The source prints one column headed "M | C". A Soldier in one of the
  // combat MOSs is scored on it regardless of sex. This is the behavior that
  // fact produces, and it is why the scale is not named "male".
  test('a female Soldier on the combat scale is held to the M|C numbers', () => {
    // HRP 22-26: M|C needs 61 reps for 100, F needs 50 (page 2).
    assert.equal(points('HRP', 24, 'female', 50), 100);
    assert.ok(points('HRP', 24, 'male_or_combat', 50) < 100);
  });

  test('both scales exist for every event', () => {
    for (const event of tables.events) {
      assert.deepEqual(Object.keys(event.scales).sort(), ['female', 'male_or_combat']);
    }
  });
});

describe('scoring a whole test', () => {
  test('a maximum test totals 500', () => {
    const result = scorer.scoreTest({
      age: 20,
      scale: 'male_or_combat',
      performances: { MDL: 340, HRP: 58, SDC: '1:29', PLK: '3:40', '2MR': '13:22' },
    });
    assert.equal(result.total, 500);
    assert.ok(result.events.every((event) => event.points === 100));
  });

  test('the 60-point row across every event totals 300', () => {
    const result = scorer.scoreTest({
      age: 20,
      scale: 'male_or_combat',
      performances: { MDL: 150, HRP: 15, SDC: '2:28', PLK: '1:30', '2MR': '19:57' },
    });
    assert.equal(result.total, 300);
    assert.ok(result.events.every((event) => event.points === 60));
  });

  test('the weakest event is identified — that is what a plan targets', () => {
    const result = scorer.scoreTest({
      age: 20,
      scale: 'male_or_combat',
      performances: { MDL: 340, HRP: 58, SDC: '1:29', PLK: '3:40', '2MR': '19:57' },
    });
    assert.equal(result.lowestEvent.event, '2MR');
    assert.equal(result.lowestEvent.points, 60);
    assert.equal(result.total, 460);
  });

  test('a missing event is an error, not a zero', () => {
    // Scoring an unrecorded event as zero would be the tool inventing a
    // result. An incomplete test is incomplete.
    assert.throws(
      () =>
        scorer.scoreTest({
          age: 20,
          scale: 'male_or_combat',
          performances: { MDL: 340, HRP: 58, SDC: '1:29', PLK: '3:40' },
        }),
      /Missing performances for: 2MR/,
    );
  });

  test('results carry enough context to explain themselves', () => {
    const result = scorer.scoreTest({
      age: 34,
      scale: 'female',
      performances: { MDL: 200, HRP: 30, SDC: '2:30', PLK: '2:00', '2MR': '18:00' },
    });
    assert.equal(result.ageBracket, '32-36');
    assert.equal(result.scale, 'female');
    const run = result.events.find((event) => event.event === '2MR');
    assert.equal(run.display, '18:00');
    assert.equal(run.unit, 'seconds');
    assert.equal(run.raw, 1080);
  });
});

describe('bad input is refused, not guessed at', () => {
  test('unknown event and unknown scale', () => {
    assert.throws(() => points('SPT', 20, 'male_or_combat', 10), /Unknown event/);
    assert.throws(() => points('MDL', 20, 'other', 200), /Unknown scale/);
  });

  test('a malformed time is rejected', () => {
    // "13:7" almost certainly means 13:07 and might mean 13:70. Guessing
    // either one hands somebody a score that is not theirs.
    assert.throws(() => parseDuration('13:7'), ScoringError);
    assert.throws(() => parseDuration('13:60'), ScoringError);
    assert.throws(() => parseDuration('thirteen'), ScoringError);
    assert.throws(() => parseDuration(''), ScoringError);
  });

  test('a negative or non-numeric performance is rejected', () => {
    assert.throws(() => points('MDL', 20, 'male_or_combat', -10), /cannot be negative/);
    assert.throws(() => points('MDL', 20, 'male_or_combat', 'heavy'), /expected a number/);
    assert.throws(() => points('MDL', 20.5, 'male_or_combat', 200), /whole number/);
  });
});

describe('duration helpers', () => {
  test('parse and format are inverses', () => {
    for (const text of ['0:00', '1:30', '13:22', '22:45']) {
      assert.equal(formatDuration(parseDuration(text)), text);
    }
  });

  test('seconds are zero-padded', () => {
    assert.equal(formatDuration(802), '13:22');
    assert.equal(formatDuration(65), '1:05');
    assert.equal(formatDuration(60), '1:00');
  });
});
