/**
 * The seismic design of the concrete frame, as the project holds it: the settings in the design
 * data, the members' roles, the inertia factors written onto the members (a model step, so the
 * solve is redone), the storeys' stiffness and the soft ones amplified in the design forces, and
 * the capacity-design checks of the last pass with the hoops and ties they ask for.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { verificationStore } from './verification.svelte';
import { activeCombinations } from './active-results';
import { designData, patchDesignData } from './design-data';
import { getReinforcement } from './rebar-edit';
import { classifyElement } from '../engine/codes/argentina/cirsoc201';
import { materialFamilyOf } from '../engine/steel/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import { storyDrifts } from '../engine/story-drift';
import { columnSectionOf } from '../engine/design/column-interaction';
import { seismicRoles } from '../engine/design/seismic/classify';
import { declareLateral, lateralResolver, setMemberLateral } from './lateral-system';
import { amplify, storeyOf, storeyStiffness, type StoreyStiffness } from '../engine/design/seismic/soft-storey';
import { beamSteel, seismicFrameChecks, type FrameMember, type SeismicReport } from '../engine/design/seismic/frame-checks';
import { hoopSpacingFor } from '../engine/design/seismic/capacity';
import { defaultSeismicDesign, type SeismicCategory, type SeismicDesignSettings, type SeismicRole, type SoftKind } from '../model/seismic-design';
import type { MemberContext } from '../engine/design/member-context';
import type { ProvidedReinforcement } from '../design-contract/reinforcement';

let report = $state<SeismicReport | null>(null);
/** The analysis and the demands the report was run on: a report of other forces is not this model's. */
let reportAt = { analysis: -1, demand: -1 };
export const seismicState = {
  /**
   * The last run's report, while the forces it read are still the model's: after a new analysis or
   * a new set of demands it describes other forces (or another model) and reads as absent, so no
   * member is held or listed by checks that were not run on it.
   */
  get report() {
    return report && reportAt.analysis === verificationStore.analysisRevision && reportAt.demand === verificationStore.demandRevision ? report : null;
  },
};

export const seismicSettings = (): SeismicDesignSettings => designData().seismic ?? defaultSeismicDesign();
export const patchSeismic = (p: Partial<SeismicDesignSettings>): void => patchDesignData({ seismic: { ...seismicSettings(), ...p } });

export const seismicCaseIds = (): Set<number> => new Set(modelStore.model.loadCases.filter((c) => c.type === 'E').map((c) => c.id));
export function seismicComboIds(): Set<number> {
  const e = seismicCaseIds();
  return new Set(activeCombinations().filter((c) => c.factors.some((f) => e.has(f.caseId) && f.factor !== 0)).map((c) => c.id));
}
export const isSeismicProject = (): boolean => seismicCaseIds().size > 0;

const P = (id: number) => modelStore.model.nodes.get(id);

/** Concrete frame members and what they are, without needing a design run. */
export function concreteFrame(): Map<number, 'beam' | 'column'> {
  const out = new Map<number, 'beam' | 'column'>();
  for (const e of modelStore.model.elements.values()) {
    const a = P(e.nodeI), b = P(e.nodeJ);
    if (!a || !b) continue;
    const fam = materialFamilyOf(modelStore.model.materials.get(e.materialId) as never, catalogueGradeFamily).family;
    if (fam !== 'concrete') continue;
    const k = classifyElement(a.x, a.y, a.z ?? 0, b.x, b.y, b.z ?? 0);
    if (k === 'beam' || k === 'column') out.set(e.id, k);
  }
  return out;
}

/** Nodes where a wall stands: the nodes of the shells that are vertical. */
function wallNodes(): Set<number> {
  const out = new Set<number>();
  for (const q of [...modelStore.quads.values(), ...modelStore.plates.values()] as Array<{ nodes: number[] }>) {
    const zs = q.nodes.map((n) => P(n)?.z ?? 0);
    if (Math.max(...zs) - Math.min(...zs) > 0.5) for (const n of q.nodes) out.add(n);
  }
  return out;
}

/**
 * The roles the geometry suggests (`seismic/classify.ts`): a suggestion for the person to adopt,
 * never read by a check.
 */
export function suggestedSeismicRoles(): Map<number, SeismicRole> {
  const kinds = concreteFrame();
  return seismicRoles({ nodes: modelStore.model.nodes as never, elements: modelStore.model.elements as never, kind: (id) => kinds.get(id) ?? 'other', wallNodes: wallNodes() });
}

