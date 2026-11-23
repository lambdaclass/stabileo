import { tp } from '../i18n';
import { uiStore } from './ui.svelte';
import { modelStore } from './model.svelte';
import { loadFamilyOfRegulations, type LoadFamilyChoice } from '../codes/families/stacks';
import { regulationsStore } from './regulations.svelte';
import { rulesFor } from '../rc-sheets/codes';
import { resultsStore } from './results.svelte';
import { physicalGroups, physicalThickness } from './physical';
import { attachService } from './rc-sheets-service';
import { materialFamilyOf } from '../model/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import { applyPlateMeshes, physicalPlates, planPlateMesh, plateEntry, plateShellKeys, plateStatus, type PlateMeshPlan } from './physical-plates';
import { designData, patchOwnDesignData, setDesignData, storedDesignData } from './design-data';
import { activePerCombo3D, activeResultSet3D } from './active-results';
import { hasSeismicLoads, seismicCaseIds, seismicSettings } from './seismic-design.svelte';
import { DESIGN_OPTION_FLAGS, readDeflectionSettings, type AlternativeOptions, type DeflectionSettings, type DesignOptionFlag, type DesignOptions } from '../rc-sheets/design-options';
import { defaultLevelName, sortedLevels } from '../model/grid';
import { computeJointPsiFromModel } from '../engine/codes/argentina/cirsoc201';
import { computeBeamCriticalSections } from '../engine/station-design-forces';
import { beamFlangeSides } from '../engine/design/beam-flange';
import { columnJointSection, frameJoints, jointChecks, type JointContext } from '../rc-sheets/joints';
import { withLapFit } from '../rc-sheets/column-ties';
import { columnLeastMn } from '../engine/design/seismic/frame-checks';
import { concreteFc, type DesignKind, type ProjectDesignData } from '../model/design-data';
import { developsAtFace, lateralReadingOf, spanLateralReading } from '../model/lateral-system';
import { beamDemands, columnDemands, levelGeometry, punchingDemands, slabDemands, wallDemands, type DemandGroup, type DemandInput, type DemandSet } from '../rc-sheets/demands';
import { slabPlan, type LevelGeometry, type LevelPlan } from '../rc-sheets/slab-plan';
import type { PunchingRow } from '../rc-sheets/punching-row';
import { FOUNDATION_SYSTEMS, type FootingRow, type FoundationSystem } from '../rc-sheets/footing-types';
import { layoutSummary, type FoundationLayout } from '../rc-sheets/footing-layouts';
import { footingPreview } from './rc-sheets-footing-preview.svelte';
import { currentFootingDemands, designFootingStraps, footingContext, footingRowOf, footingSizing, foundationRowsSteps, foundationSystem, isFootingKey, solutionsOf, strapKeyOf, withAdoptedCombined } from './rc-sheets-footings';
import { withOverlaps } from '../rc-sheets/footing-overlaps';
import { withStrapBeams } from '../rc-sheets/footing-strap';
import { tiePulls, withPulls } from '../rc-sheets/footing-ties';
import { leverOf } from '../rc-sheets/footing-design';
import { sheetStoreys, swayParts } from './rc-sheets-sway';
import { setBeamAggregate } from '../rc-sheets/bars';
import { setRowClearFactor } from '../rc-sheets/column-layout';
import { CRITERIA, criteriaKey, criteriaOf, readCriteria, type CriterionId } from '../rc-sheets/criteria';
import type { BeamRow } from '../rc-sheets/beam-row';
import { lineRowStatus, type LineAdopted, type LineLayout } from '../rc-sheets/beam-line';
import type { ColumnRow, StackPlace } from '../rc-sheets/column-row';
import { stackOver } from '../rc-sheets/column-stack';
import { wallStacks } from '../rc-sheets/wall-stack';
import type { SlabRow } from '../rc-sheets/slab-row';
import type { WallRow } from '../rc-sheets/wall-row';
import { makeFmt, type Fmt } from '../rc-sheets/format';
import { defaultRcSheetsData, RC_SHEETS_LOGIC, SHEET_CODES, SHEET_FAMILIES, SLAB_BAR_RANGE, listIn, withMissingForces, type SheetCode, type Adopted, type BeamAdopted, type ColumnAdopted, type RcSheetsData, type StoredRcSheets, type SheetFamily, type SlabAdopted, type TorsionMode, type WallAdopted } from '../rc-sheets/types';
import type { AnalysisResults3D } from '../engine/types-3d';
import { sheetsLeftOut, type LeftOut } from '../rc-sheets/coverage';
import { designPierAt, foundationPiers, memberAxes, storeyPiers, withApart, withPierColumns, withPierFeet, withWallFeet, type PierHooks } from './rc-sheets-piers';
import { legOfPier, type PierDesign } from '../rc-sheets/pier-row';

export type SheetRow = BeamRow | ColumnRow | SlabRow | WallRow | PunchingRow | FootingRow;

export interface SheetRows {
  beam: BeamRow[];
  /** Each physical beam as one continuous run of bars over its spans. */
  line: LineLayout[];
  column: ColumnRow[];
  slab: SlabRow[];
  /** Each level's slab bars laid out across its panels. */
  slabPlan: LevelPlan[];
  wall: WallRow[];
  punching: PunchingRow[];
  /** The adopted foundation layout's footings; none until one is adopted. */
  footing: FootingRow[];
  /** Every layout the building's foundation may take, to compare and adopt, the recommendation (`auto`) among them. */
  footingLayouts?: FoundationLayout[];
  /** The layout adopted, or none. */
  foundation?: FoundationSystem | null;
  /** The levels the rows are named by, from the lowest up: what `storeys.ts` reads a member's storey against. */
  levels?: string[];
  /** The regulation the rows are computed with. */
  code: string;
  /** Where the forces came from: the design combinations, or the result on screen when none is solved. */
  basis: 'combinations' | 'single' | 'none';
  combos: number;
  /** The members in concrete the rows leave out, and why. */
  left?: LeftOut[];
}

const DEFAULT_FC = 25;

/** The options the design data state for the sheets, as `RcSheetsData` carries them. */
export function optionsView(o: DesignOptions = {}): Pick<RcSheetsData, 'torsion' | DesignOptionFlag> {
  return { torsion: o.torsion ?? 'equilibrium', ...Object.fromEntries(DESIGN_OPTION_FLAGS.filter((k) => o[k]).map((k) => [k, true])) };
}

/** The sheets' data with the design options read in; adopted bars saved before adoptions were stamped count as set by hand, stamped with the code and seismic option in force. */
export function rcSheetsData(): RcSheetsData {
  const dd = designData(), d = dd.rcSheets;
  const options = optionsView(dd.designOptions);
  if (!d) return { ...defaultRcSheetsData(), ...options };
  const full = { ...defaultRcSheetsData(), ...d, ...options };
  const keys = Object.keys(full.adopted);
  if (full.adoptedCode || !keys.length) return full;
  const code = codeOf(full);
  return { ...full, edited: [...new Set([...(full.edited ?? []), ...keys])], ...adoptionStamp(full, code) };
}

const seismicIn = (d: Pick<RcSheetsData, 'seismic'>, code: SheetCode): boolean => d.seismic === true && rulesFor(code).seismic;

/** Chapter 18 against the model's loads: recommended where a seismic case carries loads and it is off, questioned where it is on with none; nothing under a code the sheets have no such chapter for. */
export function seismicAdvice(): 'recommend' | 'withoutLoads' | null {
  void modelStore.designData; void modelStore.model.loadCases; void modelStore.model.loads;
  if (!rulesFor(sheetCode()).seismic) return null;
  const on = rcSheetsData().seismic === true, loads = hasSeismicLoads();
  return loads && !on ? 'recommend' : on && !loads ? 'withoutLoads' : null;
}

