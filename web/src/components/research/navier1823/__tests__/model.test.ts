import { describe, it, expect } from 'vitest';
import { cases, solverInput, mesh, navierCenter, mindlinCenter, parameters, difference, convergence, reduction, hardCases, hardSupports, runState, type Row } from '../model';
import { strings, navierLocale } from '../strings';
import { PUBLIC_LOCALES } from '../../../../lib/i18n/offered';
import { solve3D, input3DToWireObject } from '../../../../lib/engine/wasm-solver';
import replay from '../../../../../../research/benchmarks/navier-plate/results/stabileo_results.json';

const { a, b, e, nu, thickness, pressure } = parameters;
const near = (x: number, y: number) => Math.abs(x - y) < 1e-9;

function solvedValues(index: number, hard = false) {
  const result = solve3D(solverInput(index, hard));
  return Object.values(cases[index].input.nodes).sort((p, q) => p.id - q.id).map(n => -1000 * result.displacements.find(d => d.nodeId === n.id)!.uz);
}

describe('Navier references', () => {
  it('retains alternating centre signs and resolves the published displacement', () => {
    expect(parameters.published_mm).toBe(1.28375);
    expect(Math.abs(navierCenter() - parameters.published_mm)).toBeLessThan(5e-6);
    expect(Math.abs(navierCenter(4 * parameters.terms) - navierCenter())).toBeLessThan(1e-9);
    expect(navierCenter()).toBeCloseTo(parameters.reference_mm, 12);
  });
  it('evaluates the hard-support Reissner–Mindlin series independently', () => {
    expect(parameters.shear_correction).toBe(5 / 6);
    expect(Math.abs(mindlinCenter() - parameters.mindlin_reference_mm)).toBeLessThan(1e-11);
    expect(Math.abs(mindlinCenter(2 * parameters.mindlin_terms) - parameters.mindlin_reference_mm)).toBeLessThan(1e-9);
    expect(parameters.mindlin_reference_mm / parameters.reference_mm - 1).toBeCloseTo(0.0034063, 6);
  });
});

describe.each(cases.map((c, i) => [c.family, c.n, i] as const))('%s %s', (family, n, index) => {
  const wire = cases[index].input;
  const nodes = Object.values(wire.nodes);
  it('models the plate in the paper: geometry, material, supports, centre and lumped load', () => {
    expect([a, b, e, nu, thickness, pressure]).toEqual([3, 5, 63000, 0.2, 0.1, 10]);
    expect(nodes).toHaveLength((n + 1) ** 2);
    expect(Math.max(...nodes.map(p => p.x))).toBe(a);
    expect(Math.max(...nodes.map(p => p.y))).toBe(b);
    expect(Object.values(wire.materials)).toEqual([{ id: 1, e, nu }]);
    const cells = Object.values(family === 'DKT' ? wire.plates : wire.quads);
    expect(cells).toHaveLength(family === 'DKT' ? 2 * n * n : n * n);
    expect(Object.keys(family === 'DKT' ? wire.quads : wire.plates)).toHaveLength(0);
    expect(cells.every(c => c.thickness === thickness && c.materialId === 1)).toBe(true);

    const edge = (p: { x: number; y: number }) => near(p.x, 0) || near(p.x, a) || near(p.y, 0) || near(p.y, b);
    const supports = Object.values(wire.supports);
    expect(supports.map(s => s.nodeId).sort((p, q) => p - q)).toEqual(nodes.filter(edge).map(p => p.id).sort((p, q) => p - q));
    expect(supports.every(s => s.rz && !s.rrx && !s.rry && !s.rrz)).toBe(true);
    const inPlane = supports.filter(s => s.rx || s.ry).map(s => ({ ...wire.nodes[s.nodeId], rx: s.rx, ry: s.ry }));
    expect(inPlane.map(p => [p.x, p.y, p.rx, p.ry])).toEqual([[0, 0, true, true], [a, 0, false, true]]);

    expect([wire.nodes[cases[index].center].x, wire.nodes[cases[index].center].y]).toEqual([a / 2, b / 2]);

    const cellArea = a * b / (n * n) / (family === 'DKT' ? 2 : 1);
    const expected = new Map<number, number>();
    for (const c of cells) for (const id of c.nodes) expected.set(id, (expected.get(id) ?? 0) + pressure * cellArea / c.nodes.length);
    expect(cells.every(c => c.nodes.length === (family === 'DKT' ? 3 : 4))).toBe(true);
    for (const load of wire.loads) {
      if (load.type !== 'nodal') throw new Error('nodal loads only');
      expect([load.data.fx, load.data.fy, load.data.mx, load.data.my, load.data.mz]).toEqual([0, 0, 0, 0, 0]);
      expect(load.data.fz).toBeCloseTo(-expected.get(load.data.nodeId)!, 12);
    }
    expect(wire.loads).toHaveLength(nodes.length);
    expect(wire.loads.reduce((sum, l) => sum + (l.type === 'nodal' ? l.data.fz : 0), 0)).toBeCloseTo(-pressure * a * b, 8);
  });

  it('passes the fixture to production WASM unchanged and matches the native replay at every node', () => {
    const input = solverInput(index);
    const wireObject = input3DToWireObject(input);
    for (const key of ['nodes', 'materials', 'supports', 'plates', 'quads', 'loads'] as const) expect(wireObject[key]).toEqual(wire[key]);
    const row = replay.rows[index];
    expect([row.family, row.n]).toEqual([family, n]);
    const values = solvedValues(index);
    expect(values).toHaveLength(row.values.length);
    values.forEach((v, i) => expect(v).toBeCloseTo(row.values[i], 9));
    expect(row.center_mm).toBe(row.values[cases[index].center - 1]);
    const geometry = mesh(index);
    expect(geometry.xy.length).toBe(input.nodes.size * 2);
    expect(Math.max(...geometry.cells)).toBeLessThan(input.nodes.size);
  });
});

