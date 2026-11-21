import { tp } from '../../i18n';
import { CompleteDemandSet, type ScopedDemand } from '../complete-demand-set';
import { completeMemberDemands } from '../member-demand-gate';
import { ConcurrentDemand } from '../concurrent-demand';
/**
 * The span a beam is designed as: from support to support, whatever the analysis cut it into.
 *
 * ── Why the element is not the member here ─────────────────────────
 *
 * A slab meshed into its bay cuts every beam around it at the mesh's edge nodes, so the slab and
 * the beams share them (`build-on-grid.ts` `placeSlabs`). The analysis needs those nodes; the
 * beam does not have them. Designed element by element, a 6 m beam under a 1 m mesh was six 1 m
 * beams: each read its two mesh nodes as supports (`computeBeamCriticalSections` found no column
 * there and fell back to a 0,15 m support region), put hogging regions at both, and asked its
 * bottom bars to anchor into 0,15 m. No arrangement can — ld is 0,37 m for a Ø10 in H-30 — so
 * every candidate failed and the whole floor came back «change the section».
 *
 * ── What a span is ─────────────────────────────────────────────────
 *
 * `deflectionSpans` already answers where a level member is held up: it passes through a node
 * where the member continues straight into one other element and nothing there bears on it (a
 * shell does not), and stops at a support, a constraint, a connector or a column. That reading is
 * the serviceability's, and the design takes the same one rather than a second: a span here is a
 * deflection span of two or more beam elements of one section and material, cut where the
 * physical member changes. A beam that is one element is not a span and keeps its own context.
 *
 * ── Keeping the analysis' pieces ───────────────────────────────────
 *
 * Every piece keeps its own id, its own row and its own outcome, and every piece's context IS the
 * span's: its length, its stations laid along the span (each piece's stations at its offset, in
 * the span's local axes), its demands, its critical sections from the span's end nodes. The
 * `span` reference says which piece of which span it is.
 *
 * Pure: no store access.
 */
import { deflectionSpans, type SpanModel } from '../deflection-spans';
import { computeLocalAxes3D, memberRoll, type LocalAxes3D } from '../local-axes-3d';
import {
  computeBeamCriticalSections, extractGoverningDemands,
  type ElementStationResult, type StationForces,
} from '../station-design-forces';
import { resolveDesignAxes } from './design-axes';
import { declaredContextMembers, type ContextModelData, type MemberContext } from './member-context';
import type { LimitingConstraint } from './outcome';
import { spanLateralReading } from '../../model/lateral-system';

type Vec = [number, number, number];
type SpanAxesModel = Pick<SpanSourceModel, 'nodes' | 'elements' | 'sections'>;

/** The model slice the spans are read from. */
export interface SpanSourceModel extends Omit<SpanModel, 'nodes' | 'elements'> {
  nodes: ReadonlyMap<number, { id: number; x: number; y: number; z?: number }>;
  elements: ReadonlyMap<number, {
    id: number; nodeI: number; nodeJ: number; type: string; sectionId: number; materialId: number;
    rollAngle?: number; localYx?: number; localYy?: number; localYz?: number;
  }>;
  sections?: ReadonlyMap<number, { rotation?: number; shape?: string }>;
}

/** A beam span of two or more elements, laid from its start node to its end node. */
export interface DesignSpan {
  /** Stable while the span's pieces are: `span-` and the smallest piece id. */
  key: string;
  /** The piece the span is designed and detailed under: the smallest id. */
  representative: number;
  /** The pieces in order from `start` to `end`. */
  elements: number[];
  /** Per piece: true when it runs from `end` towards `start`. */
  reversed: boolean[];
  /** Per piece: its length and the distance from `start` to its first point along the span, m. */
  lengths: number[];
  offsets: number[];
  length: number;
  start: number;
  end: number;
}

/** What a piece's context carries about the span it belongs to. */
export interface SpanRef extends Omit<DesignSpan, 'lengths' | 'offsets'> {
  /** «V3-1»: the physical member's name and the span's place along it, when it has one. */
  label?: string;
  lengths: readonly number[];
  offsets: readonly number[];
  /** This piece's position in `elements`. */
  index: number;
}