/** The design data the proposals read, as one string: another one proposes other bars. */
export function proposalBasis(dd: ProjectDesignData = designData()): string {
  return JSON.stringify({
    fy: dd.rebarFy, stirrup: dd.stirrupDiaMm, covers: dd.covers, control: dd.executionControl !== false, long: dd.longDiametersMm, ties: dd.stirrupDiametersMm,
    slab: dd.slabDiametersMm, floor: dd.minTieSpacingMm, aggregate: dd.maxAggregateMm, wall: dd.wallDiametersMm, byElement: dd.coverByElement ?? null, slabBase: dd.slabBase ?? null,
    options: optionsView(dd.designOptions), ends: dd.columnEndZones === true, lateral: dd.lateralSystem ?? null, deflection: dd.designOptions?.deflection ?? null,
    ...((k) => (k ? { criteria: k } : {}))(criteriaKey(dd.designOptions?.criteria)),
  });
}

/** The soil and the property lines, which only the footings' proposals read, as one string. */
export function foundationBasis(dd: ProjectDesignData = designData()): string {
  return JSON.stringify({ bearing: dd.presumedBearingKPa, ...(dd.presumedPile ? { pile: dd.presumedPile } : {}), lines: dd.propertyLines ?? null });
}

/** A basis stored before the soil and the property lines had one of their own still holds the members' proposals it was written for. */
function sameProposalBasis(stored: string | undefined): boolean {
  const now = proposalBasis();
  if (stored === now || !stored) return stored === now;
  try {
    const { bearing: _b, pile: _p, lines: _l, ...rest } = JSON.parse(stored) as Record<string, unknown>;
    return JSON.stringify(rest) === now;
  } catch { return false; }
}

/** What adopted proposals hold under: the code, whether the seismic provisions apply, the proposals' logic and the design data they read. */
const adoptionStamp = (d: Pick<RcSheetsData, 'seismic'>, code: SheetCode): Pick<RcSheetsData, 'adoptedCode' | 'adoptedSeismic' | 'adoptedLogic' | 'adoptedBasis' | 'adoptedFoundationBasis'> =>
  ({ adoptedCode: code, adoptedSeismic: seismicIn(d, code) ? true : undefined, adoptedLogic: RC_SHEETS_LOGIC, adoptedBasis: proposalBasis(), adoptedFoundationBasis: foundationBasis() });

/** A footing adopted while no layout is: the layout shown then is adopted with it, since a footing's bars belong to its layout. */
const withPreviewedLayout = (d: RcSheetsData, keys: readonly string[]): RcSheetsData =>
  foundationSystem(d) === null && keys.some(isFootingKey) ? { ...d, foundationSystem: footingPreview.system } : d;

/** The sheets' own data, without the options the design data hold (an older project kept them here). */
function ownSheets(d: Partial<RcSheetsData>): StoredRcSheets {
  const { torsion: _t, faces: _f, flange: _l, seismic: _s, bentBars: _b, slabBentBars: _sb, ...own } = d;
  return own as StoredRcSheets;
}

function save(next: RcSheetsData): void {
  patchOwnDesignData({ rcSheets: ownSheets(next) });
}

export const saveRcSheetsData = save;

/** Bars set for a row: by hand (the editor), kept whatever the code; `null` goes back to the proposal. */
export function setAdopted(key: string, value: Adopted | null, byHand = true): void {
  const d = value ? withPreviewedLayout(rcSheetsData(), [key]) : rcSheetsData();
  const code = sheetCode();
  const adopted = { ...(byHand ? d.adopted : liveAdopted(d, code)) };
  const edited = new Set(d.edited ?? []);
  if (value) { adopted[key] = JSON.parse(JSON.stringify(value)) as Adopted; if (byHand) edited.add(key); else edited.delete(key); } else { delete adopted[key]; edited.delete(key); }
  save({ ...d, adopted, ...(edited.size ? { edited: [...edited] } : { edited: undefined }), ...(byHand ? {} : adoptionStamp(d, code)) });
}

export function adoptAll(rows: ReadonlyArray<{ key: string; proposed: unknown }>): void {
  const d = withPreviewedLayout(rcSheetsData(), rows.map((r) => r.key));
  const live = liveAdopted(d, sheetCode());
  const adopted = { ...live };
  for (const r of rows) if (!adopted[r.key]) adopted[r.key] = JSON.parse(JSON.stringify(r.proposed)) as Adopted;
  save({ ...d, adopted, ...adoptionStamp(d, sheetCode()) });
}

/** The adopted bars that hold under `code`: those set by hand always, the adopted proposals only under the code, seismic option, proposals' logic and design data they were adopted for. */
export function liveAdopted(d: RcSheetsData, code: SheetCode): Record<string, Adopted> {
  if (!d.adoptedCode) return d.adopted;
  const edited = new Set(d.edited ?? []);
  const members = d.adoptedCode === code && (d.adoptedSeismic === true) === seismicIn(d, code) && d.adoptedLogic === RC_SHEETS_LOGIC && sameProposalBasis(d.adoptedBasis);
  if (!members) return Object.fromEntries(Object.entries(d.adopted).filter(([k]) => edited.has(k)));
  if (d.adoptedFoundationBasis === undefined || d.adoptedFoundationBasis === foundationBasis()) return d.adopted;
  return Object.fromEntries(Object.entries(d.adopted).filter(([k]) => !isFootingKey(k) || edited.has(k)));
}

/** The rows the engineer edited by hand. */
export const editedKeys = (): ReadonlySet<string> => new Set(rcSheetsData().edited ?? []);

const FROM_LOAD_FAMILY: Record<LoadFamilyChoice, SheetCode> = { cirsoc: 'cirsoc201-2025', eurocode: 'en1992-1-1', uk: 'bs-en1992-1-1', us: 'aci318-19', turkey: 'ts500-2000' };
const FROM_PROJECT: Record<string, SheetCode> = { aci318: 'aci318-19', ec2: 'en1992-1-1', 'ec2-uk': 'bs-en1992-1-1' };

/** The code the sheets design to: the one chosen for them, else the project's concrete code. */
export function sheetCode(): SheetCode {
  return codeOf(designData().rcSheets);
}

function codeOf(d: Pick<RcSheetsData, 'code'> | undefined): SheetCode {
  const own = d?.code;
  if (own && SHEET_CODES[own]) return own;
  return FROM_PROJECT[designData().foreignCodes?.concrete ?? ''] ?? FROM_LOAD_FAMILY[loadFamilyOfRegulations(regulationsStore.roles) ?? 'cirsoc'];
}

export function setSheetCode(code: SheetCode): void {
  save({ ...rcSheetsData(), code });
}

/** One of the design options in the design data: the design it fed is retired and the sheets are out of date. */
function setDesignOptions(next: DesignOptions): void {
  const { designOptions: _, rcSheets, ...rest } = storedDesignData();
  setDesignData({ ...rest, ...(rcSheets ? { rcSheets: ownSheets(rcSheets) } : {}), designOptions: next });
}

export function setTorsionMode(torsion: TorsionMode): void {
  setDesignOptions({ ...designData().designOptions, torsion });
}

/** The project's denser column ends (`columnEndZones`), the same setting the design reads. */
export function setColumnEndZones(on: boolean): void {
  const d = { ...storedDesignData() };
  if (on) d.columnEndZones = true; else delete d.columnEndZones;
  setDesignData(d);
}

/** The deflection settings with `patch` merged in; a field set to undefined goes back to its default. */
export function setDeflectionSettings(patch: Partial<DeflectionSettings>): void {
  const merged: Record<string, unknown> = { ...designData().designOptions?.deflection, ...patch };
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
  const deflection = readDeflectionSettings(merged);
  const { deflection: _, ...rest } = designData().designOptions ?? {};
  setDesignOptions({ ...rest, ...(deflection ? { deflection } : {}) });
}

/** The options for the alternatives offered where a row has no arrangement; `null` drops one. */
export function setAlternativeOptions(patch: { [K in keyof AlternativeOptions]?: AlternativeOptions[K] | null }): void {
  const cur = { ...designData().designOptions?.alternatives };
  for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined) delete (cur as Record<string, unknown>)[k]; else (cur as Record<string, unknown>)[k] = v; }
  const next: DesignOptions = { ...designData().designOptions };
  if (Object.keys(cur).length) next.alternatives = cur; else delete next.alternatives;
  setDesignOptions(next);
}

