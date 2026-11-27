import { expect, it } from 'vitest';
import { EXPERIMENTS } from '../experiments';
import catalog from '../../../../../research/papers.json';

const VALIDATED = new Set(['numerically-validated', 'published-figures-compared']);

it('lists in Run it only experiments that are at least numerically validated', () => {
  const status = new Map(catalog.papers.map((p) => [p.id, p.status]));
  const below = EXPERIMENTS.filter((e) => !VALIDATED.has(status.get(e.paperId) ?? '')).map((e) => `${e.paperId}: ${status.get(e.paperId)}`);
  expect(below).toEqual([]);
});

it('keeps interactive out of the status ladder', () => {
  expect(catalog.papers.filter((p) => p.status === 'interactive').map((p) => p.id)).toEqual([]);
});
