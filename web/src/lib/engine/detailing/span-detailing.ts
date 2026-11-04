/**
 * A beam span the analysis cut into pieces is detailed as the one member it is.
 *
 * The design gives every piece of a span the span's context (`design/design-spans.ts`): its
 * stations along the whole span, its critical sections at the span's columns. Detailing each
 * piece from that context would lay the whole span's bars from every piece's own nodes — six
 * copies of a 6 m beam's steel, each starting at a different mesh node. So the run sees each span
 * once: the piece it was designed under, standing on the span's end nodes, with the span's
 * context and outcome; the other pieces are left out of the run and given back afterwards.
 *
 * What the run produced for the span is then said of its pieces: an assembly lists all of them,
 * a bar is owned by the pieces it runs along, a joint by the piece that frames into it, and every
 * per-member record (skipped, provisional, torsion, re-verification) is repeated on each piece.
 *
 * Pure: no store access.
 */
import type { MemberContext } from '../design/member-context';
import type { SpanRef } from '../design/design-spans';
import type { RunDetailingInput, RunDetailingResult, DetailingReadiness } from './run-detailing';
import type { BarPath } from '../../codes/cirsoc201/bar-geometry';
import { hasMemberOffset, memberOffsetAt } from '../member-offsets';

export interface SpanCollapse {
  /** Span representative → the span. */
  spans: Map<number, SpanRef>;
}

/** The spans among the contexts, by their representative. Empty when no member is a piece. */
export function spansIn(contexts: ReadonlyMap<number, MemberContext>): SpanCollapse {
  const spans = new Map<number, SpanRef>();
  for (const ctx of contexts.values()) {
    const s = ctx.span;
    if (s && !spans.has(s.representative) && s.elements.every((id) => contexts.has(id))) spans.set(s.representative, s);
  }
  return { spans };
}

/** The run's input with each span as its representative standing on the span's end nodes. */
export function collapseSpans(input: RunDetailingInput, c: SpanCollapse): RunDetailingInput {
  const others = new Set<number>();
  for (const s of c.spans.values()) for (const id of s.elements) if (id !== s.representative) others.add(id);
  const keep = <V>(m: ReadonlyMap<number, V>) => new Map([...m].filter(([id]) => !others.has(id)));
  const elements = keep(input.elements);
  for (const [rep, s] of c.spans) {
    const e = elements.get(rep);
    if (!e) continue;
    // The span's ends carry the insertion of the pieces that end there, resolved to global so it
    // means the same on the representative standing on other nodes (`memberOffsetAt`).
    const pieces = s.elements.map((id) => input.elements.get(id)).filter((x) => !!x);
    const atEnd = (nodeId: number) => {
      const p = pieces.find((x) => x!.nodeI === nodeId || x!.nodeJ === nodeId);
      return p ? memberOffsetAt(p, nodeId, input.nodes, input.sections) : { x: 0, y: 0, z: 0 };
    };
    const offset = { frame: 'global' as const, i: atEnd(s.start), j: atEnd(s.end) };
    const rest = { ...e, nodeI: s.start, nodeJ: s.end };
    delete rest.offset;
    elements.set(rep, hasMemberOffset({ offset }) ? { ...rest, offset } : rest);
  }
  const repOf = new Map<number, number>();
  for (const [rep, s] of c.spans) for (const id of s.elements) repOf.set(id, rep);
  return {
    ...input,
    contexts: keep(input.contexts),
    outcomes: keep(input.outcomes),
    elements,
    // The frame editor sets a span's cuts on its representative, in the span's sense.
    ...(input.memberCuts ? { memberCuts: new Map([...input.memberCuts].filter(([id]) => !others.has(id))) } : {}),
    ...(input.lateralSystem ? { lateralSystem: new Set([...input.lateralSystem].map((id) => repOf.get(id) ?? id)) } : {}),
  };
}

/** The pieces of a span a stretch along it [a, b] (m from its start) runs over. */
function piecesAlong(s: SpanRef, a: number, b: number): number[] {
  const lo = Math.min(a, b), hi = Math.max(a, b), eps = 1e-6;
  const out = s.elements.filter((_, k) => s.offsets[k]! < hi - eps && s.offsets[k]! + s.lengths[k]! > lo + eps);
  if (out.length) return out;
  // A bar at a single station (a stirrup) or past an end: the piece nearest to it.
  const x = (lo + hi) / 2;
  const k = s.offsets.findIndex((o, i) => x <= o + s.lengths[i]! + eps);
  return [s.elements[k < 0 ? s.elements.length - 1 : k]!];
}

