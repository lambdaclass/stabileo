/**
 * Editing a member of variable section keeps its taper where it is.
 *
 * Reverse and flip turn its ends round, so its two sections go with them. A cut gives each segment
 * the sections at its own ends, made of the ends' template, so the pieces blend as the whole did;
 * a member between two catalogue profiles, where no section of the family stands at the cut, is
 * left whole. A merge with it is refused: one member has one section at each end. And regenerating
 * a generated structure keeps a member whose end J the user changed.
 *
 * The model: a 6 m welded I cantilever, b = 200 mm, flanges 12 mm, web 8 mm, depth 600 → 300 mm,
 * 20 kN at the tip: 19,05 mm.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { toSectionFields } from '../../section/section-choice';
import { computeSectionProperties } from '../../data/section-shapes';
import { variableCutRefused, variableSectionPlan } from '../../section/variable';
import { mergeCollinear } from '../../model/edit/merge-collinear';
import { flipMembers } from '../../model/edit/flip-members';
import { splitAtNodes } from '../../model/edit/cut-members';
import { DEFAULT_TRUSS_PARAMS, generateTruss } from '../generators/truss-topology';
import { emitModel, defaultProfileSpec, type EmitOptions } from '../generators/emit';
import { weldedIPair } from '../generators/variable-pair';
import { insertGenerated, regenerate } from '../../store/generated-structures';
import { translation } from '../../model/edit/affine';
import { detach, fragmentOf } from '../../model/edit/fragment';
import { insertFragment } from '../../model/edit/transformed-copy';
import { generatedMetadata } from '../../model/edit/generated-metadata';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

const B = 0.2, TF = 0.012, TW = 0.008, L = 6, P = 20;
const weldedI = (h: number) => {
  const params = { h, b: B, tw: TW, tf: TF };
  return modelStore.addSection(toSectionFields({ kind: 'built', name: `I${h}`, shapeType: 'I-custom', params, props: computeSectionProperties('I-custom', params)!, rotationDeg: 0 }, 0) as never);
};
function cantilever() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  const sI = weldedI(0.6), sJ = weldedI(0.3);
  modelStore.updateElement(e, { sectionId: sI, variableSection: { sectionJ: sJ } } as never);
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addNodalLoad3D(b, 0, 0, -P, 0, 0, 0);
  return { a, b, e, sI, sJ };
}
const tip = (b: number) => {
  const r = modelStore.solve3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return -r.displacements.find((d) => d.nodeId === b)!.uz;
};
/** δ = ∫ P (L − x)² / (E I(x)) dx, Simpson with two thousand intervals. */
function exactTip() {
  const E = [...modelStore.materials.values()][0]!.e * 1000;
  const n = 2000, dx = L / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const x = i * dx, h = 0.6 - 0.3 * (x / L);
    sum += ((P * (L - x) ** 2) / (E * computeSectionProperties('I-custom', { h, b: B, tw: TW, tf: TF })!.iy)) * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
  }
  return (sum * dx) / 3;
}

