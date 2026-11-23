/**
 * The project's design data: what used to be fixed in the code and is now the project's to
 * state, in one place. The reinforcing steel and its yield strength, the stirrup diameter the
 * depth arithmetic assumes, the clear cover by kind of element, the bar diameters the design may
 * choose from, and the diameter of a wall's bars.
 *
 * The default covers are CIRSOC 201-2025 Table 20.5.1.3.1's under execution control for the
 * default bars, rounded up to 5 mm; a project that stored its own keeps them. The exposure of each kind of element is recorded with its cover, and the minimum cover of
 * CIRSOC 201-2025 Table 20.5.1.3.1 is known for it: a cover under it is said, and a click sets
 * every cover to it.
 */
import { AGGREGATE_RANGE, BEAM_BAR_RANGE, COLUMN_BAR_RANGE, DEFAULT_AGGREGATE_MM, DEFAULT_MIN_TIE_SPACING, SHEET_CODE_LIST, SLAB_BAR_RANGE, SLAB_MESH_DIAMETERS, WALL_BAR_RANGE, inRange, type SheetCode } from '../rc-sheets/types';
import { migrateSeismicDesign } from './seismic-design';
import { migrateDesignOptions } from '../rc-sheets/design-options';
import { migrateLateralSystem } from './lateral-system';
import { REBAR_DB } from '../engine/codes/argentina/cirsoc201';
import { specifiedCoverMm } from '../codes/cirsoc201/cover';
import { PROPERTY_SIDES, type PropertyLines } from './foundation/edges';
import { footingSetupOf } from '../rc-sheets/footing-types';

export type DesignKind = 'beam' | 'column' | 'slab' | 'wall' | 'footing';
export const DESIGN_KINDS: readonly DesignKind[] = ['beam', 'column', 'slab', 'wall', 'footing'];

/**
 * Exposure as the cover table reads it: not exposed to weather nor in contact with the ground,
 * exposed to weather or in contact with the ground, or cast against and permanently in contact
 * with the ground.
 */
export type Exposure = 'interior' | 'exterior' | 'ground';

export interface LoadBasis {
  /** ISO time the plan was applied. */
  at: string;
  resultsVersion?: number;
  generatedBy?: string;
  factors: Record<string, import('../codes/regulation').ProvenancedValue<number>>;
  levels: Array<Omit<import('../engine/loads/load-plan').LevelMass, 'nodeIds'>>;
  seismic?: import('../engine/loads/load-plan').LoadPlan['seismic'];
  derivation: import('../codes/message').EngineMessage[];
  assumptions: import('../codes/message').EngineMessage[];
  refs: import('../codes/regulation').ClauseRef[];
}

