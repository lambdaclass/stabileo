/**
 * The structure's takeoff by work item and its budget.
 *
 * The work items come from what the project measures (`store/takeoff.ts`: concrete by kind of
 * element and material, formwork by kind, bars by diameter, steel by section, the joints'
 * plates, bolts and anchors) and from the elements measured where they are designed: the stairs
 * (their concrete, soffit and risers, and their bars), the post-tensioned panels (strand and
 * anchors) and the masonry walls and infills (their area). Each item keeps its split by level.
 *
 * The price bases are the person's, kept in the design data with the one in use and the summary
 * shares; prices come typed or from a CSV. Exports: CSV, the workbook (budget and takeoff by
 * level) and FIEBDC-3 (BC3).
 */
import { modelStore } from './model.svelte';
import { designData, patchOwnDesignData } from './design-data';
import { measure } from './takeoff';
import { stairChecks, ptPanels, ptData } from './stairs-pt';
import { infillChecks, masonryWallChecks } from './masonry-infill';
import { siteSafetyItems } from './site.svelte';
import type { SafetyItem } from '../engine/site/phases';
import { downloadText } from './file';
import { barMass } from '../codes/cirsoc201/bar-geometry';
import { budgetBc3, budgetCsv, NO_SHARES, parsePriceCsv, priceBudget, type Budget, type BudgetChapter, type PriceBase, type SummaryShares, type WorkItem } from '../engine/budget/budget';
import { exportToExcel } from '../export/excel';
import type { WorkbookSheet } from '../export/workbook-cells';

export type { Budget, PriceBase, SummaryShares, WorkItem };

type Settings = NonNullable<ReturnType<typeof designData>['budget']>;
export const budgetSettings = (): Settings => designData().budget ?? { bases: [] };
const patch = (p: Partial<Settings>) => patchOwnDesignData({ budget: { ...budgetSettings(), ...p } });

export function saveBase(b: PriceBase): void { patch({ bases: [...budgetSettings().bases.filter((x) => x.id !== b.id), b], activeBaseId: b.id }); }
export function removeBase(id: string): void { const s = budgetSettings(); patch({ bases: s.bases.filter((x) => x.id !== id), ...(s.activeBaseId === id ? { activeBaseId: undefined } : {}) }); }
export function setActiveBase(id: string | undefined): void { patch({ activeBaseId: id }); }
export function setShares(s: SummaryShares): void { patch({ shares: s }); }
export function setPrice(baseId: string, code: string, price: number | null): void {
  const b = budgetSettings().bases.find((x) => x.id === baseId); if (!b) return;
  const prices = { ...b.prices };
  if (price === null || !Number.isFinite(price)) delete prices[code]; else prices[code] = price;
  saveBase({ ...b, prices });
}
/** Merge the prices of a CSV into a base; how many were read and skipped. */
export function importPrices(baseId: string, text: string): { read: number; skipped: number } {
  const b = budgetSettings().bases.find((x) => x.id === baseId);
  if (!b) return { read: 0, skipped: 0 };
  const { prices, skipped } = parsePriceCsv(text);
  saveBase({ ...b, prices: { ...b.prices, ...prices } });
  return { read: Object.keys(prices).length, skipped };
}
export const activeBase = (): PriceBase | null => { const s = budgetSettings(); return s.bases.find((x) => x.id === s.activeBaseId) ?? null; };

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase() || 'X';
const item = (code: string, chapter: BudgetChapter, unit: WorkItem['unit'], key: string, params: Record<string, string | number>, quantity: number, level: string): WorkItem =>
  ({ code, chapter, unit, desc: { key, params }, quantity, byLevel: { [level]: quantity } });

/**
 * Every work item of the structure, before merging by code. With `only`, the items of those members
 * and shells alone (and their bars), with the safety items given: a phase's budget.
 */
