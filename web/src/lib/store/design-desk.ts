/**
 * One «Design» for the whole structure: the concrete families the project designs (frame, slabs,
 * walls, footings) by the same family run the design table uses, then the steel members' CIRSOC
 * 301 check; locked members left alone, edited ones kept or redesigned as the person chose. And
 * the final report: by level, how many members verify, warn, fail or could not be checked, and
 * which do not verify, each with the codes of its notices.
 */
import type { ResizeChange, ResizeRun } from './design-resize';
import { materialCheckState, runMaterialChecks, type MaterialMemberResult, type OtherMaterialFamily } from './material-check.svelte';
import { modelStore } from './model.svelte';
import { designRunStore } from './design-run.svelte';
import { verificationStore, type DisplayStatus } from './verification.svelte';
import { runSteelCheck } from './steel-check';
import { POINT_SLAB_COLUMN_JOINT, noticesOf, STEEL_INPUTS_MISSING } from '../engine/design/notice-catalogue';
import { loadSplitNotEstablished, currentSlabColumnJoint } from './analysis-validity-store';
import type { ModelSlabColumnJoint } from '../engine/design/analysis-validity';
import { steelInputCompleteness } from '../engine/verification-service';
import { sortedLevels } from '../model/grid';
import type { DesignRunReport, DesignFamilySelection } from '../engine/design/design-families';
import { levelCentres, type LevelCentres } from '../engine/building/level-centres';
import { resolveMassFactors } from '../engine/dynamics/mass-source';
import { physicalGroups } from './physical';
import { materialFamilyOf } from '../engine/steel/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';

export interface DeskRunOptions {
  families?: DesignFamilySelection;
  /** What to do with members a person edited and did not lock. */
  edited: 'keep' | 'overwrite';
  steel: boolean;
}

export interface DeskMember { id: number; status: DisplayStatus; ratio: number | null; codes: string[]; material: 'concrete' | 'steel' | OtherMaterialFamily }
/** Per level: the statuses, with the steel members that pass apart (metallic results are experimental, never verified). */
/**
 * A level's standing. `failing` holds what does not verify (fail, at the limit, provisional);
 * `unchecked` what could not be checked (inputs missing, not supported) and `stale` what was
 * checked against forces that no longer hold. All three are lists, so every member counted in the
 * report can be opened from it.
 */
export interface LevelReport { name: string; z: number; counts: Record<DisplayStatus, number>; steelOk: number; failing: DeskMember[]; unchecked: DeskMember[]; stale: DeskMember[] }
export interface DeskReport {
  concrete: DesignRunReport | null;
  steel: number | null;
  skipped: { locked: number; edited: number };
  levels: LevelReport[];
  /** The sections a sizing run enlarged, and why it stopped (`design-resize.ts`). */
  resized?: { changes: ResizeChange[]; rounds: number; stopped: ResizeRun['stopped'] };
}

const STATUSES: DisplayStatus[] = ['ok', 'warn', 'fail', 'provisional', 'unavailable', 'stale'];

/** The members the design reads: the concrete ones it has contexts for and the steel ones it checked. */
export function deskMembers(): DeskMember[] {
  const ids = new Set<number>([...verificationStore.contexts.keys()]);
  const steel = new Set(verificationStore.steelMap.keys());
  // Designed against an analysis a change has cleared: still listed, out of date (`outOfDate`).
  for (const id of verificationStore.outOfDate) {
    if (ids.has(id) || steel.has(id)) continue;
    ids.add(id);
    const e = modelStore.elements.get(id);
    if (e && materialFamilyOf(modelStore.materials.get(e.materialId) as never, catalogueGradeFamily).family === 'steel') steel.add(id);
  }
  // Listed without a design when the analysis was cleared: still listed, «not checked».
  for (const id of verificationStore.stillListed) ids.add(id);
  // Steel members whose section the check cannot read: shown, unchecked, saying why.
  const incomplete = new Set(steelInputCompleteness({ elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports } as never).map((g) => g.elementId));
  if (verificationStore.steelMap.size > 0 || incomplete.size > 0) for (const id of incomplete) { steel.add(id); }
  for (const id of steel) ids.add(id);
  // One row per design member: a span's pieces are one beam, listed under the piece it is designed under.
  for (const id of [...ids]) {
    const sp = verificationStore.contextFor(id)?.span;
    if (sp && sp.representative !== id && ids.has(sp.representative)) ids.delete(id);
  }
  // The other materials: their own checker's result (`material-check.svelte.ts`).
  const other = materialCheckState.results;
  for (const id of other.keys()) { ids.add(id); steel.delete(id); }
  return [...ids].filter((id) => modelStore.elements.has(id)).sort((a, b) => a - b).map((id) => other.has(id) ? otherMember(other.get(id)!) : jointRead({
    id,
    status: incomplete.has(id) && !verificationStore.steelMap.has(id) ? 'unavailable' : verificationStore.getDisplayStatus(id),
    ratio: incomplete.has(id) && !verificationStore.steelMap.has(id) ? null : verificationStore.getDisplayRatio(id),
    codes: incomplete.has(id) && !verificationStore.steelMap.has(id) ? [STEEL_INPUTS_MISSING.code] : noticesOf(verificationStore.outcomeFor(id)).map((n) => n.code),
    material: steel.has(id) ? 'steel' as const : 'concrete' as const,
  }));
}