/** One Stabileo criterion as stated, in the unit it is shown in; `null` or its default drops it. */
export function setCriterion(id: CriterionId, value: number | null): void {
  const next: DesignOptions = { ...designData().designOptions };
  const merged = readCriteria({ ...next.criteria, [id]: value ?? CRITERIA[id].value });
  if (merged) next.criteria = merged; else delete next.criteria;
  setDesignOptions(next);
}

/** Every Stabileo criterion back to its default. */
export function resetCriteria(): void {
  const { criteria: _, ...rest } = designData().designOptions ?? {};
  setDesignOptions(rest);
}

/** The Stabileo criteria the sheets design with. */
export const sheetCriteria = () => criteriaOf(designData().designOptions?.criteria);

export function setRcOption(option: DesignOptionFlag, on: boolean): void {
  const next: DesignOptions = { ...designData().designOptions };
  if (on) next[option] = true; else delete next[option];
  setDesignOptions(next);
}

/** Never from mesh nodes: a mesh's rows of nodes are not storeys. */
function memberElevations(): number[] {
  return [...new Set(physicalGroups().flatMap((g) => [g.physical.levelFrom, g.physical.levelTo])
    .filter((id): id is string => !!id?.startsWith('z:')).map((id) => Math.round(Number(id.slice(2)) * 1000) / 1000))].sort((p, q) => p - q);
}

function storeyElevations(): number[] {
  const grid = modelStore.grid?.levels ?? [];
  return grid.length ? grid.map((l) => l.z) : memberElevations();
}

/** One line laid out with bent bars (`true`), without them (`false`), or as the project says (`null`); its adopted proposal, unless edited by hand, goes with the old choice. */
export function setLineBentBars(key: string, on: boolean | null): void {
  const d = rcSheetsData();
  const bentLines = { ...d.bentLines };
  if (on === null) delete bentLines[key]; else bentLines[key] = on;
  const adopted = { ...d.adopted };
  if (!(d.edited ?? []).includes(key)) delete adopted[key];
  save({ ...d, adopted, bentLines: Object.keys(bentLines).length ? bentLines : undefined });
}

function storeyNamer(): (z: number) => string {
  const grid = modelStore.grid?.levels ?? [];
  if (grid.length) return (z) => grid.find((l) => Math.abs(l.z - z) < 0.05)?.name ?? `+${z.toFixed(2)}`;
  const zs = memberElevations();
  return (z) => { const i = zs.findIndex((v) => Math.abs(v - z) < 0.05); return i >= 0 ? defaultLevelName(i) : `+${z.toFixed(2)}`; };
}

/** The levels' names from the lowest up, those the rows name besides the grid's or the members' by their elevation. */
function levelsUp(named: Iterable<string | undefined>): string[] {
  const grid = sortedLevels(modelStore.grid).map((l) => l.name);
  const known = grid.length ? grid : memberElevations().map((_, i) => defaultLevelName(i));
  const extra = [...new Set([...named].filter((x): x is string => !!x && !known.includes(x)))];
  const zOf = (n: string) => (n.startsWith('+') ? Number(n.slice(1)) : NaN);
  extra.sort((a, b) => (Number.isFinite(zOf(a)) && Number.isFinite(zOf(b)) ? zOf(a) - zOf(b) : a.localeCompare(b, undefined, { numeric: true })));
  return [...known, ...extra];
}

function levelName(id: string | undefined, namer: (z: number) => string): string | undefined {
  if (!id) return undefined;
  if (id.startsWith('z:')) return namer(Number(id.slice(2)));
  return modelStore.grid?.levels.find((l) => l.id === id)?.name ?? id;
}

const isDeadCase = (type: string) => type.toUpperCase() === 'D';

/** A member's cover, m: the largest a person set for one of its elements, else its kind's. */
export function memberCover(dd: Pick<ProjectDesignData, 'covers' | 'coverByElement'>, kind: DesignKind, elements: readonly number[]): number {
  const own = elements.map((id) => dd.coverByElement?.[String(id)]).filter((x): x is number => x !== undefined);
  return own.length ? Math.max(...own) : dd.covers[kind];
}

/** The top bars a slab joint's depth is read to, mm: the thickest its level's slabs adopt on top, else the thickest the project allows them. */
export function topBarAt(slabs: readonly SlabRow[], level: string | undefined, allowed: readonly number[]): number {
  const tops = slabs.filter((r) => (r.level ?? '') === (level ?? '')).flatMap((r) => [r.adopted.topX.dia, r.adopted.topY.dia]).filter((x) => x > 0);
  return tops.length ? Math.max(...tops) : Math.max(0, ...allowed) || 12;
}

export function designSets(): { sets: DemandSet[]; basis: SheetRows['basis']; dead: AnalysisResults3D[] } {
  const combos = modelStore.combinations;
  const deadIds = new Set(modelStore.model.loadCases.filter((c) => isDeadCase(c.type)).map((c) => c.id));
  const dead = [...deadIds].map((id) => resultsStore.perCase3D.get(id)).filter((r): r is AnalysisResults3D => !!r);
  const solved = activePerCombo3D();
  const quake = seismicCaseIds();
  if (solved.size) {
    const sets = [...solved].map(([id, result]) => {
      const c = combos.find((x) => x.id === id);
      const factors = c?.factors ?? [];
      return { name: c?.name ?? `#${id}`, result, deadFactor: factors.filter((f) => deadIds.has(f.caseId)).reduce((s, f) => s + f.factor, 0), seismic: factors.some((f) => quake.has(f.caseId) && f.factor !== 0), ...swayParts(factors, result) };
    });
    return { sets, basis: 'combinations', dead };
  }
  const r = activeResultSet3D();
  return r ? { sets: [{ name: '—', result: r }], basis: 'single', dead: [] } : { sets: [], basis: 'none', dead: [] };
}

function demandInput(sets: DemandSet[], dead: AnalysisResults3D[], opts: { faces: boolean; flange: boolean; swayKMin: number }): DemandInput {
  const supportsByNode = new Map([...modelStore.supports.values()].map((s) => [s.nodeId, s]));
  const namer = storeyNamer();
  const groups: DemandGroup[] = physicalGroups().map((g) => ({
    id: g.id, name: g.name, kind: g.physical.kind, level: levelName(g.physical.levelFrom, namer),
    elements: (g.members.elements ?? []).filter((id) => inConcrete(modelStore.elements.get(id)?.materialId)),
    quads: (g.members.quads ?? []).filter((id) => inConcrete(modelStore.quads.get(id)?.materialId)),
    plates: (g.members.plates ?? []).filter((id) => inConcrete(modelStore.plates.get(id)?.materialId)),
  }));
  const storeys = sheetStoreys(groups.filter((g) => g.kind === 'column').flatMap((g) => g.elements), sets, opts.swayKMin);
  return {
    nodes: modelStore.nodes, elements: modelStore.elements as never, sections: modelStore.sections as never,
    supportNodes: new Set(supportsByNode.keys()),
    storeyOf: (id) => storeys.get(id),
    shells: { nodes: modelStore.nodes, quads: modelStore.quads, plates: modelStore.plates },
    groups, sets, dead, faces: opts.faces,
    ...((f) => ({ slabSides: (id: number) => f.get(id)?.sides.length ?? 0, ...(opts.flange ? { flangeSides: (id: number) => f.get(id)?.sides } : {}) }))(beamFlangeSides({ nodes: modelStore.nodes, elements: modelStore.elements, sections: modelStore.sections, quads: concreteQuads() })),
    faceOffset: (id, end) => {
      const e = modelStore.elements.get(id);
      const sec = e ? modelStore.sections.get(e.sectionId) : undefined;
      const cs = computeBeamCriticalSections(id, modelStore.nodes as never, modelStore.elements as never, modelStore.sections as never, modelStore.supports as never,
        { b: sec?.b ?? 0.2, h: sec?.h ?? 0.4, cover: designData().covers.beam, stirrupDia: designData().stirrupDiaMm });
      return cs ? (end === 'i' ? cs.start.halfDepth : cs.end.halfDepth) : 0;
    },
    levelZs: storeyElevations(),
    levelAt: namer,
    axesOf: memberAxes,
    psi: (id) => computeJointPsiFromModel(id, modelStore.nodes as never, modelStore.elements as never, modelStore.sections as never, modelStore.materials as never, supportsByNode as never),
  };
}

