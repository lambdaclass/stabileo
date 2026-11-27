import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import ComparisonTable from '../ComparisonTable.svelte';
import VerificationSummary from '../VerificationSummary.svelte';
import type { PublishedRow } from '../context';
import ConvergencePlot from '../../shell1985/ConvergencePlot.svelte';

const row = { name: 'measurement', source: 'paper', metric: 'absolute', observed: 0, tolerance: 0, passed: true };
const table = (fields: Partial<PublishedRow>) => render(ComparisonTable, { props: { rows: [{ ...row, ...fields }] } }).body;

it('an incomplete pair cannot certify a scalar or a curve', () => {
  for (const fields of [{ reference: 1 }, { computed: 1 }, { reference: 1, points: 2 }, { points: 0 }]) {
    const body = table(fields);
    expect(body).not.toContain('✓');
    expect(body).not.toMatch(/curve, [02] points/);
  }
  expect(table({ points: 2 })).toContain('✓');
  expect(table({ reference: 1, computed: 1 })).toContain('✓');
});

it('an excessive difference has a single failed verdict', () => {
  const body = table({ reference: 1, computed: 2, observed: 1 });
  expect(body).toContain('✗');
  expect(body).toContain('aria-label="outside tolerance"');
});

it('only adjacent finite convergence samples form segments', () => {
  for (const gap of [null, NaN, Infinity]) {
    const points = [1, 2, gap, 3].map((ratio, n) => ({ ratio, n }));
    const body = render(ConvergencePlot, { props: { points, title: 'Mesh', xLabel: 'N', yLabel: 'ratio' } }).body;
    expect(body.match(/<line /g)).toHaveLength(1);
    expect(body.match(/<circle /g)).toHaveLength(3);
  }
});

it('rejects a stale scalar error and displays the measured gap', () => {
  for (const [metric, gap] of [['absolute', '2'], ['relative difference', '100']] as const) {
    const html = table({ metric, reference: 2, computed: 4 });
    expect(html).toContain('✗');
    expect(html.split('</td>')[2]).toContain(gap);
  }
});

it('empty verification has no successful verdict or link', () => {
  const empty = { kind: 'checks' as const, passed: 0, total: 0, href: '#checks' };
  const html = render(VerificationSummary, { props: { reference: empty, published: empty } }).body;
  expect(html).toContain('Unavailable');
  expect(html).not.toContain('✓');
  expect(html).not.toContain('href="#checks"');
});

it('rejects a stale curve maximum and distinguishes inconsistent evidence', () => {
  const fields = { metric: 'absolute difference in Y, largest', points: 2, samples: [[0, 1], [0, 0]], tolerance: 2 };
  expect(table(fields)).toContain('aria-label="Unavailable"');
  expect(table({ ...fields, observed: 1 })).toContain('✓');
  expect(table({ reference: 1, computed: 1, observed: 0.1, tolerance: 0.2 })).toContain('aria-label="Unavailable"');
});

it('rejects scalar fields for curve metrics and unrecognized scalar metrics', () => {
  for (const metric of ['absolute distance outside the error bar, largest', 'absolute difference in Y, largest', 'absolute typographical error', 'relative typo']) {
    expect(table({ metric, reference: 1, computed: 1 })).not.toContain('✓');
  }
  expect(table({ metric: 'absolute difference', reference: 1, computed: 1, samples: [[0, 0]] })).not.toContain('✓');
});