/** Each span's pieces given back to what the run produced for its representative. */
export function expandSpans(
  result: RunDetailingResult,
  input: RunDetailingInput,
  c: SpanCollapse,
  readiness: DetailingReadiness,
): RunDetailingResult {
  if (c.spans.size === 0) return result;
  const all = (id: number) => c.spans.get(id)?.elements ?? [id];
  const ids = (xs: readonly number[]) => [...new Set(xs.flatMap(all))];
  const node = (id: number) => input.nodes.get(id);
  /** Distance along the span from its start node to a point. */
  const along = (s: SpanRef) => {
    const a = node(s.start)!, b = node(s.end)!;
    const d = [b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)], L = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
    return (p: { x: number; y: number; z: number }) => ((p.x - a.x) * d[0]! + (p.y - a.y) * d[1]! + (p.z - (a.z ?? 0)) * d[2]!) / L;
  };
  const owners = (bar: BarPath): number[] => [...new Set(bar.ownerElementIds.flatMap((id) => {
    const s = c.spans.get(id);
    if (!s || bar.segments.length === 0) return all(id);
    const f = along(s);
    const xs = bar.segments.flatMap((g) => [f(g.start), f(g.end)]);
    return piecesAlong(s, Math.min(...xs), Math.max(...xs));
  }))];
  /** The piece of a span that frames into a node: the first or the last. */
  const atNode = (id: number, nodeId: number): number[] => {
    const s = c.spans.get(id);
    if (!s) return [id];
    if (nodeId === s.start) return [s.elements[0]!];
    if (nodeId === s.end) return [s.elements[s.elements.length - 1]!];
    return [...s.elements];
  };
  const assemblies = result.assemblies.map((a) => ({
    ...a,
    elementIds: ids(a.elementIds),
    bars: a.bars.map((b) => ({ ...b, ownerElementIds: owners(b) })),
    marks: a.marks.map((m) => ({ ...m, ownerElementIds: ids(m.ownerElementIds) })),
    joints: a.joints.map((j) => ({
      ...j,
      elementIds: [...new Set(j.elementIds.flatMap((id) => atNode(id, j.nodeId)))],
      beamLayers: j.beamLayers.flatMap((l) => atNode(l.elementId, j.nodeId).map((elementId) => ({ ...l, elementId }))),
      unresolved: j.unresolved.map((u) => ({ ...u, elementIds: ids(u.elementIds) })),
    })),
    conflicts: a.conflicts.map((x) => ({ ...x, elementIds: ids(x.elementIds) })),
    unsupported: a.unsupported.map((u) => ({ ...u, scope: { ...u.scope, ...(u.scope.elementIds ? { elementIds: ids(u.scope.elementIds) } : {}) } })),
    ...(a.provisionalMembers ? { provisionalMembers: ids(a.provisionalMembers) } : {}),
    ...(a.torsionUnevaluatedMembers ? { torsionUnevaluatedMembers: ids(a.torsionUnevaluatedMembers).sort((x, y) => x - y) } : {}),
    ...(a.familyCertificates ? { familyCertificates: a.familyCertificates.map((f) => ({ ...f, ownerElementIds: ids(f.ownerElementIds) })) } : {}),
  }));
  const each = <T extends { elementId: number }>(xs: readonly T[]) => xs.flatMap((x) => all(x.elementId).map((elementId) => ({ ...x, elementId })));
  const lineOf = result.layering?.lineOfMember;
  return {
    ...result,
    assemblies,
    readiness,
    skipped: each(result.skipped),
    provisionalMembers: ids(result.provisionalMembers).sort((a, b) => a - b),
    torsionUnevaluated: each(result.torsionUnevaluated),
    reverification: each(result.reverification),
    ...(result.layering && lineOf ? {
      layering: { ...result.layering, lineOfMember: new Map([...lineOf].flatMap(([id, line]) => all(id).map((p) => [p, line] as [number, string]))) },
    } : {}),
  };
}
