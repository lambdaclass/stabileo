/**
 * Resizing from the sheets: the dimension a row would need to verify with the forces it has now,
 * or, for a column or a wall with room to spare, the smallest that still does; where the proposal
 * finds no arrangement for a row's section and concrete, the alternatives it verifies with (a
 * section, a stronger concrete), each computed by designing the row again with it; and the way to
 * the element in the model. Applying an alternative is `rc-sheets-apply.ts`'s.
 *
 * Beams and slabs are offered smaller only where their row checks the deflection: the smaller
 * section must meet it as well as everything else.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { holdPlateSidesAt, plateOfShell } from './physical-plates';
import { designData } from './design-data';
import { concreteOfRow, lineRedesignerOf, redesignerOf, sheetCode, type SheetRow } from './rc-sheets.svelte';
import { criteriaOf, type Criteria } from '../rc-sheets/criteria';
import { concreteClasses, concreteClassOf, DEFAULT_FC_MAX } from '../rc-sheets/concrete-classes';
import { lineRowStatus } from '../rc-sheets/beam-line';
import type { BeamRow } from '../rc-sheets/beam-row';
import type { ColumnRow } from '../rc-sheets/column-row';
import type { WallRow } from '../rc-sheets/wall-row';
import type { LineLayout } from '../rc-sheets/beam-line';
import { inRange, TIE_BAR_RANGE, type CheckLine } from '../rc-sheets/types';
import { BAR_DIAMETERS_MM } from '../model/design-data';
import type { FootingRow } from '../rc-sheets/footing-types';
import { onlyOverlaps } from '../rc-sheets/footing-overlaps';
import type { Redesign } from './rc-sheets.svelte';

const sheetCriteria = (): Criteria => criteriaOf(designData().designOptions?.criteria);

export type ResizeWhat = 'beamH' | 'beamB' | 'column' | 'slabH' | 'wallT' | 'punchSlab' | 'punchColumn' | 'punchCapital' | 'punchDrop';
/**
 * `to` null: not even at the limit searched (twice the size). Lengths in m. A capital's `to` is its
 * projection beyond the column face; a drop panel's, its depth under the slab and its extent from
 * the column face.
 */
export interface ResizeHint {
  what: ResizeWhat; direction: 'grow' | 'shrink' | 'stiffen'; from: number[]; to: number[] | null;
  /** A wall's thickness that verifies everything but its base, which the model has to hold. */
  apartFromBase?: true;
}

const passes = (r: SheetRow) => r.status !== 'fail';
const WALL_BASE = 'rcSheets.v.wallBase';
/** A wall whose base is not held all along fails for the model, not its thickness: the other checks say what thickness verifies. */
const apartFromBase = (r: SheetRow) => r.verifications.every((v) => v.ok || v.label === WALL_BASE);
/** Below this strength ratio a column or a wall is worth trying smaller. */
const ROOM = 0.6;
const round = (x: number) => Math.round(x * 1000) / 1000;
const DEFLECTION_CHECKS = new Set(['rcSheets.v.deflection', 'rcSheets.v.deflectionDepth', 'rcSheets.ts500.u.deflection', 'rcSheets.ts500.u.deflectionDepth']);
/** Whether a beam or slab row checks its deflection: its proposal fits its steel to the forces, so whether a shallower one verifies is for the redesign to say, not for its ratios. */
const checksDeflection = (r: { verifications: CheckLine[] }) => r.verifications.some((v) => DEFLECTION_CHECKS.has(v.label));

/** The first size from `start`, stepped by `step` up to `limit`, whose row passes (and meets `also`); null when none does. */
function grow(key: string, start: number[], step: number, limit: number[], make: (v: number[]) => unknown, also: (r: SheetRow) => boolean = () => true, ok: (r: SheetRow) => boolean = passes): number[] | null {
  const redesign = redesignerOf(key);
  if (!redesign) return null;
  for (let k = 1; k <= 60; k++) {
    const v = start.map((x) => round(x + k * step));
    if (v.some((x, i) => x > limit[i]! + 1e-9)) return null;
    const r = redesign(make(v) as never);
    if (ok(r) && also(r)) return v;
  }
  return null;
}

