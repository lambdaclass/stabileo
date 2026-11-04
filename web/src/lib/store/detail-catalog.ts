/**
 * The project's side of the detail catalogue: the values the details are drawn with, read from
 * the materials, covers and what is designed, and the person's choice of details with the sheet
 * each goes on, kept with the sheet settings.
 */
import { modelStore } from './model.svelte';
import { detailingStore } from './detailing.svelte';
import { designData } from './design-data';
import { resolveConcreteProperties } from './detailing-project-inputs';
import { concreteFrame, isSeismicProject } from './seismic-design.svelte';
import { storedDecisions } from './design-decisions';
import { stairEntries } from './stairs-pt';
import { CIRSOC201_DESIGN_EDITION } from '../engine/codes/argentina/cirsoc201-basis';
import type { DocumentModel } from '../engine/detailing/document-model';
import { defaultChoices, detailDef, type DetailChoice } from '../sheets/details/catalog';
import { TYPICAL, type DetailValues, type ElementKind } from '../sheets/details/values';
import { patchSheetSettings, sheetSettings } from './sheet-set';

const byUse = (count: Map<number, number>) => [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]).map(([d]) => d);
const add = (m: Map<number, number>, d: number | undefined, n = 1) => { if (d && Number.isFinite(d) && d > 0) m.set(d, (m.get(d) ?? 0) + n); };
const mostCommon = <T>(xs: T[], key: (x: T) => string): T | undefined => {
  const c = new Map<string, { x: T; n: number }>();
  for (const x of xs) { const k = key(x); c.set(k, { x, n: (c.get(k)?.n ?? 0) + 1 }); }
  return [...c.values()].sort((a, b) => b.n - a.n)[0]?.x;
};

