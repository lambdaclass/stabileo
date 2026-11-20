import { runGroup } from '../run-group';

import { expect, it } from 'vitest';
import { CORPUS } from '../corpus';
import { captureSnow } from '../snow-capture';
import { compareValues } from '../../../../scripts/results-snapshot/compare.mjs';

runGroup('loads');

it.skipIf(process.env.RUN_KNOWN_WRONG !== '2218').each([
  'snow-roof-step', 'snow-roof-rotation', 'snow-two-pitch',
])('known wrong result: #2218 — %s records only the step drift refusal', name => {
  const snapshot = captureSnow(CORPUS.find(c => c.name === name)!);
  expect(snapshot.values).toEqual({
    'snowResult.refusal': 'Snow generation cannot transfer the drift at a roof step to its carrier members reliably. Define the snow loads explicitly.',
  });
});

it('every snow load piece is retained and a changed load fails comparison', () => {
  const snapshot = captureSnow(CORPUS.find(c => c.name === 'snow-roof-step')!);
  const members = Object.entries(snapshot.values).filter(([key, value]) => key.endsWith('.elementId') && value === 500);
  expect(members.length).toBeGreaterThan(1);
  const path = members[0]![0].replace(/elementId$/, 'q');
  expect(typeof snapshot.values[path]).toBe('number');
  const changed = { ...snapshot.values, [path]: (snapshot.values[path] as number) * 2 };
  expect(compareValues(snapshot.values, changed).differs).toBe(true);
});