/** The smallest size below `start` whose row still passes, not under `floor`; null when none is smaller. */
function shrink(key: string, start: number[], step: number, floor: number, make: (v: number[]) => unknown): number[] | null {
  const redesign = redesignerOf(key);
  if (!redesign) return null;
  let best: number[] | null = null;
  for (let k = 1; k <= 20; k++) {
    const v = start.map((x) => round(x - k * step));
    if (v.some((x) => x < floor - 1e-9)) break;
    if (!passes(redesign(make(v) as never))) break;
    best = v;
  }
  return best;
}

/** A member whose proposal took steel for its deflection: the least depth at which its strength steel already meets it. */
function stiffer(key: string, what: 'beamH' | 'slabH', h0: number, step: number, limit: number, make: (h: number) => unknown): ResizeHint[] {
  const to = grow(key, [h0], step, [limit], ([h]) => make(h!), (r) => !(r as { byDeflection?: true }).byDeflection);
  return to ? [{ what, direction: 'stiffen', from: [h0], to }] : [];
}

export function resizeHints(row: SheetRow): ResizeHint[] {
  if (row.status === 'none') return [];
  const fail = row.status === 'fail';
  switch (row.family) {
    case 'beam': {
      const d = row.demand, cr = sheetCriteria(), step = cr.beamSectionStep;
      if (!fail) {
        if (!checksDeflection(row)) return [];
        if (row.byDeflection) return stiffer(row.key, 'beamH', d.h, step, Math.min(2 * d.h, 2), (h) => ({ ...d, h }));
        const to = shrink(row.key, [d.h], step, Math.max(cr.beamMinDepth, d.b), ([h]) => ({ ...d, h }));
        return to ? [{ what: 'beamH', direction: 'shrink', from: [d.h], to }] : [];
      }
      const deeper: ResizeHint = { what: 'beamH', direction: 'grow', from: [d.h], to: grow(row.key, [d.h], step, [Math.min(2 * d.h, 2)], ([h]) => ({ ...d, h })) };
      return deeper.to ? [deeper] : [deeper, { what: 'beamB', direction: 'grow', from: [d.b], to: grow(row.key, [d.b], step, [2 * d.b], ([b]) => ({ ...d, b })) }];
    }
    case 'column': {
      const d = row.demand;
      if (fail) return [{ what: 'column', direction: 'grow', from: [d.b, d.h], to: grow(row.key, [d.b, d.h], 0.05, [2 * d.b, 2 * d.h], ([b, h]) => ({ ...d, b, h })) }];
      if (!row.generous && row.checks.ratio >= ROOM) return [];
      const floor = row.verifications.some((v) => v.label === 'rcSheets.v.seisColDim') ? 0.3 : 0.2;
      const to = shrink(row.key, [d.b, d.h], 0.05, floor, ([b, h]) => ({ ...d, b, h }));
      return to ? [{ what: 'column', direction: 'shrink', from: [d.b, d.h], to }] : [];
    }
    case 'slab': {
      const d = row.demand;
      if (!fail) {
        if (!checksDeflection(row)) return [];
        if (row.byDeflection) return stiffer(row.key, 'slabH', d.h, 0.01, 2 * d.h, (h) => ({ ...d, h }));
        const to = shrink(row.key, [d.h], 0.01, sheetCriteria().slabMinThickness, ([h]) => ({ ...d, h }));
        return to ? [{ what: 'slabH', direction: 'shrink', from: [d.h], to }] : [];
      }
      return [{ what: 'slabH', direction: 'grow', from: [d.h], to: grow(row.key, [d.h], 0.01, [2 * d.h], ([h]) => ({ ...d, h })) }];
    }
    case 'wall': {
      const d = row.demand;
      if (d.base?.unheld?.length) {
        if (!row.verifications.some((v) => !v.ok && v.label !== WALL_BASE)) return [];
        return [{ what: 'wallT', direction: 'grow', from: [d.thickness], to: grow(row.key, [d.thickness], 0.05, [2 * d.thickness], ([t]) => ({ ...d, thickness: t }), undefined, apartFromBase), apartFromBase: true }];
      }
      if (fail) return [{ what: 'wallT', direction: 'grow', from: [d.thickness], to: grow(row.key, [d.thickness], 0.05, [2 * d.thickness], ([t]) => ({ ...d, thickness: t })) }];
      if (!row.generous && row.utilization >= ROOM) return [];
      const to = shrink(row.key, [d.thickness], 0.05, 0.1, ([t]) => ({ ...d, thickness: t }));
      return to ? [{ what: 'wallT', direction: 'shrink', from: [d.thickness], to }] : [];
    }
    case 'punching': {
      if (!fail) return [];
      const d = row.demand;
      const asColumn = (a: number) => ({ ...d, joint: { ...d.joint, b: d.joint.b + 2 * a, h: d.joint.h + 2 * a } });
      return [
        { what: 'punchSlab', direction: 'grow', from: [d.thickness], to: grow(row.key, [d.thickness], 0.01, [2 * d.thickness], ([t]) => ({ ...d, thickness: t })) },
        { what: 'punchColumn', direction: 'grow', from: [d.joint.b, d.joint.h], to: grow(row.key, [d.joint.b, d.joint.h], 0.05, [2 * d.joint.b, 2 * d.joint.h], ([b, h]) => ({ ...d, joint: { ...d.joint, b, h } })) },
        // The critical section from the capital's edge (§22.6.4.1), the capital within 45°: as deep as it projects.
        { what: 'punchCapital', direction: 'grow', from: [0], to: grow(row.key, [0], 0.05, [1], ([a]) => asColumn(a)) },
        { what: 'punchDrop', direction: 'grow', from: [0, 0], to: dropPanel(row.key, d) },
      ];
    }
    case 'footing': return [];
  }
}

