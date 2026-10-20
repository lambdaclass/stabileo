/**
 * The reinforcement plan of a level's slabs, one sheet per layer (bottom x, bottom y, top x,
 * top y): the panels' outlines, the base mat of the layer stated with the panels it covers, and
 * every band whose bars run in the layer's direction drawn as its bar through the middle (with its
 * hooks) and its distribution line, under a mark with its count, diameter, spacing and length.
 * Equal bands grouped as a package share one mark. Beside the four, the breakdown: each mark's
 * bars, length and weight.
 */
import type { DrawingInput } from '../compose';
import type { P, Primitive } from '../primitives';
import { boxOf, drawAxes, type PlanAxis } from './plan-common';
import { drawTable } from './table';
import type { Tr } from './details';
import { bandAngle, bandBars, bandOutline } from '../../engine/detailing/slab-bands';
import type { SlabBand, SlabPanelReinforcement } from '../../design-contract/reinforcement';

export type SlabLayer = 'bottomX' | 'bottomY' | 'topX' | 'topY';
export const SLAB_LAYERS: readonly SlabLayer[] = ['bottomX', 'bottomY', 'topX', 'topY'];

export interface PlanSlabPanel { id: string; x0: number; x1: number; y0: number; y1: number; reinforcement: SlabPanelReinforcement }

export interface SlabMark { mark: string; layer: SlabLayer; panel: string; bands: SlabBand[]; count: number; diameter: number; spacing: number; length: number; hooks: number }

const k = 1000;
/** The layer a band's bars belong to: its face, and the axis its angle is nearer. */
export function layerOf(b: SlabBand): SlabLayer {
  const a = ((bandAngle(b) % 180) + 180) % 180;
  const x = a <= 45 || a >= 135;
  return `${b.face}${x ? 'X' : 'Y'}` as SlabLayer;
}

/** The level's marks, layer by layer: one per band, one per package. */
export function slabMarks(panels: readonly PlanSlabPanel[]): SlabMark[] {
  const out: SlabMark[] = [];
  const prefix: Record<SlabLayer, string> = { bottomX: 'IX', bottomY: 'IY', topX: 'SX', topY: 'SY' };
  for (const layer of SLAB_LAYERS) {
    let n = 0;
    for (const p of [...panels].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))) {
      const seen = new Set<string>();
      for (const b of p.reinforcement.bands.filter((x) => layerOf(x) === layer)) {
        if (b.group && seen.has(b.group)) continue;
        const members = b.group ? p.reinforcement.bands.filter((x) => x.group === b.group && layerOf(x) === layer) : [b];
        if (b.group) seen.add(b.group);
        const bars = members.map(bandBars);
        out.push({
          mark: `${prefix[layer]}${++n}`, layer, panel: p.id, bands: members,
          count: bars.reduce((s, x) => s + x.count, 0), diameter: b.diameter, spacing: b.spacing,
          length: Math.max(...bars.map((x) => x.length)), hooks: bars[0]!.hooks,
        });
      }
    }
  }
  return out;
}

const cm = (v: number) => Math.round(v * 100);