export interface ProjectDesignData {
  version: 1;
  /** Reinforcing steel: its name and its specified yield strength, MPa. */
  rebarGrade: string;
  rebarFy: number;
  /** The stirrup or tie a design starts from, mm: read from `stirrupDiametersMm` (`preferredBar`), never stated. */
  stirrupDiaMm: number;
  /** Clear cover to the outermost bar, m, by kind of element. */
  covers: Record<DesignKind, number>;
  exposure: Record<DesignKind, Exposure>;
  /** `false` when the work is not under execution control: Table 20.5.1.3.1's second column, 5 mm more cover. Absent: under control. */
  executionControl?: false;
  /** Diameters the design may choose from, mm. */
  longDiametersMm: number[];
  stirrupDiametersMm: number[];
  /** The diameters a slab's meshes may choose from, mm, within `SLAB_BAR_RANGE`. */
  slabDiametersMm: number[];
  /** The closest spacing stirrups, hoops and ties are proposed at, mm: room for the concrete to pass between them. */
  minTieSpacingMm: number;
  /** The nominal size of the largest aggregate, mm: the 4/3·dagg of the clear spacing between bars (§25.2.1, §25.2.3; dg in EN 1992 8.2(2)). */
  maxAggregateMm: number;
  /** The diameters a wall's meshes may choose from, mm, within `WALL_BAR_RANGE`. */
  wallDiametersMm: number[];
  /** The wall bar a design without the list reads, mm: from `wallDiametersMm` (`preferredBar`), never stated. */
  wallBarDiaMm: number;
  /** The allowable bearing pressure footings are presized for where the model states no soil, kPa: a presumption to confirm with the soil study. */
  presumedBearingKPa: number;
  /** The piles a pile foundation is designed with: their diameter and length, m, and, where the soil profile states no strata, the allowable load of one, kN: a presumption to confirm with the soil study. Absent: the defaults. */
  presumedPile?: PresumedPile;
  /** The sides of the building that are property lines: the footings there are held at the line, and the foundation tools read the same. Absent: none. */
  propertyLines?: PropertyLines;
  /** The elevation every footing of the building is founded at, its underside, m in global Z. Absent: the level the deepest footing asks for. */
  foundingElevation?: number;
  /**
   * Denser ties at both ends of every column, also where no seismic rule asks for them: over
   * lo = max(largest side, clear height/6, 450 mm) at half the spacing. Absent: off.
   */
  columnEndZones?: boolean;
  /** The project's own joist types (its makers' sheets, or geometric definitions). */
  joistTypes?: import('../engine/joists/library').JoistType[];
  /** The sheet set: format, numbering, the documents' language and the revisions per sheet. */
  /**
   * The basis of the loads the last applied plan wrote: its provenanced factors, the weight by
   * level, the seismic derivation, the assumptions and the clauses. Kept so the memoria's actions
   * chapter can justify the loads after the dialog that computed them is closed.
   */
  loadBasis?: LoadBasis;
  /** Ribbed, hollow-core and composite-deck systems, drop panels and capitals, pile steel (`store/special-floors.ts`). */
  specialFloors?: import('./special-floors').SpecialFloorsData;
  /** Parametric stairs and the post-tensioned slabs' tendons (`store/stairs-pt.ts`). */
  stairs?: import('./stairs-pt').StairEntry[];
  postTension?: import('./stairs-pt').PostTensionData;
  /** Fire rating and how each material meets it (`store/fire.ts`). */
  fire?: import('./special-elements').FireSettings;
  /** Corbels, coupling beams, beam openings, masonry walls, infills and connections (`store/special-elements.ts`). */
  specialElements?: import('./special-elements').SpecialElementsData;
  /** The foreign codes the project also designs to, by material (`store/foreign-design.ts`). */
  foreignCodes?: import('./foreign-codes').ForeignCodes;
  /** The price bases, the one in use and the summary shares of the budget (`store/budget.ts`). */
  budget?: { bases: import('../engine/budget/budget').PriceBase[]; activeBaseId?: string; shares?: import('../engine/budget/budget').SummaryShares };
  /** Models of other disciplines linked to the project, and the versions published (`store/federation.svelte.ts`). */
  federation?: { links: import('../engine/federation/linked').LinkedModel[]; versions: import('../engine/federation/versions').PublishedVersion[] };
  /** Constructions, walls and partitions, rooms (`store/architecture.ts`). */
  /** Construction phases and what each builds (`store/site.svelte.ts`). */
  site?: import('../engine/site/phases').SiteData;
  architecture?: { constructions: import('../engine/architecture/architecture').Construction[]; walls: import('../engine/architecture/architecture').ArchWall[]; rooms: import('../engine/architecture/architecture').Room[] };
  /** Service condition and temperature of the timber members (CIRSOC 601 CM and Ct). */
  timber?: import('../engine/design/materials/timber').TimberSettings;
  /**
   * How the project goes to other programs. `ifcColumnTop`: where a column's body ends in the IFC
   * against the slab it meets: the slab's top (the whole joint in the column, the default), the
   * slab's soffit, or the node's axis; what is above goes to the slab, or to the deepest beam where
   * there is no slab.
   */
  exchange?: { ifcColumnTop?: 'slabTop' | 'slabSoffit' | 'axis' };
  /** How far apart, mm, two members' lengths may be and their frames still repeat (`repeatedFrames`). Absent: 0, the same to the millimetre. */
  frameToleranceMm?: number;
  /** Cover a person set for one member, m, by element id: it replaces its kind's (`covers`). */
  coverByElement?: Record<string, number>;
  /** The listings' columns and filters, and the waste added to the quantities (`store/listings.ts`). */
  listings?: { configs?: Record<string, { columns?: string[]; text?: string; failingOnly?: boolean }>; wastePct?: number };
  sheets?: {
    format: import('../sheets/formats').SheetFormat; prefix: string; start: number; language?: string; kinds?: string[]; revisions?: Record<string, { code: string; date?: string; note?: string }>;
    /** The set as an ordered list of entries (`sheets/sheet-entries.ts`); absent, one per kind. */
    entries?: import('../sheets/sheet-entries').SheetEntry[];
    display?: import('../sheets/display').SheetDisplay;
    titleBlock?: import('../sheets/sheet-entries').TitleBlockTemplate;
    /** The person's adjustments to the composed sheets, by drawing key (`sheets/sheet-layout.ts`). */
    layout?: import('../sheets/sheet-layout').SheetLayout;
    /** The construction details chosen from the catalogue and the plan kind each goes on; absent, the defaults (`sheets/details/catalog.ts`). */
    details?: Array<{ id: string; target: string }>;
  };
  /** How a seismic project designs its concrete (`seismic-design.ts`). Absent: the defaults. */
  seismic?: import('./seismic-design').SeismicDesignSettings;
  /**
   * Which members are part of the lateral-force-resisting system (`lateral-system.ts`): by
   * physical element, by member, and the default for the beams. Absent: nothing declared.
   */
  lateralSystem?: import('./lateral-system').LateralSystemData;
  /** The bars adopted in the reinforcement sheets, their code and schedule (`rc-sheets/`). */
  rcSheets?: import('../rc-sheets/types').StoredRcSheets;
  /** How the beams take torsion and the choices the design makes before it starts (`rc-sheets/design-options.ts`). Absent: none stated. */
  designOptions?: import('../rc-sheets/design-options').DesignOptions;
  /** A predetermined slab base mat, deducted before bands are added (absent: the minimum). */
  slabBase?: Partial<Record<'topX' | 'topY' | 'bottomX' | 'bottomY', { diameter: number; spacing: number }>>;
}

