/**
 * The dimensions of a member while it is being drawn in 2D, as a drawing
 * would give them: the length over the member's ghost, along it, and ΔX and
 * ΔZ on faint legs along X and Z when the member is inclined.
 *
 * The end is the one the click would make (see member-snap), so the figures
 * are those of the member that gets made.
 */
import type { CanvasTheme } from './theme';
import { canvasUnitSystem } from './canvas-units';
import { toDisplay, unitLabel, type UnitSystem } from '../utils/units';

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

/**
 * The three labels: the length over the ghost, and the two legs, in the unit
 * system the canvas is drawn in. The legs carry no unit of their own: they sit
 * beside the length, which names it.
 */
export function memberDimensionLabels(a: Pt, b: Pt, us: UnitSystem = canvasUnitSystem()): { length: string; dx: string; dz: string } {
  const { dx, dz, length } = memberDimensions(a, b);
  const len = (v: number) => formatDimension(toDisplay(v, 'length', us));
  return {
    length: `${len(length)} ${unitLabel('length', us)}`,
    dx: `ΔX ${len(dx)}`,
    dz: `ΔZ ${len(dz)}`,
  };
}

const FONT = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** A label in a small tag centred on (x, y), turned by `angle`. */
function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, angle: number, theme: CanvasTheme, strong: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.font = FONT;
  const w = ctx.measureText(text).width + 10;
  const h = 17;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 3);
  ctx.fillStyle = theme.surface;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;
  if (strong) {
    ctx.strokeStyle = theme.axis;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = strong ? theme.text : theme.textDim;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0.5);
  ctx.restore();
}

export function drawMemberDimensions(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  toScreen: (x: number, y: number) => Pt,
  theme: CanvasTheme,
): void {
  const { dx, dz, length } = memberDimensions(a, b);
  if (length < 1e-9) return;
  const labels = memberDimensionLabels(a, b);
  const sa = toScreen(a.x, a.y);
  const sb = toScreen(b.x, b.y);
  const sl = Math.hypot(sb.x - sa.x, sb.y - sa.y);
  if (sl < 2) return;

  ctx.save();
  const inclined = Math.abs(dx) > 1e-9 && Math.abs(dz) > 1e-9;
  if (inclined) {
    const corner = toScreen(b.x, a.y);
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
    // ΔX under (or over) its leg, ΔZ beside its leg, each on the outside.
    const below = sb.y < sa.y ? 12 : -12;
    tag(ctx, labels.dx, (sa.x + corner.x) / 2, corner.y + below, 0, theme, false);
    const side = sb.x > sa.x ? 1 : -1;
    ctx.font = FONT;
    const half = ctx.measureText(labels.dz).width / 2 + 10;
    tag(ctx, labels.dz, corner.x + side * half, (corner.y + sb.y) / 2, 0, theme, false);
  }

  // The length over the ghost's middle, along it, kept upright, on the side away from the legs.
  let angle = Math.atan2(sb.y - sa.y, sb.x - sa.x);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  const ux = (sb.x - sa.x) / sl, uy = (sb.y - sa.y) / sl;
  let nx = -uy, ny = ux;
  if (inclined) {
    // The legs sit on the corner's side; put the length on the other.
    const corner = toScreen(b.x, a.y);
    const mx = (sa.x + sb.x) / 2, my = (sa.y + sb.y) / 2;
    if ((corner.x - mx) * nx + (corner.y - my) * ny > 0) { nx = -nx; ny = -ny; }
  } else if (ny > 0) { nx = -nx; ny = -ny; }
  const off = 13;
  tag(ctx, labels.length, (sa.x + sb.x) / 2 + nx * off, (sa.y + sb.y) / 2 + ny * off, angle, theme, true);
  ctx.restore();
}
