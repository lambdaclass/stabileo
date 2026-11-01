/**
 * The placement ghost on the plane canvas: what is being placed, where the transform puts it, the
 * nodes it will weld onto and the point the anchor goes to. The space viewer draws its own
 * (`three/placement-ghost.ts`).
 */
import { applyPoint, type Affine, type Vec3 } from '../model/edit/affine';
import type { Fragment } from '../model/edit/fragment';
import type { CanvasTheme } from './theme';

type ToScreen = (p: Vec3) => { x: number; y: number };

export function drawPlacementGhost(
  ctx: CanvasRenderingContext2D,
  frag: Fragment,
  T: Affine,
  welds: readonly Vec3[],
  target: Vec3,
  onNode: boolean,
  toScreen: ToScreen,
  theme: CanvasTheme,
): void {
  const at = new Map(frag.nodes.map((n) => [n.id, toScreen(applyPoint(T, [n.x, n.y, n.z]))]));
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = theme.accent;
  ctx.fillStyle = theme.accent;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  for (const e of frag.elements) {
    const a = at.get(e.nodeI), b = at.get(e.nodeJ);
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  for (const p of at.values()) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = theme.amber;
  ctx.lineWidth = 2;
  for (const w of welds) {
    const p = toScreen(w);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.stroke();
  }
  const c = toScreen(target);
  ctx.strokeStyle = onNode ? theme.amber : theme.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(c.x - 10, c.y); ctx.lineTo(c.x + 10, c.y);
  ctx.moveTo(c.x, c.y - 10); ctx.lineTo(c.x, c.y + 10);
  ctx.stroke();
  ctx.restore();
}
