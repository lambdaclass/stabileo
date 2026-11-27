import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import ComparisonTable from '../ComparisonTable.svelte';
import ConvergencePlot from '../../shell1985/ConvergencePlot.svelte';

const row = { name: 'measurement', source: 'paper', metric: 'absolute', observed: 0, tolerance: 0, passed: true };
const table = (fields: Record<string, number>) => render(ComparisonTable, { props: { rows: [{ ...row, ...fields }] } }).body;

it.skip('known wrong result: #2505 an incomplete pair cannot certify a scalar or a curve', () => {
  for (const fields of [{ reference: 1 }, { computed: 1 }, { reference: 1, points: 2 }, { points: 0 }]) {
    const body = table(fields as Record<string, number>);
    expect(body).not.toContain('✓');
    expect(body).not.toMatch(/curve, [02] points/);
  }
  expect(table({ points: 2 })).toContain('✓');
  expect(table({ reference: 1, computed: 1 })).toContain('✓');
});

it.skip('known wrong result: #2505 an excessive difference has a single failed verdict', () => {
  const body = table({ reference: 1, computed: 2, observed: 1 });
  expect(body).toContain('✗');
  expect(body).toContain('aria-label="outside tolerance"');
});

it.skip('known wrong result: #2505 only adjacent finite convergence samples form segments', () => {
  for (const gap of [null, NaN, Infinity]) {
    const points = [1, 2, gap, 3].map((ratio, n) => ({ ratio, n }));
    const body = render(ConvergencePlot, { props: { points, title: 'Mesh', xLabel: 'N', yLabel: 'ratio' } }).body;
    expect(body.match(/<line /g)).toHaveLength(1);
    expect(body.match(/<circle /g)).toHaveLength(3);
  }
});
