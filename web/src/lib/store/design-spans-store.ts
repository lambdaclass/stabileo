/**
 * The model's beam spans, for the design: which pieces the analysis cut a beam into, and the
 * span each piece is designed and detailed as (`engine/design/design-spans.ts` says why).
 */
import { modelStore } from './model.svelte';
import { constraintNodes } from '../engine/steel/unbraced-length';
import { PHYSICAL_GROUP_KIND } from '../model/physical/types';
import { applySpanContexts, designSpans, type DesignSpan, type SpanSourceModel } from '../engine/design/design-spans';
import type { MemberContext } from '../engine/design/member-context';
import type { MemberDesignOutcome } from '../engine/design/outcome';
import type { BeamLine } from '../engine/design/repeated-frames';

/** The physical beam each element belongs to: its group id and name. */
function physicalBeams(): Map<number, { id: string; name: string }> {
  const out = new Map<number, { id: string; name: string }>();
  for (const g of modelStore.model.groups.values()) {
    if (g.kind !== PHYSICAL_GROUP_KIND || (g.data as { kind?: string } | undefined)?.kind !== 'beam') continue;
    for (const id of g.members.elements ?? []) out.set(id, { id: String(g.id), name: g.name });
  }
  return out;
}

/**
 * Give every piece of a span the span's context, in place. Called on the contexts the design
 * just built, after anything that amends a piece's own stations (storey sway, soft storeys), so
 * the span is assembled from the stations the pieces would have been designed with.
 */
export function groupSpanContexts(contexts: Map<number, MemberContext>): DesignSpan[] {
  const model: SpanSourceModel = {
    nodes: modelStore.nodes, elements: modelStore.elements as never, supports: modelStore.supports,
    sections: modelStore.sections as never,
    connectors: modelStore.model.connectors, constraintNodes: constraintNodes(modelStore.model.constraints),
  };
  const phys = physicalBeams();
  const spans = designSpans(model, (id) => contexts.get(id)?.elementType === 'beam', (id) => phys.get(id)?.id);
  // «V3-1»: the physical beam's name and the span's place along it, from its start.
  const byBeam = new Map<string, DesignSpan[]>();
  for (const s of spans) {
    const b = phys.get(s.representative);
    if (b) byBeam.set(b.id, [...(byBeam.get(b.id) ?? []), s]);
  }
  const labels = new Map<string, string>();
  for (const list of byBeam.values()) {
    const name = phys.get(list[0]!.representative)?.name;
    if (!name) continue;
    const key = (s: DesignSpan) => { const n = modelStore.nodes.get(s.start)!; return [n.x, n.y, n.z ?? 0]; };
    const order = [...list].sort((a, b) => { const p = key(a), q = key(b); return p[0]! - q[0]! || p[1]! - q[1]! || p[2]! - q[2]!; });
    order.forEach((s, k) => labels.set(s.key, `${name}-${k + 1}`));
  }
  return applySpanContexts(contexts, model, spans, (s) => labels.get(s.key));
}

/**
 * What a design run asked for, one member per span: the contexts to design, with every span
 * whose pieces were asked designed once under the first of them that was.
 */
export function oneContextPerSpan(ctxs: readonly MemberContext[]): MemberContext[] {
  const seen = new Set<string>();
  return ctxs.filter((c) => {
    if (!c.span) return true;
    if (seen.has(c.span.key)) return false;
    seen.add(c.span.key);
    return true;
  });
}

/** A span's outcome on each of its pieces, under the piece's id. */
export function spanOutcomesToPieces(
  outcomes: Map<number, MemberDesignOutcome>,
  contextOf: (id: number) => MemberContext | undefined,
): Map<number, MemberDesignOutcome> {
  const out = new Map(outcomes);
  for (const [id, o] of outcomes) {
    const span = contextOf(id)?.span;
    if (!span) continue;
    for (const p of span.elements) if (p !== id) out.set(p, { ...o, elementId: p });
  }
  return out;
}

/** Every piece of the span each member belongs to, the member alone when it is not a piece. */
export function withSpanPieces(ids: Iterable<number>, contextOf: (id: number) => MemberContext | undefined): number[] {
  const out = new Set<number>();
  for (const id of ids) for (const p of contextOf(id)?.span?.elements ?? [id]) out.add(p);
  return [...out];
}

/**
 * A beam line with each span's pieces read as one member, the span's representative: what the
 * frame editor and the repeated frames work on, since a span is designed and stored as one
 * arrangement. Its sense along the line is the span's, its signature the span's length.
 */
export function collapseLineSpans(line: BeamLine, contextOf: (id: number) => MemberContext | undefined): BeamLine {
  if (!line.members.some((id) => contextOf(id)?.span)) return line;
  const members: number[] = [], forward: boolean[] = [], signature: string[] = [];
  const seen = new Set<string>();
  line.members.forEach((id, i) => {
    const s = contextOf(id)?.span;
    if (!s) { members.push(id); forward.push(line.forward[i]!); signature.push(line.signature[i]!); return; }
    if (seen.has(s.key)) return;
    seen.add(s.key);
    const k = s.elements.indexOf(id);
    members.push(s.representative);
    forward.push(line.forward[i] !== s.reversed[k]);
    signature.push(`${Math.round(s.length * 1000)}:${line.signature[i]!.split(':')[1]}`);
  });
  return { ...line, members, forward, signature };
}

/** A member's length as the design reads it: its span's when it is a piece of one. */
export function designLength(id: number, contextOf: (id: number) => MemberContext | undefined): number {
  const s = contextOf(id)?.span;
  if (s) return s.length;
  const e = modelStore.elements.get(id);
  const a = e && modelStore.nodes.get(e.nodeI), b = e && modelStore.nodes.get(e.nodeJ);
  return a && b ? Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) : 0;
}