/**
 * The least drop panel (shear cap) a punching joint verifies with: its depth under the slab, from
 * h/4 (§8.2.4(a)), so that the section at the column holds with slab and drop together; and its
 * extent from the column face, at least that depth (§8.2.5), so that the section at d/2 beyond its
 * edge holds with the slab alone (§22.6.4.1). Null when no depth up to h or extent up to 1.5 m does.
 */
function dropPanel(key: string, d: import('../rc-sheets/punching-row').PunchingDemand): number[] | null {
  const redesign = redesignerOf(key);
  if (!redesign) return null;
  const h = d.thickness;
  let depth: number | null = null;
  for (let x = Math.max(0.05, Math.ceil((h / 4) * 100) / 100); x <= h + 1e-9; x = round(x + 0.01)) {
    if (passes(redesign({ ...d, thickness: round(h + x) } as never))) { depth = x; break; }
  }
  if (depth === null) return null;
  for (let e = Math.max(depth, 0.1); e <= 1.5 + 1e-9; e = round(e + 0.05)) {
    if (passes(redesign({ ...d, joint: { ...d.joint, b: d.joint.b + 2 * e, h: d.joint.h + 2 * e } } as never))) return [depth, round(e)];
  }
  return null;
}

/**
 * A continuous beam's depth: the deepest any of its failing spans needs; where no depth up to twice
 * does, the widest width they need. With none failing, the shallowest depth every span verifies
 * with, deflection included, when each of them has room to be shallower.
 */
export function lineResizeHint(spans: readonly BeamRow[]): ResizeHint | null {
  if (spans.length && spans.every((s) => s.status !== 'fail')) {
    const down = spans.map((s) => resizeHints(s).find((h) => h.what === 'beamH' && h.direction === 'shrink'));
    if (down.some((h) => !h?.to)) return null;
    const from = Math.max(...spans.map((s) => s.demand.h));
    const to = Math.max(...down.map((h) => h!.to![0]!));
    return to < from - 1e-9 ? { what: 'beamH', direction: 'shrink', from: [from], to: [to] } : null;
  }
  const hints = spans.filter((s) => s.status === 'fail').flatMap((s) => resizeHints(s));
  if (!hints.length) return null;
  const of = (what: ResizeWhat, side: (s: BeamRow) => number): ResizeHint => {
    const mine = hints.filter((h) => h.what === what);
    return { what, direction: 'grow', from: [Math.max(...spans.map(side))], to: mine.some((h) => h.to === null) ? null : [Math.max(...mine.map((h) => h.to![0]!))] };
  };
  const deeper = of('beamH', (s) => s.demand.h);
  return deeper.to || !hints.some((h) => h.what === 'beamB') ? deeper : of('beamB', (s) => s.demand.b);
}

