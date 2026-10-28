import { CAD_UNIT_SCALE, type ArchPlan, type CadDocument, type CadEntity, type CadPt, type CadUnit, type LayerMapping } from './types';
import { drawingRegions } from '../model/underlay-regions';
import type { PlanWindow } from './infer';

export function detectPlanWindows(doc: CadDocument, unit: CadUnit, mappings: readonly LayerMapping[]): PlanWindow[] {
  const k = CAD_UNIT_SCALE[unit];
  const structural = new Set(mappings.filter((m) => m.role !== 'ignore').map((m) => m.layer));
  const regions = drawingRegions(doc, unit, structural.size ? { layers: structural } : {});
  if (regions.length < 2) return [];
  const area = (b: { minX: number; minY: number; maxX: number; maxY: number }) => Math.max(b.maxX - b.minX, 1e-9) * Math.max(b.maxY - b.minY, 1e-9);
  const maxArea = Math.max(...regions.map((r) => area(r.box)));
  const maxCount = Math.max(...regions.map((r) => r.count));
  const kept = regions.filter((r) => area(r.box) >= 0.05 * maxArea && r.count >= Math.max(3, 0.05 * maxCount));
  if (kept.length < 2) return [];
  const cx = kept.map((r) => (r.box.minX + r.box.maxX) / 2), cy = kept.map((r) => (r.box.minY + r.box.maxY) / 2);
  const inRow = Math.max(...cx) - Math.min(...cx) >= Math.max(...cy) - Math.min(...cy);
  const order = kept.map((_, i) => i).sort((a, b) => (inRow ? cx[a]! - cx[b]! || cy[a]! - cy[b]! : cy[a]! - cy[b]! || cx[a]! - cx[b]!));
  return order.map((i) => {
    const b = kept[i]!.box;
    // cropDoc keeps only entities wholly inside: without the margin it drops the ones on the border.
    const pad = 0.01 * Math.max(b.maxX - b.minX, b.maxY - b.minY) + 0.05;
    return { x0: (b.minX - pad) / k, x1: (b.maxX + pad) / k, y0: (b.minY - pad) / k, y1: (b.maxY + pad) / k };
  });
}

export function shiftDoc(doc: CadDocument, dx: number, dy: number): CadDocument {
  if (dx === 0 && dy === 0) return doc;
  const p = (q: CadPt): CadPt => ({ x: q.x + dx, y: q.y + dy });
  const entities = doc.entities.map((e): CadEntity => {
    switch (e.kind) {
      case 'line': return { ...e, a: p(e.a), b: p(e.b) };
      case 'polyline': return { ...e, pts: e.pts.map(p) };
      case 'arc': case 'circle': return { ...e, center: p(e.center) };
      case 'insert': return { ...e, at: p(e.at), bbox: e.bbox && { minX: e.bbox.minX + dx, minY: e.bbox.minY + dy, maxX: e.bbox.maxX + dx, maxY: e.bbox.maxY + dy } };
      case 'text': return { ...e, at: p(e.at) };
    }
  });
  const bbox = doc.bbox && { minX: doc.bbox.minX + dx, minY: doc.bbox.minY + dy, maxX: doc.bbox.maxX + dx, maxY: doc.bbox.maxY + dy };
  return { ...doc, entities, bbox };
}

export interface PlanAlignment {
  /** Metres, in the drawing's coordinates. */
  ref: CadPt;
  method: 'base' | 'columns' | 'corner' | 'manual';
  matched: number;
}

const MAX_POINTS = 500;

function anchors(plan: ArchPlan): CadPt[] {
  const pts = plan.columns.map((c) => c.at);
  if (pts.length >= 3) return pts.slice(0, MAX_POINTS);
  const seen = new Set<string>();
  const out = [...pts];
  for (const m of [...plan.beams, ...plan.walls]) for (const q of [m.a, m.b]) {
    const key = `${q.x.toFixed(4)},${q.y.toFixed(4)}`;
    if (!seen.has(key)) { seen.add(key); out.push(q); }
  }
  return out.slice(0, MAX_POINTS);
}

function lowerLeft(plan: ArchPlan): CadPt | null {
  let x = Infinity, y = Infinity;
  const take = (q: CadPt) => { x = Math.min(x, q.x); y = Math.min(y, q.y); };
  for (const c of plan.columns) take(c.at);
  for (const m of [...plan.beams, ...plan.walls]) { take(m.a); take(m.b); }
  for (const s of plan.slabs) s.outline.forEach(take);
  return Number.isFinite(x) ? { x, y } : null;
}