export function workItems(o: { only?: { elements: ReadonlySet<number>; shells: ReadonlySet<string> }; safety?: readonly SafetyItem[] } = {}): WorkItem[] {
  const m = modelStore.model, out: WorkItem[] = [];
  const all = measure(), only = o.only;
  const items = only ? all.items.filter((i) => (i.elementId !== undefined && only.elements.has(i.elementId)) || (i.shellKey !== undefined && only.shells.has(i.shellKey))) : all.items;
  const marks = only ? all.marks.filter((mk) => mk.ownerElementIds.some((id) => only.elements.has(id))) : all.marks;
  const parts = only ? [] : all.parts;
  const levelOf = new Map(all.items.filter((i) => i.elementId !== undefined).map((i) => [i.elementId!, i.level]));
  for (const s of o.safety ?? (only ? [] : siteSafetyItems())) out.push(item(`SEG.${s.kind.toUpperCase()}`, 'site', s.unit, `bud.item.${s.kind}`, {}, s.quantity, s.level));
  for (const i of items) {
    const mat = i.materialId !== undefined ? m.materials.get(i.materialId)?.name ?? '—' : '—';
    if (i.concrete > 0) out.push(item(`HOR.${slug(i.kind)}.${slug(mat)}`, 'concrete', 'm3', 'bud.item.concrete', { kind: i.kind, material: mat }, i.concrete, i.level));
    if (i.formwork > 0) out.push(item(`ENC.${slug(i.kind)}`, 'formwork', 'm2', 'bud.item.formwork', { kind: i.kind }, i.formwork, i.level));
    if (i.kind.startsWith('steel-') && i.steel > 0) {
      const name = i.sectionId !== undefined ? m.sections.get(i.sectionId)?.name ?? '—' : '—';
      out.push(item(`MET.${slug(name)}`, 'steel', 'kg', 'bud.item.steelSection', { name }, i.steel, i.level));
    }
  }
  for (const mk of marks) {
    const owners = mk.ownerElementIds.length ? mk.ownerElementIds : [-1];
    for (const id of owners) out.push(item(`ACE.D${mk.diameterMm}`, 'rebar', 'kg', 'bud.item.rebar', { d: mk.diameterMm }, mk.massKg / owners.length, levelOf.get(id) ?? '—'));
  }
  const plateKg = parts.filter((p) => p.kind === 'plate' || p.kind === 'stiffener').reduce((s, p) => s + p.size[0]! * p.size[1]! * p.size[2]! * 7850, 0);
  if (plateKg > 0) out.push(item('MET.PLATE', 'connections', 'kg', 'bud.item.plates', {}, plateKg, '—'));
  const count = (k: string) => parts.filter((p) => p.kind === k).length;
  if (count('bolt')) out.push(item('MET.BOLT', 'connections', 'u', 'bud.item.bolts', {}, count('bolt'), '—'));
  if (count('anchor')) out.push(item('MET.ANCHOR', 'connections', 'u', 'bud.item.anchors', {}, count('anchor'), '—'));

  if (only) return out;
  // Stairs: the waist and the landings, the steps' triangles; the soffit and the risers; the bars.
  for (const s of stairChecks()) {
    const e = s.entry, g = s.design.geometry, tl = e.landingThickness ?? e.waist, level = e.name;
    const volume = e.width * (e.waist * g.slope + tl * (e.landingBottom + e.landingTop) + Math.max(0, Math.round(e.steps) - 1) * (e.riser * e.tread) / 2);
    const forms = e.width * g.developed + Math.round(e.steps) * e.riser * e.width;
    out.push(item('HOR.STAIR', 'concrete', 'm3', 'bud.item.concrete', { kind: 'stair', material: '—' }, volume, level));
    out.push(item('ENC.STAIR', 'formwork', 'm2', 'bud.item.formwork', { kind: 'stair' }, forms, level));
    for (const b of s.design.bars) out.push(item(`ACE.D${b.diameterMm}`, 'rebar', 'kg', 'bud.item.rebar', { d: b.diameterMm }, barMass(b.length * b.count, b.diameterMm), level));
  }
  // Post-tensioned panels: strand over each tendon's span, two anchors per tendon.
  const sys = ptData().system;
  if (sys) for (const p of ptPanels()) for (const dir of ['x', 'y'] as const) {
    const l = p.choice?.[dir], r = p.readings[dir];
    if (!l || !r || !(l.count > 0)) continue;
    out.push(item('POS.STRAND', 'postTensioning', 'kg', 'bud.item.strand', {}, l.count * r.span * sys.aps * 1e-6 * 7850, p.name));
    out.push(item('POS.ANCHOR', 'postTensioning', 'u', 'bud.item.ptAnchors', {}, 2 * l.count, p.name));
  }
  // Masonry walls by their unit, infills by their bay.
  for (const w of masonryWallChecks()) out.push(item(`MAMP.${slug(w.choice?.unit ?? 'generic')}`, 'masonry', 'm2', 'bud.item.masonry', { unit: w.choice?.unit ?? 'generic' }, w.L * w.H, w.name));
  for (const i of infillChecks()) if (i.strut) out.push(item('MAMP.INFILL', 'masonry', 'm2', 'bud.item.infill', {}, (i.strut.length * Math.cos(i.strut.theta)) * (i.strut.length * Math.sin(i.strut.theta)), i.entry.name));
  return out;
}

