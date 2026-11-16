import { afterAll, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { windHeightField, windHeightLoads } from '../wind-pressure-field';
import { windLoadCases } from '../wind-cases';
import { mesh, remeshWind, variants, windAxis, windProject } from './wind-integration-fixture';
import { input2DToWireObject, input3DToWireObject, solve, solvePDelta, solve3D, solvePDelta3D } from '../../wasm-solver';
import { computeDiagramValueAt } from '../../diagrams';
import { evaluateDiagramAt } from '../../diagrams-3d';
import type { SolverInput } from '../../types';
import type { SolverInput3D } from '../../types-3d';

const fixtures: Array<Record<string, unknown>> = [];
afterAll(() => {
  if (!fixtures.length) return;
  if (process.env.WIND_BAND_CASES) { writeFileSync(process.env.WIND_BAND_CASES, JSON.stringify(fixtures) + '\n'); return; }
  const saved = JSON.parse(readFileSync(new URL('../../../../../../engine/tests/integration/wind_band_2220.json', import.meta.url), 'utf8')) as typeof fixtures;
  for (const candidate of fixtures) expect(saved.find(c => c.kind === candidate.kind && c.variant === candidate.variant && c.dimension === candidate.dimension)).toEqual(JSON.parse(JSON.stringify(candidate)));
});

for (const entry of ['field', 'cases'] as const) for (const variant of variants) for (const eccentricity of [-0.3, 0.3]) for (const pressureSign of [-1, 1]) it(`#2220 unloaded lower band retains upper member mechanics ${entry} ${variant} ${eccentricity} pressure=${pressureSign}`, () => {
  const { model, sources, back } = remeshWind(mesh([[[0, 0, 0], [0, 0, 2]], [[0, 0, 2], [0, -1, 6]], [[0, 0, 2], [0, 1, 6]]]), variant);
  const axis = variant === 'rotate' ? 'y' : 'x', reflected = variant === 'mirror' ? -1 : 1;
  const field = windHeightField({ model, axis, from: 0, to: 6, width: 2, boundaries: [2], pressure: z => z < 2 ? 0 : pressureSign });
  const e = reflected * eccentricity;
  const direction = axis === 'y' ? '+y' : reflected < 0 ? '-x' : '+x';
  const generated = entry === 'field' ? windHeightLoads(field, axis === 'x' ? reflected : 0, axis === 'y' ? 1 : 0, e)
    : windLoadCases({ model, axes: [{ ...windAxis, axis, across: 2, pressureField: field }], set: 'all', directions: [direction], tributaryWidth: 2, speed: windProject.basicSpeed }).cases.find(c => c.nameKey === 'autoLoad.windCase2' && c.nameParams.e === (e > 0 ? '+' : '−'))!;
  expect(generated).toBeDefined(); expect(generated.nodal).toEqual([]);
  const factor = entry === 'field' ? 1 : 0.75, length = Math.sqrt(17), scale = 4 / length;
  for (const carrier of [2, 3]) {
    const side = carrier === 2 ? -1 : 1;
    const q = -pressureSign * factor * side * eccentricity * scale, gradient = pressureSign * factor * scale / length;
    const integral = (s: number, power: number) => q * (length ** (power + 1) - s ** (power + 1)) / (power + 1) + gradient * (length ** (power + 2) - s ** (power + 2)) / (power + 2);
    const parts = generated.distributed.filter(p => sources.get(p.elementId) === carrier);
    const nodes = new Map<number, { id: number; x: number; z: number }>();
    const elements: SolverInput['elements'] = new Map();
    for (const member of model.elements.values()) if (sources.get(member.id) === carrier) {
      for (const id of [member.nodeI, member.nodeJ]) nodes.set(id, { id, x: 0, z: (model.nodes.get(id)!.z! - 2) / scale });
      elements.set(member.id, { ...member, type: 'frame', hingeStart: false, hingeEnd: false });
    }
    const base = [...nodes.values()].find(n => n.z === 0)!.id, tip = [...nodes.values()].find(n => n.z === length)!.id;
    const component = (p: typeof parts[number], end = false) => back(end ? p.qXJ! : p.qX, end ? p.qYJ! : p.qY)[0]!;
    const common = { materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]), sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]) };
    for (const spatial of [false, true]) {
      const input: SolverInput = { ...common, nodes, elements, supports: new Map([[base, { id: base, nodeId: base, type: 'fixed' }]]), loads: parts.map(p => ({ type: 'distributed', data: { elementId: p.elementId, a: p.a, b: p.b, qI: -component(p), qJ: -component(p, true) } })) };
      const input3: SolverInput3D = { ...common, nodes: new Map([...nodes].map(([id, n]) => [id, { ...n, y: 0 }])), elements: new Map([...elements].map(([id, m]) => [id, { id, nodeI: m.nodeI, nodeJ: m.nodeJ, materialId: m.materialId, sectionId: m.sectionId, type: 'frame', localYx: 1, localYy: 0, localYz: 0, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])), supports: new Map([[base, { nodeId: base, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]), loads: parts.map(p => ({ type: 'distributed', data: { elementId: p.elementId, a: p.a, b: p.b, qYI: component(p), qYJ: component(p, true), qZI: 0, qZJ: 0 } })) };
      fixtures.push({ kind: `${entry}:${carrier}:${eccentricity}:${pressureSign}`, variant, dimension: spatial ? 3 : 2, axis: 'z', displacement: 'ux', length, polynomial: [q, gradient], base, tip, input: spatial ? input3DToWireObject(input3) : input2DToWireObject(input) });
      expect(parts.length).toBeGreaterThan(0);
      for (const p of parts) {
        const s = nodes.get(elements.get(p.elementId)!.nodeI)!.z;
        expect(component(p)).toBeCloseTo(q + gradient * (s + p.a), 10);
        expect(component(p, true)).toBeCloseTo(q + gradient * (s + p.b), 10);
      }
      for (const nonlinear of [false, true]) {
        const out: ReturnType<typeof solve> | ReturnType<typeof solve3D> = spatial ? nonlinear ? solvePDelta3D(input3).results : solve3D(input3) : nonlinear ? solvePDelta(input).results : solve(input);
        expect(out.elementForces.map(f => f.elementId).sort((a, b) => a - b)).toEqual([...elements.keys()].sort((a, b) => a - b));
        const tips = out.displacements.filter(d => d.nodeId === tip);
        expect(tips).toHaveLength(1);
        expect(tips[0]!.ux).toBeCloseTo((3 * length * integral(0, 2) - integral(0, 3)) / (6 * 200000 * 1000 * 1e-4), 10);
        for (const f of out.elementForces) for (const t of [0, 0.2, 0.5, 0.8, 1]) {
          const s = nodes.get(elements.get(f.elementId)!.nodeI)!.z + t * f.length;
          const shear = integral(s, 0), moment = integral(s, 1) - s * shear;
          if ('vyStart' in f) {
            expect(evaluateDiagramAt(f, 'shearY', t)).toBeCloseTo(-shear, 10);
            expect(evaluateDiagramAt(f, 'momentZ', t)).toBeCloseTo(-moment, 10);
            expect(evaluateDiagramAt(f, 'torsion', t)).toBeCloseTo(0, 10);
          } else {
            expect(computeDiagramValueAt('shear', t, f)).toBeCloseTo(shear, 10);
            expect(computeDiagramValueAt('moment', t, f)).toBeCloseTo(moment, 10);
          }
        }
      }
    }
  }
});
