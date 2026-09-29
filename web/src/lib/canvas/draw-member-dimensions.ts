/**
 * The dimensions of a member while it is being drawn in 2D: ΔX, ΔZ and its
 * length, in a tag by the cursor, with faint legs along X and Z so the two
 * components can be read off the drawing too.
 *
 * The end is the one the click would make (grid, node or a point on a
 * member), so what the tag says is the member that gets made.
 */
import type { CanvasTheme } from './theme';

type Pt = { x: number; y: number };

/** Components and length of a member from `a` to `b` (plane coordinates, m). */
export function memberDimensions(a: Pt, b: Pt): { dx: number; dz: number; length: number } {
  const dx = b.x - a.x;
  const dz = b.y - a.y;
  return { dx, dz, length: Math.hypot(dx, dz) };
}

/** A length to two decimals, signed with a true minus; −0.00 reads 0.00. */
export function formatDimension(v: number): string {
  const r = Math.round(v * 100) / 100;
  if (r === 0) return '0.00';
  return (r < 0 ? '−' : '') + Math.abs(r).toFixed(2);
}

/** The tag's text, one line: "ΔX 3.00  ΔZ −2.00  L 3.61 m". */
export function memberDimensionLabel(a: Pt, b: Pt): string {
  const { dx, dz, length } = memberDimensions(a, b);
  return `ΔX ${formatDimension(dx)}   ΔZ ${formatDimension(dz)}   L ${formatDimension(length)} m`;
}

export function drawMemberDimensions(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  toScreen: (x: number, y: number) => Pt,
  theme: CanvasTheme,
  canvasSize: { width: number; height: number },
): void {
  const { dx, dz, length } = memberDimensions(a, b);
  if (length < 1e-9) return;
  const sa = toScreen(a.x, a.y);
  const sb = toScreen(b.x, b.y);
  const corner = toScreen(b.x, a.y);

  ctx.save();
  // Legs along X then Z, only when the member is inclined (otherwise the
  // member itself is the one leg there is).
  if (Math.abs(dx) > 1e-9 && Math.abs(dz) > 1e-9) {
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(corner.x, corner.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.strokeStyle = theme.textDim;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  const text = memberDimensionLabel(a, b);
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const w = ctx.measureText(text).width + 14;
  const h = 20;
  // Beside the cursor, below and to the right; kept on the canvas.
  let x = sb.x + 14;
  let y = sb.y + 14;
  if (x + w > canvasSize.width - 4) x = sb.x - 14 - w;
  if (y + h > canvasSize.height - 4) y = sb.y - 14 - h;
  x = Math.max(4, x);
  y = Math.max(4, y);

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fillStyle = theme.surface;
  ctx.globalAlpha = 0.92;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = theme.axis;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = theme.text;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, x + 7, y + h / 2 + 0.5);
  ctx.restore();
}