const P = (n: { x: number; y: number; z?: number }) => ({ x: n.x, y: n.y, z: n.z ?? 0 });

/** Before in the lexicographic (x, y, z) order, so a span is laid the same way whoever walked it. */
const before = (a: { x: number; y: number; z?: number }, b: { x: number; y: number; z?: number }) => {
  const d = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
  for (const v of d) if (Math.abs(v) > 1e-9) return v < 0;
  return false;
};

/**
 * The model's beam spans. `isBeam` says which elements the design reads as beams; `groupOf`, the
 * physical member each belongs to, where a span is cut so it never runs across two of them.
 */
export function designSpans(
  model: SpanSourceModel,
  isBeam: (id: number) => boolean,
  groupOf: (id: number) => string | undefined = () => undefined,
): DesignSpan[] {
  const nodes = new Map<number, { x: number; y: number; z: number }>();
  for (const [id, n] of model.nodes) nodes.set(id, P(n));
  const all = deflectionSpans({
    nodes, elements: model.elements, supports: model.supports,
    ...(model.connectors ? { connectors: model.connectors } : {}),
    ...(model.constraintNodes ? { constraintNodes: model.constraintNodes } : {}),
  });
  const out: DesignSpan[] = [];
  for (const span of new Set(all.values())) {
    if (span.elements.length < 2 || !span.elements.every(isBeam)) continue;
    const sameAs = (a: number, b: number) => {
      const p = model.elements.get(a)!, q = model.elements.get(b)!;
      return p.sectionId === q.sectionId && p.materialId === q.materialId
        && groupOf(a) === groupOf(b)
        && compatibleSectionAxes(model, p.sectionId, axes.get(a)!, axes.get(b)!);
    };
    const axes = new Map(span.elements.map(id => [id, axesOf(model, id)]));
    let run: number[] = [];
    const flush = () => {
      if (run.length >= 2) out.push(laid(model, span.elements, span.reversed, run));
      run = [];
    };
    span.elements.forEach((id, k) => {
      if (run.some(i => !sameAs(span.elements[i]!, id))) flush();
      run.push(k);
    });
    flush();
  }
  return out.sort((a, b) => a.representative - b.representative);
}

