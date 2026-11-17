import type { Displacement3D } from '../../engine/types-3d';
import { subdivideForAnalysis } from '../../model/edit/analysis-subdivision';
import { beforeAll, expect, it } from 'vitest';
import { initSolver, solve3D, solvePDelta3D } from '../../engine/wasm-solver';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { buildSolverInput3D, buildSolverInput2D, buildSolverLoads3D, loadRefusal, validateAndSolve2D, validateAndSolve2DAsync, solveCombinations2D } from '../../engine/solver-service';
import { memberLoadSpans } from '../../engine/loads/member-load-spans';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';
import { compute_diagram_value_at_3d } from '../../wasm/dedaliano_engine.js';
import { floorLoad } from '../../engine/loads/floor-loads';
import { regionModel, rectangle } from '../../engine/loads/__tests__/physical-region-invariance';

beforeAll(async () => { await initSolver(); });

function cantilever(angle = 0) {
  modelStore.clear();
  const i = modelStore.addNode(0, 0, 0), j = modelStore.addNode(2 * Math.cos(angle), 2 * Math.sin(angle), 0), elementId = modelStore.addElement(i, j);
  modelStore.addSupport(i, 'fixed3d');
  const material = [...modelStore.materials.values()][0]!;
  modelStore.updateMaterial(material.id, { e: 1000, nu: 0 });
  const sectionId = modelStore.addSection({ name: 'Hand solution', a: 0.1, iy: 0.001, iz: 0.001, j: 0.002 });
  modelStore.updateElement(elementId, { sectionId });
  return { i, j, elementId };
}

for (const width of [0.5e-12, 1.5e-12, 1e-10, 2e-10, 0.5e-9, 1.5e-9]) for (const at of ['interior', 'j'] as const) for (const count of [1, 2]) for (const angle of [0, 0.37]) it(`short torque density has its hand torsion and twist: ${at} ${width} subdivisions=${count} angle=${angle}`, () => {
  const { j, elementId } = cantilever(angle);
  const a = at === 'j' ? 2 - width : 1, b = at === 'j' ? 2 : a + width, h = b - a;
  const load = { id: 1, elementId, a, b, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x: [1 / h, 1 / h, 1 / h] as [number, number, number], y: [0, 0, 0] as [number, number, number], z: [0, 0, 0] as [number, number, number] } };
  if (h < 1e-12) { expect(() => memberLoadSpans([load], () => 2)).toThrow(/native supported minimum/); return; }
  const bounded = memberLoadSpans([load], () => 2);
  expect(bounded.concentrated).toEqual([]);
  for (const data of bounded.distributed) modelStore.addLoadEntry({ type: 'distributed3d', data });
  if (h / 2 < 1e-10) {
    expect(() => count === 1 ? buildSolverInput3D(modelStore.model) : subdivideForAnalysis(modelStore.model, count)).toThrow(/relative geometry limit/);
    return;
  }
  const subdivided = count === 1 ? modelStore.model : subdivideForAnalysis(modelStore.model, count).model;
  const input = buildSolverInput3D(subdivided)!;
  expect(input.loads.every(l => l.type === 'distributed')).toBe(true);
  const unsupported = input.loads.some(l => {
    if (l.type !== 'distributed' || !l.data.moments) return false;
    const e = input.elements.get(l.data.elementId)!, i = input.nodes.get(e.nodeI)!, j = input.nodes.get(e.nodeJ)!;
    const length = Math.hypot(j.x - i.x, j.y - i.y, j.z - i.z);
    return (l.data.b ?? length) - (l.data.a ?? 0) < 1e-10 * length;
  });
  if (unsupported) {
    expect(() => solve3D(input)).toThrow(/distributed moment span.*1e-10/);
    expect(() => solvePDelta3D(input, 100, 1e-10)).toThrow(/distributed moment span.*1e-10/);
    return;
  }
  for (const result of [solve3D(input), solvePDelta3D(input, 100, 1e-10).results]) {
    for (const force of result.elementForces) {
      const member = input.elements.get(force.elementId)!;
      const node = input.nodes.get(member.nodeI)!;
      const start = node.x * Math.cos(angle) + node.y * Math.sin(angle);
      for (const x of [0, a, a + h / 4, a + h / 2, a + 3 * h / 4, b, 2].filter(x => x >= start && x <= start + force.length)) {
        const t = (x - start) / force.length;
        const station = start + t * force.length;
        const expected = -1 + Math.max(0, Math.min(1, (station - a) / h));
        expect(evaluateDiagramAt(force, 'torsion', t)).toBeCloseTo(expected, 10);
        expect(compute_diagram_value_at_3d(JSON.stringify({ elementForces: force, kind: 'torsion', t }))).toBeCloseTo(expected, 10);
        for (const kind of ['shearY', 'shearZ', 'momentY', 'momentZ', 'axial'] as const) expect(evaluateDiagramAt(force, kind, t)).toBeCloseTo(0, 12);
      }
    }
    const tip = result.displacements.find((d: Displacement3D) => d.nodeId === j)!;
    expect(tip.rx * Math.cos(angle) + tip.ry * Math.sin(angle)).toBeCloseTo((a + h / 2) / 1000, 10);
    expect(tip.uz).toBeCloseTo(0, 12);
  }
});

