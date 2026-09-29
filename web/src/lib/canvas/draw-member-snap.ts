/**
 * The member tool's snap markers: what the next click catches, drawn on the
 * point it catches, with its name by the cursor. The shapes are the ones a
 * drafting program uses, so they read without the name: a square on a node,
 * a triangle on a midpoint, a cross on a crossing, the perpendicular sign on
 * its foot, an hourglass anywhere on a member. Level and plumb show as a
 * tracking line through the start.
 */
import type { CanvasTheme } from './theme';
import type { MemberSnap } from '../viewport/member-snap';

type Pt = { x: number; y: number };

const R = 6; // marker half-size, px

export function drawMemberSnap(
  ctx: CanvasRenderingContext2D,
  snap: MemberSnap,
  start: Pt | null,
  label: string,
  toScreen: (x: number, y: number) => Pt,
  cursor: Pt,
  theme: CanvasTheme,
  canvasSize: { width: number; height: number },
  /** How far above the cursor the name goes: further for a finger, which covers the point. */
  lift = 14,
): void {
  const p = toScreen(snap.x, snap.y);
  ctx.save();
  ctx.strokeStyle = theme.amber;
  ctx.lineWidth = 2;
  ctx.beginPath();
  switch (snap.kind) {
    case 'node':
      ctx.rect(p.x - R, p.y - R, 2 * R, 2 * R);
      break;
    case 'midpoint':
      ctx.moveTo(p.x, p.y - R - 1);
      ctx.lineTo(p.x + R + 1, p.y + R);
      ctx.lineTo(p.x - R - 1, p.y + R);
      ctx.closePath();
      break;
    case 'intersection':
      ctx.moveTo(p.x - R, p.y - R); ctx.lineTo(p.x + R, p.y + R);
      ctx.moveTo(p.x + R, p.y - R); ctx.lineTo(p.x - R, p.y + R);
      break;
    case 'perpendicular':
      ctx.moveTo(p.x - R, p.y + R); ctx.lineTo(p.x + R, p.y + R);
      ctx.moveTo(p.x, p.y + R); ctx.lineTo(p.x, p.y - R);
      ctx.moveTo(p.x, p.y + R - 4); ctx.lineTo(p.x + 4, p.y + R - 4); ctx.lineTo(p.x + 4, p.y + R);
      break;
    case 'onMember':
      ctx.moveTo(p.x - R, p.y - R); ctx.lineTo(p.x + R, p.y - R);
      ctx.lineTo(p.x - R, p.y + R); ctx.lineTo(p.x + R, p.y + R);
      ctx.closePath();
      break;
    case 'horizontal':
    case 'vertical': {
      if (start) {
        const s = toScreen(start.x, start.y);
        ctx.save();
        ctx.setLineDash([2, 4]);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        if (snap.kind === 'horizontal') { ctx.moveTo(0, s.y); ctx.lineTo(canvasSize.width, s.y); }
        else { ctx.moveTo(s.x, 0); ctx.lineTo(s.x, canvasSize.height); }
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
      }
      ctx.moveTo(p.x - R + 1, p.y); ctx.lineTo(p.x + R - 1, p.y);
      ctx.moveTo(p.x, p.y - R + 1); ctx.lineTo(p.x, p.y + R - 1);
      break;
    }
    case 'grid':
      ctx.lineWidth = 1.5;
      ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y);
      ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4);
      break;
    case 'free':
      break;
  }
  ctx.stroke();

  // The name, above and to the right of the cursor; a grid point says nothing.
  if (snap.kind !== 'grid' && snap.kind !== 'free' && label) {
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    const w = ctx.measureText(label).width + 12;
    const h = 18;
    let x = cursor.x + 14;
    let y = cursor.y - lift - h;
    if (x + w > canvasSize.width - 4) x = cursor.x - 14 - w;
    if (y < 4) y = cursor.y + 14;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3);
    ctx.fillStyle = theme.surface;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.amber;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = theme.amber;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 6, y + h / 2 + 0.5);
  }
  ctx.restore();
}
