import { beforeAll, expect, it } from 'vitest';
import model from '../../../../../engine/tests/fixtures/modal-arch-370.json';
import { initSolver } from '../wasm-solver';
import type { StructuredDiagnostic } from '../types';

beforeAll(async () => { await initSolver(); });

it.each(['solve_modal_3d', 'certify_modal_3d'] as const)('%s reports only the authored modal members', async entry => {
  const wasm = await import('../../wasm/dedaliano_engine.js');
  const output = JSON.parse(wasm[entry](JSON.stringify(model), 2));
  const result = entry === 'solve_modal_3d' ? output : output.results;
  expect(result.modes).toHaveLength(2);
  const warnings = (result.structuredDiagnostics as StructuredDiagnostic[]).filter(d => d.phase === 'NL-DYNAMIC-GAPS');
  expect(warnings.map(d => [d.elementKind, d.elementIds])).toEqual([
    ['frame', [1]],
    ['curved_beam', [0]],
  ]);
});
