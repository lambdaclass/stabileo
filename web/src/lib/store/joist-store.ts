/**
 * Joist-and-block floors in the store: the panels declared of joist typology, each read from the
 * shells that model it (one-way, along its joists), its loads by case, its system (the person's,
 * else the lightest that carries it) and its design against the joist's sheet; equalizing the
 * panels of a level whose demands are within a tolerance; and the library (the examples plus the
 * project's own types).
 */
import { modelStore } from './model.svelte';
import { physicalGroups } from './physical';
import { storedDecisions } from './design-decisions';
import { designData } from './design-data';
import { readSlabPanel } from './slab-panel-reading';
import { BLOCK_DEFAULTS, EXAMPLE_JOISTS, sheetFromGeometry, type JoistType } from '../engine/joists/library';
import { designJoistPanel, equalizeWithin, floorSelfWeight, proposeJoistSystem, siteNegatives, type JoistDesign, type JoistPanelInput, type JoistSystem } from '../engine/joists/joist-design';

export function joistLibrary(): JoistType[] {
  return [...EXAMPLE_JOISTS, ...(designData().joistTypes ?? [])];
}

export interface JoistPanel {
  key: string; groupId: number; level: string | undefined;
  box: { x0: number; x1: number; y0: number; y1: number }; z: number;
  input: JoistPanelInput; system: JoistSystem; saved: boolean; design: JoistDesign;
}

function sheetOf(t: JoistType | undefined, s: JoistSystem, fc: number, Ec: number) {
  if (!t) return undefined;
  return t.sheet ?? (t.geometry ? sheetFromGeometry(t.geometry, { fc, spacing: s.spacing, topping: s.topping, Ec }) : undefined);
}

export function joistPanels(): JoistPanel[] {
  const out: JoistPanel[] = [];
  const lib = joistLibrary();
  const dd = designData();
  for (const g of physicalGroups()) {
    if (g.physical.kind !== 'slab' || g.physical.typology !== 'joist') continue;
    const key = `J${g.id}`;
    const stored = storedDecisions().joists?.[key] as JoistSystem | undefined;
    // Joists span the shorter way unless the person says otherwise (`readSlabPanel`).
    const p = readSlabPanel(g, stored?.direction);
    if (!p) continue;
    const { quads, box, dir, span, width, pos, neg, dead, live, fc, Ec } = p;
    const pts = quads.flatMap((q) => q.nodes.map((n) => modelStore.nodes.get(n)!)).filter(Boolean);
    const base = { spacing: 0.5, block: BLOCK_DEFAULTS.ceramic, topping: 0.05, direction: dir, propped: false, ends: { start: 'auto', end: 'auto' } } as Omit<JoistSystem, 'typeId' | 'multiplicity'>;
    const own = (s: Pick<JoistSystem, 'block' | 'topping' | 'spacing' | 'multiplicity' | 'typeId'>) => floorSelfWeight(s, lib.find((t) => t.id === s.typeId)?.sheet?.selfWeight ?? 0.2);
    const mkInput = (s: Pick<JoistSystem, 'block' | 'topping' | 'spacing' | 'multiplicity' | 'typeId'>): JoistPanelInput => ({
      panelId: key, span, width, rows: [...pos, ...neg].sort((a, b) => a.at - b.at),
      qu: 1.2 * (own(s) + dead) + 1.6 * live, superDead: dead, live, fc, fy: dd.rebarFy, cover: dd.covers.slab,
    });
    const system = stored ?? proposeJoistSystem(mkInput({ ...base, typeId: lib[0]!.id, multiplicity: 1 }), base, lib.map((t) => ({ id: t.id, sheet: sheetOf(t, { ...base, typeId: t.id, multiplicity: 1 } as JoistSystem, fc, Ec) })));
    const input = mkInput(system);
    const design = designJoistPanel(input, system, sheetOf(lib.find((t) => t.id === system.typeId), system, fc, Ec));
    out.push({ key, groupId: g.id, level: g.physical.levelFrom, box, z: pts[0]!.z ?? 0, input, system, saved: !!stored, design });
  }
  return out;
}

/** A panel's system, kept with the decisions; null sends it back to the proposal. One undo step. */
export function setJoistSystem(key: string, s: JoistSystem | null): void {
  const d = storedDecisions();
  const joists = { ...(d.joists ?? {}) };
  if (s) joists[key] = JSON.parse(JSON.stringify(s)); else delete joists[key];
  modelStore.reinforcementTransaction((api) => api.setDecisions({ ...d, joists }));
}

/**
 * Equalize the panels of a level within a tolerance: their joists' required moment to the same type
 * and multiplicity (the heavier), and their negatives' moment to the same bars. One undo step.
 */
export function equalizeJoists(level: string | undefined, tol: number): number {
  const ps = joistPanels().filter((p) => p.level === level);
  if (ps.length < 2) return 0;
  const lib = joistLibrary();
  const capOf = (p: JoistPanel) => lib.find((t) => t.id === p.system.typeId)?.sheet?.muPos ?? 0;
  const byCap = equalizeWithin(ps.map((p) => ({ key: p.key, value: capOf(p) * p.system.multiplicity })), tol);
  const negStart = equalizeWithin(ps.filter((p) => p.design.mNegStart > 0).map((p) => ({ key: p.key, value: p.design.mNegStart })), tol);
  const negEnd = equalizeWithin(ps.filter((p) => p.design.mNegEnd > 0).map((p) => ({ key: p.key, value: p.design.mNegEnd })), tol);
  const d = storedDecisions();
  const joists = { ...(d.joists ?? {}) };
  for (const p of ps) {
    const target = byCap.get(p.key)!;
    const twin = ps.find((q) => Math.abs(capOf(q) * q.system.multiplicity - target) < 1e-9) ?? p;
    const depth = p.system.block.height + p.system.topping - p.input.cover - 0.006;
    const neg = (M: number | undefined) => (M ? siteNegatives(M, depth, p.input.fy, p.input.span) ?? undefined : undefined);
    const s: JoistSystem = {
      ...p.system, typeId: twin.system.typeId, multiplicity: twin.system.multiplicity,
      negatives: { ...(neg(negStart.get(p.key)) ? { start: neg(negStart.get(p.key))! } : {}), ...(neg(negEnd.get(p.key)) ? { end: neg(negEnd.get(p.key))! } : {}) },
    };
    joists[p.key] = JSON.parse(JSON.stringify(s));
  }
  modelStore.reinforcementTransaction((api) => api.setDecisions({ ...d, joists }));
  return ps.length;
}