/** One layer's sheet; null when the level has nothing in that layer. */
export function slabLayerPlan(level: string, layer: SlabLayer, panels: readonly PlanSlabPanel[], marks: readonly SlabMark[], axes: readonly PlanAxis[], scale: number, tr: Tr, fmt: (v: number, d: number) => string): DrawingInput | null {
  const mine = marks.filter((m) => m.layer === layer);
  const bases = panels.filter((p) => p.reinforcement.base[layer]);
  if (!mine.length && !bases.length) return null;
  const s = scale, out: Primitive[] = [], pts: P[] = [];
  for (const p of panels) {
    const o = [{ x: p.x0 * k, y: p.y0 * k }, { x: p.x1 * k, y: p.y0 * k }, { x: p.x1 * k, y: p.y1 * k }, { x: p.x0 * k, y: p.y1 * k }];
    out.push({ kind: 'polyline', layer: 'FW-OUTLINE', closed: true, points: o });
    out.push({ kind: 'text', layer: 'FW-TAG', at: { x: p.x0 * k + 1.5 * s, y: p.y1 * k - 3.5 * s }, text: p.id, height: 2.2 });
    pts.push(...o);
  }
  for (const m of mine) {
    for (const b of m.bands) {
      const bars = bandBars(b), outline = bandOutline(b).map((q) => ({ x: q.x * k, y: q.y * k }));
      out.push({ kind: 'polyline', layer: 'RC-BAND', closed: true, points: outline });
      const [a, c] = bars.bar.map((q) => ({ x: q.x * k, y: q.y * k })) as [P, P];
      out.push({ kind: 'line', layer: 'RC-BAR', a, b: c });
      // Hooks drawn as a short leg at right angles at each hooked end.
      const t = (bandAngle(b) * Math.PI) / 180, leg = 2 * s, n = { x: -Math.sin(t) * leg, y: Math.cos(t) * leg };
      const down = b.face === 'top' ? -1 : 1;
      if (b.hookStart) out.push({ kind: 'line', layer: 'RC-BAR', a, b: { x: a.x + down * n.x, y: a.y + down * n.y } });
      if (b.hookEnd) out.push({ kind: 'line', layer: 'RC-BAR', a: c, b: { x: c.x + down * n.x, y: c.y + down * n.y } });
      const [d0, d1] = bars.spread.map((q) => ({ x: q.x * k, y: q.y * k })) as [P, P];
      out.push({ kind: 'line', layer: 'RC-DIM', a: d0, b: d1 });
      for (const e of [d0, d1]) out.push({ kind: 'circle', layer: 'RC-DIM', c: e, r: 0.6 * s, fill: true });
    }
    const first = m.bands[0]!, mid = bandBars(first).bar;
    const at = first.label ? { x: first.label.x * k, y: first.label.y * k } : { x: ((mid[0].x + mid[1].x) / 2) * k + 1 * s, y: ((mid[0].y + mid[1].y) / 2) * k + 1 * s };
    out.push({ kind: 'text', layer: 'RC-TEXT', at, text: `${m.mark} ${m.count}Ø${m.diameter} c/${cm(m.spacing)} L=${fmt(m.length, 2)}${m.bands.length > 1 ? ` (${m.bands.length}×)` : ''}`, height: 2.4 });
  }
  // The base mat drawn in each panel that has one, as a slab plan draws a mesh: one bar of it
  // across the panel, the spread it repeats over dimensioned across, and the bar's diameter and
  // spacing. Stated only in a line of text, a bottom layer of base mats alone drew no bar at all
  // (QA of 20-oct).
  const alongX = layer.endsWith('X');
  for (const p of bases) {
    const b = p.reinforcement.base[layer]!;
    const inset = 0.05;
    const xm = (p.x0 + p.x1) / 2, ym = (p.y0 + p.y1) / 2;
    // A bottom mat's bar a little off the middle and a top mat's on the other side, so the two
    // layers of one panel never sit on one line when both are shown.
    const shift = (layer.startsWith('top') ? -1 : 1) * 0.12 * (alongX ? p.y1 - p.y0 : p.x1 - p.x0);
    const a = alongX ? { x: (p.x0 + inset) * k, y: (ym + shift) * k } : { x: (xm + shift) * k, y: (p.y0 + inset) * k };
    const c = alongX ? { x: (p.x1 - inset) * k, y: (ym + shift) * k } : { x: (xm + shift) * k, y: (p.y1 - inset) * k };
    out.push({ kind: 'line', layer: 'RC-BAR', a, b: c, dia: b.diameter });
    const d0 = alongX ? { x: (xm + 0.18 * (p.x1 - p.x0)) * k, y: (p.y0 + inset) * k } : { x: (p.x0 + inset) * k, y: (ym + 0.18 * (p.y1 - p.y0)) * k };
    const d1 = alongX ? { x: d0.x, y: (p.y1 - inset) * k } : { x: (p.x1 - inset) * k, y: d0.y };
    out.push({ kind: 'line', layer: 'RC-DIM', a: d0, b: d1 });
    for (const e of [d0, d1]) out.push({ kind: 'circle', layer: 'RC-DIM', c: e, r: 0.6 * s, fill: true });
    out.push({ kind: 'text', layer: 'RC-TEXT', at: { x: (a.x + c.x) / 2 + 1 * s, y: (a.y + c.y) / 2 + 1 * s }, text: `Ø${b.diameter} c/${cm(b.spacing)}`, height: 2.4 });
  }
  const box = boxOf(pts);
  out.push(...drawAxes(axes, box, s));
  // The base mats of the layer, stated once with the panels each covers.
  const meshes = new Map<string, string[]>();
  for (const p of bases) { const b = p.reinforcement.base[layer]!; const key = `Ø${b.diameter} c/${cm(b.spacing)}`; meshes.set(key, [...(meshes.get(key) ?? []), p.id]); }
  const baseText = meshes.size ? [...meshes].map(([m, ps]) => `${m} (${ps.join(', ')})`).join(' · ') : tr('plan.slab.noBase');
  out.push({ kind: 'text', layer: 'RC-TEXT', at: { x: box.x0, y: box.y1 + 8 * s }, text: tr('plan.slab.base', { mesh: baseText }), height: 2.6 });
  const all = boxOf([...pts, { x: box.x0 - 20 * s, y: box.y0 - 20 * s }, { x: box.x1 + 20 * s, y: box.y1 + 20 * s }]);
  const title = tr('plan.slab.title', { level, layer: tr(`plan.slab.layer.${layer}`) });
  return { key: `slab-${level}-${layer}`, title, primitives: out, width: all.x1 - all.x0, height: all.y1 - all.y0, origin: { x: all.x0, y: all.y0 }, scale: s };
}