const groupOf = (key: string) => Number(key.split(':')[1]);
const membersOf = (g: number) => [...(modelStore.model.groups.get(g)?.members.elements ?? [])];

/** The storey's own members of a column stack: those between its bottom and top nodes. */
export function storeyMembers(row: ColumnRow): number[] {
  const n = row.demand.nodes;
  const all = membersOf(groupOf(row.key));
  if (!n) return all;
  const z0 = modelStore.nodes.get(n.bottom)?.z ?? -Infinity, z1 = modelStore.nodes.get(n.top)?.z ?? Infinity;
  return all.filter((id) => {
    const e = modelStore.elements.get(id);
    const a = e && modelStore.nodes.get(e.nodeI), b = e && modelStore.nodes.get(e.nodeJ);
    return !!a && !!b && Math.min(a.z ?? 0, b.z ?? 0) >= Math.min(z0, z1) - 1e-6 && Math.max(a.z ?? 0, b.z ?? 0) <= Math.max(z0, z1) + 1e-6;
  });
}

export type GotoTarget = 'members' | 'plates';

/** Where a row's element is changed: its members in the Members tab, or its plates in the Shells tab. */
export function rowTargets(row: SheetRow | LineLayout): GotoTarget[] {
  if ('spanAdopted' in row) return ['members'];
  if (row.family === 'beam' || row.family === 'column') return ['members'];
  if (row.family === 'punching') return ['plates', 'members'];
  if (row.family === 'footing') return [];
  return ['plates'];
}

export function wallsToHold(rows: readonly SheetRow[]): WallRow[] {
  const zOf = (n: number) => modelStore.nodes.get(n)?.z ?? 0;
  const supported = [...modelStore.supports.values()].map((s) => zOf(s.nodeId));
  const ground = supported.length ? Math.min(...supported) : Math.min(...[...modelStore.nodes.values()].map((n) => n.z ?? 0));
  return rows.filter((r): r is WallRow => r.family === 'wall' && !!r.demand.base?.unheld?.length
    && r.demand.base.unheld.every((n) => modelStore.nodes.has(n) && Math.abs(zOf(n) - ground) < 1e-3));
}

/** Each base node gets the support most common at the foundation's level, fixed where it has none, and each wall's base is held all along with every mesh; one undo step. */
export function supportWallBases(rows: readonly SheetRow[]): number {
  const held = new Set([...modelStore.supports.values()].map((s) => s.nodeId));
  const nodes = [...new Set(wallsToHold(rows).flatMap((r) => r.demand.base!.unheld!))].filter((n) => !held.has(n));
  if (!nodes.length) return 0;
  const ground = modelStore.nodes.get(nodes[0]!)?.z ?? 0;
  const kinds = new Map<string, number>();
  for (const s of modelStore.supports.values()) {
    const p = modelStore.nodes.get(s.nodeId);
    if (p && Math.abs((p.z ?? 0) - ground) < 1e-3) kinds.set(s.type, (kinds.get(s.type) ?? 0) + 1);
  }
  const type = ([...kinds.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] ?? 'fixed3d') as Parameters<typeof modelStore.addSupport>[1];
  modelStore.batch(() => {
    for (const n of nodes) modelStore.addSupport(n, type);
    for (const id of new Set(wallsToHold(rows).map((r) => groupOf(r.key)))) holdPlateSidesAt(id, ground, type);
  });
  return nodes.length;
}

/** Selects the row's element in the model and opens the tab where its dimensions are changed. */
export function goToRow(row: SheetRow | LineLayout, target: GotoTarget): boolean {
  let members: number[] = [], plates: number[] = [];
  if ('spanAdopted' in row) members = membersOf(row.group);
  else if (row.family === 'beam') members = membersOf(row.demand.line?.group ?? groupOf(row.key));
  else if (row.family === 'column') members = storeyMembers(row);
  else if (row.family === 'slab' || row.family === 'wall') plates = [groupOf(row.key)];
  else if (row.family === 'punching') {
    members = [row.demand.joint.elementBelow, row.demand.joint.elementAbove].filter((x): x is number => x != null);
    plates = [...new Set(row.demand.adjoining.map((a) => plateOfShell(`q${a.elementId}`) ?? plateOfShell(`p${a.elementId}`)).filter((x): x is number => x != null))];
  }
  if (target === 'members' && members.length) {
    uiStore.selectElements(members);
    uiStore.proActiveTab = 'elements';
    return true;
  }
  if (target === 'plates' && plates.length) {
    uiStore.selectPlates(plates);
    uiStore.proActiveTab = 'shells';
    return true;
  }
  return false;
}

