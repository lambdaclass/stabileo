/**
 * Batch edits for the families the member batch does not reach: walls, slab panels, footings and
 * stairs. Each takes the same few fields over every selected item, shows each item before and
 * after, and blocks (lists, never applies) an item whose result would break a limit: a spacing
 * under 50 mm or over the family's maximum, a diameter the project does not use.
 *
 * Pure: the caller reads the current arrangements and writes the result, one undo step.
 */
import type { SlabPanelReinforcement, WallReinforcement } from '../../design-contract/reinforcement';

export interface MatPatch { diameter?: number; spacing?: number }
export interface Mat { diameter: number; spacing: number }

export interface FamilyRow<T> {
  id: string; label: string;
  before: string; after: string;
  /** What is written; absent when the row is blocked or nothing changes. */
  next?: T;
  blocked?: { key: string; params: Record<string, string | number> };
}

const MIN_S = 0.05;
const fmt = (m?: Mat | null) => (m ? `Ø${m.diameter} c/${Math.round(m.spacing * 100)}` : '—');

function patchMat(m: Mat | undefined, p: MatPatch | undefined, maxS: number, dias: readonly number[]): { mat?: Mat; blocked?: FamilyRow<never>['blocked'] } {
  if (!p) return m ? { mat: m } : {};
  const diameter = p.diameter ?? m?.diameter, spacing = p.spacing ?? m?.spacing;
  if (diameter === undefined || spacing === undefined) return { blocked: { key: 'design.fbatch.incomplete', params: {} } };
  if (!dias.includes(diameter)) return { blocked: { key: 'design.fbatch.diameter', params: { d: diameter } } };
  if (spacing < MIN_S - 1e-9 || spacing > maxS + 1e-9) return { blocked: { key: 'design.fbatch.spacingRange', params: { s: Math.round(spacing * 1000), min: MIN_S * 1000, max: Math.round(maxS * 1000) } } };
  return { mat: { diameter, spacing } };
}

function row<T>(id: string, label: string, before: string, after: string, next: T, blocked?: FamilyRow<T>['blocked']): FamilyRow<T> {
  if (blocked) return { id, label, before, after: '—', blocked };
  return { id, label, before, after, ...(before !== after ? { next } : {}) };
}

// ── Walls ──
export interface WallPatch { vertical?: MatPatch; horizontal?: MatPatch; curtains?: 1 | 2 }

export function planWallBatch(items: ReadonlyArray<{ id: string; label: string; current: WallReinforcement; thickness: number }>, p: WallPatch, dias: readonly number[]): FamilyRow<WallReinforcement>[] {
  return items.map(({ id, label, current, thickness }) => {
    // §11.7.2.1 / §11.7.3.1: spacing up to 3 h and 450 mm.
    const maxS = Math.min(0.45, 3 * thickness);
    const v = patchMat(current.vertical, p.vertical, maxS, dias), h = patchMat(current.horizontal, p.horizontal, maxS, dias);
    const next: WallReinforcement = { ...current, vertical: v.mat ?? current.vertical, horizontal: h.mat ?? current.horizontal, ...(p.curtains ? { curtains: p.curtains } : {}) };
    const show = (r: WallReinforcement) => `V ${fmt(r.vertical)} · H ${fmt(r.horizontal)} · ${r.curtains}×`;
    return row(id, label, show(current), show(next), next, v.blocked ?? h.blocked);
  });
}

// ── Slab panels ──
export type SlabKey = 'bottomX' | 'bottomY' | 'topX' | 'topY';
export interface SlabPatch {
  /** Per face and direction: a mat, or null to take that base mat off. */
  base?: Partial<Record<SlabKey, MatPatch | null>>;
  /** Every band of the panel: diameter, spacing, hooked ends. */
  bands?: MatPatch & { hooks?: boolean };
}

