import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import * as engine from '../../engine/wasm-solver';
import { solve_3d } from '../../wasm/dedaliano_engine.js';
import { slab } from '../../../components/examples/slab';
import { defaults } from '../../../components/examples/define';
import inputs from '../frozen-inputs.json';
import { compareFrozen, freezeValues } from '../../../../scripts/results-snapshot/frozen.mjs';

const dir = new URL('../../../../results-frozen/', import.meta.url);
const names: string[] = [];
const solvers = {
  solve_arc_length: engine.solveArcLength,
  solve_ssi_2d: engine.solveSSI2D,
  solve_ssi_3d: engine.solveSSI3D,
};
const update = process.env.RESULTS_FROZEN_UPDATE === '1';

function check(name: string, features: string[], response: unknown, prefix: string): void {
  names.push(`${name}.json`);
  const file = new URL(`${name}.json`, dir);
  const snapshot = { format: 1, features, values: freezeValues(response, prefix) };
  if (update) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n');
  }
  expect(existsSync(file), name).toBe(true);
  const committed = JSON.parse(readFileSync(file, 'utf8'));
  expect(committed.format, name).toBe(snapshot.format);
  expect(committed.features, name).toEqual(features);
  expect(Object.keys(committed).sort(), name).toEqual(['features', 'format', 'values']);
  expect(compareFrozen(committed.values, snapshot.values), name).toEqual({ changed: [], removed: [], added: [], differs: false });
}

for (const c of inputs) {
  if (['solve_arc_length-0015ab84c3baa36f.json', 'solve_arc_length-022317310499426d.json'].includes(c.model)) {
    it.fails(`known wrong result: #1949 ${c.model} must return support reactions`, () => {
      const result = engine.solveArcLength(c.input[0]);
      expect(result.converged).toBe(true);
      expect(result.results.reactions.length).toBeGreaterThan(0);
    });
  }
  if (c.analysis === 'solve_ssi_3d') {
    it.fails(`known wrong result: #1946 no-soil reaction comparison for ${c.model}`, () => {
      const result = engine.solveSSI3D(c.input[0]);
      expect(result.results.reactions).toEqual(solve_3d(c.input[0].solver).reactions);
    });
  }
  it(`freezes every serialized field of ${c.model}`, () => {
    const arc = c.analysis === 'solve_arc_length';
    const three = c.analysis === 'solve_ssi_3d';
    const solve = solvers[c.analysis as keyof typeof solvers];
    expect(solve, c.analysis).toBeDefined();
    const result = solve(c.input[0]);
    expect(result.converged).toBe(true);
    expect(result.results.displacements.length).toBeGreaterThan(0);
    if (!arc) expect(result.results.reactions.length).toBeGreaterThan(0);
    const prefix = arc ? 'nonlinear' : 'ssi';
    check(c.model.replace(/\.json$/, ''), [three ? 'space3D' : 'plane2D', 'members', `analysis:${prefix}`], result, prefix);
  });
}

for (const supports of [0, 1]) {
  it(`freezes the public slab gallery with supports=${supports}`, () => {
    const v = { ...defaults(slab.params), supports };
    const result = slab.analyses(slab.build(v), v, engine);
    expect(result.status).toBe('ok');
    check(`gallery-slab-${supports === 1 ? 'walls' : 'columns'}`,
      [`gallery:slab-on-columns:${supports === 1 ? 'walls' : 'columns'}`, 'space3D', 'shells', 'analysis:linear'], result, 'gallery');
  });
}

it('keeps every frozen output in the executed corpus', () => {
  expect(readdirSync(dir).filter(f => f.endsWith('.json')).sort()).toEqual(names.sort());
});
