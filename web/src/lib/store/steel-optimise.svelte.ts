/**
 * Lightest passing steel profiles: propose against the analysis on hand, write them to the
 * model, and say plainly whether they still hold after the model is solved again.
 *
 * ── The three states ──────────────────────────────────────────────
 *
 *   · PROPOSED — `run()` checked every catalogue candidate against the current demands
 *     (`engine/steel/profile-optimise.ts`). Nothing in the model has changed.
 *   · APPLIED, NOT RE-VERIFIED — `apply()` wrote the picks. Writing a section is an edit, so the
 *     results on hand are retired as for any edit; the picks were made against forces that no
 *     longer exist, and the panel says so instead of showing them as verified.
 *   · RE-VERIFIED — after a new solve, `recheck()` runs each applied profile against the new
 *     demands and the search again. Each row then HOLDS (it passes and nothing lighter does),
 *     could go LIGHTER, or FAILS NOW. All rows holding is convergence, and it is shown as such;
 *     anything else is shown as it is, one pass at a time, never iterated behind the user's back.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { activePerCombo3D, activeCombinations } from './active-results';
import { computeStationDemands, steelDemandOf, steelSegmentDiagram } from '../engine/verification-service';
import { memberLengths } from '../engine/steel/unbraced-length';
import { lightestPassing, verdictFor, type OptimiseMember, type OptimiseResult, type CandidateVerdict, type OptimiseCriteria } from '../engine/steel/profile-optimise';
import { deflectionChecks } from './serviceability';
import { ALL_PROFILES, profileToSectionFull, type ProfileFamily, type SteelProfile } from '../data/steel-profiles';
import type { AnalysisResults3D } from '../engine/types-3d';
import { isDesigned, maskAxialDemand } from '../engine/design/behaviour-demands';
import { materialFamilyOf } from '../engine/steel/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import { isColdFormedSection } from '../profiles/cold-formed-catalogue';

export type OptimiseScope = 'section' | 'member' | 'group';

/** What the user asks of the search, beyond passing the strength check. */
export interface OptimiseSettings {
  families?: ProfileFamily[];
  hMinMm?: number;
  hMaxMm?: number;
  bMaxMm?: number;
  target?: number;
  /** Also keep each member's deflection within its rule, estimated from the analysis on hand. */
  deflection?: boolean;
}

/** The deflection criterion for a group's members: each one's deflection now, its limit and its inertias. */
function deflectionCriterion(ids: readonly number[]): OptimiseCriteria['deflection'] {
  const run = deflectionChecks(ids);
  const out: Array<NonNullable<OptimiseCriteria['deflection']>[number]> = [];
  for (const [id, row] of run.rows) {
    const sec = modelStore.sections.get(modelStore.elements.get(id)?.sectionId ?? -1);
    if (!sec?.iy || !sec.iz) continue;
    out.push({ elementId: id, v: row.deflection.maxV, w: row.deflection.maxW, direction: row.rule.direction, limit: row.check.limit, iy: sec.iy, iz: sec.iz });
  }
  return out;
}

function criteriaFor(settings: OptimiseSettings, ids: readonly number[]): OptimiseCriteria {
  return {
    ...(settings.families?.length ? { families: settings.families } : {}),
    ...(settings.hMinMm != null ? { hMinMm: settings.hMinMm } : {}),
    ...(settings.hMaxMm != null ? { hMaxMm: settings.hMaxMm } : {}),
    ...(settings.bMaxMm != null ? { bMaxMm: settings.bMaxMm } : {}),
    ...(settings.target != null ? { target: settings.target } : {}),
    ...(settings.deflection ? { deflection: deflectionCriterion(ids) } : {}),
  };
}

export interface OptimiseRow {
  key: string;
  scope: OptimiseScope;
  /** The group's name, for a group row. */
  groupName?: string;
  sectionId: number;
  elementIds: number[];
  family: ProfileFamily;
  currentName: string;
  current: CandidateVerdict | null;
  result: OptimiseResult;
  /** At least one member needs the proposed profile, even if the heaviest already has it. */
  changes: boolean;
}

export type RecheckStatus = 'holds' | 'lighter' | 'failsNow' | 'unchecked';

export interface AppliedRow { key: string; scope: OptimiseScope; profileName: string; elementIds: number[]; status: RecheckStatus; now?: OptimiseResult; nowRatio?: number }