/**
 * Each frame member's role as the checks read it, from the project's declaration
 * (`model/lateral-system.ts`): secondary only where declared outside the lateral system, primary
 * where declared part of it or not declared. `declared` holds the members with a declaration.
 */
export function seismicRoleReadings(): { roles: Map<number, SeismicRole>; declared: Set<number> } {
  const kinds = concreteFrame(), read = lateralResolver();
  const roles = new Map<number, SeismicRole>(), declared = new Set<number>();
  for (const [id, kind] of kinds) {
    const r = read(id, kind);
    roles.set(id, r.role === 'gravity' ? 'secondary' : 'primary');
    if (r.role !== 'undeclared') declared.add(id);
  }
  return { roles, declared };
}

export const modelSeismicRoles = (): Map<number, SeismicRole> => seismicRoleReadings().roles;

/**
 * Declare the role of members: primary is part of the lateral system, secondary is not
 * (`setMemberLateral`); null withdraws the declaration.
 */
export function setSeismicRole(ids: readonly number[], role: SeismicRole | null): void {
  setMemberLateral(ids, role === 'primary' ? 'lateral' : role === 'secondary' ? 'gravity' : null);
}

/** Declare members as the geometry suggests (`suggestedSeismicRoles`), at a person's request. One undo step. */
export function adoptSuggestedRoles(ids: readonly number[]): void {
  const s = suggestedSeismicRoles();
  declareLateral(ids.filter((id) => s.has(id)).map((id) => [id, s.get(id) === 'secondary' ? 'gravity' : 'lateral'] as const));
}

/** Write each member's inertia factor by category onto its stiffness modifiers. One model step. */
export function applyInertiaFactors(): number {
  const kinds = concreteFrame(), roles = modelSeismicRoles(), f = seismicSettings().inertia;
  let n = 0;
  modelStore.batch(() => {
    for (const [id, kind] of kinds) {
      const cat = `${roles.get(id) ?? 'primary'}${kind === 'beam' ? 'Beam' : 'Column'}` as SeismicCategory;
      const k = f[cat];
      modelStore.updateElement(id, { stiffness: { a: 1, iy: k, iz: k } });
      n++;
    }
  });
  return n;
}

/** The storeys' stiffness under the first seismic case, from its drifts and its loads. */
export function modelStoreyStiffness(): StoreyStiffness[] {
  for (const id of seismicCaseIds()) {
    const r = resultsStore.perCase3D.get(id);
    if (!r?.displacements?.length) continue;
    const loads = modelStore.model.loads.filter((l) => l.type === 'nodal3d' && (l.data as { caseId?: number }).caseId === id)
      .map((l) => { const d = l.data as { nodeId: number; fx: number; fy: number }; return { z: P(d.nodeId)?.z ?? 0, fx: d.fx, fy: d.fy }; });
    const stories = storyDrifts(modelStore.model.nodes as never, modelStore.model.elements.values(), r.displacements as never, { limit: 1 });
    return storeyStiffness(stories, loads);
  }
  return [];
}

/** Multiply the design forces of the members of the marked storeys, in the seismic combinations. */
export function applySoftStoreys(contexts: ReadonlyMap<number, MemberContext>): number {
  const s = seismicSettings().softStoreys;
  if (!s.levels.length) return 0;
  const combos = seismicComboIds();
  let n = 0;
  for (const ctx of contexts.values()) {
    const e = modelStore.model.elements.get(ctx.elementId);
    if (!e) continue;
    const top = Math.max(P(e.nodeI)?.z ?? 0, P(e.nodeJ)?.z ?? 0);
    if (storeyOf(s.levels, top) === null) continue;
    const kind: SoftKind = ctx.elementType === 'column' ? 'column' : ctx.elementType === 'wall' ? 'wall' : 'beam';
    if (amplify(ctx.stations, ctx.demands, combos, { moment: s.moment[kind], shear: s.shear[kind] })) n++;
  }
  return n;
}