/** A row whose own proposal does not verify: with its section and concrete the sheets find no arrangement. Bars set by hand are the engineer's, not a proposal. */
export function noArrangement(row: SheetRow | LineLayout, spans: readonly BeamRow[] = []): boolean {
  if ('spanAdopted' in row) return !row.isAdopted && lineRowStatus(row, spans) === 'fail';
  return row.status === 'fail' && (row.family === 'punching' || !row.isAdopted) && !(row.family === 'footing' && onlyOverlaps(row));
}

/** An alternative a row verifies with: a section (`what` and its dimensions, m) or a stronger concrete (f'c, MPa, and its class's name). */
export type Alternative =
  | { kind: 'section'; what: ResizeWhat | 'beam'; from: number[]; to: number[] }
  | { kind: 'concrete'; from: number; to: number; name: string }
  | { kind: 'footing'; what: FootingAlternative }
  | { kind: 'ties'; from: number[]; to: number };

/**
 * What a footing with no proposal that verifies is offered: another balance of its offset, tried
 * by designing it again with it; and, where none does or the footings overlap even combined, what
 * is left to do outside the sheets: a mat or deep foundation, or a soil study for a higher
 * allowable pressure than the one presumed.
 */
export type FootingAlternative = 'strap' | 'tie' | 'eccentric' | 'mat' | 'soil';

/** The stirrup and tie diameters the project does not allow yet, smallest first, each with the list it would make. */
export function widerTieLists(): Array<{ dia: number; list: number[] }> {
  const now = designData().stirrupDiametersMm;
  return BAR_DIAMETERS_MM.filter((x) => inRange(x, TIE_BAR_RANGE) && !now.includes(x)).map((dia) => ({ dia, list: [...now, dia].sort((p, q) => p - q) }));
}

/**
 * The beam sections a row is tried at, smallest depth first, by the Stabileo criteria (FIUBA §3.1):
 * h in their steps from the depth it has, b in their steps between h/n of the narrowest and of the
 * widest, never narrower than it is.
 */
export function beamSections(b0: number, h0: number, limit = Math.min(2 * h0, 2), cr: Criteria = sheetCriteria()): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const s = cr.beamSectionStep;
  const up = (x: number) => Math.ceil(x / s - 1e-9) * s, down = (x: number) => Math.floor(x / s + 1e-9) * s;
  for (let h = up(h0 - 1e-6); h <= limit + 1e-9; h = round(h + s)) {
    const lo = Math.max(b0, up(h / cr.beamWidthFrom - 1e-6)), hi = Math.max(b0, down(h / cr.beamWidthTo));
    for (let b = lo; b <= hi + 1e-9; b = round(b + s)) {
      if (Math.abs(b - b0) < 1e-6 && Math.abs(h - h0) < 1e-6) continue;
      out.push([round(b), round(h)]);
    }
  }
  return out;
}

/** The concrete strengths an alternative is chosen among, ascending: the project's list or the code's classes, above `from` and up to the largest it allows. */
export function strongerConcretes(from: number): Array<{ fc: number; name: string }> {
  const o = designData().designOptions?.alternatives;
  if (o?.raiseFc === false) return [];
  const code = sheetCode();
  const max = o?.fcMax ?? DEFAULT_FC_MAX;
  const pool = o?.fcClasses?.length ? o.fcClasses.map((fc) => concreteClassOf(code, fc)) : [...concreteClasses(code)];
  return pool.filter((k) => k.fc > from + 1e-6 && k.fc <= max + 1e-6).sort((p, q) => p.fc - q.fc).map((k) => ({ fc: k.fc, name: k.name }));
}


/**
 * The alternatives a row with no arrangement verifies with, each found by designing it again: the
 * least section (a beam by `beamSections`, the rest as `resizeHints` grows them) and the weakest
 * stronger concrete; `fc` is the concrete the row has, MPa.
 */
