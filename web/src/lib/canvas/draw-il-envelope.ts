/**
 * The envelope drawn from influence lines: the largest and smallest value at each section, as a
 * band along each member. M is drawn on the side of the fibre it tensions (positive below a beam),
 * like the moment diagrams; V and N with positive values toward the member's left normal, like
 * the line itself.
 */
import type { AlongEnvelope } from '../engine/influence/envelope-along';
import { numText } from '../engine/steps/format';

interface Ctx {
  ctx: CanvasRenderingContext2D;
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  getNode: (id: number) => { x: number; y: number } | undefined;
  getElement: (id: number) => { nodeI: number; nodeJ: number } | undefined;
}

const MAX_STROKE = '#e8705f';
const MIN_STROKE = '#6fa8dc';
const BAND = 'rgba(232, 112, 95, 0.12)';
const PX = 60;

export function drawIlEnvelope(env: AlongEnvelope, dc: Ctx): void {
  if (env.globalMax < 1e-12) return;
  const { ctx } = dc;
  const scale = PX / env.globalMax;
  const side = env.quantity === 'M' ? -1 : 1;
  for (const m of env.members) {
    const e = dc.getElement(m.elementId);
    const ni = e && dc.getNode(e.nodeI), nj = e && dc.getNode(e.nodeJ);
    if (!ni || !nj) continue;
    const dx = nj.x - ni.x, dy = nj.y - ni.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-9) continue;
    const s0 = dc.worldToScreen(ni.x, ni.y), s1 = dc.worldToScreen(nj.x, nj.y);
    const sl = Math.hypot(s1.x - s0.x, s1.y - s0.y) || 1;
    const nx = -(s1.y - s0.y) / sl, ny = (s1.x - s0.x) / sl;
    const curve = (vals: number[]) => m.t.map((t, k) => {
      const b = { x: s0.x + t * (s1.x - s0.x), y: s0.y + t * (s1.y - s0.y) };
      const off = side * vals[k] * scale;
      return { x: b.x - nx * off, y: b.y - ny * off };
    });
    const top = curve(m.max), bottom = curve(m.min);
    ctx.beginPath();
    top.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    for (let k = bottom.length - 1; k >= 0; k--) ctx.lineTo(bottom[k].x, bottom[k].y);
    ctx.closePath();
    ctx.fillStyle = BAND;
    ctx.fill();
    for (const [pts, color] of [[top, MAX_STROKE], [bottom, MIN_STROKE]] as const) {
      ctx.beginPath();
      pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    for (const [vals, pts, color] of [[m.max, top, MAX_STROKE], [m.min, bottom, MIN_STROKE]] as const) {
      let k = 0;
      vals.forEach((v, j) => { if (Math.abs(v) > Math.abs(vals[k])) k = j; });
      if (Math.abs(vals[k]) < env.globalMax * 0.05) continue;
      ctx.fillStyle = color;
      const dir = Math.sign(side * vals[k]) || 1;
      ctx.fillText(numText(vals[k], 3), pts[k].x - nx * 10 * dir, pts[k].y - ny * 10 * dir + 3);
    }
  }
}
