import { describe, it, expect } from 'vitest';
import { cases, solverInput, mesh, navierCenter, parameters, difference, convergence, reduction, type Row } from '../model';
import { strings } from '../strings';
import { solve3D, input3DToWireObject } from '../../../../lib/engine/wasm-solver';
import replay from '../../../../../../research/benchmarks/navier-plate/results/stabileo_results.json';

describe('Navier first version', () => {
  it('retains alternating centre signs and resolves the published displacement', () => {
    expect(navierCenter()).toBeCloseTo(1.28375, 5);
    expect(navierCenter(200)).toBeCloseTo(navierCenter(100), 8);
    expect(navierCenter()).toBeCloseTo(parameters.reference_mm, 12);
  });
  it.each(cases.map((c, i) => [c.family, c.n, i] as const))('%s %s uses the shared native case and agrees with its replay', (_, __, index) => {
    const input = solverInput(index);
    const wire = input3DToWireObject(input);
    for (const key of ['nodes', 'materials', 'supports', 'plates', 'quads', 'loads'] as const) expect(wire[key]).toEqual(cases[index].input[key]);
    expect(input.loads.reduce((sum, l) => sum + (l.type === 'nodal' ? l.data.fz : 0), 0)).toBeCloseTo(-150, 8);
    const result = solve3D(input);
    const center = result.displacements.find(d => d.nodeId === cases[index].center)!;
    expect(-center.uz * 1000).toBeCloseTo(replay.rows[index].center_mm, 7);
    const geometry = mesh(index);
    expect(geometry.xy.length).toBe(input.nodes.size * 2);
    expect(Math.max(...geometry.cells)).toBeLessThan(input.nodes.size);
    if (cases[index].n === 16) expect(Math.abs(difference(replay.rows[index]))).toBeLessThan(5);
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
  it('provides the same translation keys and limitations in all research locales', () => {
    for (const s of Object.values(strings)) {
      expect(Object.keys(s)).toEqual(Object.keys(strings.en));
      expect(s.limitations).toHaveLength(4);
      expect(Object.values(s).every(value => value.length > 0)).toBe(true);
    }
  });
});
