/**
 * The model as a numbered figure for the calculation report: members with
 * their numbers at mid-length, nodes with theirs, and the supports. The node
 * and member tables that follow it are read against this drawing, so the
 * numbers are always on, whatever the viewport happens to show.
 *
 * Drawn from the model, not captured from the screen: the same figure at any
 * zoom, with any labels toggled, in 2D or in 3D (an isometric view, Z up).
 * Pure: returns an SVG string.
 */

export interface FigureNode { id: number; x: number; y: number; z?: number }
export interface FigureMember { id: number; nodeI: number; nodeJ: number; type?: string }
export interface FigureSupport { nodeId: number }

export interface ModelFigureInput {
  nodes: readonly FigureNode[];
  elements: readonly FigureMember[];
  supports: readonly FigureSupport[];
  is3D: boolean;
}

/** Width of the figure in CSS pixels; the height follows the model. */
const FIGURE_W = 680;
const MAX_H = 520;
const PAD = 36;
/** Past this many members their numbers would cover the drawing, so they are left out. */
const MAX_MEMBER_LABELS = 400;

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

function project(n: FigureNode, is3D: boolean): { x: number; y: number } {
  if (!is3D) return { x: n.x, y: n.y };
  // Isometric, Z up, seen from above the +X +Y corner: X runs to the lower
  // right, Y to the lower left.
  const z = n.z ?? 0;
  return { x: (n.x - n.y) * COS30, y: z - (n.x + n.y) * SIN30 };
}

const r1 = (v: number) => v.toFixed(1);

export function modelFigureSvg(input: ModelFigureInput): string {
  const pts = new Map<number, { x: number; y: number }>();
  for (const n of input.nodes) pts.set(n.id, project(n, input.is3D));
  if (!pts.size) return '';

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts.values()) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const spanX = maxX - minX, spanY = maxY - minY;
  const span = Math.max(spanX, spanY) || 1;
  const w = spanX || span, h = spanY || span * 0.25;
  const scale = Math.min((FIGURE_W - 2 * PAD) / w, (MAX_H - 2 * PAD) / h);
  const H = Math.max(160, h * scale + 2 * PAD);
  const ox = (FIGURE_W - spanX * scale) / 2, oy = (H - spanY * scale) / 2;
  const sx = (x: number) => ox + (x - minX) * scale;
  const sy = (y: number) => H - oy - (y - minY) * scale;

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" class="model-figure" width="${FIGURE_W}" height="${r1(H)}" viewBox="0 0 ${FIGURE_W} ${r1(H)}" font-family="sans-serif">`);
  out.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);

  // Members
  out.push('<g stroke="#1a4a7a" stroke-width="2" fill="none" stroke-linecap="round">');
  for (const e of input.elements) {
    const a = pts.get(e.nodeI), b = pts.get(e.nodeJ);
    if (!a || !b) continue;
    const dash = e.type === 'truss' ? ' stroke-dasharray="7,4"' : '';
    out.push(`<line x1="${r1(sx(a.x))}" y1="${r1(sy(a.y))}" x2="${r1(sx(b.x))}" y2="${r1(sy(b.y))}"${dash}/>`);
  }
  out.push('</g>');

  // Supports: a triangle under the node.
  out.push('<g fill="#e08a1e" stroke="none">');
  for (const s of input.supports) {
    const p = pts.get(s.nodeId);
    if (!p) continue;
    const x = sx(p.x), y = sy(p.y);
    out.push(`<polygon points="${r1(x)},${r1(y + 3)} ${r1(x - 8)},${r1(y + 15)} ${r1(x + 8)},${r1(y + 15)}"/>`);
  }
  out.push('</g>');

  // Nodes and their numbers.
  out.push('<g>');
  for (const n of input.nodes) {
    const p = pts.get(n.id)!;
    const x = sx(p.x), y = sy(p.y);
    out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="3" fill="#222"/>`);
    out.push(`<text x="${r1(x + 5)}" y="${r1(y - 5)}" font-size="10" fill="#444">${n.id}</text>`);
  }
  out.push('</g>');

  // Member numbers at mid-length, boxed so they read over the lines.
  if (input.elements.length <= MAX_MEMBER_LABELS) {
    out.push('<g font-size="10" text-anchor="middle">');
    for (const e of input.elements) {
      const a = pts.get(e.nodeI), b = pts.get(e.nodeJ);
      if (!a || !b) continue;
      const x = sx((a.x + b.x) / 2), y = sy((a.y + b.y) / 2);
      const label = String(e.id);
      const bw = 6 + label.length * 6;
      out.push(`<rect x="${r1(x - bw / 2)}" y="${r1(y - 7)}" width="${bw}" height="13" rx="2" fill="#ffffff" stroke="#1a4a7a" stroke-width="0.8"/>`);
      out.push(`<text x="${r1(x)}" y="${r1(y + 3.5)}" fill="#1a4a7a">${label}</text>`);
    }
    out.push('</g>');
  }

  out.push('</svg>');
  return out.join('');
}