/**
 * The design data as the project stores it: only what someone stated. What it leaves out is read
 * from the defaults in force (`migrateDesignData`), so a default that later changes is not frozen.
 */
export type StoredDesignData = { version: 1 } & Partial<Omit<ProjectDesignData, 'version' | 'covers' | 'exposure'>>
  & { covers?: Partial<Record<DesignKind, number>>; exposure?: Partial<Record<DesignKind, Exposure>> };

const STATED_BY_DEFAULT = ['rebarGrade', 'rebarFy', 'longDiametersMm', 'stirrupDiametersMm', 'slabDiametersMm', 'wallDiametersMm', 'minTieSpacingMm', 'maxAggregateMm', 'presumedBearingKPa'] as const;
/** Read from the lists, never stored. */
export const DERIVED_DESIGN_KEYS = ['stirrupDiaMm', 'wallBarDiaMm'] as const;

/** Read any stored shape keeping only what it states: the defaults stay out, to be read when the data is. */
export function migrateStoredDesignData(raw: unknown): StoredDesignData | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const e = raw as Record<string, unknown>;
  const full = migrateDesignData(raw);
  const out: Record<string, unknown> = { version: 1 };
  for (const [k, v] of Object.entries(full)) {
    if (k === 'version' || k === 'covers' || k === 'exposure' || (DERIVED_DESIGN_KEYS as readonly string[]).includes(k)) continue;
    if ((STATED_BY_DEFAULT as readonly string[]).includes(k) && !(k in e)) continue;
    out[k] = v;
  }
  for (const k of ['covers', 'exposure'] as const) {
    const own = e[k] && typeof e[k] === 'object' ? e[k] as Record<string, unknown> : {};
    const kinds = DESIGN_KINDS.filter((kind) => kind in own && full[k][kind] === own[kind]);
    if (kinds.length) out[k] = Object.fromEntries(kinds.map((kind) => [kind, full[k][kind]]));
  }
  return out as StoredDesignData;
}