describe('editing a member of variable section', () => {
  it('reversed, its two sections swap ends: the deep end stays at the support', () => {
    const { b, e, sI, sJ } = cantilever();
    const before = tip(b);
    expect(before).toBeCloseTo(0.01905, 5);
    modelStore.reverseElement(e);
    expect(modelStore.elements.get(e)).toMatchObject({ sectionId: sJ, variableSection: { sectionJ: sI } });
    expect(tip(b)).toBeCloseTo(before, 9);
  });

  it('flipped, the same', () => {
    const { b, e, sI, sJ } = cantilever();
    const before = tip(b);
    flipMembers([e]);
    expect(modelStore.elements.get(e)).toMatchObject({ sectionId: sJ, variableSection: { sectionJ: sI } });
    expect(tip(b)).toBeCloseTo(before, 9);
  });

  it('subdivided, each segment takes the welded I at its own ends, and the tip only gains the finer pieces', () => {
    const { b, e, sI, sJ } = cantilever();
    const before = tip(b);
    expect(modelStore.subdivideElement(e, 2)).toBe(true);
    const [first, second] = [...modelStore.elements.values()];
    const mid = first!.variableSection!.sectionJ;
    expect([first!.sectionId, mid, second!.sectionId, second!.variableSection!.sectionJ]).toEqual([sI, mid, mid, sJ]);
    // The section at the cut is the template at mid-depth, of which either half is a blend.
    expect(modelStore.sections.get(mid)!.built).toEqual({ shapeType: 'I-custom', params: { h: 0.45, b: B, tw: TW, tf: TF } });
    expect(variableSectionPlan(modelStore.sections.get(sI), modelStore.sections.get(mid)).ok).toBe(true);
    // Twenty-four pieces where there were twelve: nearer the integral, never further.
    const after = tip(b), exact = exactTip();
    expect(Math.abs(after - exact)).toBeLessThan(Math.abs(before - exact));
    expect(Math.abs(after - exact) / exact).toBeLessThan(0.001);
    // A second cut at the same place finds that section rather than making another.
    const sections = modelStore.sections.size;
    const c = cantilever();
    modelStore.splitElementAtPoint(c.e, 0.5);
    expect(modelStore.sections.size).toBe(sections + 2);
  });

  it('between two catalogue profiles there is no section of the family at a cut, and the member is left whole', () => {
    const named = (n: string) => modelStore.addSection({ name: n, a: 0.001, iz: 1e-6 } as never);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0), m = modelStore.addNode(L / 2, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElement(e, { sectionId: named('IPE 300'), variableSection: { sectionJ: named('IPE 600') } } as never);
    const snapshot = JSON.stringify(modelStore.elements.get(e));
    expect(variableCutRefused(modelStore.sections, modelStore.elements.get(e)!)).toBe(true);
    expect(modelStore.subdivideElement(e, 2)).toBe(false);
    expect(modelStore.splitElementAtPoint(e, 0.5)).toBeNull();
    expect(splitAtNodes([e], [m]).variableNotCut).toBe(1);
    expect([...modelStore.elements.keys()]).toEqual([e]);
    expect(JSON.stringify(modelStore.elements.get(e))).toBe(snapshot);
  });

  it('a truss is solved prismatic with end I\'s section, and is cut so: whatever its pair, into segments of that section', () => {
    const named = (n: string) => modelStore.addSection({ name: n, a: 0.001, iz: 1e-6 } as never);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    const catalogue = modelStore.addElement(a, b, 'truss');
    const s300 = named('IPE 300');
    modelStore.updateElement(catalogue, { sectionId: s300, variableSection: { sectionJ: named('IPE 600') } } as never);
    expect(variableCutRefused(modelStore.sections, modelStore.elements.get(catalogue)!)).toBe(false);
    expect(modelStore.subdivideElement(catalogue, 2)).toBe(true);
    for (const e of modelStore.elements.values()) expect([e.sectionId, e.variableSection]).toEqual([s300, undefined]);

    modelStore.clear();
    const c = modelStore.addNode(0, 0, 0), d = modelStore.addNode(L, 0, 0);
    const sI = weldedI(0.6), sJ = weldedI(0.3);
    const template = modelStore.addElement(c, d, 'truss');
    modelStore.updateElement(template, { sectionId: sI, variableSection: { sectionJ: sJ } } as never);
    const sections = modelStore.sections.size;
    expect(modelStore.subdivideElement(template, 2)).toBe(true);
    // No section at the cut: two segments of end I's, as the whole was solved, not two steps.
    expect(modelStore.sections.size).toBe(sections);
    for (const e of modelStore.elements.values()) expect([e.sectionId, e.variableSection]).toEqual([sI, undefined]);
  });

  it('merged with a prismatic neighbour, it is refused: one member would lose the taper', () => {
    const a = modelStore.addNode(0, 0, 0), m = modelStore.addNode(3, 0, 0), b = modelStore.addNode(6, 0, 0);
    const s1 = weldedI(0.6), s2 = weldedI(0.3);
    const e1 = modelStore.addElement(a, m, 'frame'), e2 = modelStore.addElement(m, b, 'frame');
    modelStore.updateElement(e1, { sectionId: s1 } as never);
    modelStore.updateElement(e2, { sectionId: s1, variableSection: { sectionJ: s2 } } as never);
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 0, 0, -P, 0, 0, 0);
    const before = tip(b);
    const report = mergeCollinear([e1, e2]);
    expect(report.merged).toEqual([]);
    expect(report.refused).toEqual({ variableSection: 1 });
    expect(tip(b)).toBeCloseTo(before, 9);
  });
});