/** The breakdown of the level's slab marks: bars, length, total and weight per mark. */
export function slabBreakdown(level: string, marks: readonly SlabMark[], tr: Tr, fmt: (v: number, d: number) => string): DrawingInput | null {
  if (!marks.length) return null;
  const kg = (d: number) => (Math.PI * (d / 2000) ** 2) * 7850;
  const rows = marks.map((m) => [m.mark, tr(`plan.slab.layer.${m.layer}`), m.panel, String(m.count), `Ø${m.diameter}`, fmt(m.length, 2), String(m.hooks), fmt(m.count * m.length, 1), fmt(m.count * m.length * kg(m.diameter), 1)]);
  const total = marks.reduce((s, m) => s + m.count * m.length * kg(m.diameter), 0);
  rows.push([tr('plan.slab.total'), '', '', '', '', '', '', '', fmt(total, 1)]);
  const t = drawTable({
    columns: [
      { label: tr('plan.slab.col.mark'), width: 16 }, { label: tr('plan.slab.col.layer'), width: 30 }, { label: tr('plan.slab.col.panel'), width: 18 },
      { label: tr('plan.slab.col.count'), width: 14, align: 'right' as const }, { label: 'Ø', width: 12 }, { label: 'L (m)', width: 16, align: 'right' as const },
      { label: tr('plan.slab.col.hooks'), width: 14, align: 'right' as const }, { label: tr('plan.slab.col.total'), width: 20, align: 'right' as const }, { label: 'kg', width: 18, align: 'right' as const },
    ],
    rows,
  });
  return { key: `slab-${level}-breakdown`, title: tr('plan.slab.breakdown', { level }), primitives: t.primitives, width: t.width, height: t.height, origin: { x: 0, y: 0 }, paper: true };
}