export function currentBudget(): Budget {
  return priceBudget(workItems(), activeBase(), budgetSettings().shares ?? NO_SHARES);
}

type Tr = (key: string, params?: Record<string, string | number>) => string;
export const describeItem = (tr: Tr) => (i: WorkItem) => {
  const p = i.desc.params ?? {};
  return tr(i.desc.key, { ...p, ...(p.kind ? { kind: tr(`bud.kind.${p.kind}`) } : {}), ...(p.unit ? { unit: tr(`bud.unit.${p.unit}`) } : {}) });
};
const chapterOf = (tr: Tr) => (c: BudgetChapter) => tr(`bud.chapter.${c}`);
const fileName = () => (modelStore.model.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || 'structure');

export function budgetCsvText(tr: Tr, locale: string): string {
  return budgetCsv(currentBudget(), describeItem(tr), chapterOf(tr), { head: [tr('bud.col.chapter'), tr('bud.col.code'), tr('bud.col.item'), tr('bud.col.unit'), tr('bud.col.quantity'), tr('bud.col.price'), tr('bud.col.amount')], direct: tr('bud.direct'), coefficient: tr('bud.coefficient'), total: tr('bud.total') }, locale);
}
export function downloadBudgetCsv(tr: Tr, locale: string): void { downloadText(budgetCsvText(tr, locale), `${fileName()}-budget.csv`, 'text/csv'); }
export function downloadBudgetBc3(tr: Tr): void {
  downloadText(budgetBc3(currentBudget(), describeItem(tr), chapterOf(tr), { title: modelStore.model.name || 'Stabileo', program: 'Stabileo' }), `${fileName()}.bc3`, 'text/plain');
}

/** The budget and the takeoff by level, as workbook sheets. */
export function budgetSheets(tr: Tr): WorkbookSheet[] {
  const b = currentBudget(), describe = describeItem(tr);
  const levels = [...new Set(b.chapters.flatMap((c) => c.lines.flatMap((l) => Object.keys(l.item.byLevel))))];
  const budget: WorkbookSheet['rows'] = [[tr('bud.col.chapter'), tr('bud.col.code'), tr('bud.col.item'), tr('bud.col.unit'), tr('bud.col.quantity'), tr('bud.col.price'), tr('bud.col.amount')]];
  const takeoff: WorkbookSheet['rows'] = [[tr('bud.col.code'), tr('bud.col.item'), tr('bud.col.unit'), ...levels, tr('bud.col.quantity')]];
  for (const c of b.chapters) for (const l of c.lines) {
    budget.push([tr(`bud.chapter.${c.chapter}`), l.item.code, describe(l.item), l.item.unit, Math.round(l.item.quantity * 1000) / 1000, l.unitPrice ?? '', l.amount === null ? '' : Math.round(l.amount * 100) / 100]);
    takeoff.push([l.item.code, describe(l.item), l.item.unit, ...levels.map((lv) => Math.round((l.item.byLevel[lv] ?? 0) * 1000) / 1000), Math.round(l.item.quantity * 1000) / 1000]);
  }
  budget.push(['', '', tr('bud.direct'), '', '', '', Math.round(b.directCost * 100) / 100], ['', '', tr('bud.coefficient'), '', '', '', Math.round(b.coefficient * 10000) / 10000], ['', '', tr('bud.total'), '', '', '', Math.round(b.total * 100) / 100]);
  return [{ name: 'Budget', rows: budget }, { name: 'Takeoff', rows: takeoff }];
}
export async function downloadBudgetXlsx(tr: Tr): Promise<void> {
  await exportToExcel({ filename: `${fileName()}-budget.xlsx`, onlyExtras: true, extraSheets: budgetSheets(tr) });
}
