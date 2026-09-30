import { beforeAll, beforeEach, expect, it } from 'vitest';
import { modelStore } from '../../store';
import { initSolver } from '../../engine/wasm-solver';
import { buildSolverInput2D, buildSolverInput3D, validateAndSolve3D } from '../../engine/solver-service';
import { staticsCheck } from '../../engine/statics-check';
import { analyzeDrawn } from '../drawn-properties';
import { catalogueOutline } from '../canonical';
import { starterParts } from '../drawn-starters';
import { toSectionFields } from '../section-choice';
import { createSectionWeight } from '../weight';
import type { DrawnSection } from '../drawn';

beforeAll(async () => { await initSolver(); });
beforeEach(() => modelStore.clear());

function filledColumn(mode: '2d' | '3d') {
  const steel = modelStore.materials.values().next().value!;
  const concrete = modelStore.addMaterial({ name: 'Concrete', e: 27000, nu: .2, rho: 24 });
  const n = 27000 / steel.e;
  const drawn: DrawnSection = {
    version: 1, refMaterialId: steel.id,
    parts: starterParts('filledTube', catalogueOutline).map(p => p.id === 2
      ? { ...p, materialId: concrete, ratio: { e: n, g: n } } : p),
  };
  const p = analyzeDrawn(drawn, catalogueOutline).properties!;
  const section = modelStore.addSection(toSectionFields({
    kind: 'drawn', name: 'Filled tube', drawn,
    props: { a: p.a, iy: p.iy, iz: p.iz, j: p.j, b: p.bbox[2] - p.bbox[0], h: p.bbox[3] - p.bbox[1] },
  }, 0)! as Parameters<typeof modelStore.addSection>[0]);
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(0, mode === '2d' ? 4 : 0, mode === '3d' ? 4 : 0);
  const member = modelStore.addElement(a, b, 'frame');
  modelStore.updateElementSection(member, section);
  modelStore.addSupport(a, mode === '3d' ? 'fixed3d' : 'fixed');
  const d = .2191, t = .0063;
  const steelA = Math.PI / 4 * (d ** 2 - (d - 2 * t) ** 2);
  const coreA = Math.PI / 4 * (d - 2 * t) ** 2;
  return { section, concrete, p, expected: 4 * (steel.rho * steelA + 24 * coreA), coreA };
}

it.each(['2d', '3d'] as const)('uses physical constituent weights in %s while retaining transformed stiffness', (mode) => {
  const { section, p, expected } = filledColumn(mode);
  const m = modelStore.model;
  const input = mode === '2d' ? buildSolverInput2D(m, true)! : buildSolverInput3D(m, true)!;
  const weight = input.loads.reduce((sum, l) => sum + (l.type === 'nodal' ? -l.data.fz : 0), 0);
  // Circular parts have 64 sides; the polygon area is within 0.2% of the exact circle.
  expect(Math.abs(weight / expected - 1)).toBeLessThan(.002);
  expect(input.sections.get(section)!.a).toBeCloseTo(p.a, 12);
});

it('balances composite self-weight against solved reactions and reads density edits', () => {
  const { concrete, expected, coreA } = filledColumn('3d');
  const m = modelStore.model;
  const result = validateAndSolve3D(m, true);
  if (!result || typeof result === 'string') throw Error(String(result));
  const reaction = result.reactions.reduce((s, r) => s + r.fz, 0);
  expect(Math.abs(reaction / expected - 1)).toBeLessThan(.002);
  const rows = staticsCheck({ model: m, includeSelfWeight: true, reactionsByCase: new Map([[null, result.reactions]]) });
  expect(rows[0]!.worstRelative).toBeLessThan(1e-9);
  modelStore.updateMaterial(concrete, { rho: 30 });
  const input = buildSolverInput3D(modelStore.model, true)!;
  const weight = input.loads.reduce((s, l) => s + (l.type === 'nodal' ? -l.data.fz : 0), 0);
  expect(Math.abs((weight - reaction) / (4 * 6 * coreA) - 1)).toBeLessThan(.002);
});

it('unions same-material overlaps and subtracts holes before computing weight', () => {
  const drawn: DrawnSection = { version: 1, parts: [
    { id: 1, shape: { kind: 'rect', b: .2, h: .2 }, at: [0, 0], rotationDeg: 0 },
    { id: 2, shape: { kind: 'rect', b: .2, h: .2 }, at: [.1, 0], rotationDeg: 0 },
    { id: 3, shape: { kind: 'rect', b: .1, h: .1 }, at: [0, 0], rotationDeg: 0, void: true },
  ] };
  expect(createSectionWeight(new Map([[1, { rho: 78.5 }]]))({ a: 999, drawn }, 1))
    .toBeCloseTo((.3 * .2 - .1 * .1) * 78.5, 12);
});

it('uses the stated reference density and refuses missing constituent materials', () => {
  const drawn: DrawnSection = { version: 1, refMaterialId: 2, parts: [
    { id: 1, shape: { kind: 'rect', b: .2, h: .2 }, at: [0, 0], rotationDeg: 0 },
  ] };
  const section = { a: .04, drawn };
  expect(createSectionWeight(new Map([[1, { rho: 78.5 }], [2, { rho: 24 }]]))(section, 1)).toBeCloseTo(.04 * 24);
  expect(() => createSectionWeight(new Map([[1, { rho: 78.5 }]]))(section, 1)).toThrow(/material 2/);
});
