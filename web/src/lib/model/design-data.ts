/**
 * The project's design data: what used to be fixed in the code and is now the project's to
 * state, in one place. The reinforcing steel and its yield strength, the stirrup diameter the
 * depth arithmetic assumes, the clear cover by kind of element, the bar diameters the design may
 * choose from, and the diameter of a wall's bars.
 *
 * The defaults are the values the code used, so a project that states nothing designs as it did.
 * The exposure of each kind of element is recorded with its cover, and the minimum cover of
 * CIRSOC 201-2025 Table 20.5.1.3.1 is known for it: a cover under it is said, and a click sets
 * every cover to it.
 */
import { migrateSeismicDesign } from './seismic-design';
import { migrateLateralSystem } from './lateral-system';
import { REBAR_DB } from '../engine/codes/argentina/cirsoc201';

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
  /** The stirrup or tie diameter the cover-to-centroid arithmetic assumes, mm. */
  stirrupDiaMm: number;
  /** Clear cover to the outermost bar, m, by kind of element. */
  covers: Record<DesignKind, number>;
  exposure: Record<DesignKind, Exposure>;
  /** Diameters the design may choose from, mm. */
  longDiametersMm: number[];
  stirrupDiametersMm: number[];
  /** The diameter of a wall's vertical and horizontal bars, mm. */
  wallBarDiaMm: number;
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
  /** A predetermined slab base mat, deducted before bands are added (absent: the minimum). */
  slabBase?: Partial<Record<'topX' | 'topY' | 'bottomX' | 'bottomY', { diameter: number; spacing: number }>>;
}

/** Every diameter the bar table knows, mm. */
export const BAR_DIAMETERS_MM: readonly number[] = REBAR_DB.map((r) => r.diameter);

export function defaultDesignData(): ProjectDesignData {
  return {
    version: 1,
    rebarGrade: 'ADN 420', rebarFy: 420,
    stirrupDiaMm: 8,
    covers: { beam: 0.025, column: 0.025, slab: 0.025, wall: 0.025, footing: 0.025 },
    exposure: { beam: 'interior', column: 'interior', slab: 'interior', wall: 'interior', footing: 'ground' },
    longDiametersMm: BAR_DIAMETERS_MM.filter((d) => d >= 10),
    stirrupDiametersMm: BAR_DIAMETERS_MM.filter((d) => d <= 12),
    wallBarDiaMm: 12,
  };
}

/**
 * The minimum clear cover, m, of CIRSOC 201-2025 Table 20.5.1.3.1 for cast-in-place concrete
 * that is not prestressed, for a kind of element, its exposure and the largest bar it holds.
 */
export function minimumCover(kind: DesignKind, exposure: Exposure, largestBarMm: number): number {
  if (exposure === 'ground' || kind === 'footing') return 0.075;
  if (exposure === 'exterior') return largestBarMm >= 19 ? 0.05 : 0.04;
  // Not exposed: slabs and walls by bar size; beams and columns 40 mm to their stirrups and ties.
  if (kind === 'slab' || kind === 'wall') return largestBarMm >= 43 ? 0.04 : 0.02;
  return 0.04;
}

/** The largest bar a kind of element may take under these data, mm. */
export const largestBar = (d: ProjectDesignData, kind: DesignKind): number =>
  kind === 'wall' ? d.wallBarDiaMm : Math.max(0, ...d.longDiametersMm);

/** The kinds whose stated cover is under the table's minimum for their exposure. */
export function coversUnderMinimum(d: ProjectDesignData): Array<{ kind: DesignKind; cover: number; minimum: number }> {
  return DESIGN_KINDS.map((kind) => ({ kind, cover: d.covers[kind], minimum: minimumCover(kind, d.exposure[kind], largestBar(d, kind)) }))
    .filter((x) => x.cover < x.minimum - 1e-9);
}

/** Every cover set to the table's minimum for its exposure: the CIRSOC preset. */
export function withCirsocCovers(d: ProjectDesignData): ProjectDesignData {
  const covers = { ...d.covers };
  for (const k of DESIGN_KINDS) covers[k] = minimumCover(k, d.exposure[k], largestBar(d, k));
  return { ...d, covers };
}

/** Read any stored shape, including none; what it does not state is the default. */
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
  return {
    version: 1,
    rebarGrade: typeof e.rebarGrade === 'string' && e.rebarGrade ? e.rebarGrade : def.rebarGrade,
    rebarFy: pos(e.rebarFy, def.rebarFy),
    stirrupDiaMm: BAR_DIAMETERS_MM.includes(e.stirrupDiaMm as number) ? (e.stirrupDiaMm as number) : def.stirrupDiaMm,
    covers: byKind(e.covers, def.covers, (x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0),
    exposure: byKind(e.exposure, def.exposure, (x): x is Exposure => x === 'interior' || x === 'exterior' || x === 'ground'),
    longDiametersMm: known(e.longDiametersMm, def.longDiametersMm),
    stirrupDiametersMm: known(e.stirrupDiametersMm, def.stirrupDiametersMm),
    wallBarDiaMm: BAR_DIAMETERS_MM.includes(e.wallBarDiaMm as number) ? (e.wallBarDiaMm as number) : def.wallBarDiaMm,
    ...(e.columnEndZones === true ? { columnEndZones: true } : {}),
    ...(Array.isArray(e.joistTypes) ? { joistTypes: (e.joistTypes as Array<{ id?: unknown; name?: unknown }>).filter((t) => typeof t?.id === 'string' && typeof t?.name === 'string') as never } : {}),
    ...(e.slabBase && typeof e.slabBase === 'object' ? { slabBase: e.slabBase as ProjectDesignData['slabBase'] } : {}),
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