/** The frame as the checks read it, from the design contexts and the bars in the model. */
function frameInput(): FrameMember[] {
  const { roles } = seismicRoleReadings(), combos = seismicComboIds();
  const cases = new Map(modelStore.model.loadCases.map((c) => [c.id, c.type]));
  const out: FrameMember[] = [];
  const quads = [...modelStore.quads.values()] as Array<{ nodes: number[]; thickness: number }>;
  const slabBase = designData().slabBase;
  for (const ctx of verificationStore.contexts.values()) {
    const e = modelStore.model.elements.get(ctx.elementId);
    // The design's own reading of the member (a span's, from its pieces), the one §9.7.3.8.2 read.
    const reading = ctx.lateral ?? lateralResolver()(ctx.elementId, ctx.elementType);
    const role: SeismicRole | undefined = roles.has(ctx.elementId) ? (reading.role === 'gravity' ? 'secondary' : 'primary') : undefined;
    if (!e || !role || ctx.elementType === 'wall') continue;
    // A span the analysis cut into pieces is one member, under its representative, from its
    // start node to its end node; its end shears are its end pieces' (`design-spans.ts`).
    const span = ctx.span;
    if (span && span.representative !== ctx.elementId) continue;
    const ends = span
      ? { i: span.elements[0]!, iAtJ: span.reversed[0]!, j: span.elements[span.elements.length - 1]!, jAtI: span.reversed[span.elements.length - 1]! }
      : { i: e.id, iAtJ: false, j: e.id, jAtI: false };
    const r = getReinforcement(e.id);
    const base: FrameMember = {
      id: e.id, kind: ctx.elementType, role, ...(reading.role === 'undeclared' ? { assumed: true } : {}), nodeI: span?.start ?? e.nodeI, nodeJ: span?.end ?? e.nodeJ, L: ctx.L,
      b: ctx.axes.bFlex || ctx.section.b, h: ctx.axes.hFlex || ctx.section.h, cover: ctx.material.cover, fc: ctx.material.fc, fy: ctx.material.fy,
      stirrupDia: ctx.material.stirrupDia, r,
    };
    if (ctx.elementType === 'beam') {
      // Gravity shear at the ends, 1,2D + L, from the cases.
      const vg: [number, number] = [0, 0];
      for (const [cid, res] of resultsStore.perCase3D) {
        const t = cases.get(cid), k = t === 'D' ? 1.2 : t === 'L' ? 1.0 : 0;
        const fi = k ? res.elementForces?.find((x) => x.elementId === ends.i) : undefined;
        const fj = k ? res.elementForces?.find((x) => x.elementId === ends.j) : undefined;
        if (!fi || !fj) continue;
        const at = (f: typeof fi, end: boolean) => (ctx.axes.shear === 'Vy' ? (end ? f.vyEnd : f.vyStart) : (end ? f.vzEnd : f.vzStart));
        vg[0] += k * at(fi, ends.iAtJ); vg[1] += k * at(fj, !ends.jAtI);
      }
      // The slab beside the beam: the shells sharing both nodes of its (first) element, each side a flange.
      const first = modelStore.model.elements.get(ends.i) ?? e;
      const sides = quads.filter((q) => q.nodes.includes(first.nodeI) && q.nodes.includes(first.nodeJ));
      const hf = sides[0]?.thickness ?? 0;
      const ln = Math.max(0.1, ctx.L - (ctx.criticalSections?.start.halfDepth ?? 0) - (ctx.criticalSections?.end.halfDepth ?? 0));
      const top = slabBase?.topX ?? slabBase?.topY;
      const perM = top ? (Math.PI * top.diameter ** 2 / 400) / top.spacing : 0.0009 * hf * 1e4; // cm²/m
      const slab = sides.length * Math.min(8 * hf, ln / 8) * perM;
      out.push({ ...base, faceHalf: [ctx.criticalSections?.start.halfDepth ?? 0, ctx.criticalSections?.end.halfDepth ?? 0], vg: [Math.abs(vg[0]), Math.abs(vg[1])], slabTop: [slab, slab] });
    } else {
      const ps: number[] = [], vs: number[] = [];
      for (const c of ctx.stations?.comboResults ?? []) {
        if (combos.size && !combos.has(c.comboId)) continue;
        for (const s of c.stations) { ps.push(-s.n); vs.push(Math.hypot(s.vy, s.vz)); }
      }
      const sec = columnSectionOf(ctx, r);
      out.push({ ...base, b: ctx.section.b, h: ctx.section.h, ...(sec ? { section: sec } : {}), axial: { min: ps.length ? Math.min(...ps) : 0, max: ps.length ? Math.max(...ps) : 0 }, vu: vs.length ? Math.max(...vs) : 0 });
    }
  }
  return out;
}

export function runSeismicChecks(): SeismicReport {
  const r = seismicFrameChecks({ nodes: modelStore.model.nodes as never, members: frameInput(), settings: seismicSettings() });
  report = r;
  reportAt = { analysis: verificationStore.analysisRevision, demand: verificationStore.demandRevision };
  return r;
}

const BAR_STEPS = [8, 10, 12];

