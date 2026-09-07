/**
 * AFT scoring engine.
 *
 * Turns a raw performance -- pounds lifted, reps completed, a time -- into
 * points, using the official scoring tables in data/aft-scoring.json.
 *
 * There is not a single scoring number in this file, and there must never be
 * one. Every number comes from the tables that are passed in. If you find
 * yourself typing a weight, a rep count, or a time into this file, the change
 * belongs in data/ instead.
 *
 * The module is pure: it takes tables and a performance, and returns a result.
 * It does no fetching and touches no DOM, which is what lets the same code run
 * in the browser and under `node --test`.
 */

/** Thrown when a caller asks for something the tables cannot answer. */
export class ScoringError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScoringError';
  }
}

const DURATION_PATTERN = /^(\d{1,2}):([0-5]\d)$/;

/**
 * "13:22" -> 802 seconds.
 *
 * Strict on purpose. "13:7" is a typo, not seven seconds, and a scoring tool
 * that quietly guesses what you meant is a scoring tool that hands somebody
 * the wrong number.
 */
export function parseDuration(text) {
  if (typeof text !== 'string') {
    throw new ScoringError(`Expected a time like "13:22", got ${JSON.stringify(text)}`);
  }
  const match = DURATION_PATTERN.exec(text.trim());
  if (!match) {
    throw new ScoringError(`Expected a time like "13:22", got ${JSON.stringify(text)}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 802 -> "13:22". The inverse of parseDuration, for display. */
export function formatDuration(seconds) {
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new ScoringError(`Expected a whole number of seconds, got ${JSON.stringify(seconds)}`);
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

/**
 * Which age bracket a Soldier tests in.
 *
 * The oldest bracket has no upper bound -- it is "Over 62" in the source -- so
 * its max is null and everything at or above its min lands there.
 */
export function findAgeBracket(age, brackets) {
  if (!Number.isInteger(age)) {
    throw new ScoringError(`Age must be a whole number, got ${JSON.stringify(age)}`);
  }
  const bracket = brackets.find(
    (candidate) => age >= candidate.min && (candidate.max === null || age <= candidate.max),
  );
  if (!bracket) {
    const youngest = Math.min(...brackets.map((candidate) => candidate.min));
    throw new ScoringError(
      `Age ${age} is below the youngest bracket in the tables (${youngest}). ` +
        'The AFT tables do not cover it.',
    );
  }
  return bracket;
}

/**
 * Walk a column and return the points a performance earns.
 *
 * A column is [[points, value], ...] sorted from 100 points downward, with
 * unreachable point values already omitted (they print as "---" in the PDF).
 * Because the column is sorted, the first entry the performance satisfies is
 * by definition the best one it satisfies -- so the walk can stop there.
 *
 * A performance worse than the 0-point entry scores 0. It does not score
 * negative, and it is not an error: a Soldier who runs 25 minutes has a real
 * score, and it is zero.
 */
export function pointsFrom(column, raw, better) {
  if (!Array.isArray(column) || column.length === 0) {
    throw new ScoringError('Scoring column is empty');
  }
  for (const [points, value] of column) {
    const meets = better === 'higher' ? raw >= value : raw <= value;
    if (meets) return points;
  }
  return 0;
}

/**
 * Build a scorer around a set of tables.
 *
 * Pass in the parsed contents of data/aft-scoring.json. In the browser that
 * comes from fetch(); in tests it comes from readFileSync. Either way this
 * module never goes and gets it -- that is the caller's job.
 */
export function createScorer(tables) {
  if (!tables || !Array.isArray(tables.events) || !Array.isArray(tables.ageBrackets)) {
    throw new ScoringError('Tables must have events[] and ageBrackets[]');
  }

  const eventsById = new Map(tables.events.map((event) => [event.id, event]));

  /** Coerce whatever the caller handed us into the unit the tables use. */
  function normalizeRaw(event, raw) {
    if (event.valueType === 'duration') {
      // Accept both "13:22" and a plain number of seconds, because a form
      // field gives you the former and a stored record gives you the latter.
      const seconds = typeof raw === 'number' ? raw : parseDuration(raw);
      if (!Number.isInteger(seconds) || seconds < 0) {
        throw new ScoringError(
          `${event.id}: expected a time like "13:22" or whole seconds, ` +
            `got ${JSON.stringify(raw)}`,
        );
      }
      return seconds;
    }
    if (!Number.isFinite(raw)) {
      throw new ScoringError(`${event.id}: expected a number, got ${JSON.stringify(raw)}`);
    }
    if (raw < 0) {
      throw new ScoringError(`${event.id}: a performance cannot be negative (${raw})`);
    }
    return raw;
  }

  /**
   * Score one event.
   *
   * `scale` is "male_or_combat" or "female". The first name is deliberate and
   * not a shorthand: the Army's table prints one column headed "M | C", used
   * both by males on the general standard and by any Soldier in a combat MOS
   * on the sex-neutral standard. Calling it "male" would hide that.
   */
  function scoreEvent(eventId, { age, scale, raw }) {
    const event = eventsById.get(eventId);
    if (!event) {
      const known = [...eventsById.keys()].join(', ');
      throw new ScoringError(`Unknown event ${JSON.stringify(eventId)}. Known events: ${known}`);
    }
    const column = event.scales[scale];
    if (!column) {
      const known = Object.keys(event.scales).join(', ');
      throw new ScoringError(`Unknown scale ${JSON.stringify(scale)}. Known scales: ${known}`);
    }
    const bracket = findAgeBracket(age, tables.ageBrackets);
    const entries = column[bracket.id];
    if (!entries) {
      throw new ScoringError(`${eventId}: no ${scale} column for age bracket ${bracket.id}`);
    }

    const value = normalizeRaw(event, raw);
    const points = pointsFrom(entries, value, event.better);

    return {
      event: event.id,
      name: event.name,
      points,
      raw: value,
      unit: event.unit,
      display: event.valueType === 'duration' ? formatDuration(value) : String(value),
      ageBracket: bracket.id,
      scale,
    };
  }

  /**
   * Score a whole test.
   *
   * `performances` is keyed by event id, e.g.
   *   { MDL: 250, HRP: 40, SDC: '1:45', PLK: '2:30', '2MR': '15:30' }
   *
   * Every event in the tables must be present. A partial test is not a lower
   * score, it is an incomplete record, and silently scoring a missing event as
   * zero would be the tool inventing a result.
   */
  function scoreTest({ age, scale, performances }) {
    if (!performances || typeof performances !== 'object') {
      throw new ScoringError('performances must be an object keyed by event id');
    }
    const missing = tables.events
      .map((event) => event.id)
      .filter((id) => performances[id] === undefined || performances[id] === null);
    if (missing.length > 0) {
      throw new ScoringError(`Missing performances for: ${missing.join(', ')}`);
    }

    const events = tables.events.map((event) =>
      scoreEvent(event.id, { age, scale, raw: performances[event.id] }),
    );

    return {
      events,
      total: events.reduce((sum, result) => sum + result.points, 0),
      lowestEvent: events.reduce((worst, result) => (result.points < worst.points ? result : worst)),
      ageBracket: events[0].ageBracket,
      scale,
    };
  }

  return {
    events: tables.events.map(({ id, name, unit, valueType, better }) => ({
      id,
      name,
      unit,
      valueType,
      better,
    })),
    scales: tables.scales,
    ageBrackets: tables.ageBrackets,
    source: tables.meta.source,
    scoreEvent,
    scoreTest,
  };
}
