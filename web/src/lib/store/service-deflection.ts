/**
 * The service deflection of each member: relative to its chord, under service loads.
 *
 * Two things were wrong with the number the deflection check read, and both are settled here:
 *
 *   · WHAT is measured. It is the member's bending — the distance from the displaced curve to
 *     the chord of its displaced ends (`engine/member-deflection.ts`) — not a node's absolute
 *     displacement, and not an estimate from the moment.
 *   · UNDER WHICH LOADS. The project's service envelopes when it states any
 *     (`engine/result-scopes.ts`): the largest over their combinations. Without one, every load
 *     case at factor 1 — the unfactored solve — which is what "service" meant before, stated.
 *     Without that either, the active combinations, which are factored: the deflection is then
 *     conservative and the basis says so.
 *
 * Member offsets: the curve is taken between the nodes. With rigid offsets the flexible part is
 * shorter than the node-to-node length and its ends move with the offsets' rotation; the chord
 * deflection read here is then an approximation of that part's own.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { uiStore } from './ui.svelte';
import { activePerCombo3D } from './active-results';
import { memberLocalCurve, chordDeflection, eiOf, type ChordDeflection, type LocalCurve } from '../engine/member-deflection';
import { deflectionSpans, type Span, type SpanModel } from '../engine/deflection-spans';
import { constraintNodes } from '../engine/steel/unbraced-length';
import { shouldEmbedFlat2DModelIn3D } from '../engine/solver-service';
import { projectNodeToScene } from '../geometry/coordinate-system';
import type { AnalysisResults3D, Displacement3D, ElementForces3D } from '../engine/types-3d';

export type DeflectionBasis = 'service' | 'unfactored' | 'factored' | 'shown';

export interface ServiceSets { basis: DeflectionBasis; names: string[]; sets: Array<{ id: number; name: string; results: AnalysisResults3D }> }

/** The result sets the deflection check reads, and on what basis. */
export function serviceSets(): ServiceSets {
  const envs = (modelStore.resultScopes?.envelopes ?? []).filter((e) => e.purpose === 'service');
  const comboName = new Map(modelStore.combinations.map((c) => [c.id, c.name]));
  if (envs.length > 0) {
    const ids = [...new Set(envs.flatMap((e) => e.comboIds))];
    const sets = ids.flatMap((id) => {
      const r = resultsStore.perCombo3D.get(id);
      return r ? [{ id, name: comboName.get(id) ?? String(id), results: r }] : [];
    });
    if (sets.length > 0) return { basis: 'service', names: envs.map((e) => e.name), sets };
  }
  if (resultsStore.singleResults3D) return { basis: 'unfactored', names: [], sets: [{ id: 0, name: '', results: resultsStore.singleResults3D }] };
  const active = activePerCombo3D();
  if (active.size > 0) return { basis: 'factored', names: [], sets: [...active].map(([id, results]) => ({ id, name: comboName.get(id) ?? String(id), results })) };
  const shown = resultsStore.results3D;
  return { basis: 'shown', names: [], sets: shown ? [{ id: 0, name: '', results: shown }] : [] };
}

export type MemberDeflection = ChordDeflection & {
  setName: string;
  /** The span measured: its elements in order, one for a member drawn as one element. */
  span: number[];
};

/** Samples per span; each element gets its share by length, and never fewer than 8. */
const SPAN_SAMPLES = 40;

/**
 * Each member's largest deflection relative to the chord of its span, over the result sets, and
 * the set that produced it.
 *
 * The span is the physical member (`engine/deflection-spans.ts`): the elements of a beam that was
 * cut — by the mesher under a slab, by a split, by a point load — are measured as one curve from
 * the chord of the span's ends, and every element of the span maps to that one result.
 */
export function serviceDeflections(elementIds: Iterable<number>, sets: ServiceSets['sets']): Map<number, MemberDeflection> {
  const out = new Map<number, MemberDeflection>();
  // The solver's own frame: a flat model is solved embedded in XZ, and its displacements are too.
  const embed = shouldEmbedFlat2DModelIn3D(modelStore.model);
  const leftHand = uiStore.axisConvention3D === 'leftHand';
  const spans = deflectionSpans(spanModel(embed));
  const indexed = sets.map((s) => ({
    name: s.name,
    disp: new Map(s.results.displacements.map((d) => [d.nodeId, d])),
    forces: new Map(s.results.elementForces.map((f) => [f.elementId, f])),
  }));
  const done = new Set<Span>();
  for (const elementId of elementIds) {
    const span = spans.get(elementId);
    if (!span || done.has(span)) continue;
    done.add(span);
    const parts = span.elements.map((id) => memberGeometry(id, embed)).filter((g): g is NonNullable<typeof g> => !!g);
    if (parts.length !== span.elements.length) continue;
    let best: MemberDeflection | null = null;
    for (const s of indexed) {
      const curve = spanCurve(span, parts, s, leftHand);
      if (!curve) continue;
      const d = chordDeflection(curve);
      if (!best || d.max > best.max) best = { ...d, setName: s.name, span: span.elements };
    }
    if (best) for (const id of span.elements) out.set(id, best);
  }
  return out;
}

