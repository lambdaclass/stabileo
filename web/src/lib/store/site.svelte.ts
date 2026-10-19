/**
 * The works by phases (`engine/site/phases.ts`), as the project holds them.
 *
 *  · The members are the physical elements (columns and walls vertical, beams and slabs
 *    horizontal, foundation beams with the footings), and the members and shells no physical
 *    element holds, each by its key. A column or wall of several storeys is phased by its pieces,
 *    storey by storey, as it is cast. The usual sequence by level is proposed from a date and a
 *    duration; phases are renamed, moved and lengthened, and what is selected is assigned to one.
 *  · The animation shows the model as it stands at the end of each phase.
 *  · The auxiliary means and collective protections are measured per level from its slabs and go
 *    with the phase that builds them; they enter the budget, which is also given phase by phase.
 *  · The phases become the stages of the staged construction analysis.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { designData, patchOwnDesignData } from './design-data';
import { physicalGroups } from './physical';
import { viewVisibility } from './view-state.svelte';
import { levels } from './architecture';
import { builtBy, phasesByLevel, safetyItems, stagesFromPhases, type Phase, type SafetyItem, type SiteData, type SiteMember } from '../engine/site/phases';
import { polygonArea, polygonPerimeter } from '../engine/architecture/architecture';

export type { Phase, SiteData, SafetyItem };

export const siteData = (): SiteData => designData().site ?? { phases: [], assign: {} };
const patch = (p: Partial<SiteData>) => patchOwnDesignData({ site: { ...siteData(), ...p } });

type Tr = (key: string, params?: Record<string, string | number>) => string;
const zOf = (n: number) => modelStore.nodes.get(n)?.z ?? 0;

/** The members of the works, by key, with their kind and the elevations they span. */
export function siteMembers(): SiteMember[] {
  const out: SiteMember[] = [], inGroup = new Set<string>();
  for (const g of physicalGroups()) {
    const ids = [...(g.members.elements ?? []).map((id) => { const e = modelStore.elements.get(id); return e ? [e.nodeI, e.nodeJ] : []; }).flat(),
      ...(g.members.quads ?? []).flatMap((id) => modelStore.quads.get(id)?.nodes ?? []), ...(g.members.plates ?? []).flatMap((id) => modelStore.plates.get(id)?.nodes ?? [])];
    if (!ids.length) continue;
    const zs = ids.map(zOf), k = g.physical.kind;
    const kind: SiteMember['kind'] = g.physical.typology === 'foundation' || g.physical.typology === 'strap' ? 'foundation' : k === 'column' || k === 'wall' ? 'vertical' : 'horizontal';
    // A column or wall of several storeys is cast storey by storey: its pieces are phased one by one.
    if (kind === 'vertical' && levels().filter((l) => l.z > Math.min(...zs) + 0.05 && l.z < Math.max(...zs) - 0.05).length > 0) continue;
    for (const id of g.members.elements ?? []) inGroup.add(`e${id}`);
    for (const id of g.members.quads ?? []) inGroup.add(`q${id}`);
    for (const id of g.members.plates ?? []) inGroup.add(`p${id}`);
    out.push({ key: `g${g.id}`, kind, zBottom: Math.min(...zs), zTop: Math.max(...zs) });
  }
  for (const e of modelStore.elements.values()) {
    if (inGroup.has(`e${e.id}`)) continue;
    const a = zOf(e.nodeI), b = zOf(e.nodeJ), n1 = modelStore.nodes.get(e.nodeI), n2 = modelStore.nodes.get(e.nodeJ);
    const vertical = !!n1 && !!n2 && Math.hypot(n2.x - n1.x, (n2.y ?? 0) - (n1.y ?? 0)) < 0.05;
    out.push({ key: `e${e.id}`, kind: vertical ? 'vertical' : Math.max(a, b) < 0.05 ? 'foundation' : 'horizontal', zBottom: Math.min(a, b), zTop: Math.max(a, b) });
  }
  for (const [prefix, map] of [['q', modelStore.quads], ['p', modelStore.plates]] as const) for (const s of map.values()) {
    if (inGroup.has(`${prefix}${s.id}`)) continue;
    const zs = s.nodes.map(zOf);
    out.push({ key: `${prefix}${s.id}`, kind: Math.max(...zs) - Math.min(...zs) > 0.05 ? 'vertical' : 'horizontal', zBottom: Math.min(...zs), zTop: Math.max(...zs) });
  }
  for (const f of modelStore.model.footings.values()) out.push({ key: `f${f.id}`, kind: 'foundation', zBottom: f.foundingElevation, zTop: f.foundingElevation + f.thickness });
  return out;
}

/** What a key builds in the model. */
export function expandKey(key: string): { elements: number[]; plates: number[]; quads: number[] } {
  const id = Number(key.slice(1));
  if (key.startsWith('g')) { const g = physicalGroups().find((x) => x.id === id); return { elements: [...(g?.members.elements ?? [])], plates: [...(g?.members.plates ?? [])], quads: [...(g?.members.quads ?? [])] }; }
  if (key.startsWith('e')) return { elements: [id], plates: [], quads: [] };
  if (key.startsWith('q')) return { elements: [], plates: [], quads: [id] };
  if (key.startsWith('p')) return { elements: [], plates: [id], quads: [] };
  return { elements: [], plates: [], quads: [] };
}