describe('hard simple support', () => {
  it('also restrains the rotation along each edge and nothing else', () => {
    const wire = cases[hardCases[0]].input;
    const hard = hardSupports(wire.supports, wire.nodes);
    for (const s of Object.values(hard)) {
      const p = wire.nodes[s.nodeId];
      expect(s.rrx).toBe(near(p.x, 0) || near(p.x, a));
      expect(s.rry).toBe(near(p.y, 0) || near(p.y, b));
      expect(s.rrz).toBe(false);
      expect([s.rx, s.ry, s.rz]).toEqual([wire.supports[s.nodeId].rx, wire.supports[s.nodeId].ry, true]);
    }
    expect(Object.values(wire.supports).some(s => s.rrx || s.rry)).toBe(false);
  });
  it.each(hardCases.map((index, k) => [cases[index].n, index, k] as const))('MITC4 %s matches the native hard-support replay at every node', (n, index, k) => {
    const row = replay.hard_rows[k];
    expect([row.family, row.n]).toEqual(['MITC4', n]);
    const values = solvedValues(index, true);
    values.forEach((v, i) => expect(v).toBeCloseTo(row.values[i], 9));
    expect(row.center_mm).toBe(row.values[cases[index].center - 1]);
  });
  it('converges to the Reissner–Mindlin series as shown on the page', () => {
    const errors = replay.hard_rows.map(row => difference(row, parameters.mindlin_reference_mm));
    expect(errors.map(v => v.toFixed(3))).toEqual(['-1.951', '-0.561', '-0.142']);
    expect(reduction(replay.hard_rows, 'MITC4', parameters.mindlin_reference_mm)!.toFixed(2)).toBe('13.71');
    const w = replay.hard_rows.map(r => r.center_mm);
    expect((w[1] - w[0]) / (w[2] - w[1])).toBeGreaterThan(3);
  });
});

describe('displayed convergence numbers', () => {
  it('recomputes every soft-support difference, the closer element and the reductions from the replay', () => {
    expect(replay.rows.map(row => difference(row).toFixed(3))).toEqual(['-3.476', '-0.877', '-0.220', '-1.358', '0.257', '1.077']);
    expect(convergence(replay.rows).map(c => c.best)).toEqual(['MITC4', 'MITC4', 'DKT']);
    const mitc4 = replay.rows.filter(r => r.family === 'MITC4');
    expect(mitc4.reduce((p, q) => Math.abs(difference(p)) < Math.abs(difference(q)) ? p : q).n).toBe(8);
    expect(reduction(replay.rows, 'DKT')!.toFixed(2)).toBe('15.78');
    expect(reduction(replay.rows, 'MITC4')!.toFixed(2)).toBe('1.26');
    const dkt = replay.rows.filter(r => r.family === 'DKT').map(r => r.center_mm);
    expect((dkt[1] - dkt[0]) / (dkt[2] - dkt[1])).toBeCloseTo(3.96, 2);
  });
  it('compares absolute errors without assuming the winner', () => {
    const rows: Row[] = [
      { family: 'DKT', n: 4, center_mm: parameters.reference_mm * .9, values: [] },
      { family: 'MITC4', n: 4, center_mm: parameters.reference_mm * 1.05, values: [] },
      { family: 'DKT', n: 16, center_mm: parameters.reference_mm * .99, values: [] },
    ];
    expect(convergence(rows)[0].best).toBe('MITC4');
    expect(convergence(rows)[2].best).toBeNull();
    expect(reduction(rows, 'DKT')).toBeCloseTo(10);
    expect(reduction(rows, 'MITC4')).toBeNull();
  });
});

describe('run state', () => {
  it('distinguishes replay, running, complete, partial, cancelled and failed runs', () => {
    expect(runState('replay', false, false, 6)).toBe('replay');
    expect(runState('live', true, false, 3)).toBe('running');
    expect(runState('live', false, false, cases.length)).toBe('complete');
    expect(runState('live', false, false, 2)).toBe('partial');
    expect(runState('live', false, false, 0)).toBe('cancelled');
    expect(runState('live', false, true, 2)).toBe('failed');
  });
});

describe('locales', () => {
  it('translates the page into every public locale with the same keys', () => {
    expect(Object.keys(strings).sort()).toEqual([...PUBLIC_LOCALES].sort());
    for (const locale of PUBLIC_LOCALES) expect(navierLocale(locale)).toBe(locale);
    expect(navierLocale('it')).toBe('en');
    for (const s of Object.values(strings)) {
      expect(Object.keys(s)).toEqual(Object.keys(strings.en));
      expect(Object.keys(s.errors)).toEqual(Object.keys(strings.en.errors));
      expect(s.limitations).toHaveLength(4);
      expect(Object.values(s).every(value => value && (typeof value !== 'string' || value.length > 0))).toBe(true);
      expect(s.partial).toContain('{k}');
      expect(s.partial).toContain('{n}');
      for (const key of ['{mesh}', '{min}', '{max}']) expect(s.viewerLabel).toContain(key);
    }
  });
});