const propertyLinesOf = (v: unknown): PropertyLines | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const on = PROPERTY_SIDES.filter((k) => (v as Record<string, unknown>)[k] === true);
  return on.length ? Object.fromEntries(on.map((k) => [k, true])) : undefined;
};

/** The floor of the stirrups' spacing the project may state, mm. */
export const MIN_TIE_SPACING_RANGE = { min: 25, max: 150 } as const;

/** The founding elevation the project may state, m. */
export const FOUNDING_RANGE = { min: -30, max: 30 } as const;

/** The presumed allowable bearing pressure the project may state, kPa, and its default (1,5 kg/cm²). */
export const PRESUMED_BEARING_RANGE = { min: 50, max: 1000, default: 150 } as const;

/** A pile as the project presumes it: diameter and length, m, and allowable load, kN. */
/** A layer of ground down to `to`, m below the cap: the allowable shaft friction on the pile's skin there and the allowable tip pressure under a pile ending in it, kPa, as the soil study gives them. */
export interface PileLayer { to: number; shaft: number; tip: number }
export interface PresumedPile {
  diameter: number; length: number; capacity: number;
  /** The ground by depth, top down: where stated, the pile's allowable load is read from it, tip on its section and friction on its skin, and `capacity` is not used. */
  layers?: PileLayer[];
}

/** The presumed pile's ranges and defaults: a bored pile of 50 cm, 12 m long, 600 kN allowable. */
export const PRESUMED_PILE_RANGE = { diameter: { min: 0.3, max: 1.5, default: 0.5 }, length: { min: 3, max: 50, default: 12 }, capacity: { min: 100, max: 10000, default: 600 } } as const;

/** The presumed pile with the defaults where it states none. */
export const presumedPileOf = (p: Partial<PresumedPile> | undefined): PresumedPile => {
  const pick = (k: 'diameter' | 'length' | 'capacity') => { const v = p?.[k], r = PRESUMED_PILE_RANGE[k]; return typeof v === 'number' && Number.isFinite(v) && v >= r.min && v <= r.max ? v : r.default; };
  const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const layers = Array.isArray(p?.layers)
    ? p!.layers.filter((l): l is PileLayer => !!l && num(l.to, 0.1, 200) && num(l.shaft, 0, 2000) && num(l.tip, 0, 50000)).sort((a, b) => a.to - b.to)
    : [];
  return { diameter: pick('diameter'), length: pick('length'), capacity: pick('capacity'), ...(layers.length ? { layers } : {}) };
};

/** The layers as strata top down, each as thick as the step to its bottom. */
export const pileLayerStrata = (layers: readonly PileLayer[]): Array<{ name: string; thickness: number; shaftFrictionKPa: number; tipResistanceKPa: number }> =>
  layers.map((l, i) => ({ name: `${i + 1}`, thickness: l.to - (i ? layers[i - 1]!.to : 0), shaftFrictionKPa: l.shaft, tipResistanceKPa: l.tip }));

/** Every diameter the bar table knows, mm. */
export const BAR_DIAMETERS_MM: readonly number[] = REBAR_DB.map((r) => r.diameter);

/** The bar of a list a design starts from: `usual` where the list has it, else the nearest above, else the largest. */
export const preferredBar = (list: readonly number[], usual: number): number =>
  list.includes(usual) ? usual : [...list].sort((p, q) => p - q).find((x) => x > usual) ?? Math.max(...list);