/**
 * What the checks ask for, written onto the bars in one undo step: the beams' end hoops at the
 * spacing their capacity shear and §18.6.4 need, over 2h; the columns' end zones over lo at the
 * spacing confinement and shear need. Strong column and joints are not fixed here: they ask for
 * more column steel or a bigger section, which is the designer's call.
 */
export function applySeismicDetailing(): { beams: number; columns: number } {
  const rep = seismicState.report ?? runSeismicChecks();
  const writes = new Map<number, ProvidedReinforcement>();
  const ctxs = verificationStore.contexts;
  for (const m of rep.members) {
    if (m.ok || m.role !== 'primary') continue;
    const r0 = getReinforcement(m.id), ctx = ctxs.get(m.id);
    if (!r0 || !ctx) continue;
    const r: ProvidedReinforcement = JSON.parse(JSON.stringify(r0));
    if (m.kind === 'beam' && m.beam) {
      const cur = r.regions?.stirrupsSupport ?? r.stirrups ?? { diameter: 8, legs: 2, spacing: 0.2 };
      const st = beamSteel(r), d = (ctx.axes.hFlex || ctx.section.h) - ctx.material.cover - (cur.diameter + st.minDia / 2) / 1000;
      let pick: { diameter: number; spacing: number } | null = null;
      for (const dia of BAR_STEPS.filter((x) => x >= cur.diameter)) {
        const s = hoopSpacingFor(m.beam.ve, m.beam.vcZero, ctx.axes.bFlex || ctx.section.b, d, ctx.material.fc, ctx.material.fy, dia, cur.legs);
        if (s === null) continue;
        pick = { diameter: dia, spacing: Math.max(0.05, Math.min(m.beam.hoops.spacing, s, cur.spacing)) };
        pick.spacing = Math.floor(pick.spacing * 40 + 1e-9) / 40 || 0.05;
        break;
      }
      if (!pick) continue;
      r.regions = { ...(r.regions ?? {}), stirrupsSupport: { ...cur, ...pick }, regionT: Math.max(r.regions?.regionT ?? 0.25, Math.min(0.5, m.beam.hoops.length / ctx.L)) };
      writes.set(m.id, r);
    }
    if (m.kind === 'column' && m.confinement) {
      // The first tie, from the lightest up, whose spacing for so, Ash and the capacity shear is
      // at least 7,5 cm: the spacing scales Ash and Vs, the diameter and the legs scale both.
      const c = m.confinement, ties = r.stirrups ?? { diameter: 8, legs: 2, spacing: 0.2 };
      const sNow = r.tieZones?.endSpacing ?? ties.spacing, fy = ctx.material.fy;
      const area = (dia: number) => (Math.PI * dia * dia) / 400;
      const perS = Math.max(c.ashRequired.acrossB, c.ashRequired.acrossH) / sNow; // cm² of Ash per metre of spacing
      let pick: { diameter: number; legs: number; spacing: number } | null = null;
      for (const dia of BAR_STEPS.filter((x) => x >= ties.diameter)) for (const legs of [ties.legs, 3, 4].filter((l, k, a) => l >= ties.legs && a.indexOf(l) === k)) {
        if (pick) break;
        const d = Math.max(ctx.section.b, ctx.section.h) - ctx.material.cover - (dia + 16) / 1000;
        const vsNeed = m.shear ? m.shear.ve / 0.75 - (m.shear.vcZero ? 0 : 0.17 * Math.sqrt(ctx.material.fc) * Math.min(ctx.section.b, ctx.section.h) * d * 1000) : 0;
        const sShear = vsNeed > 0 ? (legs * area(dia) * 1e-4 * fy * 1000 * d) / vsNeed : Infinity;
        const sAsh = perS > 0 ? (legs * area(dia)) / perS : Infinity;
        const sp = Math.floor(Math.min(c.so, sAsh, sShear) * 40 + 1e-9) / 40;
        if (sp >= 0.075) pick = { diameter: dia, legs, spacing: sp };
      }
      if (!pick) continue;
      r.stirrups = { ...ties, diameter: pick.diameter, legs: pick.legs };
      r.tieZones = { endLength: Math.max(r.tieZones?.endLength ?? 0, c.lo), endSpacing: pick.spacing };
      writes.set(m.id, r);
    }
  }
  // A span's arrangement is held by every piece of it.
  if (writes.size) modelStore.reinforcementTransaction((api) => { for (const [id, r] of writes) for (const p of ctxs.get(id)?.span?.elements ?? [id]) api.setReinforcement(p, r); });
  runSeismicChecks();
  const beams = [...writes.keys()].filter((id) => ctxs.get(id)?.elementType === 'beam').length;
  return { beams, columns: writes.size - beams };
}
