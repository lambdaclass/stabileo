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
import { computeStationDemands, steelDemandOf } from '../engine/verification-service';
import { memberLengths } from '../engine/steel/unbraced-length';
import { lightestPassing, verdictFor, type OptimiseMember, type OptimiseResult, type CandidateVerdict } from '../engine/steel/profile-optimise';
import { ALL_PROFILES, profileToSectionFull, type ProfileFamily, type SteelProfile } from '../data/steel-profiles';
import type { AnalysisResults3D } from '../engine/types-3d';

export type OptimiseScope = 'section' | 'member';

export interface OptimiseRow {
  key: string;
  scope: OptimiseScope;
  sectionId: number;
  elementIds: number[];
  family: ProfileFamily;
  currentName: string;
  current: CandidateVerdict | null;
  result: OptimiseResult;
}

export type RecheckStatus = 'holds' | 'lighter' | 'failsNow' | 'unchecked';

export interface AppliedRow { key: string; scope: OptimiseScope; profileName: string; elementIds: number[]; status: RecheckStatus; now?: OptimiseResult; nowRatio?: number }

const byName = new Map(ALL_PROFILES.map((p) => [p.name, p]));

/** A section that is exactly one catalogue profile — the only kind this search can replace. */
function catalogueProfileOf(sec: { name: string; profileFamily?: string; composition?: unknown } | undefined): SteelProfile | null {
  if (!sec || sec.composition) return null;
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
    if (!ef || !e) continue;
    const len = lengths.get(id);
    const k = { ...(e.kStrong !== undefined ? { Kx: e.kStrong } : {}), ...(e.kWeak !== undefined ? { Ky: e.kWeak } : {}) };
    members.push({ elementId: id, demand: steelDemandOf(ef, demands.get(id), stations.get(id)), lengths: { ...(len ? { L: len.L, Lb: len.Lb } : { L: ef.length, Lb: ef.length }), ...k } });
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
function groups(scope: OptimiseScope, ids?: readonly number[]) {
  const wanted = ids ? new Set(ids) : null;
  const out = new Map<string, { sectionId: number; materialId: number; profile: SteelProfile; elementIds: number[] }>();
  for (const e of modelStore.elements.values()) {
    if (wanted && !wanted.has(e.id)) continue;
    const m = modelStore.materials.get(e.materialId);
    if (!m?.fy || m.fy <= 80) continue;
    const p = catalogueProfileOf(modelStore.sections.get(e.sectionId));
    if (!p) continue;
    const key = scope === 'section' ? `s${e.sectionId}m${e.materialId}` : `e${e.id}`;
    const g = out.get(key) ?? { sectionId: e.sectionId, materialId: e.materialId, profile: p, elementIds: [] };
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

  return {
    get rows() { return rows; },
    get applied() { return applied; },
    get error() { return error; },
    /** Picks written, and no solve since: the model is designed but not re-verified. */
    get awaitingReverify() { return applied.length > 0 && applied.every((a) => a.status === 'unchecked'); },
    get converged() { return applied.length > 0 && applied.every((a) => a.status === 'holds'); },
    get appliedAt() { return appliedAt; },

    /** Propose the lightest passing profile per group, against the analysis on hand. */
    run(scope: OptimiseScope, ids?: readonly number[]): void {
      error = null;
      if (!resultsStore.results3D) { rows = []; error = 'opt.needSolve'; return; }
      const out: OptimiseRow[] = [];
      for (const [key, g] of groups(scope, ids)) {
        const { members } = membersFor(g.elementIds);
        if (members.length === 0) continue;
        const material = modelStore.materials.get(g.materialId)!;
        out.push({
          key, scope, sectionId: g.sectionId, elementIds: g.elementIds, family: g.profile.family as ProfileFamily,
          currentName: g.profile.name, current: verdictFor(g.profile, members, material),
          result: lightestPassing(g.profile.family as ProfileFamily, members, material),
        });
      }
      rows = out;
    },

    /**
     * Write the chosen profiles to the model, as one undoable edit.
     *
     * A 'section' row replaces the profile of the section in place, so every member sharing it
     * follows — the same edit the sections table makes. A 'member' row gives the member a section
     * of its own for the new profile, reusing one that already is that profile.
     */
    apply(keys: readonly string[]): void {
      const chosen = rows.filter((r) => keys.includes(r.key) && r.result.chosen && r.result.chosen.profile.name !== r.currentName);
      if (chosen.length === 0) return;
      modelStore.batch(() => {
        for (const r of chosen) {
          const p = r.result.chosen!.profile;
          const full = profileToSectionFull(p);
          const fields = { name: p.name, profileFamily: p.family, a: full.a, iy: full.iy, iz: full.iz, j: full.j, b: full.b, h: full.h, shape: full.shape, tw: full.tw, tf: full.tf, t: full.t };
          if (r.scope === 'section') {
            modelStore.updateSection(r.sectionId, fields);
          } else {
            const rotation = modelStore.sections.get(r.sectionId)?.rotation;
            const existing = [...modelStore.sections.values()].find((s) => s.name === p.name && !s.composition && (s.rotation ?? 0) === (rotation ?? 0));
            const sid = existing?.id ?? modelStore.addSection({ ...fields, ...(rotation ? { rotation } : {}) } as never);
            for (const id of r.elementIds) modelStore.updateElementSection(id, sid);
          }
        }
      });
      applied = chosen.map((r) => ({ key: r.key, scope: r.scope, profileName: r.result.chosen!.profile.name, elementIds: r.elementIds, status: 'unchecked' as const }));
      appliedAt = modelStore.modelVersion;
      rows = [];
    },

    /**
     * After a new solve: does each applied profile still pass, and is it still the lightest?
     * One pass, reported per row.
     */
    recheck(): void {
      error = null;
      if (!resultsStore.results3D) { error = 'opt.needSolve'; return; }
      applied = applied.map((a) => {
        const p = byName.get(a.profileName);
        const ids = a.elementIds.filter((id) => modelStore.elements.has(id));
        const { members, materialOf } = membersFor(ids);
        const material = materialOf.get(ids[0]!);
        if (!p || !material || members.length === 0) return { ...a, status: 'unchecked' as const };
        const mine = verdictFor(p, members, material);
        const now = lightestPassing(p.family as ProfileFamily, members, material);
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