export function defaultDesignData(): ProjectDesignData {
  const stirrups = BAR_DIAMETERS_MM.filter((d) => d <= 12), walls = BAR_DIAMETERS_MM.filter((d) => inRange(d, WALL_BAR_RANGE) && d <= 16);
  return {
    version: 1,
    rebarGrade: 'ADN 420', rebarFy: 420,
    stirrupDiaMm: preferredBar(stirrups, 8),
    covers: { beam: 0.03, column: 0.03, slab: 0.025, wall: 0.025, footing: 0.055 },
    exposure: { beam: 'interior', column: 'interior', slab: 'interior', wall: 'interior', footing: 'ground' },
    longDiametersMm: BAR_DIAMETERS_MM.filter((d) => d >= 10),
    stirrupDiametersMm: stirrups,
    slabDiametersMm: [...SLAB_MESH_DIAMETERS],
    minTieSpacingMm: DEFAULT_MIN_TIE_SPACING * 1000,
    maxAggregateMm: DEFAULT_AGGREGATE_MM,
    wallDiametersMm: walls,
    wallBarDiaMm: preferredBar(walls, 12),
    presumedBearingKPa: PRESUMED_BEARING_RANGE.default,
  };
}

/**
 * The minimum clear cover to the outermost steel, m, of CIRSOC 201-2025 Table 20.5.1.3.1 for
 * cast-in-place concrete that is not prestressed: by kind of element, exposure, the largest bar
 * and, for beams and columns, the stirrup it is measured to; under execution control unless said.
 */
export function minimumCover(kind: DesignKind, exposure: Exposure, largestBarMm: number, o: { stirrupMm?: number; control?: boolean } = {}): number {
  return specifiedCoverMm({ element: kind, exposure, dbMm: largestBarMm, ...o }) / 1000;
}

/** A kind's minimum cover under these data: their stirrup, largest bar and execution control. */
export const minimumCoverFor = (d: ProjectDesignData, kind: DesignKind): number =>
  minimumCover(kind, d.exposure[kind], largestBar(d, kind), { stirrupMm: d.stirrupDiaMm, control: d.executionControl !== false });

/** The largest bar a kind of element takes under these data, mm: from the bars its rows choose among, not another family's. */
export function largestBar(d: ProjectDesignData, kind: DesignKind): number {
  if (kind === 'wall') return Math.max(...d.wallDiametersMm);
  if (kind === 'slab') return Math.max(...d.slabDiametersMm);
  const range = kind === 'beam' ? BEAM_BAR_RANGE : kind === 'column' ? COLUMN_BAR_RANGE : null;
  const own = range ? d.longDiametersMm.filter((x) => inRange(x, range)) : d.longDiametersMm;
  return Math.max(0, ...(own.length ? own : d.longDiametersMm));
}

/** The kinds whose stated cover is under the table's minimum for their exposure. */
export function coversUnderMinimum(d: ProjectDesignData): Array<{ kind: DesignKind; cover: number; minimum: number }> {
  return DESIGN_KINDS.map((kind) => ({ kind, cover: d.covers[kind], minimum: minimumCoverFor(d, kind) }))
    .filter((x) => x.cover < x.minimum - 1e-9);
}

/** Every cover set to the table's minimum for its exposure, rounded up to 5 mm: the CIRSOC preset. */
export function withCirsocCovers(d: ProjectDesignData): ProjectDesignData {
  const covers = { ...d.covers };
  for (const k of DESIGN_KINDS) covers[k] = Math.ceil(minimumCoverFor(d, k) * 200 - 1e-9) / 200;
  return { ...d, covers };
}

/** Read any stored shape, including none; what it does not state is the default. */
const SCOPES = ['element', 'level', 'project'] as const;
function scheduleOf(x: unknown): { schedule?: { waste?: number; scope?: (typeof SCOPES)[number] } } {
  if (!x || typeof x !== 'object') return {};
  const { waste, scope } = x as { waste?: unknown; scope?: unknown };
  const out: { waste?: number; scope?: (typeof SCOPES)[number] } = {};
  if (typeof waste === 'number' && Number.isFinite(waste) && waste >= 0 && waste <= 0.5) out.waste = waste;
  if (SCOPES.includes(scope as never)) out.scope = scope as (typeof SCOPES)[number];
  return Object.keys(out).length ? { schedule: out } : {};
}