/** A run of a deflection span's pieces, laid from its lexicographically first end. */
function laid(model: SpanSourceModel, ids: number[], rev: boolean[], run: number[]): DesignSpan {
  let elements = run.map((k) => ids[k]!), reversed = run.map((k) => rev[k]!);
  const endOf = (k: number, first: boolean) => {
    const e = model.elements.get(elements[k]!)!;
    return first === !reversed[k] ? e.nodeI : e.nodeJ;
  };
  let start = endOf(0, true), end = endOf(elements.length - 1, false);
  const sectionId = model.elements.get(elements[0]!)!.sectionId;
  const reverseOrder = sectionAllowsSideReflection(model, sectionId)
    ? before(model.nodes.get(end)!, model.nodes.get(start)!)
    : reversed[0];
  if (reverseOrder) {
    elements = [...elements].reverse(); reversed = [...reversed].reverse().map((r) => !r);
    [start, end] = [end, start];
  }
  const lengths = elements.map((id) => {
    const e = model.elements.get(id)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    return Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
  });
  const offsets: number[] = [];
  lengths.forEach((_, k) => offsets.push(k === 0 ? 0 : offsets[k - 1]! + lengths[k - 1]!));
  const representative = Math.min(...elements);
  return {
    key: `span-${representative}`, representative, elements, reversed, lengths, offsets,
    length: lengths.reduce((s, l) => s + l, 0), start, end,
  };
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** An element's local axes, as the solve reads them. */
function axesOf(model: SpanAxesModel, id: number): LocalAxes3D {
  const e = model.elements.get(id)!;
  const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
  const localY = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined
    ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
  return computeLocalAxes3D({ id: a.id, ...P(a) }, { id: b.id, ...P(b) }, localY, memberRoll(e, model.sections));
}

function halfTurnSymmetric(model: SpanAxesModel, sectionId: number): boolean {
  const shape = model.sections?.get(sectionId)?.shape;
  return shape === undefined || ['rect', 'CHS', 'RHS', 'I', 'H', 'Z'].includes(shape);
}

function sectionAllowsSideReflection(model: SpanAxesModel, sectionId: number): boolean {
  const shape = model.sections?.get(sectionId)?.shape;
  return shape === undefined || ['rect', 'CHS', 'RHS', 'I', 'H', 'T'].includes(shape);
}

function compatibleSectionAxes(model: SpanAxesModel, sectionId: number, a: LocalAxes3D, b: LocalAxes3D): boolean {
  const depth = dot(a.ez, b.ez);
  const reverse = dot(a.ex, b.ex) < 0;
  const sameDepth = depth > 1 - 1e-10;
  if (!sectionAllowsSideReflection(model, sectionId)) return sameDepth && dot(a.ey, b.ey) > 1 - 1e-10;
  return sameDepth || (reverse && halfTurnSymmetric(model, sectionId) && depth < -1 + 1e-10);
}

function chordAxes(model: SpanAxesModel, start: number, end: number, sectionUp?: Vec, canonicalizeDepth = true): LocalAxes3D {
  const i = { id: start, ...P(model.nodes.get(start)!) };
  const j = { id: end, ...P(model.nodes.get(end)!) };
  const base = computeLocalAxes3D(i, j);
  if (!sectionUp) return base;
  const upProjection = dot(sectionUp, base.ez);
  const sign = canonicalizeDepth && (Math.abs(upProjection) > 1e-10 ? upProjection : dot(sectionUp, base.ey)) < 0 ? -1 : 1;
  const [x, y, z] = base.ex;
  const [u, v, w] = sectionUp;
  return computeLocalAxes3D(i, j, { x: sign * (v * z - w * y), y: sign * (w * x - u * z), z: sign * (u * y - v * x) });
}

function spanAxes(model: SpanAxesModel, span: DesignSpan): LocalAxes3D | null {
  const first = span.elements[0]!;
  const sectionId = model.elements.get(first)!.sectionId;
  const axes = span.elements.map(id => axesOf(model, id));
  if (axes.some((a, i) => axes.slice(0, i).some(b => !compatibleSectionAxes(model, sectionId, a, b)))) return null;
  const ref = chordAxes(model, span.start, span.end, axes[0]!.ez, sectionAllowsSideReflection(model, sectionId) && halfTurnSymmetric(model, sectionId));
  if (!sectionAllowsSideReflection(model, sectionId) && dot(ref.ey, axes[0]!.ey) <= 1 - 1e-10) return null;
  return ref;
}

/**
 * The span's stations: each piece's, at its place along the span, in the span's local axes.
 *
 * A piece's section forces act on its positive face; one that runs against the span has its
 * positive face on the other side, so its forces are turned into the span's axes and negated:
 * f = s·R_span·R_pieceᵀ·f_piece with s = ex_piece·ex_span. For a piece turned end for end
 * (y kept) that keeps N, Vz, T and Mz and reverses Vy and My — what the solver gives for the same
 * cut read from the other side.
 */
export function mergeSpanStations(
  model: SpanSourceModel,
  span: DesignSpan,
  stationsOf: (id: number) => ElementStationResult | undefined,
): ElementStationResult | null {
  const ref = spanAxes(model, span);
  if (!ref) return null;
  const byCombo = new Map<number, { comboId: number; comboName: string; stations: StationForces[] }>();
  const expectedCombinationIds = new Set<number>();
  const declaredPieces: { elementId: number; stationTs: number[] }[] = [];
  const spanGrid = new Set<number>();
  const rows: ScopedDemand[] = [];
  for (const [k, id] of span.elements.entries()) {
    const st = stationsOf(id);
    if (!st || st.comboResults.length === 0) return null;
    const ax = axesOf(model, id), L = span.lengths[k]!, off = span.offsets[k]!;
    const spanX = (t: number) => off + L * (span.reversed[k] ? 1 - t : t);
    if (st.stationTs.length) declaredPieces.push({ elementId: id, stationTs: st.stationTs });
    for (const t of st.stationTs) spanGrid.add(spanX(t) / span.length);
    for (const comboId of st.expectedCombinationIds ?? []) expectedCombinationIds.add(comboId);
    const s = Math.sign(dot(ax.ex, ref.ex)) || 1;
    // Rows: the span's axes in the piece's (R_span·R_pieceᵀ), times s.
    const T = [ref.ex, ref.ey, ref.ez].map((r) => [dot(r, ax.ex), dot(r, ax.ey), dot(r, ax.ez)].map((v) => s * v));
    const turn = (a: number, b: number, c: number) => T.map((row) => row[0]! * a + row[1]! * b + row[2]! * c);
    for (const cr of st.comboResults) {
      expectedCombinationIds.add(cr.comboId);
      const acc = byCombo.get(cr.comboId) ?? { comboId: cr.comboId, comboName: cr.comboName, stations: [] };
      for (const f of cr.stations) {
        rows.push({ elementId: id, comboId: cr.comboId, stationT: f.t });
        const x = spanX(f.t);
        const [n, vy, vz] = turn(f.n, f.vy, f.vz);
        const [torsion, my, mz] = turn(f.torsion, f.my, f.mz);
        acc.stations.push({ t: x / span.length, x, n: n!, vy: vy!, vz: vz!, my: my!, mz: mz!, torsion: torsion! });
      }
      byCombo.set(cr.comboId, acc);
    }
  }
  CompleteDemandSet.require({
    combinations: [...expectedCombinationIds].map(comboId => ({
      comboId, comboName: byCombo.get(comboId)?.comboName, members: declaredPieces,
    })),
  }, rows);
  const comboResults = [...byCombo.values()].map((c) => ({ ...c, stations: c.stations.sort((a, b) => a.t - b.t) }));
  const stationTs = [...spanGrid].sort((a, b) => a - b);
  return { elementId: span.representative, length: span.length, stationTs, comboResults };
}

/**
 * The model slice the verifier reads a span's critical sections from.
 *
 * `verifyProvidedReinforcement` computes a beam's support faces from `modelData` and its element
 * id (`computeBeamCriticalSections`); for a piece of a span the member is the span, so every piece
 * of it reads as the span's chord, from its start node to its end node, under its own id. The
 * function only looks at the member and at what meets its two end nodes, so those are what the
 * slice holds.
 */
export function spanModelData(model: ContextModelData, span: DesignSpan, source: SpanAxesModel = model): ContextModelData {
  const ref = spanAxes(source, span);
  if (!ref) throw new Error(tp('design.reason.orientationSuspect', { elementId: span.representative }));
  const [localYx, localYy, localYz] = ref.ey;
  const elements = new Map<number, ContextModelData['elements'] extends Map<number, infer E> ? E : never>();
  for (const e of model.elements.values()) {
    if (e.nodeI === span.start || e.nodeJ === span.start || e.nodeI === span.end || e.nodeJ === span.end) elements.set(e.id, e);
  }
  for (const id of span.elements) {
    const e = model.elements.get(id)!;
    const rollAngle = -(source.sections?.get(e.sectionId)?.rotation ?? 0);
    const chord = { ...e, nodeI: span.start, nodeJ: span.end, localYx, localYy, localYz, rollAngle };
    elements.set(id, chord);
  }
  return { ...model, elements };
}

/**
 * Replace the contexts of every span's pieces by the span's, each under its piece's id.
 *
 * A span whose pieces are not all designable beams with stations is left element by element:
 * the span cannot be assembled from them, and what is wrong with them is said on each.
 * `label` names a span («V3-1») when its physical member has a name. Returns the spans grouped.
 */
export function applySpanContexts(
  contexts: Map<number, MemberContext>,
  model: SpanSourceModel,
  spans: readonly DesignSpan[],
  label: (span: DesignSpan) => string | undefined = () => undefined,
): DesignSpan[] {
  completeMemberDemands([...contexts.values()].filter(c => c.stations || c.demands).map(c => ({ elementId: c.elementId,
    demands: c.demands?.demands ?? [], tuples: c.stations ? ConcurrentDemand.fromStations(c.stations) : c.demands?.concurrent,
    expectedCombinationIds: c.demands?.expectedCombinationIds, stationTs: c.stations?.stationTs,
  })), declaredContextMembers([...contexts.values()]));
  const done: DesignSpan[] = [];
  for (const span of spans) {
    const pieces = span.elements.map((id) => contexts.get(id));
    if (pieces.some((c) => !c || c.elementType !== 'beam' || !c.stations)) continue;
    const ref = spanAxes(model, span);
    if (!ref) {
      for (const c of pieces) {
        if (!c) continue;
        contexts.set(c.elementId, { ...c, orientationSuspect: true,
          blocking: [...new Set<LimitingConstraint>([...c.blocking, 'memberOrientationSuspect'])] });
      }
      continue;
    }
    const rep = contexts.get(span.representative)!;
    const merged = mergeSpanStations(model, span, (id) => contexts.get(id)?.stations);
    if (!merged) continue;
    const demands = extractGoverningDemands(merged);
    const modelData = spanModelData(rep.modelData, span, model);
    const criticalSections = computeBeamCriticalSections(
      span.representative, modelData.nodes, modelData.elements, modelData.sections, modelData.supports,
      { b: rep.section.b, h: rep.section.h, cover: rep.material.cover, stirrupDia: rep.material.stirrupDia },
    ) ?? undefined;
    const name = label(span);
    const blocking: LimitingConstraint[] = [...new Set(pieces.flatMap((c) => c!.blocking))]
      .filter((b) => b !== 'missingDemand' && b !== 'missingCombinations');
    if (demands.demands.length === 0) blocking.push('missingDemand');
    const base: MemberContext = {
      ...rep,
      L: span.length,
      stations: merged,
      demands,
      criticalSections,
      // As `buildMemberContext` reads a piece: the slab takes the in-plane axis of an upright beam with one.
      axes: resolveDesignAxes('beam', { b: rep.section.b, h: rep.section.h }, demands, { slab: (!!rep.flange || pieces.some((c) => c!.inSlabPlane)) && dot(ref.ez, chordAxes(model, span.start, span.end).ez) > Math.cos(5 * Math.PI / 180) }),
      orientationSuspect: pieces.some((c) => c!.orientationSuspect),
      blocking,
      modelData,
      // One member, one role in the lateral system, from what its pieces declare.
      ...(pieces.some((c) => c!.lateral) ? { lateral: spanLateralReading(pieces.map((c) => c!.lateral)) } : {}),
    };
    span.elements.forEach((id, index) => {
      contexts.set(id, { ...base, elementId: id,
        stations: { ...merged, elementId: id }, demands: { ...demands, elementId: id },
        span: { ...span, ...(name ? { label: name } : {}), index } });
    });
    done.push(span);
  }
  if (done.length) {
    const stations = [...contexts.values()].flatMap(c => c.stations ? [{ ...c.stations, elementId: c.elementId }] : []);
    const inventory = ConcurrentDemand.inventoryForStations(stations);
    const converted = new WeakMap<readonly ConcurrentDemand[], readonly ConcurrentDemand[]>();
    for (const c of contexts.values()) {
      if (!c.stations || !c.demands) continue;
      c.stations = { ...c.stations, elementId: c.elementId, inventory };
      const source = c.demands.concurrent;
      const concurrent = source && converted.get(source) || ConcurrentDemand.fromStations(c.stations);
      if (source) converted.set(source, concurrent);
      c.demands = { ...c.demands, concurrent };
    }
  }
  return done;
}
