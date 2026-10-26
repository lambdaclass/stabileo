/**
 * The project as the IFC export's input: members with their profiles, slabs and walls from the
 * physical groups (or, without them, from the shells by level and by plane), footings, the bars of
 * the detailing, the parts of the designed steel joints, and the design state of each element as
 * properties. Decisions stated once:
 *  · the concrete of a reinforced-concrete frame is the concrete as built (`ifc-physical.ts`):
 *    members cut at their joints, each joint in the body of the member it is attributed to, and
 *    slabs net of the frame, with the column's top against the slab as the project chose;
 *  · a slab that geometry does not cover (an inclined one) is the hull of its shells;
 *  · a wall is its base line swept up its height, at its shells' thickness;
 *  · a section the IFC profiles cannot name is written as the rectangle b × h, or as the square of
 *    its area when it has no b and h.
 */
import { slabColumnJointOf } from './analysis-validity-store';
import { modelStore } from './model.svelte';
import { detailingStore } from './detailing.svelte';
import { jointDesignStore } from './joint-design.svelte';
import { steelJoints } from './joint-typology';
import { physicalGroups, physicalThickness } from './physical';
import { memoriaInput } from './memoria-inputs';
import { projectVerdict, projectVerdictLines } from './member-verdict';
import { CAUTIOUS_FAMILIES, memoElementState } from '../report/memoria/types';
import { gridFromModel, sortedLevels } from '../model/grid';
import { columnShapeOf } from '../engine/design/shaped-column';
import { samplePath } from '../codes/cirsoc201/bar-geometry';
import { writeIfc, type IfcExportInput, type ProfileSpec, type V3 } from '../ifc/ifc-writer';
import { verificationStore } from './verification.svelte';
import type { SpanRef } from '../engine/design/design-spans';
import { memberOffsetAt } from '../engine/member-offsets';
import { projectPhysicalFrame } from './physical-frame';
import { ifcPhysicalBodies } from './ifc-physical';
import { designData } from './design-data';
import { provenanceLines } from '../export/provenance-attach';
import type { ResultProvenance } from '../provenance/result-provenance';

/** The `LateralSystem` property of a beam, by the reading its design used (`model/lateral-system.ts`). */
const IFC_LATERAL: Record<'lateral' | 'gravity' | 'undeclared', string> = {
  lateral: 'part of the lateral-force-resisting system (declared)',
  gravity: 'not part of the lateral-force-resisting system (declared)',
  undeclared: 'not declared: designed as part of the lateral-force-resisting system, fy developed at the face (CIRSOC 201-2025 9.7.3.8.2)',
};

/** The project verdict's reasons as the file states them (English, as every other property). */
const IFC_VERDICT: Record<string, string> = {
  'verdict.project.held.analysis': '{n} with the slab joined to the columns at one node (load split not established)',
  'verdict.project.held.detailing': '{n} with detailing conditions open',
  'verdict.project.held.deflection': '{n} with the deflection over the limit',
  'verdict.project.held.refused': '{n} refused by the design',
  'verdict.project.held.seismic': '{n} with seismic checks only as a substitute',
  'verdict.project.failing': '{n} failing their local checks',
  'verdict.project.provisional': '{n} carrying a provisional proposal',
  'verdict.project.stale': '{n} on an outdated baseline',
  'verdict.project.unchecked': '{n} not verified',
};

const TOL = 0.05;
type Tr = (key: string, params?: Record<string, string | number>) => string;

