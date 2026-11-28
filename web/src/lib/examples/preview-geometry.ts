export interface PreviewSource {
  nodes: { id: number; x: number; y: number; z?: number }[];
  elements: { nodeI: number; nodeJ: number }[];
  supports: { nodeId: number; type?: string }[];
  shells: number[][];
}

/** Members by role, as the PRO generator previews colour them (`ROLE_COLOUR`). */
export type PreviewRole = 'column' | 'beam' | 'diagonal';

export interface ExamplePreview {
  /** viewBox width and height. */
  w: number;
  h: number;
  /** One SVG path of straight segments per role. */
  c: string;
  b: string;
  d: string;
  /** Shells, as closed filled outlines. */
  s: string;
  /** Supports as flat [x, y, fixed, …] (fixed is 1 or 0); empty when there are too many to draw. */
  p: number[];
  /** Nodes as flat [x, y, …]; empty on models too dense for dots to read. */
  n: number[];
}

export const PREVIEW_W = 240;
export const PREVIEW_H = 150;
const MARGIN = 0.1;
const MAX_SEGMENTS = 1000;
const MAX_SHELLS = 120;
const MAX_SUPPORTS = 28;
const MAX_NODES = 40;
/** A member within this angle of the vertical is a column, and of the horizontal a beam. */
const ROLE_DEGREES = 15;

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

type Projected = { x: number; y: number; depth: number };

/** A plane model is drawn as it is; a space one in isometric, Z up. */
export function project(x: number, y: number, z: number, planar: boolean): Projected {
  if (planar) return { x, y: -y, depth: 0 };
  return { x: (x - y) * COS30, y: -z + (x + y) * SIN30, depth: x + y };
}

/** By the member's own direction, so a beam stays a beam whatever the view does to it. */
export function roleOf(dx: number, dy: number, dz: number, planar: boolean): PreviewRole {
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) return 'beam';
  const fromHorizontal = (Math.asin(Math.min(1, Math.abs(planar ? dy : dz) / len)) * 180) / Math.PI;
  if (fromHorizontal >= 90 - ROLE_DEGREES) return 'column';
  if (fromHorizontal <= ROLE_DEGREES) return 'beam';
  return 'diagonal';
}

function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  if (max <= 0) return [];
  const step = items.length / max;
  return Array.from({ length: max }, (_, i) => items[Math.floor(i * step)]);
}

const r1 = (v: number) => Math.round(v);

export function buildPreview(src: PreviewSource, planar: boolean): ExamplePreview {
  const empty: ExamplePreview = { w: PREVIEW_W, h: PREVIEW_H, c: '', b: '', d: '', s: '', p: [], n: [] };
  const world = new Map<number, { x: number; y: number; z: number }>();
  for (const n of src.nodes) world.set(n.id, { x: n.x, y: n.y, z: n.z ?? 0 });
  const at = new Map<number, Projected>();
  for (const [id, v] of world) at.set(id, project(v.x, v.y, v.z, planar));
  if (at.size === 0) return empty;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { x, y } of at.values()) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const spanX = maxX - minX, spanY = maxY - minY;
  const room = (dim: number) => dim * (1 - 2 * MARGIN);
  const k = Math.min(
    spanX > 0 ? room(PREVIEW_W) / spanX : Infinity,
    spanY > 0 ? room(PREVIEW_H) / spanY : Infinity,
  );
  const scale = Number.isFinite(k) ? k : 1;
  const offX = (PREVIEW_W - spanX * scale) / 2, offY = (PREVIEW_H - spanY * scale) / 2;
  const q = (id: number): [number, number] | null => {
    const v = at.get(id);
    return v ? [r1(offX + (v.x - minX) * scale), r1(offY + (v.y - minY) * scale)] : null;
  };

  type Seg = { role: PreviewRole; depth: number; a: [number, number]; b: [number, number] };
  const seen = new Set<string>();
  const segs: Seg[] = [];
  for (const e of src.elements) {
    const a = q(e.nodeI), b = q(e.nodeJ);
    const wa = world.get(e.nodeI), wb = world.get(e.nodeJ);
    if (!a || !b || !wa || !wb || (a[0] === b[0] && a[1] === b[1])) continue;
    const key = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    segs.push({
      role: roleOf(wb.x - wa.x, wb.y - wa.y, wb.z - wa.z, planar),
      depth: (at.get(e.nodeI)!.depth + at.get(e.nodeJ)!.depth) / 2,
      a, b,
    });
  }
  segs.sort((s, t) => t.depth - s.depth);
  const kept = thin(segs, MAX_SEGMENTS);
  const path = (role: PreviewRole) => kept.filter((s) => s.role === role)
    .map((s) => `M${s.a[0]} ${s.a[1]}l${r1(s.b[0] - s.a[0])} ${r1(s.b[1] - s.a[1])}`).join('');

  const rings: { pts: [number, number][]; depth: number }[] = [];
  for (const ring of src.shells) {
    const pts = ring.map(q);
    if (pts.length < 3 || pts.some((v) => v === null)) continue;
    const depth = ring.reduce((d, id) => d + (at.get(id)?.depth ?? 0), 0) / ring.length;
    rings.push({ pts: pts as [number, number][], depth });
  }
  rings.sort((s, t) => t.depth - s.depth);
  const shells = thin(rings, MAX_SHELLS)
    .map((r) => `M${r.pts.map((v) => `${v[0]} ${v[1]}`).join('L')}Z`).join('');

  const seenP = new Set<string>();
  const p: number[] = [];
  for (const s of src.supports) {
    const v = q(s.nodeId);
    if (!v || seenP.has(`${v[0]},${v[1]}`)) continue;
    seenP.add(`${v[0]},${v[1]}`);
    p.push(v[0], v[1], s.type === 'fixed' || s.type === 'fixed3d' ? 1 : 0);
  }

  const n: number[] = [];
  if (at.size <= MAX_NODES) for (const id of at.keys()) { const v = q(id)!; n.push(v[0], v[1]); }

  return {
    w: PREVIEW_W, h: PREVIEW_H,
    c: path('column'), b: path('beam'), d: path('diagonal'),
    s: shells,
    p: p.length / 3 <= MAX_SUPPORTS ? p : [],
    n,
  };
}
