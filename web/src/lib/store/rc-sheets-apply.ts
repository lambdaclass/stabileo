/**
 * An alternative from the sheets applied to the model, one undo step: the row's members take a
 * section of the new size, its plates the new thickness, or both a material of the new concrete.
 * A section or material others use is never changed: one of that size or strength is reused when
 * the model has it, else one is made, named after the row. The results go with the change (every
 * model edit clears them), so nothing reads as verified until the model is solved again. A stirrup
 * diameter allowed is the project's design data, not the model: the sheets design again with it.
 */
import { modelStore, type Material, type Section } from './model.svelte';
import { plateOfShell, setPlateProperties } from './physical-plates';
import { rectJ } from '../cad/draft';
import { concreteClassOf, concreteModulus } from '../rc-sheets/concrete-classes';
import { rcSheetsData, sheetCode, type SheetRow } from './rc-sheets.svelte';
import { setFootingSetup } from './rc-sheets-footings';
import type { FootingBalance } from '../rc-sheets/footing-types';
import { storeyMembers, type Alternative } from './rc-sheets-resize';
import { patchDesignData } from './design-data';
import type { LineLayout } from '../rc-sheets/beam-line';

/** What applying did: the section or material assigned, whether it was made for it, and how many members and plates took it. */
export interface Applied { name: string; created: boolean; members: number; plates: number }

const groupOf = (key: string) => Number(key.split(':')[1]);
const membersOf = (g: number) => [...(modelStore.model.groups.get(g)?.members.elements ?? [])];
const cm = (x: number) => Math.round(x * 100);

/** The members and plates an alternative changes: a beam's whole physical member, a column's storey, a slab's or wall's plate, the slab plates around a punching joint. */
function targetsOf(row: SheetRow | LineLayout, alt: Alternative): { members: number[]; plates: number[] } {
  if ('spanAdopted' in row) return { members: membersOf(row.group), plates: [] };
  switch (row.family) {
    case 'beam': return { members: membersOf(row.demand.line?.group ?? groupOf(row.key)), plates: [] };
    case 'column': return { members: storeyMembers(row), plates: [] };
    case 'slab': case 'wall': return { members: [], plates: [groupOf(row.key)] };
    case 'punching': {
      if (alt.kind === 'section' && alt.what !== 'punchSlab') return { members: [], plates: [] };
      const plates = [...new Set(row.demand.adjoining.map((a) => plateOfShell(`q${a.elementId}`) ?? plateOfShell(`p${a.elementId}`)).filter((x): x is number => x != null))];
      return { members: [], plates };
    }
    case 'footing': case 'stair': return { members: [], plates: [] };
  }
}

/** Whether the sheets can apply it themselves: a capital, a drop panel or a column grown for punching is changed in the model by hand. */
export function canApply(row: SheetRow | LineLayout, alt: Alternative): boolean {
  if (alt.kind === 'ties') return true;
  if (alt.kind === 'footing') return alt.what === 'strap' || alt.what === 'tie' || alt.what === 'eccentric';
  const t = targetsOf(row, alt);
  return t.members.length + t.plates.length > 0;
}

function sectionFor(old: Section, b: number, h: number, name: string): { id: number; name: string; created: boolean } {
  const same = [...modelStore.sections.values()].find((s) => s.shape === 'rect' && Math.abs((s.b ?? 0) - b) < 1e-6 && Math.abs((s.h ?? 0) - h) < 1e-6 && (s.rotation ?? 0) === (old.rotation ?? 0));
  if (same) return { id: same.id, name: same.name, created: false };
  const id = modelStore.addSection({
    name, shape: 'rect', b, h, a: b * h, iy: (b * h ** 3) / 12, iz: (h * b ** 3) / 12, j: rectJ(b, h),
    ...(old.rotation !== undefined ? { rotation: old.rotation } : {}),
  });
  return { id, name, created: true };
}

function materialFor(old: Material | undefined, fc: number): { id: number; name: string; created: boolean } {
  const code = sheetCode();
  const name = concreteClassOf(code, fc).name;
  const same = [...modelStore.materials.values()].find((m) => (m.fc ?? m.fy) !== undefined && Math.abs((m.fc ?? m.fy)! - fc) < 0.05 && m.name === name);
  if (same) return { id: same.id, name: same.name, created: false };
  const id = modelStore.addMaterial({ name, e: concreteModulus(code, fc), nu: old?.nu ?? 0.2, rho: old?.rho ?? 25, fc, ...(old?.maxAggregateSizeMm !== undefined ? { maxAggregateSizeMm: old.maxAggregateSizeMm } : {}) });
  return { id, name, created: true };
}

/**
 * Apply `alt` to the row's members or plates; one undo step. A beam's or column's section keeps
 * the orientation it had: the demand's width and depth go to the section's b and h as they lay.
 * Null when there is nothing to apply it to.
 */
export function applyAlternative(row: SheetRow | LineLayout, alt: Alternative): Applied | null {
  if (alt.kind === 'ties') {
    patchDesignData({ stirrupDiametersMm: alt.list });
    return { name: `Ø${alt.to}`, created: false, members: 0, plates: 0 };
  }
  if (alt.kind === 'footing') {
    if (!canApply(row, alt) || 'spanAdopted' in row || row.family !== 'footing') return null;
    setFootingSetup(row.key, { ...(rcSheetsData().footingSetup?.[row.key] ?? {}), balance: alt.what as FootingBalance });
    return { name: row.name, created: false, members: 0, plates: 0 };
  }
  const { members, plates } = targetsOf(row, alt);
  if (!members.length && !plates.length) return null;
  let out: Applied | null = null;
  modelStore.batch(() => {
    if (alt.kind === 'concrete') {
      const first = members.length ? modelStore.elements.get(members[0]!)?.materialId : modelStore.plates.get([...(modelStore.model.groups.get(plates[0]!)?.members.plates ?? [])][0] ?? -1)?.materialId;
      const m = materialFor(first !== undefined ? modelStore.materials.get(first) : undefined, alt.to);
      for (const id of members) modelStore.updateElementMaterial(id, m.id);
      for (const id of plates) setPlateProperties(id, { materialId: m.id });
      out = { name: m.name, created: m.created, members: members.length, plates: plates.length };
      return;
    }
    if (plates.length) {
      const t = alt.to[0]!;
      for (const id of plates) setPlateProperties(id, { thickness: t });
      out = { name: `${cm(t)} cm`, created: false, members: 0, plates: plates.length };
      return;
    }
    const [from0, from1] = alt.from, [b, h] = alt.to;
    if (b === undefined || h === undefined) return;
    const made = new Map<number, { id: number; name: string; created: boolean }>();
    for (const id of members) {
      const e = modelStore.elements.get(id), old = e ? modelStore.sections.get(e.sectionId) : undefined;
      if (!e || !old) continue;
      const turned = old.b !== undefined && old.h !== undefined && Math.abs(old.b - (from1 ?? 0)) < 1e-6 && Math.abs(old.h - (from0 ?? 0)) < 1e-6 && Math.abs(old.b - old.h) > 1e-6;
      const [sb, sh] = turned ? [h, b] : [b, h];
      const s = made.get(old.id) ?? sectionFor(old, sb, sh, `${row.name} ${cm(sb)}×${cm(sh)}`);
      made.set(old.id, s);
      modelStore.updateElementSection(id, s.id);
    }
    const first = [...made.values()][0];
    if (first) out = { name: first.name, created: [...made.values()].some((s) => s.created), members: members.length, plates: 0 };
  });
  return out;
}