/**
 * A member on a floor whose slab is joined to a column at one node (`analysis-validity.ts`) was
 * checked against forces whose split between beams and columns the model does not establish: it
 * does not count as verifying. It is listed with what could not be checked, with its notice; one
 * that fails still fails.
 */
function jointRead(m: DeskMember): DeskMember {
  if (!loadSplitNotEstablished(m.id)) return m;
  return { ...m, status: m.status === 'ok' || m.status === 'warn' ? 'unavailable' : m.status, codes: [...m.codes, POINT_SLAB_COLUMN_JOINT.code] };
}

/** The model's slab-column joint verdict, for the desk's banner. */
export function deskSlabColumnJoint(): ModelSlabColumnJoint { return currentSlabColumnJoint(); }

const DISPLAY: Record<string, DisplayStatus> = { ok: 'ok', nearLimit: 'warn', fail: 'fail', notVerified: 'unavailable', unsupported: 'unavailable' };
function otherMember(r: MaterialMemberResult): DeskMember {
  return { id: r.elementId, status: DISPLAY[r.status] ?? 'unavailable', ratio: r.utilization, codes: [], material: r.family };
}

/** The level a member is on: the grid level at or below its top end, else its top elevation. */
function levelOf(id: number): { name: string; z: number } {
  const e = modelStore.elements.get(id);
  const zs = e ? [e.nodeI, e.nodeJ].map((n) => modelStore.nodes.get(n)?.z ?? 0) : [0];
  const top = Math.max(...zs);
  const levels = sortedLevels(modelStore.grid);
  const at = [...levels].reverse().find((l) => l.z <= top + 1e-6);
  return at ? { name: at.name, z: at.z } : { name: `z = ${Math.round(top * 100) / 100}`, z: top };
}

export function finalReport(members = deskMembers()): LevelReport[] {
  const by = new Map<string, LevelReport>();
  for (const m of members) {
    const l = levelOf(m.id);
    const r = by.get(l.name) ?? { name: l.name, z: l.z, counts: Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<DisplayStatus, number>, steelOk: 0, failing: [], unchecked: [], stale: [] };
    // Every result but concrete's is calculated, never verified: its passes are counted apart.
    if (m.material !== 'concrete' && m.status === 'ok') r.steelOk++; else r.counts[m.status]++;
    if (m.status === 'fail' || m.status === 'warn' || m.status === 'provisional') r.failing.push(m);
    else if (m.status === 'unavailable') r.unchecked.push(m);
    else if (m.status === 'stale') r.stale.push(m);
    by.set(l.name, r);
  }
  return [...by.values()].sort((a, b) => a.z - b.z);
}

/**
 * The members «Size…» reads as not designed yet: the concrete members design has a context for
 * and no bars on. The steel members are checked, not designed, so they are never among them.
 */
export function undesignedMembers(): number[] {
  return [...verificationStore.contexts.keys()].filter((id) => !modelStore.elements.get(id)?.reinforcement);
}

/**
 * Design the members given (a selection, the undesigned ones), with the same rule for the edited
 * ones as the whole run, then the steel check when asked, and report as the whole run does.
 */
export function designMembers(ids: readonly number[], o: Omit<DeskRunOptions, 'families'>): DeskReport {
  designRunStore.autoDesign([...ids], { edited: o.edited });
  const skipped = { ...designRunStore.lastSkipped };
  const s = o.steel ? runSteelCheck() : null;
  if (o.steel) runMaterialChecks();
  return { concrete: null, steel: s && 'checked' in s ? s.checked : null, skipped, levels: finalReport() };
}

/** Design everything the project designs, and report. */
export function designEverything(o: DeskRunOptions): DeskReport {
  const concrete = designRunStore.designFamilies(o.families ?? designRunStore.familySelection, { edited: o.edited });
  const skipped = { ...designRunStore.lastSkipped };
  const s = o.steel ? runSteelCheck() : null;
  if (o.steel) runMaterialChecks();
  return { concrete, steel: s && 'checked' in s ? s.checked : null, skipped, levels: finalReport() };
}

/**
 * The centres of mass and rigidity of the model's levels. The mass source's factors weigh the
 * load cases; without one, the members' and shells' own weight only, as the dynamics does.
 */
export function modelLevelCentres(): LevelCentres[] {
  const m = modelStore.model;
  const factors = new Map(resolveMassFactors(m.loadCases.map((c) => ({ id: c.id, name: c.name, type: c.type ?? '' })), m.massSource).map((f) => [f.caseId, f.factor]));
  const walls = physicalGroups().filter((g) => g.physical.kind === 'wall').flatMap((g) => (g.members.quads ?? []).length ? [{
    nodes: [...new Set((g.members.quads ?? []).flatMap((q) => m.quads.get(q)?.nodes ?? []))],
    thickness: m.quads.get(g.members.quads![0]!)?.thickness ?? 0,
    materialId: m.quads.get(g.members.quads![0]!)?.materialId ?? 0,
  }] : []);
  return levelCentres({
    nodes: m.nodes, elements: m.elements as never, sections: m.sections as never, materials: m.materials as never,
    quads: m.quads as never, loads: m.loads as never, massFactor: (id) => factors.get(id) ?? 0,
    levels: sortedLevels(m.grid), walls,
  });
}