const byName = new Map(ALL_PROFILES.map((p) => [p.name, p]));

/**
 * A section that is exactly one catalogue profile — the only kind this search can replace. A
 * declared section (its own properties under a catalogue-looking name), a drawn one or a built-up
 * one is not, whatever its name.
 */
function catalogueProfileOf(sec: { name: string; profileFamily?: string; composition?: unknown; declared?: boolean; drawn?: unknown; built?: unknown } | undefined): SteelProfile | null {
  if (!sec || sec.composition || sec.declared || sec.drawn || sec.built) return null;
  const p = byName.get(sec.name);
  return p && (!sec.profileFamily || sec.profileFamily === p.family) ? p : null;
}

/** The demands, lengths and material of the steel members in `ids`, against the analysis on hand. */
function membersFor(ids: readonly number[]): { members: OptimiseMember[]; materialOf: Map<number, { fy?: number; e?: number; fu?: number }> } {
  const md = { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports };
  let perCombo: Map<number, AnalysisResults3D> = activePerCombo3D();
  let combos = activeCombinations();
  if (perCombo.size === 0 && resultsStore.results3D) {
    perCombo = new Map([[0, resultsStore.results3D]]);
    combos = [{ id: 0, name: '', factors: [] }] as never;
  }
  const { demands, stations } = computeStationDemands(perCombo, combos, md as never);
  const lengths = memberLengths(modelStore.model);
  const forces = new Map((resultsStore.results3D?.elementForces ?? []).map((f) => [f.elementId, f]));
  const members: OptimiseMember[] = [];
  const materialOf = new Map<number, { fy?: number; e?: number; fu?: number }>();
  for (const id of ids) {
    const ef = forces.get(id);
    const e = modelStore.elements.get(id);
    if (!ef || !e || !isDesigned(e.behaviour)) continue;
    const len = lengths.get(id);
    const k = { ...(e.kStrong !== undefined ? { Kx: e.kStrong } : {}), ...(e.kWeak !== undefined ? { Ky: e.kWeak } : {}) };
    members.push({
      elementId: id,
      // As the check reads it: a tension-only brace is not sized for buckling.
      demand: maskAxialDemand(steelDemandOf(ef, demands.get(id), stations.get(id)), e.behaviour),
      lengths: { ...(len ? { L: len.L, Lb: len.Lb, freeEnd: len.freeEnd } : { L: ef.length, Lb: ef.length }), ...k },
      // Cb reads the whole unbraced segment, which on a chained member spans sibling elements.
      segment: steelSegmentDiagram(id, len, stations, md as never),
    });
    const m = modelStore.materials.get(e.materialId);
    if (m) materialOf.set(id, m);
  }
  return { members, materialOf };
}

/**
 * The groups to optimise: every steel member with a single catalogue profile, by the section
 * it shares ('section') or one by one ('member'), limited to `ids` when given.
 *
 * Members of one group are checked against one material — the group's first — and members of a
 * section with different materials are split so that is always true.
 */
/** Members the last grouping left out because the checker does not cover their material or section. */
const outOfScope = new Set<number>();

function groups(scope: OptimiseScope, ids?: readonly number[]) {
  const wanted = ids ? new Set(ids) : null;
  const out = new Map<string, { sectionId: number; materialId: number; profile: SteelProfile; elementIds: number[]; groupName?: string }>();
  outOfScope.clear();
  /*
   * A named group is a design group: one profile for all its steel members. A member in two
   * groups is optimised with the first, so no member receives two answers.
   */
  const groupOf = new Map<number, { id: number; name: string }>();
  if (scope === 'group') {
    for (const g of modelStore.model.groups.values()) {
      for (const id of g.members.elements ?? []) if (!groupOf.has(id)) groupOf.set(id, { id: g.id, name: g.name });
    }
  }
  for (const e of modelStore.elements.values()) {
    if (wanted && !wanted.has(e.id)) continue;
    const m = modelStore.materials.get(e.materialId);
    if (!m?.fy || m.fy <= 80) continue;
    // The checker is CIRSOC 301's hot-rolled steel one: aluminium is out of its scope, and so is
    // a cold-formed section (CIRSOC 303), whatever a catalogue lookup of its name returns.
    if (materialFamilyOf(m as never, catalogueGradeFamily).family !== 'steel') { outOfScope.add(e.id); continue; }
    if (isColdFormedSection(modelStore.sections.get(e.sectionId))) { outOfScope.add(e.id); continue; }
    const p = catalogueProfileOf(modelStore.sections.get(e.sectionId));
    if (!p) continue;
    const grp = groupOf.get(e.id);
    if (scope === 'group' && !grp) continue;
    const key = scope === 'section' ? `s${e.sectionId}m${e.materialId}` : scope === 'group' ? `g${grp!.id}m${e.materialId}` : `e${e.id}`;
    const g = out.get(key) ?? { sectionId: e.sectionId, materialId: e.materialId, profile: p, elementIds: [], ...(grp ? { groupName: grp.name } : {}) };
    // A group's current profile is its heaviest member's: the one the group is designed around.
    if (p.weight > g.profile.weight) { g.profile = p; g.sectionId = e.sectionId; }
    g.elementIds.push(e.id);
    out.set(key, g);
  }
  return out;
}

