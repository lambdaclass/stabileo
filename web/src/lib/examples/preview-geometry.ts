export interface PreviewSource {
  nodes: { id: number; x: number; y: number; z?: number }[];
  elements: { nodeI: number; nodeJ: number }[];
  supports: { nodeId: number }[];
  shells: number[][];
}

export interface ExamplePreview {
  /** viewBox width and height. */
  w: number;
  h: number;
  /** Members, as an SVG path of straight segments. */
  m: string;
  /** Shell outlines, as an SVG path. */
  s: string;
  /** Supported nodes, as flat [x, y, x, y, …]. */
  p: number[];
}

export const PREVIEW_W = 160;
export const PREVIEW_H = 100;
const PAD = 8;
const MAX_SEGMENTS = 450;

function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  if (max <= 0) return [];
  const step = items.length / max;
  return Array.from({ length: max }, (_, i) => items[Math.floor(i * step)]);
}

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

/** A plane model is drawn as it is; a space one in isometric, Z up. */
export function project(x: number, y: number, z: number, planar: boolean): [number, number] {
  if (planar) return [x, -y];
  return [(x - y) * COS30, -z - (x + y) * SIN30];
}

export function buildPreview(src: PreviewSource, planar: boolean): ExamplePreview {
  const at = new Map<number, [number, number]>();
  for (const n of src.nodes) at.set(n.id, project(n.x, n.y, n.z ?? 0, planar));
  const pts = [...at.values()];
  if (pts.length === 0) return { w: PREVIEW_W, h: PREVIEW_H, m: '', s: '', p: [] };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const spanX = maxX - minX, spanY = maxY - minY;
  const scale = Math.min(
    spanX > 0 ? (PREVIEW_W - 2 * PAD) / spanX : Infinity,
    spanY > 0 ? (PREVIEW_H - 2 * PAD) / spanY : Infinity,
  );
  const k = Number.isFinite(scale) ? scale : 1;
  const offX = (PREVIEW_W - spanX * k) / 2, offY = (PREVIEW_H - spanY * k) / 2;
  const q = (id: number): [number, number] | null => {
    const v = at.get(id);
    return v ? [Math.round(offX + (v[0] - minX) * k), Math.round(offY + (v[1] - minY) * k)] : null;
  };

  const seen = new Set<string>();
  const segments = (pairs: [number, number][]): string[] => {
    const out: string[] = [];
    for (const [i, j] of pairs) {
      const a = q(i), b = q(j);
      if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue;
      const [p1, p2] = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
      const key = `${p1[0]},${p1[1]},${p2[0]},${p2[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`M${p1[0]} ${p1[1]}l${p2[0] - p1[0]} ${p2[1] - p1[1]}`);
    }
    return out;
  };

  const memberSegs = segments(src.elements.map((e) => [e.nodeI, e.nodeJ]));
  const shellEdges: [number, number][] = [];
  for (const ring of src.shells) ring.forEach((id, i) => shellEdges.push([id, ring[(i + 1) % ring.length]]));
  const shellSegs = segments(shellEdges);
  const budget = Math.max(0, MAX_SEGMENTS - memberSegs.length);
  const members = thin(memberSegs, MAX_SEGMENTS).join('');
  const shells = thin(shellSegs, budget).join('');

  const seenP = new Set<string>();
  const p: number[] = [];
  for (const s of src.supports) {
    const v = q(s.nodeId);
    if (!v || seenP.has(`${v[0]},${v[1]}`)) continue;
    seenP.add(`${v[0]},${v[1]}`);
    p.push(v[0], v[1]);
  }
  return { w: PREVIEW_W, h: PREVIEW_H, m: members, s: shells, p };
}