function spanModel(embed: boolean): SpanModel {
  const nodes = new Map<number, { x: number; y: number; z: number }>();
  for (const [id, n] of modelStore.nodes) nodes.set(id, projectNodeToScene(n, embed));
  return {
    nodes,
    elements: modelStore.elements,
    supports: modelStore.supports,
    connectors: modelStore.model.connectors,
    constraintNodes: constraintNodes(modelStore.model.constraints),
  };
}

function memberGeometry(id: number, embed: boolean) {
  const elem = modelStore.elements.get(id);
  if (!elem) return null;
  const nI = modelStore.nodes.get(elem.nodeI), nJ = modelStore.nodes.get(elem.nodeJ);
  if (!nI || !nJ) return null;
  const localY = elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined
    ? { x: elem.localYx, y: elem.localYy, z: elem.localYz } : undefined;
  return {
    elem,
    pI: projectNodeToScene(nI, embed), pJ: projectNodeToScene(nJ, embed),
    ei: eiOf(modelStore.materials.get(elem.materialId), modelStore.sections.get(elem.sectionId)),
    localY,
    roll: (elem.rollAngle ?? 0) + (modelStore.sections.get(elem.sectionId)?.rotation ?? 0),
  };
}

/**
 * The span's displaced curve in the local axes of its first element: each element's own curve,
 * turned to global, laid end to end in the span's direction, and read back in those axes.
 */
function spanCurve(
  span: Span,
  parts: NonNullable<ReturnType<typeof memberGeometry>>[],
  set: { disp: Map<number, Displacement3D>; forces: Map<number, ElementForces3D> },
  leftHand: boolean,
): LocalCurve | null {
  let axes: LocalCurve | null = null;
  const xi: number[] = [], u: number[] = [], v: number[] = [], w: number[] = [];
  let s0 = 0;
  for (let k = 0; k < parts.length; k++) {
    const g = parts[k]!;
    const dI = set.disp.get(g.elem.nodeI), dJ = set.disp.get(g.elem.nodeJ), ef = set.forces.get(g.elem.id);
    if (!dI || !dJ || !ef) return null;
    const segments = parts.length === 1 ? SPAN_SAMPLES : Math.max(8, Math.round(SPAN_SAMPLES * (Math.hypot(g.pJ.x - g.pI.x, g.pJ.y - g.pI.y, g.pJ.z - g.pI.z) / span.length)));
    const c = memberLocalCurve(g.pI, g.pJ, dI, dJ, ef, g.ei, g.localY, g.roll, leftHand, segments);
    if (!c) return null;
    if (!axes) axes = c;
    const rev = span.reversed[k]!;
    for (let i = 0; i <= segments; i++) {
      const j = rev ? segments - i : i;
      if (k > 0 && i === 0) continue; // the shared node, already sampled by the previous element
      const gx = c.ex[0]! * c.u[j]! + c.ey[0]! * c.v[j]! + c.ez[0]! * c.w[j]!;
      const gy = c.ex[1]! * c.u[j]! + c.ey[1]! * c.v[j]! + c.ez[1]! * c.w[j]!;
      const gz = c.ex[2]! * c.u[j]! + c.ey[2]! * c.v[j]! + c.ez[2]! * c.w[j]!;
      xi.push((s0 + (rev ? 1 - c.xi[j]! : c.xi[j]!) * c.L) / span.length);
      u.push(gx * axes.ex[0]! + gy * axes.ex[1]! + gz * axes.ex[2]!);
      v.push(gx * axes.ey[0]! + gy * axes.ey[1]! + gz * axes.ey[2]!);
      w.push(gx * axes.ez[0]! + gy * axes.ez[1]! + gz * axes.ez[2]!);
    }
    s0 += c.L;
  }
  if (!axes) return null;
  // The first element's axes may run against the span; x is measured from the span's start.
  return { L: span.length, ex: axes.ex, ey: axes.ey, ez: axes.ez, xi, u, v, w };
}