/** The shells a beam may take as its flange: concrete slabs, never a steel deck or a timber panel beside it. */
const concreteQuads = () => new Map([...modelStore.quads].filter(([, q]) => inConcrete((q as { materialId?: number }).materialId)));

/** A member of steel, timber or another metal is none of the sheets' business; one with no strength recorded is read as concrete. */
function inConcrete(materialId: number | undefined): boolean {
  const family = materialFamilyOf(materialId !== undefined ? (modelStore.materials.get(materialId) as never) : undefined, catalogueGradeFamily).family;
  return family === 'concrete' || family === 'unknown';
}

const fcOfMaterialId = (id: number | undefined) => concreteFc((id !== undefined ? modelStore.materials.get(id) : undefined) as never) ?? DEFAULT_FC;

/** The weakest concrete among a member's elements: one stronger piece must not lend its strength to the rest. */
function fcOfElements(ids: readonly number[] | undefined): number {
  const fcs = (ids ?? []).flatMap((id) => { const e = modelStore.elements.get(id); return e ? [fcOfMaterialId(e.materialId)] : []; });
  return fcs.length ? Math.min(...fcs) : DEFAULT_FC;
}

function fcOfShells(quads: number[], plates: number[]): number {
  const ids = [...quads.map((q) => modelStore.quads.get(q)), ...plates.map((p) => modelStore.plates.get(p))].flatMap((sh) => (sh ? [(sh as { materialId: number }).materialId] : []));
  return ids.length ? Math.min(...ids.map(fcOfMaterialId)) : DEFAULT_FC;
}

const demandCache = new WeakMap<object, { beams: ReturnType<typeof beamDemands>; columns: ReturnType<typeof columnDemands>; slabs: ReturnType<typeof slabDemands>; levels: LevelGeometry[]; walls: ReturnType<typeof wallDemands>; punching: ReturnType<typeof punchingDemands>; groupsRev: unknown; opts: string }>();

const rowCache = new WeakMap<object, Map<string, SheetRow>>();
const lineCache = new WeakMap<object, { k: string; v: LineLayout }>();

function cachedLine(anchor: object, inputs: unknown, compute: () => LineLayout): LineLayout {
  const k = JSON.stringify(inputs);
  const hit = lineCache.get(anchor);
  if (hit && hit.k === k) return hit.v;
  const v = compute();
  lineCache.set(anchor, { k, v });
  return v;
}

function cached<D extends object, R extends SheetRow>(demand: D, inputs: unknown, compute: () => R): R {
  const k = JSON.stringify(inputs);
  let m = rowCache.get(demand);
  if (!m) { m = new Map(); rowCache.set(demand, m); }
  const hit = m.get(k);
  if (hit) return hit as R;
  const row = compute();
  if (m.size > 4) m.clear();
  m.set(k, row);
  return row;
}

/** The element size the wall sheets read a wall's in-plane moment at, m. */
export const WALL_MESH_SIZE = 0.5;

const loadedByHand = (key: string) => modelStore.loads.some((l) => (l.type === 'surface3d' || l.type === 'thermalQuad3d')
  && `${(l.data as { on?: string }).on === 'plate' ? 'p' : 'q'}${(l.data as { quadId: number }).quadId}` === key && (l.data as { fromDef?: number }).fromDef === undefined);

/**
 * The walls the sheets cannot read yet: with no mesh or an out-of-date one, or whole as one element
 * (a storey-high quad has no in-plane moment to speak of), unless a load put on that element by hand
 * would be lost with it.
 */
export function wallsToMeshForSheets(): number[] {
  return physicalPlates().filter((p) => {
    if (p.physical.kind !== 'wall') return false;
    if (plateStatus(p.id) !== 'current') return true;
    const keys = plateShellKeys(p.id);
    return keys.length === 1 && !loadedByHand(keys[0]!);
  }).map((p) => p.id);
}

/** Those walls meshed now at `WALL_MESH_SIZE` at most, whatever "mesh before analysis" says. One undo step; how many. */
export function meshWallsForSheets(): number {
  const ids = wallsToMeshForSheets();
  if (!ids.length) return 0;
  const meshedAgain = new Set(ids.flatMap(plateShellKeys));
  const plans = ids.map(id => {
    const wall = plateEntry(id);
    return wall ? planPlateMesh(id, { size: Math.min(wall.surface.mesh.size, WALL_MESH_SIZE) }, { meshedAgain }) : null;
  }).filter((p): p is PlateMeshPlan => !!p && p.localLoads === 0);
  const report = applyPlateMeshes(plans);
  if (report.refused.length) uiStore.toast(tp('plates.meshRefusedSome', { n: report.refused.length }), 'error');
  if (!report.plates) return 0;
  const pending = new Set(wallsToMeshForSheets());
  return plans.filter(p => !pending.has(p.id)).length;
}

/** What a row is designed again with besides its demand: another concrete, MPa, or other diameters allowed for its stirrups and ties, mm. */
export interface RedesignWith { fc?: number; ties?: readonly number[] }
/** A row designed again from its demand with other dimensions or concrete, its context as the last build had it; by row key. */
export type Redesign = (demand: never, o?: RedesignWith) => SheetRow;
const redesigners = new Map<string, Redesign>();
export const redesignerOf = (key: string): Redesign | undefined => redesigners.get(key);

/** A physical beam designed again whole, every span with another width, depth or concrete: its line and the spans as the line lays them out; by line group. */
export type LineRedesign = (o: RedesignWith & { b?: number; h?: number }) => { line: LineLayout; spans: BeamRow[]; status: 'ok' | 'warn' | 'fail' };
const lineRedesigners = new Map<number, LineRedesign>();
export const lineRedesignerOf = (group: number): LineRedesign | undefined => lineRedesigners.get(group);

const rowFc = new Map<string, number>();
/** The concrete a row was designed with, MPa, as the last build read it. */
export const concreteOfRow = (key: string): number | undefined => rowFc.get(key);

/** Drops the redesigners and concretes of the last build, which hold its demands alive. */
export function forgetRedesigners(): void {
  redesigners.clear();
  lineRedesigners.clear();
  rowFc.clear();
}

const withRedesign = <C extends { mat: { fc: number; fy: number } }>(ctx: C, o?: RedesignWith): C =>
  ({ ...ctx, ...(o?.fc ? { mat: { ...ctx.mat, fc: o.fc } } : {}), ...(o?.ties ? { tieDiameters: o.ties } : {}) });

import type { SheetProgress } from './rc-sheets-progress.svelte';
export type { SheetProgress };

/** Whether the model has a physical member the sheets design: a slab or wall plate counts, whatever bars are still unread. */
export function sheetsHavePhysical(): boolean {
  return physicalGroups().length > 0;
}

/** The sheets' rows at once (`sheetRowsSteps` run to its end). */
export function buildSheetRows(fmt: Fmt = makeFmt(',')): SheetRows {
  const it = sheetRowsSteps(fmt);
  for (let r = it.next(); ; r = it.next()) if (r.done) return r.value;
}

/**
 * The sheets' rows, step by step: a step after each family's forces are read and after each member
 * is designed, saying how far it has got, so a caller can let the page draw between steps
 * (`rc-sheets-view.svelte.ts`). The rows are those of `buildSheetRows`.
 */
