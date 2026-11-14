import { runGroup } from '../run-group';

import { expect, it } from 'vitest';
import { CORPUS } from '../corpus';
import { captureSnow } from '../snow-capture';
import { compareValues } from '../../../../scripts/results-snapshot/compare.mjs';

runGroup('loads');

it('every snow load piece is retained and a changed load fails comparison', () => {
  const snapshot = captureSnow(CORPUS.find(c => c.name === 'snow-roof-step')!);
  const members = Object.entries(snapshot.values).filter(([key, value]) => key.endsWith('.elementId') && value === 500);
  expect(members.length).toBeGreaterThan(1);
  const path = members[0]![0].replace(/elementId$/, 'q');
  expect(typeof snapshot.values[path]).toBe('number');
  const changed = { ...snapshot.values, [path]: (snapshot.values[path] as number) * 2 };
  expect(compareValues(snapshot.values, changed).differs).toBe(true);
});
