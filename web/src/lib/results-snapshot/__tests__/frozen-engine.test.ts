import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import * as engine from '../../engine/wasm-solver';
import { solve_3d } from '../../wasm/dedaliano_engine.js';
import type { Reaction3D } from '../../engine/types-3d';
import { slab } from '../../../components/examples/slab';
import { defaults } from '../../../components/examples/define';
import inputs from '../frozen-inputs.json';
import exclusions from '../frozen-exclusions.json';
import { assertFrozenModelAllowed, compareFrozen, freezeValues } from '../../../../scripts/results-snapshot/frozen.mjs';
import { compareValues } from '../../../../scripts/results-snapshot/compare.mjs';

const dir = new URL('../../../../results-frozen/', import.meta.url);
const names: string[] = [];
const solvers = {
  solve_arc_length: engine.solveArcLength,
  solve_ssi_2d: engine.solveSSI2D,
  solve_ssi_3d: engine.solveSSI3D,
};
const update = process.env.RESULTS_FROZEN_UPDATE === '1';
const reactionKeys = ['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as const;
const ssiRankRefusals = new Set([
  'solve_ssi_2d-c703b27bda5f4eb8.json',
  'solve_ssi_2d-169f627ba8e7f8cf.json',
]);

function expectSameReactions(reference: Reaction3D[], current: Reaction3D[]): void {
  expect(current.map(r => r.nodeId)).toEqual(reference.map(r => r.nodeId));
  expect(compareValues(freezeValues(reference, 'reactions'), freezeValues(current, 'reactions')))
    .toEqual({ changed: [], removed: [], added: [], differs: false });
}

function check(name: string, features: string[], response: unknown, prefix: string): void {
  assertFrozenModelAllowed(`${name}.json`, exclusions);
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
  if (c.analysis === 'solve_ssi_3d') {
    it(`known wrong result: #1946 no-soil reaction comparison for ${c.model}`, () => {
      const result = engine.solveSSI3D(c.input[0]);
      expect(result.converged).toBe(true);
      expect(result.springResults).toEqual([]);
      expectSameReactions(solve_3d(c.input[0].solver).reactions, result.results.reactions);
    });

    it(`both solvers balance the input loads for ${c.model}`, () => {
      const input = c.input[0];
      if (!('soilSprings' in input)) throw new Error('SSI input must contain soil springs');
      const solver = input.solver;
      const nodes = solver.nodes as Record<string, { x: number; y: number; z: number }>;
      const supports = Object.values(solver.supports);
      expect(supports).toHaveLength(1);
      expect(input.soilSprings).toEqual([]);
      const nodeId = supports[0].nodeId;
      const origin = nodes[nodeId];
      const expected: Reaction3D = { nodeId, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };
      for (const load of solver.loads) {
        expect(load.type).toBe('nodal');
        const d = load.data as Reaction3D;
        const node = nodes[d.nodeId];
        for (const key of reactionKeys) expected[key] -= d[key];
        expected.mx -= (node.y - origin.y) * d.fz - (node.z - origin.z) * d.fy;
        expected.my -= (node.z - origin.z) * d.fx - (node.x - origin.x) * d.fz;
        expected.mz -= (node.x - origin.x) * d.fy - (node.y - origin.y) * d.fx;
      }
      expectSameReactions([expected], solve_3d(solver).reactions);
      expectSameReactions([expected], engine.solveSSI3D(c.input[0]).results.reactions);
    });

    for (const key of reactionKeys) {
      it(`rejects a changed ${key} in the no-soil reaction comparison (#1946)`, () => {
        const reference: Reaction3D[] = solve_3d(c.input[0].solver).reactions;
        const delta = Math.max(...reference.flatMap(r => reactionKeys.map(k => Math.abs(r[k]))));
        expect(delta).toBeGreaterThan(0);
        const changed = reference.map(r => ({ ...r, [key]: r[key] + delta }));
        expect(() => expectSameReactions(reference, changed)).toThrow();
      });
    }

    it('rejects missing, relabelled and non-finite no-soil reactions (#1946)', () => {
      const reference: Reaction3D[] = solve_3d(c.input[0].solver).reactions;
      expect(() => expectSameReactions(reference, [])).toThrow();
      expect(() => expectSameReactions(reference, reference.map(r => ({ ...r, nodeId: r.nodeId + 1 })))).toThrow();
      for (const fy of [NaN, Infinity, -Infinity]) {
        expect(() => expectSameReactions(reference, reference.map(r => ({ ...r, fy })))).toThrow();
      }
    });
  }
  if (c.analysis === 'solve_ssi_2d' && ssiRankRefusals.has(c.model)) {
    it(`freezes the rank refusal for ${c.model}`, () => {
      const message = 'the structure is a mechanism or so close to one that its stability cannot be decided in double precision: the reduced stiffness rank cannot be resolved at assembly precision. Check member releases, supports, springs and constraints for a mechanism.';
      let refusal: unknown;
      try {
        engine.solveSSI2D(c.input[0]);
      } catch (error) {
        refusal = JSON.parse(String(error));
      }
      expect(refusal).toEqual({
        message,
        structuredDiagnostics: [{ code: 'reduced_stiffness_rank', severity: 'error', message }],
      });
      check(c.model.replace(/\.json$/, ''), ['plane2D', 'members', 'analysis:ssi', 'ssiHistory'], refusal, 'ssi.refusal');
    });
    it(`solves ${c.model} with transverse soil restraint`, () => {
      const input = c.input[0];
      if (!('soilSprings' in input)) throw new Error('SSI input must contain soil springs');
      const lateralSpring = {
        nodeId: input.soilSprings[0].nodeId,
        direction: 0,
        tributaryLength: 1,
        curve: { type: 'custom', points: [[0, 0], [1, 1000]] },
      };
      const result = engine.solveSSI2D({ ...input, soilSprings: [...input.soilSprings, lateralSpring] });
      expect(result.converged).toBe(true);
      expect(result.springResults).toHaveLength(input.soilSprings.length + 1);
      expect(result.results.displacements).toHaveLength(Object.keys(input.solver.nodes).length);
      for (const displacement of result.results.displacements) {
        expect(Math.abs(displacement.ux)).toBe(0);
        expect(Math.abs(displacement.ry)).toBe(0);
      }
    });
    continue;
  }
  it(`freezes every serialized field of ${c.model}`, () => {
    const arc = c.analysis === 'solve_arc_length';
    const three = c.analysis === 'solve_ssi_3d';
    const solve = solvers[c.analysis as keyof typeof solvers];
    expect(solve, c.analysis).toBeDefined();
    const result = solve(c.input[0]);
    expect(result.converged).toBe(true);
    expect(result.results.displacements.length).toBeGreaterThan(0);
    expect(result.results.reactions.length).toBeGreaterThan(0);
    const prefix = arc ? 'nonlinear' : 'ssi';
    check(c.model.replace(/\.json$/, ''), [three ? 'space3D' : 'plane2D', 'members', `analysis:${prefix}`, ...(arc ? ['pathAnalysis'] : [])], result, prefix);
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
