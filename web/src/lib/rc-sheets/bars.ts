import { rebarGroupArea } from '../engine/station-design-forces';
import { chooseBars } from '../engine/codes/argentina/cirsoc201-bars';
import { barsPerRow, layerClearBetween, minClearSpacingInLayer } from '../codes/cirsoc201/spacing';
import { minMandrelDiameter, standardHook } from '../codes/cirsoc201/bar-geometry';
import type { BendRules } from './shape';
import type { BarGroup, MeshBars, Stirrups } from './types';

export const barArea = (dia: number): number => rebarGroupArea({ count: 1, diameter: dia });

export const groupsArea = (groups: readonly BarGroup[]): number => groups.reduce((s, g) => s + g.count * barArea(g.dia), 0);

export const groupsLabel = (groups: readonly BarGroup[]): string =>
  groups.filter((g) => g.count > 0).map((g) => `${g.count} Ø${g.dia}`).join(' + ') || '—';

export const stirrupsLabel = (s: Stirrups): string => `${s.legs > 2 ? `${s.legs}r ` : ''}Ø${s.dia} c/${Math.round(s.spacing * 100)}`;

export const meshLabel = (m: MeshBars): string => `Ø${m.dia} c/${Math.round(m.spacing * 100)}`;

export const meshArea = (m: MeshBars): number => (m.spacing > 0 ? barArea(m.dia) / m.spacing : 0);

export const minClearSpacing = (dia: number): number => minClearSpacingInLayer('2025', { barDiameterMm: dia, maxAggregateSizeMm: 0 }).minClear;

/** How many bars of `dia` (mm) fit in one row across `inner` (m) at the code's least clear spacing. */
const rowCapacity = (inner: number, dia: number) => {
  const gap = minClearSpacing(dia);
  return Math.max(2, Math.floor((inner + gap) / (dia / 1000 + gap) + 1e-9));
};

/**
 * Each bar of a face, row by row from the face in: across from the left side and in from the face, m.
 * The first group's two bars hold the corners; the rest fill the first row symmetrically, the largest
 * first, as many as the least clear spacing lets in, and only what does not fit goes to the next row,
 * so the steel sits as far from the neutral axis as it can.
 */
export function faceBars(groups: readonly BarGroup[], b: number, cover: number, stirrupDia: number): Array<{ x: number; depth: number; dia: number; row: number }> {
  const used = groups.filter((g) => g.count > 0);
  if (!used.length) return [];
  const inner = b - 2 * cover - 2 * stirrupDia / 1000;
  const corner = used[0]!;
  const pool: number[] = [];
  if (corner.count === 1) pool.push(corner.dia);
  else for (let k = 2; k < corner.count; k++) pool.push(corner.dia);
  for (const g of used.slice(1)) for (let k = 0; k < g.count; k++) pool.push(g.dia);
  pool.sort((p, q) => q - p);
  const rows: number[][] = [];
  let first = true;
  while (first || pool.length) {
    const edgeDias = first && corner.count >= 2 ? [corner.dia, corner.dia] : [];
    const big = Math.max(...edgeDias, ...pool.slice(0, 1), 0);
    const slots = rowCapacity(inner, big) - edgeDias.length;
    const inside: number[] = [];
    const counts = new Map<number, number>();
    for (const d of pool) counts.set(d, (counts.get(d) ?? 0) + 1);
    for (const d of [...counts.keys()].sort((p, q) => q - p)) {
      while ((counts.get(d) ?? 0) >= 2 && inside.length + 2 <= slots) { inside.push(d, d); counts.set(d, counts.get(d)! - 2); }
    }
    if (inside.length < slots && inside.length % 2 === 0) {
      const single = [...counts.entries()].filter(([, n]) => n > 0).sort((p, q) => q[0] - p[0])[0];
      if (single && inside.length < slots) { inside.push(single[0]); counts.set(single[0], single[1] - 1); }
    }
    const pairs: number[] = [];
    for (let i = 0; i + 1 < inside.length; i += 2) pairs.push(inside[i]!);
    const centre = inside.length % 2 === 1 ? [inside[inside.length - 1]!] : [];
    const ordered = [...edgeDias.slice(0, 1), ...pairs, ...centre, ...[...pairs].reverse(), ...edgeDias.slice(1)];
    if (!ordered.length) break;
    rows.push(ordered);
    for (const d of inside) pool.splice(pool.indexOf(d), 1);
    first = false;
  }
  const out: Array<{ x: number; depth: number; dia: number; row: number }> = [];
  let y = cover + stirrupDia / 1000;
  rows.forEach((row, r) => {
    const rowDia = Math.max(...row);
    if (r > 0) { const prev = Math.max(...rows[r - 1]!); y += prev / 1000 + layerClearBetween('2025', prev, rowDia); }
    const edge = cover + stirrupDia / 1000 + rowDia / 2000;
    row.forEach((dia, k) => out.push({ x: row.length > 1 ? edge + (k * (b - 2 * edge)) / (row.length - 1) : b / 2, depth: y + rowDia / 2000, dia, row: r }));
  });
  return out;
}

export function faceLayout(groups: readonly BarGroup[], b: number, cover: number, stirrupDia: number): {
  centroidFromFace: number; fits: boolean; clear: number[];
} {
  const bars = faceBars(groups, b, cover, stirrupDia);
  const area = bars.reduce((s, x) => s + barArea(x.dia), 0);
  const moment = bars.reduce((s, x) => s + barArea(x.dia) * x.depth, 0);
  const clear: number[] = [];
  let fits = true;
  for (const r of [...new Set(bars.map((x) => x.row))]) {
    const row = bars.filter((x) => x.row === r).sort((p, q) => p.x - q.x);
    for (let k = 1; k < row.length; k++) {
      const gap = row[k]!.x - row[k - 1]!.x - (row[k]!.dia + row[k - 1]!.dia) / 2000;
      clear.push(gap);
      if (gap < minClearSpacing(Math.max(row[k]!.dia, row[k - 1]!.dia)) - 1e-4) fits = false;
    }
    if (row.length === 1) clear.push(b - 2 * cover - 2 * stirrupDia / 1000 - row[0]!.dia / 1000);
  }
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

/** CIRSOC 201-2025 and ACI 318-19: Tables 25.3.1 (bars) and 25.3.2 (stirrups and ties); cross ties hooked 135° and 90° (§25.7.1.6). */
export const ACI_BENDS: BendRules = {
  mandrel: (dia, use) => minMandrelDiameter(dia, use).value,
  extension: (dia, angle, use) => standardHook(dia, angle, use).extension,
  crossTieHooks: [135, 90],
  clause: '§25.3.1, §25.3.2',
};