/** The values the details are drawn with, from the project; a kind with nothing designed keeps the typical ones and is listed in `typical`. */
export function projectDetailValues(doc: DocumentModel | null): DetailValues {
  const dd = designData(), conc = resolveConcreteProperties(), m = modelStore.model;
  const fc = Number.isFinite(conc.fc) && conc.fc > 0 ? conc.fc : TYPICAL.fc, fy = dd.rebarFy ?? TYPICAL.fy;
  const bars: Record<ElementKind, Map<number, number>> = { slab: new Map(), beam: new Map(), column: new Map(), wall: new Map(), footing: new Map(), stair: new Map() };
  const ties: Partial<Record<ElementKind, Map<number, number>>> = { beam: new Map(), column: new Map() };
  for (const a of doc?.assemblies ?? []) {
    const k: ElementKind = a.source.kind === 'columnStack' ? 'column' : 'beam';
    for (const mk of a.source.marks) (mk.role === 'longitudinal' ? bars[k] : ties[k]!).set(mk.diameterMm, ((mk.role === 'longitudinal' ? bars[k] : ties[k]!).get(mk.diameterMm) ?? 0) + mk.quantity);
  }
  // Without a document, the reinforcement placed on each designed beam and column.
  const placedOn = (k: 'beam' | 'column') => !bars[k].size;
  const wantBeam = placedOn('beam'), wantCol = placedOn('column');
  for (const [id, kind] of concreteFrame()) {
    const r = m.elements.get(id)?.reinforcement;
    if (!r) continue;
    if (kind === 'beam' && wantBeam) {
      for (const g of [r.regions?.topStart, r.regions?.topEnd, r.regions?.bottomSpan, r.top, r.bottom]) add(bars.beam, g?.diameter, g?.count ?? 1);
      add(ties.beam!, r.stirrups?.diameter);
    } else if (kind === 'column' && wantCol) {
      if (r.column) { add(bars.column, r.column.cornerDia, 4); add(bars.column, r.column.faceDia, r.column.nBottom + r.column.nTop + r.column.nLeft + r.column.nRight); }
      add(bars.column, r.longitudinal?.diameter, r.longitudinal?.count ?? 1);
      add(bars.column, r.shaped?.diameter, r.shaped?.count ?? 1);
      add(ties.column!, r.stirrups?.diameter);
    }
  }
  const saved = storedDecisions();
  const run = detailingStore.lastFloorRun;
  for (const s of run?.slabs ?? []) {
    const r = saved.slabs?.[s.panelId] ?? s.panel?.reinforcement;
    for (const b of Object.values(r?.base ?? {})) add(bars.slab, b?.diameter);
    for (const b of r?.bands ?? []) add(bars.slab, b.diameter);
  }
  for (const w of run?.walls ?? []) { const r = saved.walls?.[w.wallId] ?? w.reinforcement; add(bars.wall, r.vertical.diameter, 2); add(bars.wall, r.horizontal.diameter); add(bars.wall, r.boundary?.diameter); }
  for (const f of m.footings.values()) if (f.mats) { add(bars.footing, f.mats.bottomX.diameterMm); add(bars.footing, f.mats.bottomY.diameterMm); }
  for (const o of (detailingStore.footingRunStale ? null : detailingStore.lastFootingRun)?.outcomes ?? []) { add(bars.footing, o.general?.mats?.bottomX.diameterMm); add(bars.footing, o.mat?.x?.diameterMm); }
  const stairs = stairEntries();
  for (const s of stairs) add(bars.stair, s.barDia ?? 12);

  // Typical sizes: the most common concrete beam and column sections, then each kind's own.
  const kinds = concreteFrame(), secs = { beam: [] as Array<{ b: number; h: number }>, column: [] as Array<{ b: number; h: number }> };
  for (const [id, k] of kinds) { const e = m.elements.get(id), s = e && m.sections.get(e.sectionId); if (s?.b && s.h) secs[k].push({ b: Math.round(s.b * 1000), h: Math.round(s.h * 1000) }); }
  const beam = mostCommon(secs.beam, (s) => `${s.b}x${s.h}`), column = mostCommon(secs.column, (s) => `${s.b}x${s.h}`);
  const slabT = mostCommon((run?.slabs ?? []).flatMap((s) => (s.panel ? [Math.round(s.panel.input.thickness * 1000)] : [])), String);
  const wallT = mostCommon((run?.walls ?? []).map((w) => Math.round(w.input.thickness * 1000)), String);
  const footT = mostCommon([...m.footings.values()].map((f) => Math.round(f.thickness * 1000)), String);
  const stair = stairs[0];

  const typical: ElementKind[] = [];
  const list = (k: ElementKind) => { const l = byUse(bars[k]); if (!l.length) typical.push(k); return l.length ? l : [...TYPICAL.bars[k]]; };
  const tieOf = (k: ElementKind) => (ties[k]?.size ? byUse(ties[k]!)[0]! : k === 'beam' || k === 'column' ? dd.stirrupDiaMm ?? TYPICAL.ties[k] : TYPICAL.ties[k]);
  const cover = (k: 'beam' | 'column' | 'slab' | 'wall' | 'footing') => Math.round((dd.covers?.[k] ?? TYPICAL.cover[k] / 1000) * 1000);
  const exp = dd.exposure as Partial<Record<string, string>> | undefined;
  return {
    fc, fy, concrete: `H-${Math.round(fc)}`, steel: dd.rebarGrade ?? TYPICAL.steel, edition: CIRSOC201_DESIGN_EDITION, seismic: isSeismicProject(),
    cover: { slab: cover('slab'), beam: cover('beam'), column: cover('column'), wall: cover('wall'), footing: cover('footing'), stair: cover('slab') },
    ...(exp ? { exposure: { slab: exp.slab, beam: exp.beam, column: exp.column, wall: exp.wall, footing: exp.footing, stair: exp.slab } as DetailValues['exposure'] } : {}),
    bars: { slab: list('slab'), beam: list('beam'), column: list('column'), wall: list('wall'), footing: list('footing'), stair: list('stair') },
    ties: { slab: TYPICAL.ties.slab, beam: tieOf('beam'), column: tieOf('column'), wall: TYPICAL.ties.wall, footing: TYPICAL.ties.footing, stair: stair?.distDia ?? TYPICAL.ties.stair },
    size: {
      beam: beam ?? TYPICAL.size.beam, column: column ?? TYPICAL.size.column,
      slab: slabT ?? TYPICAL.size.slab, wall: wallT ?? TYPICAL.size.wall, footing: footT ?? TYPICAL.size.footing,
      stair: stair ? Math.round(stair.waist * 1000) : TYPICAL.size.stair, riser: stair ? Math.round(stair.riser * 1000) : TYPICAL.size.riser, tread: stair ? Math.round(stair.tread * 1000) : TYPICAL.size.tread,
    },
    typical,
  };
}

/** The details chosen for the set, with their sheets; before any choice, the defaults. */
export function chosenDetails(): DetailChoice[] {
  const c = sheetSettings().details;
  return c ? c.filter((x) => detailDef(x.id)) : defaultChoices(isSeismicProject());
}
export const detailsChosenByPerson = (): boolean => !!sheetSettings().details;

export function setChosenDetails(next: DetailChoice[] | undefined): void { patchSheetSettings({ details: next }); }

/** A detail on or off; on, at its family's sheet. */
export function toggleDetail(id: string, on: boolean): void {
  const cur = chosenDetails().filter((c) => c.id !== id), d = detailDef(id);
  setChosenDetails(on && d ? [...cur, { id, target: d.target }] : cur);
}

export function setDetailTarget(id: string, target: string): void {
  setChosenDetails(chosenDetails().map((c) => (c.id === id ? { ...c, target } : c)));
}