export function profileOfSection(s: { shape?: string; a: number; b?: number; h?: number; tw?: number; tf?: number; t?: number } | undefined): ProfileSpec {
  if (!s) return { kind: 'rect', b: 0.3, h: 0.3 };
  const sh = (s.shape ?? '').toUpperCase();
  const circle = columnShapeOf(s as never);
  if (circle?.kind === 'circle') return { kind: 'circle', r: circle.D / 2 };
  if ((sh === 'I' || sh === 'H') && s.b && s.h && s.tw && s.tf) return { kind: 'I', b: s.b, h: s.h, tw: s.tw, tf: s.tf };
  if (sh === 'CHS' && s.h && s.t) return { kind: 'hollowCircle', r: s.h / 2, t: s.t };
  if ((sh === 'RHS' || sh === 'SHS') && s.b && s.h && s.t) return { kind: 'hollowRect', b: s.b, h: s.h, t: s.t };
  if (sh === 'L' && s.b && s.h && (s.t ?? s.tw)) return { kind: 'L', b: s.b, h: s.h, t: (s.t ?? s.tw)! };
  if (s.b && s.h) return { kind: 'rect', b: s.b, h: s.h };
  const side = Math.sqrt(Math.max(s.a, 1e-6));
  return { kind: 'rect', b: side, h: side };
}

function hull(ps: readonly V3[]): V3[] {
  const s = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: V3, a: V3, b: V3) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: V3[] = [], hi: V3[] = [];
  for (const q of s) { while (lo.length >= 2 && cr(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 1e-12) lo.pop(); lo.push(q); }
  for (const q of [...s].reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2]!, hi[hi.length - 1]!, q) <= 1e-12) hi.pop(); hi.push(q); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}

