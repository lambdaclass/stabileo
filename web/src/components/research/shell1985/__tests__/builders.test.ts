import { describe, expect, it } from 'vitest';
import data from '../../../../../../engine/tests/benchmarks/shell_obstacle_course.json';
import { caseFor, cylinderInput, roofInput } from '../builders';
import { compare, inputFor } from '../cases';
import { initSolver, solve3D } from '../../../../lib/engine/wasm-solver';

function same(a: unknown, b: unknown, at = '$'): void {
  if (typeof a === 'number' && typeof b === 'number') {
    expect(Math.abs(a - b), at).toBeLessThanOrEqual(1e-12 * Math.max(Math.abs(a), Math.abs(b)));
  } else if (Array.isArray(a) && Array.isArray(b)) {
    expect(b.length, at).toBe(a.length);
    a.forEach((x, i) => same(x, b[i], `${at}[${i}]`));
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    expect(Object.keys(b).sort(), at).toEqual(Object.keys(a).sort());
    for (const k of Object.keys(a)) same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${at}.${k}`);
  } else {
    expect(b, at).toBe(a);
  }
}

describe('roof and cylinder builders', () => {
  const fixtures = [...data.cases, ...data.nativeCases].filter(c => c.group !== 'hemisphere');
  it('reproduce every engine-owned roof and cylinder case', () => {
    expect(fixtures.map(c => c.id)).toEqual(['roof-6', 'roof-8', 'roof-12', 'roof-16', 'cylinder-6', 'cylinder-8', 'cylinder-12', 'cylinder-16', 'cylinder-32']);
    for (const c of fixtures) {
      const built = c.group === 'roof' ? roofInput(c.mesh) : cylinderInput(c.mesh);
      same(c.input, built.input, c.id);
      expect(built.node, c.id).toBe(c.measurement.node);
    }
  });
  it('use the fixture for its meshes and build every other mesh', () => {
    expect(caseFor('roof', 16).built).toBe(false);
    const c = caseFor('cylinder', 10);
    expect(c).toMatchObject({ id: 'cylinder-10', mesh: 10, built: true, reference: 1.8248e-5, measurement: { node: 1, component: 'uy' } });
    expect(Object.keys(c.input.nodes)).toHaveLength(121);
    const roof = caseFor('roof', 3);
    expect(roof.measurement.node).toBe(4);
    expect(roof.input.loads.reduce((sum, l) => sum + l.data.fz, 0)).toBeCloseTo(-90 * 25 * 25 * 40 * Math.PI / 180, 8);
  });
  it('solve built meshes through the production engine in line with the case file', async () => {
    await initSolver();
    const solve = (c: ReturnType<typeof caseFor>) => compare(c, solve3D(inputFor(c)).displacements as unknown as Record<string, number>[]);
    const roof10 = solve(caseFor('roof', 10));
    expect(roof10.value!).toBeLessThan(0);
    expect(roof10.pass).toBe(true);
    const cylinder16 = solve(caseFor('cylinder', 16));
    const cylinder20 = solve(caseFor('cylinder', 20));
    expect(cylinder20.value!).toBeLessThan(0);
    expect(cylinder20.error!).toBeLessThan(cylinder16.error!);
  }, 120_000);
});

it('only selectable group and mesh combinations can produce a viewer case', () => {
  for (const [group, n] of [['hemisphere', 10], ['unknown', 10], ['roof', 1], ['cylinder', 21]] as const) {
    expect(() => caseFor(group as Parameters<typeof caseFor>[0], n)).toThrow(RangeError);
  }
  for (const group of ['roof', 'cylinder'] as const) {
    for (const n of [2, 20]) expect(caseFor(group, n).id).toBe(`${group}-${n}`);
  }
  expect(caseFor('hemisphere' as Parameters<typeof caseFor>[0], 16).built).toBe(false);
});
