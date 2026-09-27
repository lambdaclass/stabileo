/**
 * A tapered cantilever as prismatic segments, against the exact integral of its own taper, and
 * the bookkeeping: segments in order from end I, shared sections, one undo step.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import '../../../store/index';
import { initSolver } from '../../../engine/wasm-solver';
import { historyStore } from '../../../store/history.svelte';
import { taperMembers, taperPlan, validateTaper, DEFAULT_TAPER_SEGMENTS, type TaperSpec } from '../taper';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

const L = 8, P = 10;
const spec = (segments: number): TaperSpec => ({ hI: 0.8, hJ: 0.3, b: 0.2, tf: 0.012, tw: 0.008, segments });
/** Sharp-cornered welded I, the outline the segments are resolved from. */
const inertia = (s: TaperSpec, h: number) => (s.b * h ** 3) / 12 - ((s.b - s.tw) * (h - 2 * s.tf) ** 3) / 12;

/** δ = ∫ P (L−x)² / (E I(x)) dx, Simpson with a thousand intervals. */
function exactTip(s: TaperSpec, E: number) {
  const n = 1000, dx = L / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const x = i * dx, h = s.hI + (s.hJ - s.hI) * (x / L);
    const f = (P * (L - x) ** 2) / (E * inertia(s, h));
    sum += f * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
  }
  return (sum * dx) / 3;
}

function tip(segments: number) {
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  const rep = taperMembers([e], spec(segments));
  const tipNode = b;
  modelStore.addNodalLoad3D(tipNode, 0, 0, -P, 0, 0, 0);
  const r = modelStore.solve3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  const E = [...modelStore.materials.values()][0]!.e * 1000; // MPa → kPa, with kN and m
  return { rep, uz: -r.displacements.find((d) => d.nodeId === tipNode)!.uz, exact: exactTip(spec(segments), E) };
}

describe('tapered members', () => {
  it(`${DEFAULT_TAPER_SEGMENTS} segments reach the exact tip deflection within 0.5 %, and the error falls with n²`, () => {
    const err = (r: { uz: number; exact: number }) => Math.abs(r.uz - r.exact) / r.exact;
    expect(err(tip(DEFAULT_TAPER_SEGMENTS))).toBeLessThan(0.005);
    // Second order: halving the segment length quarters the error, to within a margin.
    const e6 = err(tip(6)), e12 = err(tip(12)), e24 = err(tip(24));
    expect(e6 / e12).toBeGreaterThan(3);
    expect(e12 / e24).toBeGreaterThan(3);
  });

  it('segments run from end I, each with its planned depth, and one undo step', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    const undo = historyStore.undoCount;
    const r = taperMembers([e], spec(4));
    expect(r.tapered).toHaveLength(4);
    expect(historyStore.undoCount).toBe(undo + 1);
    const hs = r.tapered.map((id) => modelStore.sections.get(modelStore.elements.get(id)!.sectionId)!.h!);
    const want = taperPlan(spec(4)).map((p) => p.h);
    hs.forEach((h, i) => expect(h).toBeCloseTo(want[i]!, 12));
    expect(hs[0]).toBeGreaterThan(hs[3]!);
    // A second member tapered alike reuses the four sections.
    const c = modelStore.addNode(0, 5, 0), d = modelStore.addNode(L, 5, 0);
    const again = taperMembers([modelStore.addElement(c, d, 'frame')], spec(4));
    expect(again.sections).toBe(0);
  });

  it('refuses what cannot be a welded I', () => {
    expect(validateTaper({ ...spec(1) })).toContain('segments');
    expect(validateTaper({ ...spec(4), hJ: 0.02 })).toContain('webTooShallow');
    expect(validateTaper({ ...spec(4), b: 0 })).toContain('dimensions');
  });
});

import { generateShed, DEFAULT_SHED_PARAMS } from '../../../engine/generators/shed';
import { emitModel, defaultProfileSpec, requiredRoles } from '../../../engine/generators/emit';
import { applyGeneratedModel } from '../../../store/generator-apply';
import { taperSupportedColumns } from '../taper';

describe('a shed with tapered columns', () => {
  it('every solid column is cut into segments, deepest at the head', () => {
    const topo = generateShed({ ...DEFAULT_SHED_PARAMS, columnKind: 'solid', frames: 2 })!;
    const profiles = Object.fromEntries(requiredRoles(topo).map((r) => [r, defaultProfileSpec(r === 'column' ? 'IPE 400' : 'L 50x50x5')]));
    applyGeneratedModel(emitModel(topo, { name: 'n', profiles: profiles as never }), { source: 'generator' as never, atIso: '2026-09-27T00:00:00Z', params: {} });
    const before = modelStore.elements.size;
    const r = taperSupportedColumns(0.3, 0.6, 6);
    expect(r.notI).toBe(0);
    const columns = r.tapered.length / 6;
    expect(columns).toBeGreaterThanOrEqual(4);
    expect(modelStore.elements.size).toBe(before + columns * 5);
    // Deepest segment is the one at the head.
    const depths = r.tapered.slice(0, 6).map((id) => modelStore.sections.get(modelStore.elements.get(id)!.sectionId)!.h!);
    const zOf = (id: number) => { const e = modelStore.elements.get(id)!; return (modelStore.nodes.get(e.nodeI)!.z! + modelStore.nodes.get(e.nodeJ)!.z!) / 2; };
    const top = r.tapered.slice(0, 6).reduce((a, b) => (zOf(a) > zOf(b) ? a : b));
    expect(modelStore.sections.get(modelStore.elements.get(top)!.sectionId)!.h).toBeCloseTo(Math.max(...depths), 12);
  });
});