export function planSlabBatch(items: ReadonlyArray<{ id: string; label: string; current: SlabPanelReinforcement; thickness: number }>, p: SlabPatch, dias: readonly number[]): FamilyRow<SlabPanelReinforcement>[] {
  return items.map(({ id, label, current, thickness }) => {
    // §8.7.2.2: in a two-way slab, spacing up to 2 h and 450 mm; base mats and bands alike.
    const maxS = Math.min(0.45, 2 * thickness);
    let blocked: FamilyRow<never>['blocked'];
    const base = { ...current.base };
    for (const k of ['bottomX', 'bottomY', 'topX', 'topY'] as const) {
      if (!p.base || !(k in p.base)) continue;
      const q = p.base[k];
      if (q === null) { delete base[k]; continue; }
      const r = patchMat(base[k], q, maxS, dias);
      if (r.blocked) blocked ??= r.blocked; else if (r.mat) base[k] = r.mat;
    }
    const bands = current.bands.map((b) => {
      if (!p.bands) return b;
      const r = patchMat({ diameter: b.diameter, spacing: b.spacing }, p.bands, maxS, dias);
      if (r.blocked) { blocked ??= r.blocked; return b; }
      return { ...b, ...r.mat!, ...(p.bands.hooks !== undefined ? { hookStart: p.bands.hooks || undefined, hookEnd: p.bands.hooks || undefined } : {}) };
    });
    const next: SlabPanelReinforcement = { base, bands };
    const show = (r: SlabPanelReinforcement) => (['bottomX', 'bottomY', 'topX', 'topY'] as const).map((k) => `${k} ${fmt(r.base[k])}`).join(' · ') + ` · ${r.bands.length} b ${r.bands.map((b) => `${fmt(b)}${b.hookStart || b.hookEnd ? '⌐' : ''}`).join(',')}`;
    return row(id, label, show(current), show(next), next, blocked);
  });
}

// ── Footings ──
export interface FootingMat { diameterMm: number; spacing: number }
export interface FootingMatsShape { bottomX: FootingMat; bottomY: FootingMat; topX?: FootingMat; topY?: FootingMat }
export interface FootingPatch { bottom?: MatPatch; top?: MatPatch | null }

export function planFootingBatch(items: ReadonlyArray<{ id: string; label: string; current: FootingMatsShape | undefined }>, p: FootingPatch, dias: readonly number[]): FamilyRow<FootingMatsShape>[] {
  // §7.7.2.3 / §13.3: a footing's mats up to 3 h and 450 mm; footings are thicker than 150 mm.
  const maxS = 0.45;
  const to = (m?: FootingMat): Mat | undefined => (m ? { diameter: m.diameterMm, spacing: m.spacing } : undefined);
  const from = (m: Mat): FootingMat => ({ diameterMm: m.diameter, spacing: m.spacing });
  return items.map(({ id, label, current }) => {
    let blocked: FamilyRow<never>['blocked'];
    const mat = (m: FootingMat | undefined, q: MatPatch | undefined) => { const r = patchMat(to(m), q, maxS, dias); if (r.blocked) blocked ??= r.blocked; return r.mat ? from(r.mat) : m; };
    const bx = mat(current?.bottomX, p.bottom), by = mat(current?.bottomY, p.bottom);
    const top = p.top === null ? undefined : p.top ? { x: mat(current?.topX, p.top), y: mat(current?.topY, p.top) } : { x: current?.topX, y: current?.topY };
    if (!bx || !by) return { id, label, before: '—', after: '—', blocked: blocked ?? { key: 'design.fbatch.incomplete', params: {} } };
    const next: FootingMatsShape = { bottomX: bx, bottomY: by, ...(top?.x ? { topX: top.x } : {}), ...(top?.y ? { topY: top.y } : {}) };
    const show = (r?: FootingMatsShape) => (r ? `inf ${fmt(to(r.bottomX))}/${fmt(to(r.bottomY))} · sup ${fmt(to(r.topX))}/${fmt(to(r.topY))}` : '—');
    return row(id, label, show(current), show(next), next, blocked);
  });
}

// ── Stairs ──
export interface StairPatch { barDia?: number; distDia?: number }

export function planStairBatch(items: ReadonlyArray<{ id: string; label: string; barDia: number; distDia: number }>, p: StairPatch, dias: readonly number[]): FamilyRow<{ barDia: number; distDia: number }>[] {
  return items.map(({ id, label, barDia, distDia }) => {
    const next = { barDia: p.barDia ?? barDia, distDia: p.distDia ?? distDia };
    const bad = [next.barDia, next.distDia].find((d) => !dias.includes(d));
    const show = (r: { barDia: number; distDia: number }) => `Ø${r.barDia} · dist Ø${r.distDia}`;
    return row(id, label, show({ barDia, distDia }), show(next), next, bad !== undefined ? { key: 'design.fbatch.diameter', params: { d: bad } } : undefined);
  });
}