for (const plane of [true, false]) it(`unsupported direct density refuses before native solve, plane=${plane}`, () => {
  const { elementId } = cantilever(), a = plane ? 2 - 0.5e-12 : 2;
  if (plane) modelStore.addLoadEntry({ type: 'distributed', data: { id: 1, elementId, a, b: 2, qI: 1, qJ: 1 } });
  else modelStore.addLoadEntry({ type: 'distributed3d', data: { id: 1, elementId, a, b: 2, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x: [1, 1, 1], y: [0, 0, 0], z: [0, 0, 0] } } });
  for (const build of plane ? [() => buildSolverInput2D(modelStore.model), () => buildSolverInput3D(modelStore.model)] : [() => buildSolverInput3D(modelStore.model)]) {
    let refused = false;
    try { build(); } catch (err) { refused = true; expect(loadRefusal(err)).toContain(String(elementId)); expect(loadRefusal(err)).toContain('relative geometry limit'); }
    expect(refused).toBe(true);
  }
});

for (const plane of [true, false]) for (const frame of ['local', 'global', 'projected'] as const) for (const end of ['i', 'j'] as const) for (const width of [0.5e-12, 1e-12, 1.5e-12, 0.5e-9]) it(`force native boundary plane=${plane} frame=${frame} end=${end} width=${width}`, () => {
  const { elementId } = cantilever();
  const a = end === 'i' ? 0 : 2 - width, b = end === 'i' ? width : 2, h = b - a;
  if (plane) modelStore.addLoadEntry({ type: 'distributed', data: { id: 1, elementId, a, b, qI: 1 / h, qJ: 1 / h } });
  else modelStore.addLoadEntry({ type: 'distributed3d', data: { id: 1, elementId, a, b, frame, qYI: 0, qYJ: 0, qZI: 1 / h, qZJ: 1 / h } });
  const builders = plane ? [() => buildSolverInput2D(modelStore.model), () => buildSolverInput3D(modelStore.model)] : [() => buildSolverInput3D(modelStore.model)];
  for (const build of builders) {
    if (h / 2 < 1e-10) expect(build).toThrow(/relative geometry limit/);
    else {
      const input = build()!;
      expect(input.loads.some(l => l.type === 'nodal')).toBe(false);
      expect(input.loads.filter(l => l.type === 'distributed').every(l => l.data.a === a && l.data.b === b)).toBe(true);
      expect(input.loads.filter(l => l.type === 'distributed').length).toBeGreaterThan(0);
    }
  }
});

for (const plane of [true, false]) it(`axial-only density also respects the member geometry limit, plane=${plane}`, () => {
  const { j, elementId } = cantilever(), h = 0.5e-12;
  if (plane) {
    modelStore.updateNode(j, 0, 2, 0);
    modelStore.addLoadEntry({ type: 'distributed', data: { id: 1, elementId, a: 0, b: h, qI: 1 / h, qJ: 1 / h, isGlobal: true } });
    expect(() => buildSolverInput2D(modelStore.model)).toThrow(/relative geometry limit/);
  } else {
    modelStore.addLoadEntry({ type: 'distributed3d', data: { id: 1, elementId, a: 0, b: h, qXI: 1 / h, qXJ: 1 / h, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0 } });
    expect(() => buildSolverInput3D(modelStore.model)).toThrow(/relative geometry limit/);
  }
});

it('plane synchronous, worker and combination solves return the localized span refusal', async () => {
  const { elementId } = cantilever();
  const support = [...modelStore.supports.values()][0]!;
  modelStore.updateSupport(support.id, { type: 'fixed' });
  modelStore.addLoadEntry({ type: 'distributed', data: { id: 1, elementId, a: 0, b: 0.5e-12, qI: 1, qJ: 1 } });
  const expected = `Element ${elementId}:`;
  expect(validateAndSolve2D(modelStore.model)).toContain(expected);
  expect(await validateAndSolve2DAsync(modelStore.model)).toContain(expected);
  expect(solveCombinations2D(modelStore.model, [{ id: 1, name: 'D', type: 'D' }], [{ id: 1, name: 'D', factors: [{ caseId: 1, factor: 1 }] }], false)).toContain(expected);
});

it('an ordinary eccentric floor gives each carrier its distributed torque and hand torsion', () => {
  const model = regionModel([rectangle(0, 0, 6, 4, 0)]);
  const floor = floorLoad({ nodes: model.nodes, beams: [...model.elements.values()].map(e => ({ ...e, type: 'frame' as const })), q: 1, distribution: 'oneWay', spanAxis: 'y', zone: { outer: rectangle(0, 0, 6, 1, 0).map(p => [p[0]!, p[1]!, p[2]!] as [number, number, number]) } });
  expect(floor.concentrated).toEqual([]);
  for (const carrier of [1, 3]) {
    const { elementId } = cantilever();
    modelStore.updateNode(2, 6, 0, 0);
    for (const load of floor.loads.filter(l => l.elementId === carrier)) modelStore.addLoadEntry({ type: 'distributed3d', data: { ...load, id: 0, elementId } });
    const input = buildSolverInput3D(modelStore.model)!;
    expect(buildSolverLoads3D(modelStore.model, modelStore.loads, false, false).every(l => l.type === 'distributed')).toBe(true);
    for (const result of [solve3D(input), solvePDelta3D(input, 100, 1e-10).results]) {
      const force = result.elementForces[0]!;
      const density = carrier === 1 ? -1 / 2 : 0;
      for (const t of [0, 0.25, 0.5, 0.75, 1]) expect(evaluateDiagramAt(force, 'torsion', t)).toBeCloseTo(-density * 6 * (1 - t), 10);
    }
  }
});
