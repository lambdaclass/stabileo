import { expect, it } from 'vitest';
import { assertPDeltaMemoryBudget } from '../pdelta-memory';

const nodes = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, id) => [id, { id }]));

it('counts restrained nodes as well as free nodes in dense storage', () => {
  const input = { nodes: nodes(1149), elements: { 1: { type: 'frame' } }, supports: {} };
  expect(() => assertPDeltaMemoryBudget(input)).toThrow('P-Delta is not available');
  expect(() => assertPDeltaMemoryBudget({ ...input, supports: input.nodes })).toThrow('P-Delta is not available');
});

it('uses translational DOFs for trusses, six for shells, and seven for warping', () => {
  // 700 truss nodes fit the budget; the same nodes with rotational DOFs do not.
  const input = { nodes: nodes(700), elements: { 1: { type: 'truss' } } };
  expect(() => assertPDeltaMemoryBudget(input)).not.toThrow();
  for (const kind of ['plates', 'quads', 'quad9s', 'curvedShells']) {
    expect(() => assertPDeltaMemoryBudget({ ...input, [kind]: { 1: {} } })).toThrow('P-Delta is not available');
  }
  const frame = { nodes: nodes(600), elements: { 1: { type: 'frame' } } };
  expect(() => assertPDeltaMemoryBudget(frame)).not.toThrow();
  // Even a declared zero Cw enables the seventh DOF in the native solver.
  expect(() => assertPDeltaMemoryBudget({ ...frame, sections: { 1: { cw: 0 } } })).toThrow('P-Delta is not available');
});