const bentLinesOf = (v: unknown): { bentLines?: Record<string, boolean> } => {
  if (!v || typeof v !== 'object') return {};
  const kept = Object.entries(v as Record<string, unknown>).filter((x): x is [string, boolean] => typeof x[1] === 'boolean');
  return kept.length ? { bentLines: Object.fromEntries(kept) } : {};
};

export function migrateDesignData(raw: unknown): ProjectDesignData {
  const def = defaultDesignData();
  if (!raw || typeof raw !== 'object') return def;
  const e = raw as Record<string, unknown>;
  const pos = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fb);
  const known = (list: unknown, fb: number[]) => {
    const l = Array.isArray(list) ? [...new Set(list.filter((x): x is number => BAR_DIAMETERS_MM.includes(x as number)))].sort((a, b) => a - b) : [];
    return l.length ? l : fb;
  };
  const byKind = <T>(v: unknown, fb: Record<DesignKind, T>, ok: (x: unknown) => x is T): Record<DesignKind, T> => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return Object.fromEntries(DESIGN_KINDS.map((k) => [k, ok(o[k]) ? o[k] : fb[k]])) as Record<DesignKind, T>;
  };
  const stirrups = known(e.stirrupDiametersMm, def.stirrupDiametersMm);
  const walls = known(Array.isArray(e.wallDiametersMm) ? e.wallDiametersMm.filter((x) => inRange(x as number, WALL_BAR_RANGE)) : undefined, def.wallDiametersMm);
  return {
    version: 1,
    rebarGrade: typeof e.rebarGrade === 'string' && e.rebarGrade ? e.rebarGrade : def.rebarGrade,
    rebarFy: pos(e.rebarFy, def.rebarFy),
    stirrupDiaMm: preferredBar(stirrups, 8),
    covers: byKind(e.covers, def.covers, (x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0),
    exposure: byKind(e.exposure, def.exposure, (x): x is Exposure => x === 'interior' || x === 'exterior' || x === 'ground'),
    longDiametersMm: known(e.longDiametersMm, def.longDiametersMm),
    stirrupDiametersMm: stirrups,
    slabDiametersMm: known(Array.isArray(e.slabDiametersMm) ? e.slabDiametersMm.filter((x) => inRange(x as number, SLAB_BAR_RANGE)) : undefined, def.slabDiametersMm),
    minTieSpacingMm: typeof e.minTieSpacingMm === 'number' && Number.isFinite(e.minTieSpacingMm) && e.minTieSpacingMm >= MIN_TIE_SPACING_RANGE.min && e.minTieSpacingMm <= MIN_TIE_SPACING_RANGE.max ? e.minTieSpacingMm : def.minTieSpacingMm,
    maxAggregateMm: typeof e.maxAggregateMm === 'number' && Number.isFinite(e.maxAggregateMm) && e.maxAggregateMm >= AGGREGATE_RANGE.min && e.maxAggregateMm <= AGGREGATE_RANGE.max ? e.maxAggregateMm : def.maxAggregateMm,
    wallDiametersMm: walls,
    wallBarDiaMm: preferredBar(walls, 12),
    presumedBearingKPa: typeof e.presumedBearingKPa === 'number' && Number.isFinite(e.presumedBearingKPa) && e.presumedBearingKPa >= PRESUMED_BEARING_RANGE.min && e.presumedBearingKPa <= PRESUMED_BEARING_RANGE.max ? e.presumedBearingKPa : def.presumedBearingKPa,
    ...(e.presumedPile && typeof e.presumedPile === 'object' ? { presumedPile: presumedPileOf(e.presumedPile as Partial<PresumedPile>) } : {}),
    ...((l) => (l ? { propertyLines: l } : {}))(propertyLinesOf(e.propertyLines)),
    ...(typeof e.foundingElevation === 'number' && Number.isFinite(e.foundingElevation) && e.foundingElevation >= FOUNDING_RANGE.min && e.foundingElevation <= FOUNDING_RANGE.max ? { foundingElevation: e.foundingElevation } : {}),
    ...(e.columnEndZones === true ? { columnEndZones: true } : {}),
    ...((o) => (o ? { designOptions: o } : {}))(migrateDesignOptions(e.designOptions, e.rcSheets)),
    ...(e.executionControl === false ? { executionControl: false as const } : {}),
    ...(Array.isArray(e.joistTypes) ? { joistTypes: (e.joistTypes as Array<{ id?: unknown; name?: unknown }>).filter((t) => typeof t?.id === 'string' && typeof t?.name === 'string') as never } : {}),
    ...(e.slabBase && typeof e.slabBase === 'object' ? { slabBase: e.slabBase as ProjectDesignData['slabBase'] } : {}),
    ...(e.rcSheets && typeof e.rcSheets === 'object' && typeof (e.rcSheets as { adopted?: unknown }).adopted === 'object' ? { rcSheets: { version: 1 as const, ...(SHEET_CODE_LIST.includes((e.rcSheets as { code?: unknown }).code as never) ? { code: (e.rcSheets as { code: SheetCode }).code } : {}), ...bentLinesOf((e.rcSheets as { bentLines?: unknown }).bentLines), ...(['full', 'minimum', 'reinforce'].includes((e.rcSheets as { footingSizing?: unknown }).footingSizing as string) ? { footingSizing: (e.rcSheets as { footingSizing: 'full' | 'minimum' | 'reinforce' }).footingSizing } : {}), ...(['auto', 'footings', 'strips', 'mat', 'piles'].includes((e.rcSheets as { foundationSystem?: unknown }).foundationSystem as string) ? { foundationSystem: (e.rcSheets as { foundationSystem: 'auto' | 'footings' | 'strips' | 'mat' | 'piles' }).foundationSystem } : {}), ...scheduleOf((e.rcSheets as { schedule?: unknown }).schedule), ...footingSetupOf((e.rcSheets as { footingSetup?: unknown }).footingSetup), ...(Array.isArray((e.rcSheets as { edited?: unknown }).edited) ? { edited: ((e.rcSheets as { edited: unknown[] }).edited).filter((k): k is string => typeof k === 'string') } : {}), ...(SHEET_CODE_LIST.includes((e.rcSheets as { adoptedCode?: unknown }).adoptedCode as never) ? { adoptedCode: (e.rcSheets as { adoptedCode: SheetCode }).adoptedCode } : {}), ...((e.rcSheets as { adoptedSeismic?: unknown }).adoptedSeismic === true ? { adoptedSeismic: true as const } : {}), ...((x) => (typeof x === 'number' && Number.isInteger(x) && x > 0 ? { adoptedLogic: x } : {}))((e.rcSheets as { adoptedLogic?: unknown }).adoptedLogic), ...((x) => (typeof x === 'string' && x ? { adoptedBasis: x } : {}))((e.rcSheets as { adoptedBasis?: unknown }).adoptedBasis), ...((x) => (typeof x === 'string' && x ? { adoptedFoundationBasis: x } : {}))((e.rcSheets as { adoptedFoundationBasis?: unknown }).adoptedFoundationBasis), ...((e.rcSheets as { foundationSystem?: unknown }).foundationSystem === null ? { foundationSystem: null } : {}), adopted: { ...((e.rcSheets as { adopted: Record<string, never> }).adopted) } } } : {}),
    // The seismic roles fixed by hand are the lateral-system declaration under its older name:
    // they move there (`migrateLateralSystem`), and the seismic settings keep none of their own.
    ...(e.seismic && typeof e.seismic === 'object' ? { seismic: { ...migrateSeismicDesign(e.seismic), roles: {} } } : {}),
    ...((lateral) => (lateral ? { lateralSystem: lateral } : {}))(migrateLateralSystem(e.lateralSystem, (e.seismic as { roles?: Record<string, unknown> } | undefined)?.roles)),
    ...(e.sheets && typeof e.sheets === 'object' ? { sheets: e.sheets as ProjectDesignData['sheets'] } : {}),
    ...(e.loadBasis && typeof e.loadBasis === 'object' ? { loadBasis: e.loadBasis as LoadBasis } : {}),
    ...(e.timber && typeof e.timber === 'object' ? { timber: e.timber as ProjectDesignData['timber'] } : {}),
    ...(e.specialFloors && typeof e.specialFloors === 'object' ? { specialFloors: e.specialFloors as ProjectDesignData['specialFloors'] } : {}),
    ...(Array.isArray(e.stairs) ? { stairs: (e.stairs as Array<{ id?: unknown }>).filter((x) => typeof x?.id === 'string') as ProjectDesignData['stairs'] } : {}),
    ...(e.postTension && typeof e.postTension === 'object' ? { postTension: e.postTension as ProjectDesignData['postTension'] } : {}),
    ...(e.fire && typeof e.fire === 'object' ? { fire: e.fire as ProjectDesignData['fire'] } : {}),
    ...(e.specialElements && typeof e.specialElements === 'object' ? { specialElements: e.specialElements as ProjectDesignData['specialElements'] } : {}),
    ...(e.foreignCodes && typeof e.foreignCodes === 'object' ? { foreignCodes: e.foreignCodes as ProjectDesignData['foreignCodes'] } : {}),
    ...(e.site && typeof e.site === 'object' && Array.isArray((e.site as { phases?: unknown }).phases) ? { site: e.site as ProjectDesignData['site'] } : {}),
    ...(e.architecture && typeof e.architecture === 'object' && Array.isArray((e.architecture as { walls?: unknown }).walls) ? { architecture: e.architecture as ProjectDesignData['architecture'] } : {}),
    ...(e.federation && typeof e.federation === 'object' && Array.isArray((e.federation as { links?: unknown }).links) ? { federation: e.federation as ProjectDesignData['federation'] } : {}),
    ...(e.budget && typeof e.budget === 'object' && Array.isArray((e.budget as { bases?: unknown }).bases) ? { budget: e.budget as ProjectDesignData['budget'] } : {}),
    ...((x) => (x && typeof x === 'object' && ['slabTop', 'slabSoffit', 'axis'].includes(String((x as { ifcColumnTop?: unknown }).ifcColumnTop))
      ? { exchange: { ifcColumnTop: (x as { ifcColumnTop: 'slabTop' | 'slabSoffit' | 'axis' }).ifcColumnTop } } : {}))(e.exchange),
    ...(e.listings && typeof e.listings === 'object' && !Array.isArray(e.listings) ? { listings: e.listings as ProjectDesignData['listings'] } : {}),
    ...(typeof e.frameToleranceMm === 'number' && Number.isFinite(e.frameToleranceMm) && e.frameToleranceMm > 0 ? { frameToleranceMm: Math.min(e.frameToleranceMm, 500) } : {}),
    ...((c) => (Object.keys(c).length ? { coverByElement: c } : {}))(
      e.coverByElement && typeof e.coverByElement === 'object' && !Array.isArray(e.coverByElement)
        ? Object.fromEntries(Object.entries(e.coverByElement as Record<string, unknown>).filter((x): x is [string, number] => typeof x[1] === 'number' && Number.isFinite(x[1]) && x[1] >= 0 && x[1] < 0.2))
        : {}),
  };
}

/** The steel grades offered, with their yield strength, MPa. */
export const REBAR_GRADES: ReadonlyArray<{ name: string; fy: number }> = [
  { name: 'ADN 420', fy: 420 }, { name: 'ADN 500', fy: 500 }, { name: 'AL 220', fy: 220 },
];

/** f'c of a concrete material: its own `fc` when stated, else the `fy` older projects kept it in. */
export function concreteFc(m: { fc?: number; fy?: number } | undefined): number | undefined {
  return m?.fc ?? m?.fy;
}
