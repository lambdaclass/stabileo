/**
 * Models of other disciplines linked to the project: an IFC file read as its objects (lines for
 * beams, columns and members; outlines for slabs and walls), each with its GlobalId, class, name,
 * storey and a hash of what it is, so a later version of the same file is compared object by
 * object rather than replaced.
 *
 *  · `diffLinked` sorts the new version's objects into added, modified (same GlobalId, another
 *    hash) and removed, against the version the project holds.
 *  · `applyUpdate` takes what the rules say: added and modified taken or skipped, removed removed
 *    or kept. What is skipped stays as it was, so a later update offers it again.
 *  · `linkUnderlays` draws a link as one background drawing per storey: its lines and outlines
 *    seen from above at the storey's elevation, which the 3D view already shows.
 *
 * An object without a GlobalId is keyed by its class, name and rounded position; the key says so.
 */
import type { IfcMember, IfcSurface } from '../../ifc/ifc-mapper';

export type Discipline = 'architecture' | 'structure' | 'services' | 'other';

export interface LinkedEntity {
  guid: string; ifcClass: string; name: string; storey: string;
  kind: 'line' | 'surface';
  /** Points, m, as x, y, z, x, y, z… (two for a line, the outline for a surface). */
  pts: number[];
  hash: string;
}

export interface LinkedModel {
  id: string; name: string; discipline: Discipline;
  /** The file it was read from and the version label the person gives it. */
  fileName: string; version: string; date: string;
  entities: LinkedEntity[];
  visible: boolean;
  /** Storey elevations of the file, m, by name. */
  storeys: Record<string, number>;
}

/** FNV-1a, 32 bits, as 8 hex digits: stable across runs and machines. */
export function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

function entity(ifcClass: string, name: string, storey: string, kind: LinkedEntity['kind'], pts: number[], guid?: string, extra = ''): LinkedEntity {
  const rounded = pts.map(r3);
  const body = `${ifcClass}|${name}|${kind}|${rounded.join(',')}|${extra}`;
  return { guid: guid ?? `~${fnv(`${ifcClass}|${name}|${rounded.slice(0, 3).join(',')}`)}`, ifcClass, name, storey, kind, pts: rounded, hash: fnv(body) };
}

/** The objects of a parsed IFC file. */
export function entitiesFromParse(members: readonly IfcMember[], surfaces: readonly IfcSurface[]): LinkedEntity[] {
  return [
    ...members.map((m) => entity(m.ifcClass ?? m.type, m.name, m.storey ?? '', 'line', [m.start.x, m.start.y, m.start.z, m.end.x, m.end.y, m.end.z], m.globalId, m.profileName ?? '')),
    ...surfaces.map((s) => entity(s.ifcClass ?? s.type, s.name, s.storey ?? '', 'surface', s.outline.flatMap((p) => [p.x, p.y, p.z]), s.globalId, String(r3(s.thickness)))),
  ];
}

export interface LinkedDiff { added: LinkedEntity[]; modified: Array<{ before: LinkedEntity; after: LinkedEntity }>; removed: LinkedEntity[]; unchanged: number }

export function diffLinked(held: readonly LinkedEntity[], next: readonly LinkedEntity[]): LinkedDiff {
  const before = new Map(held.map((e) => [e.guid, e])), after = new Map(next.map((e) => [e.guid, e]));
  const out: LinkedDiff = { added: [], modified: [], removed: [], unchanged: 0 };
  for (const e of next) {
    const b = before.get(e.guid);
    if (!b) out.added.push(e);
    else if (b.hash !== e.hash) out.modified.push({ before: b, after: e });
    else out.unchanged++;
  }
  for (const e of held) if (!after.has(e.guid)) out.removed.push(e);
  return out;
}

export interface UpdateRules { added: 'take' | 'skip'; modified: 'take' | 'skip'; removed: 'remove' | 'keep' }
export const DEFAULT_RULES: UpdateRules = { added: 'take', modified: 'take', removed: 'remove' };

/** The objects the link holds after an update under `rules`, in the new version's order. */
export function applyUpdate(held: readonly LinkedEntity[], d: LinkedDiff, rules: UpdateRules): LinkedEntity[] {
  const byGuid = new Map(held.map((e) => [e.guid, e]));
  if (rules.added === 'take') for (const e of d.added) byGuid.set(e.guid, e);
  if (rules.modified === 'take') for (const m of d.modified) byGuid.set(m.after.guid, m.after);
  if (rules.removed === 'remove') for (const e of d.removed) byGuid.delete(e.guid);
  return [...byGuid.values()];
}

/** A link as background drawings, one per storey: segments seen from above, at the storey's elevation. */
export function linkUnderlays(link: LinkedModel): Array<{ id: string; name: string; z: number; segments: number[] }> {
  const by = new Map<string, number[]>();
  for (const e of link.entities) {
    const seg = by.get(e.storey) ?? [];
    const n = e.pts.length / 3;
    const xy = (i: number) => [e.pts[3 * i]!, e.pts[3 * i + 1]!];
    if (e.kind === 'line') {
      const [ax, ay] = xy(0), [bx, by_] = xy(1);
      // A column seen from above is a point: drawn as a small cross so it shows.
      if (Math.hypot(bx! - ax!, by_! - ay!) < 1e-6) seg.push(ax! - 0.15, ay!, ax! + 0.15, ay!, ax!, ay! - 0.15, ax!, ay! + 0.15);
      else seg.push(ax!, ay!, bx!, by_!);
    } else {
      for (let i = 0; i < n; i++) { const [px, py] = xy(i), [qx, qy] = xy((i + 1) % n); if (Math.hypot(qx! - px!, qy! - py!) > 1e-6) seg.push(px!, py!, qx!, qy!); }
    }
    by.set(e.storey, seg);
  }
  const zOf = (storey: string, ents: readonly LinkedEntity[]) => link.storeys[storey] ?? Math.min(...ents.filter((e) => e.storey === storey).flatMap((e) => e.pts.filter((_, i) => i % 3 === 2)));
  return [...by.entries()].map(([storey, segments]) => ({ id: `link-${link.id}-${fnv(storey)}`, name: `${link.name} · ${storey || '—'}`, z: zOf(storey, link.entities), segments }));
}