function createSteelOptimise() {
  let rows = $state<OptimiseRow[]>([]);
  let applied = $state<AppliedRow[]>([]);
  /** The model version the picks were applied at; a later version means the user edited since. */
  let appliedAt = $state<number | null>(null);
  let error = $state<string | null>(null);
  /** The criteria of the last run, which the re-verification applies again. */
  let lastSettings: OptimiseSettings = {};
  /**
   * The project and the model version the proposals were made on. Proposals outlived a project
   * change and an edit, and "Apply" then wrote another project's picks by section id onto
   * whatever carried that id now.
   */
  let ranOn = $state<{ epoch: number; version: number } | null>(null);
  let skipped = $state(0);
  let appliedEpoch = $state<number | null>(null);
  const fresh = () => ranOn !== null && ranOn.epoch === modelStore.loadEpoch && ranOn.version === modelStore.modelVersion;
  /** The analysis the proposals were checked against: a new solve makes them stale too. */
  let proposedResults: AnalysisResults3D | null = null;

  return {
    get rows() { return fresh() ? rows : []; },
    get applied() { return appliedEpoch === modelStore.loadEpoch ? applied : []; },
    get error() { return error; },
    /** Picks written, and no solve since: the model is designed but not re-verified. */
    get awaitingReverify() { const a = this.applied; return a.length > 0 && a.every((x) => x.status === 'unchecked'); },
    get converged() { const a = this.applied; return a.length > 0 && a.every((x) => x.status === 'holds'); },
    get appliedAt() { return appliedAt; },
    /** Members of the last run left out: aluminium or cold-formed, which the checker does not cover. */
    get outOfScope() { return fresh() ? skipped : 0; },

    /** Propose the lightest passing profile per group, against the analysis on hand. */
    run(scope: OptimiseScope, ids?: readonly number[], settings: OptimiseSettings = {}): void {
      error = null;
      lastSettings = settings;
      proposedResults = resultsStore.results3D;
      if (!resultsStore.results3D) { rows = []; error = 'opt.needSolve'; return; }
      if (scope === 'group' && modelStore.model.groups.size === 0) { rows = []; error = 'opt.noGroups'; return; }
      const out: OptimiseRow[] = [];
      for (const [key, g] of groups(scope, ids)) {
        const { members } = membersFor(g.elementIds);
        if (members.length === 0) continue;
        const material = modelStore.materials.get(g.materialId)!;
        const criteria = criteriaFor(settings, g.elementIds);
        const result = lightestPassing(g.profile.family as ProfileFamily, members, material, criteria);
        out.push({
          key, scope, sectionId: g.sectionId, elementIds: g.elementIds, family: g.profile.family as ProfileFamily,
          ...(g.groupName ? { groupName: g.groupName } : {}),
          currentName: g.profile.name, current: verdictFor(g.profile, members, material, criteria),
          result,
          changes: !!result.chosen && g.elementIds.some(id => modelStore.sections.get(modelStore.elements.get(id)!.sectionId)?.name !== result.chosen!.profile.name),
        });
      }
      rows = out;
      skipped = outOfScope.size;
      ranOn = { epoch: modelStore.loadEpoch, version: modelStore.modelVersion };
    },

    /**
     * Write the chosen profiles to the model, as one undoable edit.
     *
     * A 'section' row replaces the section in place only when every member using it was checked.
     * Otherwise assign the checked members their own sections, preserving each orientation and
     * reusing an existing section only when its profile properties also match.
     */
    apply(keys: readonly string[]): void {
      // Proposals made on another project or model version are not applied, and the panel says so.
      if (!fresh()) { rows = []; error = 'opt.needSolve'; return; }
      if (proposedResults !== resultsStore.results3D || !proposedResults) {
        rows = []; error = 'opt.needSolve'; return;
      }
      const chosen = rows.filter((r) => keys.includes(r.key) && r.result.chosen && r.changes);
      if (chosen.length === 0) return;
      modelStore.batch(() => {
        for (const r of chosen) {
          const p = r.result.chosen!.profile;
          const full = profileToSectionFull(p);
          const fields = { name: p.name, profileFamily: p.family, a: full.a, iy: full.iy, iz: full.iz, j: full.j, b: full.b, h: full.h, shape: full.shape, tw: full.tw, tf: full.tf, t: full.t };
          const allUsersChosen = [...modelStore.elements.values()].every(e => e.sectionId !== r.sectionId || r.elementIds.includes(e.id));
          if (r.scope === 'section' && allUsersChosen) {
            // The section in place: every member sharing it follows.
            modelStore.updateSection(r.sectionId, fields);
          } else {
            // Each member keeps its own orientation. A section is reused only when it is that
            // catalogue profile with the same properties: a declared, drawn or built-up section of
            // the same name carries other properties.
            for (const id of r.elementIds) {
              const rotation = modelStore.sections.get(modelStore.elements.get(id)!.sectionId)?.rotation ?? 0;
              const existing = [...modelStore.sections.values()].find(s => {
                if (s.composition || s.declared || s.drawn || s.built || (s.rotation ?? 0) !== rotation) return false;
                return Object.entries(fields).every(([key, value]) => s[key as keyof typeof s] === value);
              });
              const sid = existing?.id ?? modelStore.addSection({ ...fields, rotation } as never);
              modelStore.updateElementSection(id, sid);
            }
          }
        }
      });
      applied = chosen.map((r) => ({ key: r.key, scope: r.scope, profileName: r.result.chosen!.profile.name, elementIds: r.elementIds, status: 'unchecked' as const }));
      appliedAt = modelStore.modelVersion;
      appliedEpoch = modelStore.loadEpoch;
      rows = [];
      ranOn = null;
    },

    /**
     * After a new solve: does each applied profile still pass, and is it still the lightest?
     * One pass, reported per row.
     */
    recheck(): void {
      error = null;
      if (appliedEpoch !== modelStore.loadEpoch) { applied = []; appliedAt = null; return; }
      if (!resultsStore.results3D) { error = 'opt.needSolve'; return; }
      applied = applied.map((a) => {
        const p = byName.get(a.profileName);
        const ids = a.elementIds.filter((id) => modelStore.elements.has(id));
        if (ids.length !== a.elementIds.length || ids.some(id => modelStore.sections.get(modelStore.elements.get(id)!.sectionId)?.name !== a.profileName)) {
          return { ...a, status: 'unchecked' as const };
        }
        const { members, materialOf } = membersFor(ids);
        // An inactive member follows its section but is not designed, as when the row was
        // proposed: every designed member must be checked, and only those.
        const designed = ids.filter(id => isDesigned(modelStore.elements.get(id)!.behaviour));
        const material = designed.length > 0 ? materialOf.get(designed[0]!) : undefined;
        // Rows start out homogeneous. A later material assignment can split the group, so its
        // first member's grade no longer represents all members; propose the groups again.
        const materialIds = new Set(ids.map(id => modelStore.elements.get(id)!.materialId));
        if (!p || !material || members.length !== designed.length || members.length === 0 || materialIds.size !== 1) {
          return { ...a, status: 'unchecked' as const };
        }
        const criteria = criteriaFor(lastSettings, ids);
        const mine = verdictFor(p, members, material, criteria);
        const now = lightestPassing(p.family as ProfileFamily, members, material, criteria);
        const status: RecheckStatus = !mine?.passes ? 'failsNow'
          : now.chosen && now.chosen.profile.name !== p.name && now.chosen.profile.weight < p.weight ? 'lighter'
          : 'holds';
        return { ...a, status, now, nowRatio: mine?.ratio };
      });
    },

    /** Forget the applied set (a new run, or the user moved on). */
    clearApplied(): void { applied = []; appliedAt = null; },
  };
}

export const steelOptimise = createSteelOptimise();
