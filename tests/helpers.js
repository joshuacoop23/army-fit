/**
 * Shared test setup: load the scoring tables from disk once.
 *
 * The browser will fetch this same file. Node reads it. Neither path is baked
 * into src/scoring.js, which is the point -- the engine takes tables as an
 * argument, so it can be tested without a browser.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const tablesPath = fileURLToPath(new URL('../data/aft-scoring.json', import.meta.url));

export const tables = JSON.parse(readFileSync(tablesPath, 'utf8'));

/** "13:22" -> 802. Duplicated from the engine on purpose: see scoring.test.js. */
export function seconds(text) {
  const [minutes, secs] = text.split(':').map(Number);
  return minutes * 60 + secs;
}