export function* sheetRowsSteps(fmt: Fmt = makeFmt(',')): Generator<SheetProgress, SheetRows, void> {
  const { sets, basis, dead } = designSets();
  const code = sheetCode();
  const rules = rulesFor(code);
  const codeName = SHEET_CODES[code].name;
  if (!sets.length) return { beam: [], line: [], column: [], slab: [], slabPlan: [], wall: [], punching: [], footing: [], code: codeName, basis, combos: 0 };
  const dd = designData();
  const adoptedNow = liveAdopted(rcSheetsData(), code);
  const data = rcSheetsData();
  const key = basis === 'combinations' ? resultsStore.perCombo3D : sets[0]!.result;
  const groupsRev = modelStore.model.groups;
  const crit = criteriaOf(dd.designOptions?.criteria);
  const opts = { faces: data.faces === true, flange: data.flange === true, swayKMin: rules.swayFloor ? crit.columnSwayKMin : 1 };
  const optsKey = JSON.stringify({ ...opts, sets: sets.map((x) => x.name) });
  let dem = demandCache.get(key);
  if (!dem || dem.groupsRev !== groupsRev || dem.opts !== optsKey) {
    const input = demandInput(sets, dead, opts);
    const byGroup = new Map(physicalGroups().map((g) => [g.id, g]));
    yield { phase: 'demands', done: 0, total: 5 };
    const beams = beamDemands(input);
    yield { phase: 'demands', done: 1, total: 5 };
    const columns = columnDemands(input);
    yield { phase: 'demands', done: 2, total: 5 };
    const slabs = slabDemands(input, (g) => { const pg = byGroup.get(g.id); return pg ? physicalThickness(pg) : null; });
    yield { phase: 'demands', done: 3, total: 5 };
    const walls = wallDemands(input);
    yield { phase: 'demands', done: 4, total: 5 };
    const punching = punchingDemands(input);
    const levels = [...new Set(slabs.map((d) => d.level ?? ''))].map((name) => {
      const zs = slabs.filter((d) => (d.level ?? '') === name && d.bounds).map((d) => d.bounds!.z);
      return levelGeometry(input, name, zs.length ? zs.reduce((a, z) => a + z, 0) / zs.length : 0);
    });
    attachService(input, beams, slabs, levels, (g) => { const pg = byGroup.get(g.id); return pg ? physicalThickness(pg) : null; });
    dem = { beams, columns, slabs, levels, walls, punching, groupsRev, opts: optsKey };
    demandCache.set(key, dem);
  }
  const D = dem;
  const allPiers = storeyPiers(D.walls, D.columns);
  const piers = rules.piers ? allPiers.filter((p) => p.columns.length) : [];
  const supported = new Set([...modelStore.supports.values()].map((x) => x.nodeId));
  let feet = withAdoptedCombined(currentFootingDemands(sets, storeyNamer(), foundationPiers(allPiers, D.walls, D.columns, supported)), adoptedNow);
  const total = D.beams.length * 2 + D.columns.length + D.slabs.length + D.walls.length + D.punching.length + (feet.length ? FOUNDATION_SYSTEMS.length * feet.length : 0);
  let done = 0;
  const step = (): SheetProgress => ({ phase: 'design', done: ++done, total });
  const groupsById = new Map(physicalGroups().map((g) => [g.id, g]));
  const groupOf = (k: string) => groupsById.get(Number(k.split(':')[1]));
  const fy = dd.rebarFy;
  const dec = fmt(1.5, 1);
  const seismic = data.seismic && rules.seismic ? { overstrength: seismicSettings().overstrength } : undefined;
  const bentIn = (d: (typeof D.beams)[number]) => data.bentLines?.[`line:${d.line?.group ?? -1}`] ?? data.bentBars === true;
  const coverTable = rules.coverTable ? { coverTable: { control: dd.executionControl !== false } } : {};
  const ties = { tieDiameters: dd.stirrupDiametersMm, minTieSpacing: dd.minTieSpacingMm / 1000, aggregate: dd.maxAggregateMm };
  setBeamAggregate(dd.maxAggregateMm);
  setRowClearFactor(code === 'cirsoc201-2025' || code === 'aci318-19' ? Math.max(4 / 3, crit.columnRowClear) : crit.columnRowClear);
  const coverOf = (kind: DesignKind, key: string) => memberCover(dd, kind, groupOf(key)?.members.elements ?? []);
  /** Chapter 18 for the beams of the lateral system only: a beam declared outside it takes the ordinary rules; one not declared is read as part of it. */
  const lateralBeam = (key: string) => {
    const g = groupOf(key);
    return developsAtFace(spanLateralReading((g?.members.elements ?? []).map((id) => lateralReadingOf(dd.lateralSystem, id, { physicalId: g!.id, kind: 'beam' }))));
  };
  /** A column declared outside the lateral system (§18.14); one not declared is read as part of it. */
  const lateralColumn = (key: string) => {
    const g = groupOf(key);
    return (g?.members.elements ?? []).some((id) => lateralReadingOf(dd.lateralSystem, id, { physicalId: g!.id, kind: 'column' }).role !== 'gravity');
  };
  const defl = dd.designOptions?.deflection ? { deflection: dd.designOptions.deflection } : {};
  const beamCtx = (d: (typeof D.beams)[number]) => ({ mat: { fc: fcOfElements(groupOf(d.key)?.members.elements), fy }, cover: coverOf('beam', d.key), stirrupDia: dd.stirrupDiaMm, diameters: dd.longDiametersMm, ...ties, torsion: data.torsion, ...(seismic && lateralBeam(d.key) ? { seismic } : {}), ...(bentIn(d) ? { bentBars: true } : {}), ...coverTable, ...defl, criteria: crit });
  const proposals: BeamRow[] = [];
  for (const d of D.beams) {
    const ctx = beamCtx(d);
    proposals.push(cached(d, [code, ctx, undefined, dec, 'proposal'], () => rules.beamRow(d, ctx, undefined, fmt)));
    yield step();
  }
  const byLine = new Map<number, BeamRow[]>();
  for (const r of proposals) { const g = r.demand.line?.group ?? -1; let l = byLine.get(g); if (!l) byLine.set(g, (l = [])); l.push(r); }
  const line: LineLayout[] = [];
  const derived = new Map<string, BeamAdopted>();
  const edited = new Set(data.edited ?? []);
  const linesAdopted = new Set<number>();
  forgetRedesigners();
  for (const [g, rows] of byLine) {
    const first = rows[0]!;
    const ctx = beamCtx(first.demand);
    const own = adoptedNow[`line:${g}`] as LineAdopted | undefined;
    const la = own && ctx.seismic && !edited.has(`line:${g}`) && own.bent?.some((x) => x.count > 0) ? undefined : own;
    if (la) linesAdopted.add(g);
    const layout = cachedLine(first.demand, [code, ctx, la, dec, rows.map((r) => r.key)], () => rules.beamLine(rows, ctx, la, fmt));
    line.push(withMissingForces(layout, rows.flatMap((r) => r.demand.missing ?? [])));
    const sortedRows = [...rows].sort((p, q) => (p.demand.line?.index ?? 0) - (q.demand.line?.index ?? 0));
    sortedRows.forEach((r, k) => { const sa = layout.spanAdopted[k]; if (sa) derived.set(r.key, sa); });
    rowFc.set(`line:${g}`, ctx.mat.fc);
    lineRedesigners.set(g, (o) => {
      const ds = sortedRows.map((r) => ({ ...r.demand, ...(o.b ? { b: o.b } : {}), ...(o.h ? { h: o.h } : {}) }));
      const props = ds.map((d) => rules.beamRow(d, withRedesign(beamCtx(d), o), undefined, fmt));
      const lay = withMissingForces(rules.beamLine(props, withRedesign(ctx, o), undefined, fmt), ds.flatMap((d) => d.missing ?? []));
      const spans = ds.map((d, k) => withMissingForces(rules.beamRow(d, withRedesign(beamCtx(d), o), lay.spanAdopted[k], fmt), d.missing));
      return { line: lay, spans, status: lineRowStatus(lay, spans) };
    });
  }
  const beam: BeamRow[] = [];
  for (const d of D.beams) {
    const ctx = beamCtx(d);
    redesigners.set(d.key, ((x: typeof d, o?: RedesignWith) => withMissingForces(rules.beamRow(x, withRedesign(ctx, o), undefined, fmt), x.missing)) as Redesign);
    rowFc.set(d.key, ctx.mat.fc);
    const own = adoptedNow[d.key] as BeamAdopted | undefined;
    const a = own ?? derived.get(d.key);
    const row = withMissingForces(cached(d, [code, ctx, a, dec], () => rules.beamRow(d, ctx, a, fmt)), d.missing);
    const lineAdopted = linesAdopted.has(d.line?.group ?? -1);
    beam.push(own ? row : { ...row, isAdopted: lineAdopted, proposed: derived.get(d.key) ?? row.proposed });
    yield step();
  }
  const below = new Map<number, ColumnRow>();
  const founded = feet.length > 0 && foundationSystem(data) !== null;
  const onFooting = new Set(founded ? feet.flatMap((f) => [f.column?.rowKey, f.carried?.column?.rowKey]).filter((k): k is string => !!k) : []);
  const columnCtxOf = (d: (typeof D.columns)[number], minMn: ReadonlyMap<string, number> = new Map()) => ({ mat: { fc: fcOfElements(groupOf(d.key)?.members.elements), fy }, cover: coverOf('column', d.key), tieDia: dd.stirrupDiaMm, diameters: dd.longDiametersMm, ...ties, seismic: seismic && !lateralColumn(d.key) ? { ...seismic, gravity: true as const } : seismic, ...coverTable, ...(minMn.has(d.key) ? { minMn: minMn.get(d.key) } : {}), criteria: crit });
  const columnAt = (d: (typeof D.columns)[number], minMn: ReadonlyMap<string, number>): ColumnRow => {
    const ctx = columnCtxOf(d, minMn);
    const a = adoptedNow[d.key] as ColumnAdopted | undefined;
    const g = Number(d.key.split(':')[1]);
    const prev = below.get(g);
    const stack: StackPlace = prev ? stackOver(prev, d) : onFooting.has(d.key) ? { fromBelow: true, onFooting: true } : {};
    const row = withMissingForces(withLapFit(cached(d, [code, ctx, a, dec, stack], () => rules.columnRow(d, ctx, a, fmt, stack)), code, fmt), d.missing);
    rowFc.set(d.key, ctx.mat.fc);
    redesigners.set(d.key, ((x: typeof d, o?: RedesignWith) => withMissingForces(withLapFit(rules.columnRow(x, withRedesign(ctx, o), undefined, fmt, stack), code, fmt), x.missing)) as Redesign);
    below.set(g, row);
    return row;
  };
  let column: ColumnRow[] = [];
  for (const d of D.columns) {
    column.push(columnAt(d, new Map()));
    yield step();
  }
  const joint = { fc: (r: ColumnRow) => fcOfElements(groupOf(r.key)?.members.elements), beamFc: (b: BeamRow) => fcOfElements(groupOf(b.key)?.members.elements), fy, cover: dd.covers.column, beamCover: dd.covers.beam, settings: seismicSettings() };
  if (seismic) column = strongColumns(column, beam, joint, (minMn) => { below.clear(); return D.columns.map((d) => columnAt(d, minMn)); });
  const slabBars = listIn(dd.slabDiametersMm, SLAB_BAR_RANGE);
  const baseFaces = Object.entries(dd.slabBase ?? {}).filter((x): x is [string, { diameter: number; spacing: number }] => !!x[1]);
  const slabBase = baseFaces.length ? { base: Object.fromEntries(baseFaces.map(([k, v]) => [k, { dia: v.diameter, spacing: v.spacing }])) } : {};
  const slab: SlabRow[] = [];
  for (const d of D.slabs) {
    const g = groupOf(d.key);
    const ctx = { mat: { fc: fcOfShells(g?.members.quads ?? [], g?.members.plates ?? []), fy }, cover: dd.covers.slab, diameters: slabBars, ...slabBase, ...defl, criteria: crit };
    const a = adoptedNow[d.key] as SlabAdopted | undefined;
    redesigners.set(d.key, ((x: typeof d, o?: RedesignWith) => withMissingForces(rules.slabRow(x, withRedesign(ctx, o), undefined, fmt), x.missing)) as Redesign);
    rowFc.set(d.key, ctx.mat.fc);
    slab.push(withMissingForces(cached(d, [code, ctx, a, dec], () => rules.slabRow(d, ctx, a, fmt)), d.missing));
    yield step();
  }
  const planOf = (g: LevelGeometry) => {
    const rows = slab.filter((r) => (r.level ?? '') === g.level);
    const first = groupOf(rows[0]?.key ?? '');
    const ctx = { mat: { fc: fcOfShells(first?.members.quads ?? [], first?.members.plates ?? []), fy }, cover: dd.covers.slab, diameters: slabBars, bent: data.slabBentBars === true, columnInset: dd.covers.column + dd.stirrupDiaMm / 1000 + Math.max(0, ...dd.longDiametersMm.filter((x) => x <= 16)) / 2000, criteria: crit };
    return slabPlan(g.level, rows, g, ctx, rules.slabPlan);
  };
  let slabPlans = D.levels.map(planOf).filter((p) => p.panels.length);
  const spanned = new Set<string>();
  slab.forEach((r, i) => {
    const k = slabPlans.find((p) => p.level === (r.level ?? ''))?.cantilevers.find((x) => x.panel === r.name);
    if (!k) return;
    const d = D.slabs.find((x) => x.key === r.key)!;
    const g = groupOf(d.key);
    const ctx = { mat: { fc: fcOfShells(g?.members.quads ?? [], g?.members.plates ?? []), fy }, cover: dd.covers.slab, diameters: slabBars, ...slabBase, ...defl, span: { kind: 'cantilever' as const, dir: k.dir, length: k.length }, criteria: crit };
    const a = adoptedNow[d.key] as SlabAdopted | undefined;
    redesigners.set(d.key, ((x: typeof d, o?: RedesignWith) => withMissingForces(rules.slabRow(x, withRedesign(ctx, o), undefined, fmt), x.missing)) as Redesign);
    rowFc.set(d.key, ctx.mat.fc);
    slab[i] = withMissingForces(cached(d, [code, ctx, a, dec], () => rules.slabRow(d, ctx, a, fmt)), d.missing);
    spanned.add(r.level ?? '');
  });
  if (spanned.size) slabPlans = D.levels.map((g) => (spanned.has(g.level) ? planOf(g) : slabPlans.find((p) => p.level === g.level))).filter((p): p is LevelPlan => !!p && p.panels.length > 0);
  const wall: WallRow[] = [];
  const wallStack = wallStacks(D.walls);
  const wallDone = new Map<string, WallRow>();
  const wallCtxOf = (d: (typeof D.walls)[number]) => {
    const g = groupOf(d.key);
    const stack = wallStack.get(d.key);
    const belowSpecial = !!stack?.below && wallDone.get(stack.below)?.seismic?.special === true;
    return { mat: { fc: fcOfShells(g?.members.quads ?? [], g?.members.plates ?? []), fy }, cover: dd.covers.wall, barDia: dd.wallBarDiaMm, meshDiameters: dd.wallDiametersMm, diameters: dd.longDiametersMm, criteria: crit, ...ties, ...(seismic ? { seismic } : {}), ...(belowSpecial ? { belowSpecial } : {}) };
  };
  const pierHooks: PierHooks = {
    fmt, fy, diameters: dd.longDiametersMm,
    wallCtx: wallCtxOf, wallAdopted: (k) => adoptedNow[k] as WallAdopted | undefined,
    wallRow: (d, c, a) => withMissingForces(cached(d, [code, c, a, dec], () => rules.wallRow(d, c, a, fmt)), d.missing),
    columnCtx: (d) => columnCtxOf(d), columnAdopted: (k) => adoptedNow[k] as ColumnAdopted | undefined,
    columnRow: (d, c, a, st) => withLapFit(rules.columnRow(d, c, a, fmt, st), code, fmt),
    below: (d) => { const i = D.columns.indexOf(d), prev = D.columns[i - 1]; return prev && prev.key.split(':')[1] === d.key.split(':')[1] ? column.find((r) => r.key === prev.key) : undefined; },
  };
  const pierOf = new Map(piers.flatMap((p) => p.walls.map((w) => [w.key, p] as const)));
  const pierDone = new Map<string, PierDesign>();
  for (const d of [...D.walls].sort((p, q) => (p.z ?? 0) - (q.z ?? 0))) {
    const pier = pierOf.get(d.key);
    if (pier) {
      if (!pierDone.has(pier.key)) {
        const design = designPierAt(pier, D.walls, D.columns, pierHooks);
        pierDone.set(pier.key, design);
        for (const leg of design.legs) {
          const stack = wallStack.get(leg.key);
          const placed = legOfPier(stack ? { ...leg, stack } : leg, design, fmt);
          const legCtx = { ...wallCtxOf(leg.demand), pier: {} };
          redesigners.set(leg.key, ((x: typeof d, o?: RedesignWith) => withMissingForces(rules.wallRow(x, withRedesign(legCtx, o), undefined, fmt), x.missing)) as Redesign);
          rowFc.set(leg.key, legCtx.mat.fc);
          wallDone.set(leg.key, placed);
          wall.push(placed);
        }
      }
      yield step();
      continue;
    }
    const ctx = wallCtxOf(d);
    const stack = wallStack.get(d.key);
    const a = adoptedNow[d.key] as WallAdopted | undefined;
    redesigners.set(d.key, ((x: typeof d, o?: RedesignWith) => withMissingForces(rules.wallRow(x, withRedesign(ctx, o), undefined, fmt), x.missing)) as Redesign);
    rowFc.set(d.key, ctx.mat.fc);
    const row = withMissingForces(cached(d, [code, ctx, a, dec], () => rules.wallRow(d, ctx, a, fmt)), d.missing);
    const placed = stack ? { ...row, stack } : row;
    wallDone.set(d.key, placed);
    wall.push(placed);
    yield step();
  }
  if (pierDone.size) {
    column = withPierColumns(D.columns, column, pierDone, pierHooks, (d, before) => { below.set(Number(d.key.split(':')[1]), before); return columnAt(d, new Map()); });
    for (const r of column) if (r.pier) redesigners.delete(r.key);
    feet = withPierFeet(feet, pierDone, (d) => wallCtxOf(d).mat.fc, dd.covers.wall, fy);
  }
  feet = withWallFeet(feet, wall);
  const onFootingWalls = new Set(founded ? feet.flatMap((f) => f.pier?.walls ?? []) : []);
  wall.forEach((r, i) => { if (onFootingWalls.has(r.key)) wall[i] = { ...r, onFooting: true }; });
  const punching: PunchingRow[] = [];
  const slabStrength = new Map<(typeof D.punching)[number]['slab'], number>();
  for (const d of D.punching) {
    let fc = slabStrength.get(d.slab);
    if (fc === undefined) {
      const strengths = new Set(d.slab.map(({ kind, id }) => {
        const shell = kind === 'quad' ? modelStore.quads.get(id) : modelStore.plates.get(id);
        return concreteFc(shell && modelStore.materials.get(shell.materialId));
      }));
      const strength = strengths.values().next().value;
      fc = strengths.size === 1 && strength !== undefined && Number.isFinite(strength) && strength > 0 ? strength : NaN;
      slabStrength.set(d.slab, fc);
    }
    const plan = slabPlans.find((p) => p.level === (d.level ?? ''));
    const at = (dir: 'x' | 'y') => plan?.integrity.find((k) => k.dir === dir && Math.hypot(k.x - d.joint.at.x, k.y - d.joint.at.y) < 0.05);
    const ix = at('x'), iy = at('y');
    const ctx = { fc, fy, cover: dd.covers.slab, topBarDia: topBarAt(slab, d.level, slabBars), ...(ix && iy ? { integrity: { x: ix.bars, y: iy.bars, required: ix.required, dia: Math.max(ix.dia, iy.dia) } } : {}) };
    redesigners.set(d.key, ((x: typeof d, o?: RedesignWith) => rules.punchingRow(x, o?.fc ? { ...ctx, fc: o.fc } : ctx, fmt)) as Redesign);
    rowFc.set(d.key, ctx.fc);
    punching.push(cached(d, [code, ctx, dec], () => rules.punchingRow(d, ctx, fmt)));
    yield step();
  }
  const sort = <T extends { level?: string; name: string }>(rows: T[]) => rows.sort((a, b) => (a.level ?? '').localeCompare(b.level ?? '', undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const layout = function* (system: FoundationSystem, own: boolean, index: number): Generator<SheetProgress, FootingRow[]> {
    const base = done;
    const redo = (k: string, f: unknown) => { if (own) redesigners.set(k, f as Redesign); };
    const it = foundationRowsSteps(feet, {
      rules, adopted: adoptedNow, sizing: footingSizing(data), columns: column, fmt, redo,
      system, solutions: solutionsOf(data.footingSetup), matShare: crit.footingMatShare, ...(dd.foundingElevation !== undefined ? { founding: dd.foundingElevation } : {}),
    });
    let rows: FootingRow[];
    for (;;) {
      const r = it.next();
      if (r.done) { rows = r.value; break; }
      const s = r.value;
      done = base + Math.min(feet.length - 1, s.levelling ? feet.length - 1 : Math.round(feet.length * s.footing / Math.max(1, s.footings)));
      yield { phase: 'foundations', done, total, layout: { system, index, count: FOUNDATION_SYSTEMS.length, footing: s.footing, footings: s.footings, levelling: s.levelling, ...(s.grouping ? { grouping: true as const } : {}) } };
    }
    done = base + feet.length;
    yield { phase: 'foundations', done, total, layout: { system, index, count: FOUNDATION_SYSTEMS.length, footing: feet.length, footings: feet.length, levelling: false } };
    const pulls = tiePulls(rows, (q, H, from) => q.column?.storey ?? Math.max(0, H - leverOf(from.demand, from.adopted.h)), feet);
    if (pulls.size) rows = rows.map((r) => { const p = pulls.get(r.key); if (!p) return r; const f = footingRowOf(withPulls(r.demand, p), rules, adoptedNow, footingSizing(data), column, fmt); redo(r.key, f.redo); return f.row; });
    const straps = designFootingStraps(rows, {
      rules, fmt, baseOf: (k) => D.beams.find((b) => b.key === k), adoptedOf: (g) => adoptedNow[`line:${g}`],
      ctxOf: (base, r) => (base ? beamCtx(base) : { mat: { fc: footingContext(r.demand, footingSizing(data), column).fc, fy }, cover: dd.covers.footing, stirrupDia: dd.stirrupDiaMm, diameters: dd.longDiametersMm, ...ties, torsion: data.torsion, ...coverTable, ...defl, criteria: crit }),
    });
    rows = rows.map((r) => withStrapBeams(r, straps, (s) => strapKeyOf(r, s)));
    if (own) for (const sd of straps.values()) {
      if (sd.group === undefined) continue;
      const g = sd.group;
      const li = line.findIndex((l) => l.key === `line:${g}`);
      if (li >= 0) line[li] = sd.line;
      const bi = beam.findIndex((b) => b.key === sd.beam.key);
      if (bi >= 0) beam[bi] = { ...sd.beam, isAdopted: !!adoptedNow[`line:${g}`] };
      lineRedesigners.set(g, (o) => { const r = sd.redo(o.b ?? sd.b, o.h ?? sd.h, o.fc); return { line: r.line, spans: [r.beam], status: lineRowStatus(r.line, [r.beam]) }; });
    }
    return sort(withOverlaps(rows));
  };
  const chosen = feet.length ? foundationSystem(data) : null;
  const footing = chosen ? yield* layout(chosen, true, 1) : [];
  const others = new Map<FoundationSystem, FootingRow[]>();
  for (const sys of FOUNDATION_SYSTEMS) if (feet.length && sys !== chosen) others.set(sys, yield* layout(sys, false, others.size + (chosen ? 2 : 1)));
  const footingLayouts = FOUNDATION_SYSTEMS.flatMap((sys) => { const rows = sys === chosen ? footing : others.get(sys); return rows ? [{ system: sys, rows }] : []; });
  const framed = column.filter((r) => !r.pier);
  const checked = seismic ? jointChecks(framed, beam, modelStore.nodes, fmt, joint) : framed;
  const checkedBy = new Map(checked.map((x) => [x.key, x]));
  const columnsFinal = column.map((r) => (r.pier ? r : checkedBy.get(r.key) ?? r));
  if (seismic) for (const r of checked) jointAwareRedesign(r, checked, beam, (rows, beams) => jointChecks(rows, beams, modelStore.nodes, fmt, joint));
  const left = leftOut([...beam, ...columnsFinal, ...slab, ...wall].map((r) => r.key), columnsFinal.map((r) => ({
    name: r.name, level: r.level, b: r.b, h: r.h, fc: fcOfElements(groupOf(r.key)?.members.elements), tu: Math.max(0, ...r.demand.cases.map((c) => c.tu ?? 0)),
  })));
  const apart = rules.piers ? [] : allPiers;
  return { beam: sort(beam), line: sort(line), column: sort(withApart(columnsFinal, apart)), slab: sort(slab), slabPlan: slabPlans.sort((a, b) => a.level.localeCompare(b.level, undefined, { numeric: true })), wall: sort(withApart(wall, apart)), punching: sort(punching), levels: levelsUp([...beam, ...columnsFinal, ...slab, ...wall, ...punching].map((r) => r.level)), footing, footingLayouts: footingLayouts.map((l) => ({ ...l, summary: layoutSummary(l.rows, code) })), foundation: chosen, code: codeName, basis, combos: sets.length, left };
}

function leftOut(rowKeys: string[], columns: Parameters<typeof sheetsLeftOut>[0]['columns']): LeftOut[] {
  const namer = storeyNamer();
  const inGroups = { elements: new Set<number>(), quads: new Set<number>(), plates: new Set<number>() };
  const groups = physicalGroups().map((g) => {
    for (const id of g.members.elements ?? []) inGroups.elements.add(id);
    for (const id of g.members.quads ?? []) inGroups.quads.add(id);
    for (const id of g.members.plates ?? []) inGroups.plates.add(id);
    return {
      id: g.id, name: g.name, kind: g.physical.kind, level: levelName(g.physical.levelFrom, namer),
      elements: (g.members.elements ?? []).filter((id) => inConcrete(modelStore.elements.get(id)?.materialId)).length,
      shells: (g.members.quads ?? []).filter((id) => inConcrete(modelStore.quads.get(id)?.materialId)).length
        + (g.members.plates ?? []).filter((id) => inConcrete(modelStore.plates.get(id)?.materialId)).length,
      noFc: [...(g.members.elements ?? []).map((id) => modelStore.elements.get(id)?.materialId), ...(g.members.quads ?? []).map((id) => modelStore.quads.get(id)?.materialId), ...(g.members.plates ?? []).map((id) => modelStore.plates.get(id)?.materialId)]
        .some((m) => m !== undefined && inConcrete(m) && concreteFc(modelStore.materials.get(m) as never) === undefined),
    };
  });
  const looseElements = [...modelStore.elements.values()].filter((e) => !inGroups.elements.has(e.id) && inConcrete(e.materialId)).length;
  const looseShells = [...modelStore.quads.values()].filter((q) => !inGroups.quads.has(q.id) && inConcrete(q.materialId)).length
    + [...modelStore.plates.values()].filter((p) => !inGroups.plates.has(p.id) && inConcrete(p.materialId)).length;
  return sheetsLeftOut({ groups, looseElements, looseShells, rowKeys, columns, defaultFc: DEFAULT_FC });
}


/**
 * A column redesigned for its resize hint is checked for the shear of the joint at its top too, the
 * members framing into it as they are. The strong-column rule stays with the column's own Mn: the
 * joint's share of it falls to the columns above as well, which the hint does not resize.
 */
function jointAwareRedesign(r: ColumnRow, columns: readonly ColumnRow[], beams: readonly BeamRow[], check: (rows: ColumnRow[], beams: BeamRow[]) => ColumnRow[]): void {
  const own = redesigners.get(r.key), top = r.demand.nodes?.top;
  if (!own || top === undefined) return;
  const near = columns.filter((x) => x.demand.nodes?.top === top || x.demand.nodes?.bottom === top);
  const framing = beams.filter((b) => b.demand.line?.startNode === top || b.demand.line?.endNode === top);
  redesigners.set(r.key, ((x: never, o?: RedesignWith) => {
    const row = own(x, o) as ColumnRow;
    const joint = check(near.map((c) => (c.key === r.key ? row : c)), framing).find((c) => c.key === r.key)?.verifications.find((v) => v.label === 'rcSheets.v.seisJoint');
    return joint ? { ...row, verifications: [...row.verifications, joint], ...(joint.ok ? {} : { status: 'fail' as const, checks: { ...row.checks, ok: false } }) } : row;
  }) as Redesign);
}

/**
 * The columns grown, joint by joint, until the strong-column rule holds (§18.7.3.2) with the beams'
 * bars framing in, as the joint check reads both: each column at a joint short of it is asked for its
 * share of what is missing, and those adopted are left as they are.
 */
function strongColumns(columns: ColumnRow[], beams: BeamRow[], c: JointContext, design: (minMn: ReadonlyMap<string, number>) => ColumnRow[]): ColumnRow[] {
  const minMn = new Map<string, number>();
  let rows = columns;
  for (let round = 0; round < 6; round++) {
    const { joints, columnId } = frameJoints(rows, beams, modelStore.nodes, c);
    const byId = new Map([...columnId].map(([r, id]) => [id, r]));
    let grown = false;
    for (const j of joints) {
      const sc = j.strongColumn;
      if (sc.ok || sc.roof || sc.sumColumns <= 1e-9) continue;
      for (const id of j.columns) {
        const r = byId.get(id);
        if (!r || r.isAdopted) continue;
        const own = columnJointSection(r, c.fc(r), c.fy, c.cover);
        const want = columnLeastMn(own.section, c.fc(r), c.fy, own.axial) * (sc.required / sc.sumColumns) * 1.01;
        if (want > (minMn.get(r.key) ?? 0) + 1e-3) { minMn.set(r.key, want); grown = true; }
      }
    }
    if (!grown) break;
    rows = design(minMn);
  }
  return rows;
}

export const familyRows = (rows: SheetRows, f: SheetFamily): SheetRow[] => rows[f];

export async function downloadRcSheets(rows: SheetRows, tr: (k: string) => string): Promise<void> {
  const { exportToExcel } = await import('../export/excel');
  const { rcSheetsWorkbook } = await import('../rc-sheets/workbook');
  const { sheetsSchedule } = await import('./rc-sheets-schedule');
  const { recordSheetsExport } = await import('./rc-sheets-exports');
  const name = (modelStore.model.name || 'stabileo').replace(/[^\w.-]+/g, '-');
  const filename = `${name}-${tr('rcSheets.fileName')}.xlsx`;
  await exportToExcel({ filename, onlyExtras: true, extraSheets: rcSheetsWorkbook(rows, tr, sheetsSchedule(rows)), provenance: false });
  recordSheetsExport('rcWorkbook', filename, SHEET_FAMILIES.filter((f) => rows[f].length).map((f) => tr(`rcSheets.family.${f}`)).join(', '));
}