export function projectIfcInput(tr: Tr, locale: string, projectName: string): IfcExportInput {
  const m = modelStore.model, nodes = m.nodes;
  const P = (id: number): V3 | null => { const n = nodes.get(id); return n ? [n.x, n.y, n.z ?? 0] : null; };
  const g = m.grid ?? gridFromModel(m.nodes.values(), m.elements.values());
  const storeys = sortedLevels(g).map((l) => ({ name: l.name, z: l.z }));
  if (!storeys.some((s) => Math.abs(s.z) < TOL)) storeys.unshift({ name: tr('ifc.export.ground'), z: 0 });

  // The design state of each element, read from the memoria's rows.
  const memo = memoriaInput(tr, locale);
  const state = new Map<number, { u: number | null; fail: boolean; family: string; open: boolean; heldBy: string[] }>();
  for (const e of memo.elements) {
    const id = Number(/^[esm](\d+)$/.exec(e.id)?.[1]);
    if (!Number.isFinite(id)) continue;
    const ratios = e.rows.map((r) => r.ratio).filter((x): x is number => x !== null && Number.isFinite(x));
    // The member's state (`memoElementState`): a row not evaluated, or a hold of the member's
    // verdict, is not a pass, whatever its local checks read.
    const st = memoElementState(e);
    state.set(id, { u: ratios.length ? Math.max(...ratios) : null, fail: st === 'fail', family: e.family, open: st === 'open', heldBy: e.heldBy ?? [] });
  }
  // Bars generated from an earlier model say so, on the assembly and on the members they belong to.
  const outdated = detailingStore.modelStale;
  const detailed = new Set(detailingStore.assemblies.flatMap((a) => a.elementIds));
  const propsOf = (id: number, section: string): Record<string, string | number> => {
    const s = state.get(id);
    // Steel is calculated, never stated as satisfying a code (`steel-never-verified`).
    const label = !s ? 'not designed'
      : CAUTIOUS_FAMILIES.has(s.family) ? (s.fail ? 'exceeds' : s.open ? 'not fully checked' : 'within limit')
        : s.fail ? 'fails' : s.open ? 'not fully verified' : 'satisfies';
    /*
     * A refused member says which refusal: a section a code bound rules out for every
     * reinforcement (with the bound and its numbers), or no arrangement among the implemented
     * ones verifying, which proves nothing about the section. «fails» alone read the same for both.
     */
    const o = verificationStore.outcomeFor(id);
    const refusal: Record<string, string> = o?.outcome === 'SECTION_INADEQUATE' && o.insufficiency
      ? { DesignOutcome: 'section inadequate', DesignReason: `${o.insufficiency.bound} §${o.insufficiency.clause}: ${o.insufficiency.demand} > ${o.insufficiency.capacity} ${o.insufficiency.unit}` }
      : o?.outcome === 'SEARCH_EXHAUSTED'
        ? { DesignOutcome: o.exhaustion?.scope === 'budget' ? 'search stopped by its budget, insufficiency not shown' : 'implemented alternatives exhausted, insufficiency not shown', DesignReason: `limiting: ${o.limiting.join(', ')}` }
        : {};
    return {
      // `Utilization` is the worst LOCAL check; `DesignState` the member's verdict, `HeldBy` what holds it.
      Section: section, ...(s?.u !== null && s?.u !== undefined ? { Utilization: Math.round(s.u * 1000) / 1000, UtilizationScope: 'worst local check of the section' } : {}), DesignState: label,
      ...(s?.heldBy.length ? { HeldBy: s.heldBy.join('; ') } : {}), ...refusal,
      ...(detailed.has(id) ? { DetailingState: outdated ? 'outdated: the model changed after the detailing' : 'current' } : {}),
      // A beam's role in the lateral system as its design read it (§9.7.3.8.2): an undeclared one
      // was designed as part of it, and the file says so.
      ...(verificationStore.contextFor(id)?.elementType === 'beam' ? { LateralSystem: IFC_LATERAL[verificationStore.contextFor(id)?.lateral?.role ?? 'undeclared'] } : {}),
      // A member on a floor whose slab is joined to the columns at one node: the split of the
      // slab's load between beams and columns its forces come from is not established.
      ...(slabColumnJointOf(id)?.verdict === 'pointJoint' ? { SlabColumnJoint: `one node, load split between beams and columns not established: ${tr(slabColumnJointOf(id)!.reasonKey!, slabColumnJointOf(id)!.params)}` } : {}),
    };
  };

  /*
   * A beam the slab mesh cut into pieces is one beam per span, as it was designed and detailed
   * (`design-spans.ts`): one IfcBeam from the span's first node to its last, not one per piece.
   */
  const bodies = ifcPhysicalBodies(projectPhysicalFrame(), designData().exchange?.ifcColumnTop ?? 'slabTop');
  const spanOf = new Map<number, SpanRef>();
  for (const c of verificationStore.contexts.values()) if (c.span) spanOf.set(c.elementId, c.span);
  const members: IfcExportInput['members'] = [];
  for (const e of m.elements.values()) {
    const sp = spanOf.get(e.id);
    if (sp && sp.representative !== e.id) continue;
    const na = P(sp ? sp.start : e.nodeI), nb = P(sp ? sp.end : e.nodeJ);
    if (!na || !nb) continue;
    // The solid on the member's axis, the nodes plus its declared insertion (`memberOffsetAt`), as
    // the analysis, the viewport and the bars place it: a top-flush beam exported on its nodes
    // stood half its depth above the bars it carries in the same file.
    const axisAt = (p: V3, nodeId: number): V3 => {
      const piece = sp ? sp.elements.map((id) => m.elements.get(id)).find((x) => !!x && (x.nodeI === nodeId || x.nodeJ === nodeId)) ?? e : e;
      const o = memberOffsetAt(piece, nodeId, nodes, m.sections);
      return [p[0] + o.x, p[1] + o.y, p[2] + o.z];
    };
    const a = axisAt(na, sp ? sp.start : e.nodeI), b = axisAt(nb, sp ? sp.end : e.nodeJ);
    const s = m.sections.get(e.sectionId);
    const vertical = Math.hypot(b[0] - a[0], b[1] - a[1]) < TOL, level = Math.abs(b[2] - a[2]) < TOL;
    // Cut at the joints where every piece of it was cut; the joints it owns in its body.
    const piece = sp ? sp.elements : [e.id];
    const segments = piece.map((id) => bodies.segment(id));
    const prisms = piece.flatMap((id) => bodies.prisms(id));
    members.push({
      ...(segments.every((g) => g) ? { segments: segments as Array<{ a: V3; b: V3 }> } : {}),
      ...(prisms.length ? { prisms } : {}),
      id: sp ? sp.key : String(e.id), kind: vertical ? 'column' : level ? 'beam' : 'member', name: sp?.label ?? (e.name || `${vertical ? 'C' : level ? 'V' : 'D'}${e.id}`),
      a, b, profile: profileOfSection(s), ...(s?.name ? { profileName: s.name } : {}),
      ...((e as { rollAngle?: number }).rollAngle ? { rollDeg: (e as { rollAngle?: number }).rollAngle } : {}),
      ...(m.materials.get(e.materialId)?.name ? { material: m.materials.get(e.materialId)!.name } : {}),
      props: propsOf(e.id, s?.name ?? '—'),
    });
  }

  // Slabs and walls: physical groups first, the shells left over by level (slabs) or plane (walls).
  const slabs: IfcExportInput['slabs'] = [], walls: IfcExportInput['walls'] = [];
  const used = new Set<string>();
  const shells = [...[...m.quads.values()].map((q) => ({ key: `q${q.id}`, nodes: [...q.nodes], t: q.thickness, mat: q.materialId })), ...[...m.plates.values()].map((q) => ({ key: `p${q.id}`, nodes: [...q.nodes], t: q.thickness, mat: q.materialId }))];
  const groups: Array<{ name: string; kind: 'slab' | 'wall'; keys: string[]; t?: number }> = [];
  for (const gr of physicalGroups()) {
    if (gr.physical.kind !== 'slab' && gr.physical.kind !== 'wall') continue;
    const keys = [...(gr.members.quads ?? []).map((q) => `q${q}`), ...(gr.members.plates ?? []).map((p) => `p${p}`)];
    keys.forEach((k) => used.add(k));
    groups.push({ name: gr.name, kind: gr.physical.kind === 'slab' ? 'slab' : 'wall', keys, t: physicalThickness(gr) ?? undefined });
  }
  const loose = new Map<string, { kind: 'slab' | 'wall'; keys: string[] }>();
  for (const sh of shells) {
    if (used.has(sh.key)) continue;
    const pts = sh.nodes.map(P).filter((p): p is V3 => !!p);
    const zs = pts.map((p) => p[2]), flat = Math.max(...zs) - Math.min(...zs) < TOL;
    let key: string;
    if (flat) key = `slab|${zs[0]!.toFixed(2)}`;
    else {
      const d = [pts[1]![0] - pts[0]![0], pts[1]![1] - pts[0]![1]], L = Math.hypot(d[0]!, d[1]!) || 1, nx = -d[1]! / L, ny = d[0]! / L;
      key = `wall|${Math.abs(nx).toFixed(2)}|${Math.abs(ny).toFixed(2)}|${(Math.abs(nx * pts[0]![0] + ny * pts[0]![1])).toFixed(2)}`;
    }
    const gr = loose.get(key) ?? { kind: flat ? 'slab' as const : 'wall' as const, keys: [] };
    gr.keys.push(sh.key); loose.set(key, gr);
  }
  let ns = 0, nw = 0;
  for (const gr of loose.values()) groups.push({ name: gr.kind === 'slab' ? `L${++ns}` : `T${++nw}`, ...gr });
  const shellBy = new Map(shells.map((s) => [s.key, s]));
  for (const gr of groups) {
    const ss = gr.keys.map((k) => shellBy.get(k)).filter((x): x is NonNullable<typeof x> => !!x);
    if (!ss.length) continue;
    const pts = ss.flatMap((s) => s.nodes.map(P)).filter((p): p is V3 => !!p);
    const t = gr.t ?? ss[0]!.t, material = m.materials.get(ss[0]!.mat)?.name;
    if (gr.kind === 'slab') {
      const z = pts.reduce((a, p) => a + p[2], 0) / pts.length;
      const net = gr.keys.map((k) => bodies.slab(k));
      slabs.push({
        id: `slab-${gr.name}`, name: gr.name, outline: hull(pts).map((p) => [p[0], p[1], z] as V3), thickness: t, ...(material ? { material } : {}),
        ...(net.every((x) => x) ? { prisms: net.flatMap((x) => x!) } : {}),
      });
    } else {
      const z0 = Math.min(...pts.map((p) => p[2])), z1 = Math.max(...pts.map((p) => p[2]));
      let a = pts[0]!, b = pts[0]!, d = -1;
      for (const p of pts) for (const q of pts) { const e = Math.hypot(p[0] - q[0], p[1] - q[1]); if (e > d) { d = e; a = p; b = q; } }
      walls.push({ id: `wall-${gr.name}`, name: gr.name, a: [a[0], a[1], z0], b: [b[0], b[1], z0], height: z1 - z0, thickness: t, ...(material ? { material } : {}) });
    }
  }

  const footings: IfcExportInput['footings'] = [...m.footings.values()].map((f, k) => {
    const n = nodes.get(f.nodeId);
    return { id: `footing-${f.id}`, name: `Z${k + 1}`, centre: [(n?.x ?? 0) + (f.eccentricityB ?? 0), (n?.y ?? 0) + (f.eccentricityL ?? 0), f.foundingElevation], B: f.B, L: f.L, thickness: f.thickness, rotDeg: f.rotationDeg ?? 0, material: tr('ifc.export.concrete') };
  });

  const bars: IfcExportInput['bars'] = detailingStore.assemblies.flatMap((a) => {
    const mark = new Map(a.marks.flatMap((mk) => mk.barIds.map((id) => [id, mk.mark] as const)));
    return a.bars.map((b) => ({
      id: `${a.id}:${b.id}`, mark: mark.get(b.id) ?? b.id, diameter: b.diameterMm / 1000, role: b.role === 'transverse' ? 'ligature' as const : 'main' as const,
      assembly: outdated ? `${a.id} (OUTDATED)` : a.id, length: b.cuttingLength, points: samplePath(b, 0.02).map((p) => [p.x, p.y, p.z] as V3),
    }));
  });

  const parts: IfcExportInput['parts'] = steelJoints().flatMap((j) => (jointDesignStore.designFor(j.nodeId, j.elementIds).typology?.parts ?? []).map((p, k) => ({
    id: `${j.nodeId}:${k}`, kind: p.kind, joint: `N${j.nodeId}`, center: [p.center.x, p.center.y, p.center.z] as V3, u: [p.u.x, p.u.y, p.u.z] as V3, v: [p.v.x, p.v.y, p.v.z] as V3, size: p.size, material: 'F-24',
  })));

  // The project's verdict over its concrete design members (`member-verdict.ts`), on the building:
  // no member's «satisfies» and no favourable local ratio reads as the project's approval.
  const pv = projectVerdict();
  const buildingProps: Record<string, string | number> = pv.state === 'empty' ? {} : {
    ProjectDesignState: pv.state === 'conforms' ? 'every concrete design member satisfies' : `not approved: ${pv.conforming} of ${pv.total} concrete design members satisfy`,
    ...(pv.state === 'held' ? { ProjectHeldBy: projectVerdictLines(pv, (k, p) => IFC_VERDICT[k]?.replace(/\{n\}/g, String(p?.n ?? '')) ?? k).reasons.join('; ') } : {}),
  };
  return { project: { name: projectName, time: new Date().toISOString().slice(0, 19), app: 'Stabileo' }, buildingProps, storeys, members, slabs, walls, footings, bars, parts };
}

/**
 * The IFC of the project. With the results' provenance (`export/provenance-attach.ts`), the building
 * carries it as properties, the status line (STALE or current) first, as every export of results
 * carries it: the members' utilizations and design states are read from those results.
 */
export function exportProjectIfc(tr: Tr, locale: string, projectName: string, provenance?: ResultProvenance): string {
  const input = projectIfcInput(tr, locale, projectName);
  if (provenance) {
    const lines = provenanceLines(provenance);
    input.buildingProps = { ...input.buildingProps, ...Object.fromEntries(lines.map(([k, v], i) => [`Provenance_${String(i + 1).padStart(2, '0')}_${k.replace(/[^\w]+/g, '_')}`, v])) };
  }
  return writeIfc(input);
}
