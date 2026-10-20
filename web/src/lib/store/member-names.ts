/**
 * One name per physical member, wherever a member is named (QA of 20-oct: «las columnas deberían
 * tener un solo nombre de abajo hacia arriba; las vigas cambian de nombre entre apoyos, hoy una
 * viga entre apoyos tiene unos 5 nombres; las losas igual»).
 *
 * The analysis cuts a member into pieces (a beam at every slab mesh node, a column at every
 * floor), and the desk, the listings and the sheets named the pieces. A member is named here by
 * what it is built as:
 *   - a column: its physical column's name (C3) on every floor it runs through;
 *   - a beam: its span between supports, the physical beam's name and the span's place along it
 *     from its start (V3-1, as `groupSpanContexts` labels the design's spans); a beam with no
 *     physical element, «V» and its span's first piece;
 *   - a slab: its physical slab's name, one per panel (L4);
 *   - a wall: its physical wall's name, and the storey from the bottom where it runs through
 *     more than one (M1-2).
 * Anything else keeps its element number.
 *
 * Read from the model each call, cached on the model's maps: the names change only when the
 * model does.
 */
import { modelStore } from './model.svelte';
import { physicalGroups } from './physical';
import { constraintNodes } from '../engine/steel/unbraced-length';
import { designSpans, type DesignSpan, type SpanSourceModel } from '../engine/design/design-spans';

export interface MemberNames {
  /** The member's name: its physical member's, a beam's span, or its number. */
  name(elementId: number): string;
  /** The name with the level a column lift reaches («C3 · N2»): a column's floors apart, on a sheet. */
  atLevel(elementId: number): string;
  /** The physical element's name, where the element belongs to one. */
  physical(elementId: number): string | undefined;
  /** The span a beam piece belongs to, as the design reads it. */
  span(elementId: number): DesignSpan | undefined;
  /** The physical element a shell belongs to (a slab or wall group's name). */
  shellGroup(kind: 'quad' | 'plate', id: number): string | undefined;
}

/** «V3-1»: each physical beam's spans in order from its start, by the start's (x, y, z). */
export function spanLabels(spans: readonly DesignSpan[], physOf: (id: number) => { id: string; name: string } | undefined, nodeAt: (id: number) => { x: number; y: number; z?: number }): Map<string, string> {
  const byBeam = new Map<string, DesignSpan[]>();
  for (const s of spans) {
    const b = physOf(s.representative);
    if (b) byBeam.set(b.id, [...(byBeam.get(b.id) ?? []), s]);
  }
  const labels = new Map<string, string>();
  for (const list of byBeam.values()) {
    const name = physOf(list[0]!.representative)?.name;
    if (!name) continue;
    const key = (s: DesignSpan) => { const n = nodeAt(s.start); return [n.x, n.y, n.z ?? 0]; };
    const order = [...list].sort((a, b) => { const p = key(a), q = key(b); return p[0]! - q[0]! || p[1]! - q[1]! || p[2]! - q[2]!; });
    order.forEach((s, k) => labels.set(s.key, `${name}-${k + 1}`));
  }
  return labels;
}

let cache: { elements: unknown; groups: unknown; nodes: unknown; names: MemberNames } | null = null;

export function memberNames(): MemberNames {
  const m = modelStore.model;
  if (cache && cache.elements === m.elements && cache.groups === m.groups && cache.nodes === m.nodes) return cache.names;
  const groups = physicalGroups();
  const groupOfElement = new Map<number, { id: string; name: string; kind: string }>();
  const groupOfQuad = new Map<number, string>(), groupOfPlate = new Map<number, string>();
  for (const g of groups) {
    for (const id of g.members.elements ?? []) groupOfElement.set(id, { id: String(g.id), name: g.name, kind: g.physical.kind });
    for (const id of g.members.quads ?? []) groupOfQuad.set(id, g.name);
    for (const id of g.members.plates ?? []) groupOfPlate.set(id, g.name);
  }
  const vertical = (id: number) => {
    const e = m.elements.get(id), a = e && m.nodes.get(e.nodeI), b = e && m.nodes.get(e.nodeJ);
    return !!a && !!b && Math.hypot(b.x - a.x, b.y - a.y) < 1e-6;
  };
  const model: SpanSourceModel = {
    nodes: m.nodes, elements: m.elements as never, supports: m.supports, sections: m.sections as never,
    connectors: m.connectors, constraintNodes: constraintNodes(m.constraints),
  };
  const beamGroup = (id: number) => { const g = groupOfElement.get(id); return g && g.kind === 'beam' ? g : undefined; };
  const spans = designSpans(model, (id) => !vertical(id), (id) => beamGroup(id)?.id);
  const spanOf = new Map<number, DesignSpan>();
  for (const s of spans) for (const id of s.elements) spanOf.set(id, s);
  const labels = spanLabels(spans, beamGroup, (id) => m.nodes.get(id)!);
  const names: MemberNames = {
    name(id) {
      const g = groupOfElement.get(id);
      if (vertical(id)) return g?.name ?? `C${id}`;
      const s = spanOf.get(id);
      if (s) return labels.get(s.key) ?? (g ? g.name : `V${s.representative}`);
      return g?.name ?? `#${id}`;
    },
    physical: (id) => groupOfElement.get(id)?.name,
    atLevel(id) {
      const base = names.name(id);
      if (!vertical(id)) return base;
      const e = m.elements.get(id)!;
      const top = Math.max(m.nodes.get(e.nodeI)?.z ?? 0, m.nodes.get(e.nodeJ)?.z ?? 0);
      const lv = (m.grid?.levels ?? []).find((l) => Math.abs(l.z - top) < 1e-3);
      return `${base} · ${lv ? lv.name : `+${top.toFixed(2)}`}`;
    },
    span: (id) => spanOf.get(id),
    shellGroup: (kind, id) => (kind === 'quad' ? groupOfQuad : groupOfPlate).get(id),
  };
  cache = { elements: m.elements, groups: m.groups, nodes: m.nodes, names };
  return names;
}

/**
 * The walls a floor run designed, named by their physical wall: «M1» where the wall is one
 * storey, «M1-1», «M1-2»… from the bottom where it runs through several. A wall with no physical
 * element keeps its run id.
 */
export function wallNames(walls: ReadonlyArray<{ wallId: string; elementIds?: readonly number[] }>): Map<string, string> {
  const n = memberNames(), m = modelStore.model;
  const baseOf = (ids: readonly number[]) => Math.min(...ids.flatMap((q) => (m.quads.get(q)?.nodes ?? m.plates.get(q)?.nodes ?? []).map((id) => m.nodes.get(id)?.z ?? 0)));
  const byGroup = new Map<string, Array<{ wallId: string; z: number }>>();
  const out = new Map<string, string>();
  for (const w of walls) {
    // A floor run names a wall by its first shell («W17», `run-floor-design.ts`).
    const ids = w.elementIds ?? (/^W(\d+)$/.exec(w.wallId) ? [Number(w.wallId.slice(1))] : []);
    const g = ids.map((id) => n.shellGroup('quad', id) ?? n.shellGroup('plate', id)).find((x) => !!x);
    if (!g) { out.set(w.wallId, w.wallId); continue; }
    byGroup.set(g, [...(byGroup.get(g) ?? []), { wallId: w.wallId, z: baseOf(ids) }]);
  }
  for (const [g, list] of byGroup) {
    if (list.length === 1) { out.set(list[0]!.wallId, g); continue; }
    [...list].sort((a, b) => a.z - b.z).forEach((x, k) => out.set(x.wallId, `${g}-${k + 1}`));
  }
  return out;
}