describe('regenerating a structure of variable members', () => {
  const PROFILES: EmitOptions['profiles'] = {
    rafter: defaultProfileSpec('IPE 300'), column: defaultProfileSpec('HEB 200'), beam: defaultProfileSpec('IPE 200'),
    purlin: defaultProfileSpec('UPN 100'), chord: defaultProfileSpec('IPE 100'), post: defaultProfileSpec('L 50x50x5'),
    diagonal: defaultProfileSpec('L 50x50x5'), bracing: defaultProfileSpec('L 50x50x5'),
  };

  it('keeps a member whose end J the user changed, one made prismatic, and the pieces another was given', () => {
    const pair = weldedIPair(defaultProfileSpec('IPE 300'));
    const t = generateTruss({ ...DEFAULT_TRUSS_PARAMS, kind: 'rolledPortal', spanM: 12, riseM: 1, variableSection: true });
    const opts = { name: 'V', profiles: { ...PROFILES, rafter: pair.start }, variable: { rafter: pair.end } };
    const meta = { generator: 'truss', params: {}, profiles: {}, gradeId: null, name: 'V' };
    const roles = t.members.map((m) => m.role);
    const ins = insertGenerated(emitModel(t, opts), translation([0, 0, 0]), meta, roles);
    const [left, right] = [...modelStore.elements.values()].map((e) => e.id);
    const deeper = weldedI(0.9);
    modelStore.updateElement(left!, { variableSection: { sectionJ: deeper } } as never);
    modelStore.updateElement(right!, { variableSection: undefined } as never);
    const report = regenerate(ins.groupId, emitModel(t, opts), meta, roles)!;
    expect(report.keptSections).toBe(2);
    expect(modelStore.elements.get(left!)!.variableSection).toEqual({ sectionJ: deeper });
    expect(modelStore.elements.get(right!)!.variableSection).toBeUndefined();
    // Put back as generated, a regeneration takes it again; the pieces it is solved in stay the user's.
    const generated = modelStore.elements.get(right!)!.sectionId;
    modelStore.updateElement(left!, { variableSection: { sectionJ: generated, segments: 20 } } as never);
    const second = regenerate(ins.groupId, emitModel(t, opts), meta, roles)!;
    expect(second.keptSections).toBe(1);
    expect(modelStore.elements.get(left!)!.variableSection).toEqual({ sectionJ: generated, segments: 20 });
  });

  it('pasted into another project, regenerates as the generator\'s, and keeps the end J the user chose', () => {
    const pair = weldedIPair(defaultProfileSpec('IPE 300'));
    const t = generateTruss({ ...DEFAULT_TRUSS_PARAMS, kind: 'rolledPortal', spanM: 12, riseM: 1, variableSection: true });
    const opts = { name: 'V', profiles: { ...PROFILES, rafter: pair.start }, variable: { rafter: pair.end } };
    const meta = { generator: 'truss', params: {}, profiles: {}, gradeId: null, name: 'V' };
    const roles = t.members.map((m) => m.role);
    const ins = insertGenerated(emitModel(t, opts), translation([0, 0, 0]), meta, roles);
    const [left] = [...modelStore.elements.values()].filter((e) => e.variableSection).map((e) => e.id);
    // The user's end J: the generator's is then on no member, and only the record names it.
    modelStore.updateElement(left!, { variableSection: { sectionJ: weldedI(0.9) } } as never);
    const g = modelStore.model.groups.get(ins.groupId)!;
    const frag = detach(fragmentOf({ nodes: g.members.nodes ?? [], elements: g.members.elements ?? [] } as never));
    modelStore.clear();
    // Another project, whose sections take the ids the copied ones had.
    for (const h of [0.41, 0.42, 0.43, 0.44, 0.45, 0.46]) weldedI(h);
    const pasted = insertFragment(frag, [translation([0, 0, 0])]).groups[0]!;
    const record = generatedMetadata(modelStore.model.groups.get(pasted)!)!;
    for (const e of record.elements) if (e?.sectionJ !== undefined) expect(modelStore.sections.has(e.sectionJ)).toBe(true);
    const report = regenerate(pasted, emitModel(t, opts), meta, roles)!;
    // The member the user changed is kept, the other is the generator's still.
    expect(report.keptSections).toBe(1);
  });

  it('keeps a member the user flipped running the way the user left it, tapered the same way', () => {
    const pair = weldedIPair(defaultProfileSpec('IPE 300'));
    const t = generateTruss({ ...DEFAULT_TRUSS_PARAMS, kind: 'rolledPortal', spanM: 12, riseM: 1, variableSection: true });
    const opts = { name: 'V', profiles: { ...PROFILES, rafter: pair.start }, variable: { rafter: pair.end } };
    const meta = { generator: 'truss', params: {}, profiles: {}, gradeId: null, name: 'V' };
    const roles = t.members.map((m) => m.role);
    const ins = insertGenerated(emitModel(t, opts), translation([0, 0, 0]), meta, roles);
    const left = [...modelStore.elements.values()].find((e) => e.variableSection)!.id;
    flipMembers([left]);
    /** The section at each physical end, by the node there. */
    const ends = (id: number) => {
      const e = modelStore.elements.get(id)!;
      return { [e.nodeI]: e.sectionId, [e.nodeJ]: e.variableSection!.sectionJ };
    };
    const before = ends(left);
    const { nodeI, nodeJ } = modelStore.elements.get(left)!;
    regenerate(ins.groupId, emitModel(t, opts), meta, roles);
    const e = modelStore.elements.get(left)!;
    expect([e.nodeI, e.nodeJ]).toEqual([nodeI, nodeJ]);
    expect(ends(left)).toEqual(before);
    // Regenerated with another pair, a flipped member is still the generator's: it takes the new
    // pair, each section at the end it was at, and the member still runs the user's way. A flip is
    // not an edit; the same profiles above could not tell the two apart.
    const depth = (id: number) => Object.fromEntries(Object.entries(ends(id)).map(([n, s]) => [n, modelStore.sections.get(s)!.h!]));
    const deep = depth(left);
    const bigger = weldedIPair(defaultProfileSpec('IPE 400'));
    const opts2 = { ...opts, profiles: { ...PROFILES, rafter: bigger.start }, variable: { rafter: bigger.end } };
    const report = regenerate(ins.groupId, emitModel(t, opts2), meta, roles)!;
    expect(report.keptSections).toBe(0);
    const after = modelStore.elements.get(left)!;
    expect([after.nodeI, after.nodeJ]).toEqual([nodeI, nodeJ]);
    for (const [n, h] of Object.entries(depth(left))) expect(h / deep[n]!).toBeCloseTo(400 / 300, 2);
  });
});
