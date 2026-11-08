import { rebarGroupArea } from '../engine/station-design-forces';
import { chooseBars } from '../engine/codes/argentina/cirsoc201-bars';
import { barsPerRow, layerClearBetween, minClearSpacingInLayer } from '../codes/cirsoc201/spacing';
import type { BarGroup, MeshBars, Stirrups } from './types';

export const barArea = (dia: number): number => rebarGroupArea({ count: 1, diameter: dia });

export const groupsArea = (groups: readonly BarGroup[]): number => groups.reduce((s, g) => s + g.count * barArea(g.dia), 0);

export const groupsLabel = (groups: readonly BarGroup[]): string =>
  groups.filter((g) => g.count > 0).map((g) => `${g.count} Ø${g.dia}`).join(' + ') || '—';

export const stirrupsLabel = (s: Stirrups): string => `${s.legs > 2 ? `${s.legs}r ` : ''}Ø${s.dia} c/${Math.round(s.spacing * 100)}`;

export const meshLabel = (m: MeshBars): string => `Ø${m.dia} c/${Math.round(m.spacing * 100)}`;

export const meshArea = (m: MeshBars): number => (m.spacing > 0 ? barArea(m.dia) / m.spacing : 0);

export const minClearSpacing = (dia: number): number => minClearSpacingInLayer('2025', { barDiameterMm: dia, maxAggregateSizeMm: 0 }).minClear;

/** Each bar of a face, layer by layer (one group per layer, the first at the face): across from the left side and in from the face, m. */
export function faceBars(groups: readonly BarGroup[], b: number, cover: number, stirrupDia: number): Array<{ x: number; depth: number; dia: number }> {
  const out: Array<{ x: number; depth: number; dia: number }> = [];
  let y = cover + stirrupDia / 1000;
  const used = groups.filter((g) => g.count > 0);
  used.forEach((g, i) => {
    if (i > 0) y += used[i - 1]!.dia / 1000 + layerClearBetween('2025', used[i - 1]!.dia, g.dia);
    const edge = cover + stirrupDia / 1000 + g.dia / 2000;
    for (let k = 0; k < g.count; k++) out.push({ x: g.count > 1 ? edge + (k * (b - 2 * edge)) / (g.count - 1) : b / 2, depth: y + g.dia / 2000, dia: g.dia });
  });
  return out;
}

export function faceLayout(groups: readonly BarGroup[], b: number, cover: number, stirrupDia: number): {
  centroidFromFace: number; fits: boolean; clear: number[];
} {
  const inner = b - 2 * cover - 2 * stirrupDia / 1000;
  const bars = faceBars(groups, b, cover, stirrupDia);
  const area = bars.reduce((s, x) => s + barArea(x.dia), 0);
  const moment = bars.reduce((s, x) => s + barArea(x.dia) * x.depth, 0);
  const clear = groups.filter((g) => g.count > 0).map((g) => (g.count > 1 ? (inner - g.count * g.dia / 1000) / (g.count - 1) : inner - g.dia / 1000));
  const fits = groups.filter((g) => g.count > 0).every((g, i) => clear[i]! >= minClearSpacing(g.dia) - 1e-4);
  return { centroidFromFace: area > 0 ? moment / area : cover + stirrupDia / 1000 + 0.008, fits, clear };
}

export function proposeBeamFace(AsCm2: number, b: number, h: number, cover: number, stirrupDia: number, diameters: readonly number[]): BarGroup[] {
  const allowed = diameters.filter((d) => d >= 10 && d <= 25);
  const pick = chooseBars(Math.max(AsCm2, 0), { widthM: b, coverM: cover + stirrupDia / 1000 + 0.008, minCount: 2, maxLayers: 2, heightM: h });
  const dia = allowed.includes(pick.diameter) ? pick.diameter : nearest(allowed, pick.diameter);
  const n = Math.max(2, Math.ceil(AsCm2 / barArea(dia)));
  const perLayer = Math.max(2, barsPerRow(b - 2 * cover - 2 * stirrupDia / 1000, dia, minClearSpacingInLayer('2025', { barDiameterMm: dia, maxAggregateSizeMm: 0 }), Infinity));
  if (n <= perLayer) return [{ count: n, dia }];
  return [{ count: perLayer, dia }, { count: Math.max(2, n - perLayer), dia }];
}

const nearest = (list: readonly number[], d: number): number =>
  list.length ? list.reduce((a, x) => (Math.abs(x - d) < Math.abs(a - d) ? x : a)) : d;

export const roundDown = (s: number, step = 0.025): number => Math.max(step, Math.floor(s / step + 1e-9) * step);

export function proposeMesh(AsCm2: number, sMax: number, diameters: readonly number[]): MeshBars {
  const ds = diameters.filter((d) => d >= 8 && d <= 16);
  for (const floor of [0.1, 0.075]) {
    for (const dia of ds.length ? ds : [8, 10, 12]) {
      const s = roundDown(Math.min(sMax, barArea(dia) / Math.max(AsCm2, 1e-9)));
      if (s >= floor - 1e-9) return { dia, spacing: s };
    }
  }
  const dia = ds[ds.length - 1] ?? 12;
  return { dia, spacing: roundDown(Math.max(0.05, Math.min(sMax, barArea(dia) / Math.max(AsCm2, 1e-9)))) };
}