export function alternatives(row: SheetRow, fc = concreteOfRow(row.key)): Alternative[] {
  if (!noArrangement(row)) return [];
  const redesign = redesignerOf(row.key);
  if (!redesign) return [];
  const out: Alternative[] = [];
  if (row.family === 'footing') return footingAlternatives(row, redesign);
  if (row.family === 'beam') {
    const d = row.demand;
    const to = beamSections(d.b, d.h).find(([b, h]) => passes(redesign({ ...d, b, h } as never)));
    if (to) out.push({ kind: 'section', what: 'beam', from: [d.b, d.h], to });
  } else {
    for (const h of resizeHints(row)) if (h.to && h.direction === 'grow' && h.what !== 'punchCapital' && h.what !== 'punchDrop') out.push({ kind: 'section', what: h.what, from: h.from, to: h.to });
  }
  const demand = row.demand;
  const stronger = fc !== undefined ? strongerConcretes(fc).find((k) => passes(redesign(demand as never, { fc: k.fc }))) : undefined;
  if (stronger && fc !== undefined) out.push({ kind: 'concrete', from: fc, to: stronger.fc, name: stronger.name });
  const ties = row.family === 'beam' || row.family === 'column' || row.family === 'wall' ? widerTieLists().find((k) => passes(redesign(demand as never, { ties: k.list }))) : undefined;
  if (ties) out.unshift({ kind: 'ties', from: designData().stirrupDiametersMm, to: ties.dia });
  return out;
}

function footingAlternatives(row: FootingRow, redesign: Redesign): Alternative[] {
  const out: Alternative[] = [];
  const d = row.demand, e = d.edge;
  if (e) for (const balance of ['strap', 'tie', 'eccentric'] as const) {
    if (balance === e.balance) continue;
    if (passes(redesign({ ...d, edge: { ...e, balance } } as never))) out.push({ kind: 'footing', what: balance });
  }
  if (row.verifications.some((v) => v.label === 'rcSheets.v.footOverlap' && !v.ok)) out.push({ kind: 'footing', what: 'mat' });
  if (!out.length) out.push({ kind: 'footing', what: d.soil?.presumed ? 'soil' : 'mat' });
  return out;
}

/** The same for a physical beam laid out as one line: one section for all its spans, or a stronger concrete, the whole line designed again with it. */
export function lineAlternatives(line: LineLayout, spans: readonly BeamRow[], fc = concreteOfRow(line.key)): Alternative[] {
  if (!noArrangement(line, spans)) return [];
  const redesign = lineRedesignerOf(line.group);
  if (!redesign || !spans.length) return [];
  const b0 = Math.max(...spans.map((s) => s.b)), h0 = Math.max(...spans.map((s) => s.h));
  const out: Alternative[] = [];
  const own = spans.map((s) => ({ s, redo: redesignerOf(s.key) })).filter((x) => x.redo && passes(x.redo(x.s.demand as never)) === false);
  const alone = (o: { b?: number; h?: number; fc?: number; ties?: number[] }) => own.every(({ s, redo }) => passes(redo!({ ...s.demand, ...(o.b ? { b: o.b, h: o.h } : {}) } as never, o.fc || o.ties ? { ...(o.fc ? { fc: o.fc } : {}), ...(o.ties ? { ties: o.ties } : {}) } : undefined)));
  const to = beamSections(b0, h0).find(([b, h]) => alone({ b, h }) && redesign({ b, h }).status !== 'fail');
  if (to) out.push({ kind: 'section', what: 'beam', from: [b0, h0], to });
  const stronger = fc !== undefined ? strongerConcretes(fc).find((k) => alone({ fc: k.fc }) && redesign({ fc: k.fc }).status !== 'fail') : undefined;
  if (stronger && fc !== undefined) out.push({ kind: 'concrete', from: fc, to: stronger.fc, name: stronger.name });
  const ties = widerTieLists().find((k) => alone({ ties: k.list }) && redesign({ ties: k.list }).status !== 'fail');
  if (ties) out.unshift({ kind: 'ties', from: designData().stirrupDiametersMm, to: ties.dia });
  return out;
}