function bestTranslation(P: CadPt[], Q: CadPt[], tol: number, prefer: CadPt): { t: CadPt; score: number } | null {
  if (!P.length || !Q.length) return null;
  const votes = new Map<string, { n: number; t: CadPt }>();
  for (const p of P) for (const q of Q) {
    const t = { x: p.x - q.x, y: p.y - q.y };
    const key = `${Math.round(t.x / tol)},${Math.round(t.y / tol)}`;
    const v = votes.get(key);
    if (v) v.n++; else votes.set(key, { n: 1, t });
  }
  const grid = new Map<string, CadPt[]>();
  const cell = (x: number) => Math.floor(x / tol);
  for (const p of P) { const key = `${cell(p.x)},${cell(p.y)}`; (grid.get(key) ?? grid.set(key, []).get(key)!).push(p); }
  const score = (t: CadPt) => {
    let n = 0;
    for (const q of Q) {
      const x = q.x + t.x, y = q.y + t.y;
      let hit = false;
      for (let i = cell(x) - 1; i <= cell(x) + 1 && !hit; i++) for (let j = cell(y) - 1; j <= cell(y) + 1 && !hit; j++) {
        for (const p of grid.get(`${i},${j}`) ?? []) if (Math.hypot(p.x - x, p.y - y) <= tol) { hit = true; break; }
      }
      if (hit) n++;
    }
    return n;
  };
  const top = [...votes.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  let best: { t: CadPt; score: number; d: number } | null = null;
  for (const v of top) {
    const s = score(v.t), d = Math.hypot(v.t.x - prefer.x, v.t.y - prefer.y);
    if (!best || s > best.score || (s === best.score && d < best.d)) best = { t: v.t, score: s, d };
  }
  return best && { t: best.t, score: best.score };
}

/** `plans` lowest floor first; each plan's ref is chained to the plan below it, so a `fixed` ref moves every plan above it too. */
export function alignPlans(plans: readonly ArchPlan[], fixed: ReadonlyArray<CadPt | null | undefined> = [], tol = 0.05): PlanAlignment[] {
  const out: PlanAlignment[] = [];
  plans.forEach((plan, i) => {
    const hand = fixed[i];
    if (hand) { out.push({ ref: hand, method: 'manual', matched: 0 }); return; }
    const own = anchors(plan);
    const corner = lowerLeft(plan) ?? { x: 0, y: 0 };
    if (i === 0) {
      const cols = plan.columns.map((c) => c.at);
      const ll = cols.length ? cols.reduce((a, b) => (b.x + b.y < a.x + a.y - 1e-9 ? b : a)) : corner;
      out.push({ ref: ll, method: 'base', matched: 0 });
      return;
    }
    const below = plans[i - 1]!, prev = out[i - 1]!;
    const belowCorner = lowerLeft(below) ?? { x: 0, y: 0 };
    const cornerT = { x: belowCorner.x - corner.x, y: belowCorner.y - corner.y };
    const found = bestTranslation(anchors(below), own, tol, cornerT);
    const enough = found && found.score >= 2 && found.score >= Math.ceil(0.3 * Math.min(anchors(below).length, own.length));
    const t = enough ? found!.t : cornerT;
    out.push({ ref: { x: prev.ref.x - t.x, y: prev.ref.y - t.y }, method: enough ? 'columns' : 'corner', matched: enough ? found!.score : 0 });
  });
  return out;
}

/** "2-9", "1, 3–4": floors within 1..n, sorted and unique; null when the text is not a list of floors. */
export function parseFloors(text: string, n: number): number[] | null {
  const out = new Set<number>();
  const parts = text.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return [];
  for (const part of parts) {
    const m = /^(\d+)\s*(?:[-–]\s*(\d+))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    for (let k = Math.min(a, b); k <= Math.max(a, b); k++) if (k >= 1 && k <= n) out.add(k);
  }
  return [...out].sort((a, b) => a - b);
}

export function floorRuns(floors: readonly number[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (const k of [...floors].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && k === last[1] + 1) last[1] = k;
    else if (!last || k > last[1]) runs.push([k, k]);
  }
  return runs;
}

export function formatFloors(floors: readonly number[]): string {
  return floorRuns(floors).map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(', ');
}

/** Plan `r` takes `floors`; every other plan gives them up, so a floor never has two plans. */
export function assignFloors(plans: ReadonlyArray<readonly number[]>, r: number, floors: readonly number[]): number[][] {
  const taken = new Set(floors);
  return plans.map((f, i) => (i === r ? [...taken].sort((a, b) => a - b) : f.filter((k) => !taken.has(k))));
}

/** The plan of each floor 1..n (index into `plans`), or -1 for a floor no plan covers. */
export function planOfFloor(plans: ReadonlyArray<readonly number[]>, n: number): number[] {
  const out = new Array<number>(n).fill(-1);
  plans.forEach((f, i) => { for (const k of f) if (k >= 1 && k <= n && out[k - 1] === -1) out[k - 1] = i; });
  return out;
}
