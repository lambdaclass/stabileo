/**
 * A generated solid-web beam, or a shed's solid columns, of variable section: the topology marks
 * which end grows, the emitter gives each member its two sections, and the members land in the
 * model as variable-section members that blend and solve.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import '../../../store/index';
import { initSolver } from '../../wasm-solver';
import { DEFAULT_TRUSS_PARAMS, generateTruss, type TrussParams } from '../truss-topology';
import { DEFAULT_SHED_PARAMS, generateShed } from '../shed';
import { emitModel, validateProfiles, defaultProfileSpec, variableRoles, type EmitOptions } from '../emit';
import { builtSpec, weldedIPair, variablePairProblem } from '../variable-pair';
import { insertGenerated, regenerate } from '../../../store/generated-structures';
import { translation } from '../../../model/edit/affine';
import { variableSectionPlan } from '../../../section/variable';

beforeAll(async () => { await initSolver(); });
beforeEach(() => modelStore.clear());

const SPAN = 12;
const beam = (over: Partial<TrussParams> = {}) =>
  generateTruss({ ...DEFAULT_TRUSS_PARAMS, kind: 'rolledPortal', spanM: SPAN, riseM: 1, ...over });
const PROFILES: EmitOptions['profiles'] = {
  rafter: defaultProfileSpec('IPE 300'), column: defaultProfileSpec('HEB 200'), beam: defaultProfileSpec('IPE 200'),
  purlin: defaultProfileSpec('UPN 100'), chord: defaultProfileSpec('IPE 100'), post: defaultProfileSpec('L 50x50x5'),
  diagonal: defaultProfileSpec('L 50x50x5'), bracing: defaultProfileSpec('L 50x50x5'),
};
const pair = weldedIPair(defaultProfileSpec('IPE 300'));

describe('generated members of variable section', () => {
  it('a beam grows from each support toward mid-span; a monopitch one gets a node at mid-span for it', () => {
    const t = beam({ variableSection: true });
    expect(t.members.map((m) => m.variableEnd)).toEqual(['b', 'a']);
    expect(t.nodes[t.members[0]!.b]!.x).toBeCloseTo(SPAN / 2, 9);
    const half = beam({ variableSection: true, halfTruss: true, riseM: 1 });
    expect(half.nodes).toHaveLength(3);
    expect(half.nodes[1]).toMatchObject({ x: SPAN / 2, z: 0.5 });
    expect(half.members.map((m) => m.variableEnd)).toEqual(['b', 'a']);
    // Off, the topology is what it always was.
    expect(beam({ halfTruss: true }).nodes).toHaveLength(2);
    expect(beam().members.every((m) => m.variableEnd === undefined)).toBe(true);
  });

  it('the welded I pair keeps the profile\'s plates and doubles the depth', () => {
    expect(pair.start.built).toEqual({ shapeType: 'I-custom', params: { h: 0.3, b: 0.15, tw: 0.0071, tf: 0.0107 } });
    expect(pair.end.built!.params).toEqual({ ...pair.start.built!.params, h: 0.6 });
    expect(pair.end.profileName).toBe('I 600x150x7.1x10.7');
  });

  it('a varying role needs a second section that can blend with the first', () => {
    const t = beam({ variableSection: true });
    expect(variableRoles(t)).toEqual(['rafter']);
    const keys = (v: EmitOptions['variable'], p = PROFILES) => validateProfiles(t, p, v).map((x) => x.key);
    expect(keys({})).toEqual(['generator.problem.variableMissing']);
    expect(keys({ rafter: defaultProfileSpec('IPE 300') })).toEqual(['generator.problem.variableSame']);
    expect(keys({ rafter: defaultProfileSpec('HEB 300') })).toEqual(['generator.problem.variableMakeUp']);
    expect(keys({ rafter: pair.end })).toEqual(['generator.problem.variableMakeUp']);
    expect(keys({ rafter: defaultProfileSpec('IPE 600') })).toEqual([]);
    expect(keys({ rafter: pair.end }, { ...PROFILES, rafter: pair.start })).toEqual([]);
    expect(variablePairProblem(pair.start, builtSpec('I-custom', { h: 0.6, b: 0.15, tw: 0.01, tf: 0.5 }))).toBeNull();
    expect(keys({ rafter: builtSpec('I-custom', { h: 0.6, b: 0.15, tw: 0.01, tf: 0.5 }) }, { ...PROFILES, rafter: pair.start }))
      .toEqual(['generator.problem.builtInvalid']);
  });

  it('each half takes the support section at its support end and the mid-span one at the other', () => {
    const g = emitModel(beam({ variableSection: true }), { name: 'V', profiles: { ...PROFILES, rafter: pair.start }, variable: { rafter: pair.end } });
    const byId = new Map(g.json.sections.map((s) => [s.id, s.name]));
    const [e1, e2] = g.json.elements;
    expect([byId.get(e1!.sectionId), byId.get(e1!.variableSection!.sectionJ)]).toEqual([pair.start.profileName, pair.end.profileName]);
    expect([byId.get(e2!.sectionId), byId.get(e2!.variableSection!.sectionJ)]).toEqual([pair.end.profileName, pair.start.profileName]);
    expect(g.assumptions).toContain('generator.assume.variableRafter');
  });

  it('inserted, the beam blends welded I to welded I and solves stiffer than its shallow end alone', () => {
    const g = emitModel(beam({ variableSection: true }), { name: 'V', profiles: { ...PROFILES, rafter: pair.start }, variable: { rafter: pair.end } });
    insertGenerated(g, translation([0, 0, 0]), { generator: 'truss', params: {}, profiles: {}, gradeId: null, name: 'V' });
    const els = [...modelStore.elements.values()];
    expect(els.every((e) => e.variableSection)).toBe(true);
    const plan = variableSectionPlan(modelStore.sections.get(els[0]!.sectionId), modelStore.sections.get(els[0]!.variableSection!.sectionJ));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.at(0.5).h!).toBeCloseTo(0.45, 6);
    // The flanges stay: the area grows by the web alone.
    expect(plan.at(1).a - plan.at(0).a).toBeCloseTo(0.3 * 0.0071, 6);

    const mid = [...modelStore.nodes.values()].find((n) => Math.abs(n.x - SPAN / 2) < 1e-9)!;
    modelStore.addNodalLoad3D(mid.id, 0, 0, -50, 0, 0, 0);
    const uz = () => {
      const r = modelStore.solve3D(false, false, true);
      if (!r || typeof r === 'string') throw new Error(String(r));
      return -r.displacements.find((d) => d.nodeId === mid.id)!.uz;
    };
    const variable = uz();
    for (const e of els) modelStore.updateElement(e.id, { sectionId: modelStore.elements.get(els[0]!.id)!.sectionId, variableSection: undefined } as never);
    expect(variable).toBeGreaterThan(0);
    expect(uz()).toBeGreaterThan(variable * 2);
  });

  it('a shed\'s solid columns grow from the base to the head, and regenerating keeps both sections', () => {
    const params = { ...DEFAULT_SHED_PARAMS, frames: 2, columnKind: 'solid' as const, variableColumns: true, truss: { ...DEFAULT_SHED_PARAMS.truss, kind: 'rolledPortal' as const, variableSection: true } };
    const t = generateShed(params);
    const columns = t.members.filter((m) => m.role === 'column');
    expect(columns.length).toBe(4);
    expect(columns.every((m) => m.variableEnd === 'b' && t.nodes[m.b]!.z > t.nodes[m.a]!.z)).toBe(true);
    expect(variableRoles(t)).toEqual(expect.arrayContaining(['rafter', 'column']));
    const col = weldedIPair(defaultProfileSpec('HEB 200'), 1.5);
    const opts = { name: 'N', profiles: { ...PROFILES, rafter: pair.start, column: col.start }, variable: { rafter: pair.end, column: col.end } };
    const meta = { generator: 'shed', params: {}, profiles: {}, gradeId: null, name: 'N' };
    const ins = insertGenerated(emitModel(t, opts), translation([0, 0, 0]), meta, t.members.map((m) => m.role));
    const sections = modelStore.sections.size;
    const named = () => [...modelStore.elements.values()].filter((e) => e.variableSection)
      .map((e) => `${modelStore.sections.get(e.sectionId)!.name}>${modelStore.sections.get(e.variableSection!.sectionJ)!.name}`).sort();
    const before = named();
    expect(before).toContain(`${col.start.profileName}>${col.end.profileName}`);
    regenerate(ins.groupId, emitModel(t, opts), meta, t.members.map((m) => m.role));
    expect(modelStore.sections.size).toBe(sections);
    expect(named()).toEqual(before);
  });
});