/** Propose the usual sequence by level; it replaces the phases there were. */
export function generatePhases(start: string, days: number, tr: Tr): Phase[] {
  const r = phasesByLevel(levels(), siteMembers(), start, days);
  const phases = r.phases.map(({ nameKey, params, ...p }) => ({ ...p, name: tr(nameKey, params) }));
  patch({ phases, assign: r.assign });
  return phases;
}
export function savePhase(p: Phase): void { const s = siteData(); patch({ phases: s.phases.some((x) => x.id === p.id) ? s.phases.map((x) => (x.id === p.id ? p : x)) : [...s.phases, p] }); }
export function removePhase(id: string): void {
  const s = siteData();
  patch({ phases: s.phases.filter((x) => x.id !== id), assign: Object.fromEntries(Object.entries(s.assign).filter(([, v]) => v !== id)) });
}
/** Assign the selected members and shells (by their physical element when they have one) to a phase. */
export function assignSelection(phaseId: string): number {
  const keyOf = new Map<string, string>();
  const asGroup = new Set(siteMembers().map((m) => m.key).filter((k) => k.startsWith('g')));
  for (const g of physicalGroups()) {
    if (!asGroup.has(`g${g.id}`)) continue;
    for (const id of g.members.elements ?? []) keyOf.set(`e${id}`, `g${g.id}`);
    for (const id of g.members.quads ?? []) keyOf.set(`q${id}`, `g${g.id}`);
  }
  const keys = new Set<string>();
  for (const id of uiStore.selectedElements) keys.add(keyOf.get(`e${id}`) ?? `e${id}`);
  for (const k of uiStore.selectedShells) keys.add(keyOf.get(k) ?? k);
  if (!keys.size) return 0;
  const assign = { ...siteData().assign };
  for (const k of keys) assign[k] = phaseId;
  patch({ assign });
  return keys.size;
}

// ─── Animation ───

let step = $state<number | null>(null);
export const siteView = { get step() { return step; } };
/** Show the model as it stands at the end of phase `i` (in order of start); null shows it all. */
export function showUpTo(i: number | null): void {
  step = i;
  if (i === null) { viewVisibility.showAll(); return; }
  const b = builtBy(siteData())[i];
  if (!b) return;
  const parts = [...b.before, ...b.keys].map(expandKey);
  viewVisibility.isolate({ nodes: [], elements: parts.flatMap((p) => p.elements), shells: [...parts.flatMap((p) => p.quads.map((q) => `q${q}`)), ...parts.flatMap((p) => p.plates.map((q) => `p${q}`))] });
}

// ─── Safety ───

/** Auxiliary means and protections of each level with slabs, with the phase that builds them. */
export function siteSafetyItems(): SafetyItem[] {
  const s = siteData(), lvs = levels(), out: SafetyItem[] = [];
  lvs.forEach((lv, i) => {
    if (lv.z <= 0.05) return;
    const below = lvs[i - 1]?.z ?? 0;
    const slabs = physicalGroups().filter((g) => g.physical.kind === 'slab' && (g.members.quads ?? []).some((q) => modelStore.quads.get(q)?.nodes.every((n) => Math.abs(zOf(n) - lv.z) < 0.05)));
    if (!slabs.length) return;
    const geo = slabs.map((g) => {
      const quads = (g.members.quads ?? []).map((q) => modelStore.quads.get(q)!).filter(Boolean);
      const pts = quads.flatMap((q) => q.nodes.map((n) => modelStore.nodes.get(n)!)).map((n) => ({ x: n.x, y: n.y ?? 0 }));
      const hull = convexHull(pts);
      return { perimeter: polygonPerimeter(hull), area: quads.reduce((a, q) => a + polygonArea(q.nodes.map((n) => { const p = modelStore.nodes.get(n)!; return { x: p.x, y: p.y ?? 0 }; })), 0) };
    });
    const phaseId = s.assign[`g${slabs[0]!.id}`];
    out.push(...safetyItems(lv.name, geo, lv.z - below, phaseId));
  });
  return out;
}

function convexHull(ps: ReadonlyArray<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const s = [...ps].sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: typeof s = [], hi: typeof s = [];
  for (const q of s) { while (lo.length >= 2 && cr(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 1e-12) lo.pop(); lo.push(q); }
  for (const q of [...s].reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2]!, hi[hi.length - 1]!, q) <= 1e-12) hi.pop(); hi.push(q); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}

/** The members, shells and safety items of each phase: what its budget is made of. */
export function phaseScopes(): Array<{ phase: Phase; elements: Set<number>; shells: Set<string>; safety: SafetyItem[] }> {
  const safety = siteSafetyItems();
  return builtBy(siteData()).map((b) => {
    const parts = b.keys.map(expandKey);
    return { phase: b.phase, elements: new Set(parts.flatMap((p) => p.elements)), shells: new Set([...parts.flatMap((p) => p.quads.map((q) => `q${q}`)), ...parts.flatMap((p) => p.plates.map((q) => `p${q}`))]), safety: safety.filter((x) => x.phaseId === b.phase.id) };
  });
}

/** The phases as staged construction stages. */
export function stagesForAnalysis() {
  return stagesFromPhases(siteData(), expandKey, modelStore.model.loadCases.map((c) => c.id));
}
