/**
 * Project regulations store.
 *
 * Owns the role bindings, the revision vector, and the pending/applied transition that
 * makes "changing a load regulation must not silently relabel existing loads" enforceable
 * rather than aspirational.
 *
 * ── The transition ─────────────────────────────────────────────
 *
 * `choose()` stages a change as PENDING. Nothing downstream moves. The UI can then ask
 * `pendingConsequence()` what applying it would cost, show that to the user, and call
 * either `applyPending()` or `cancelPending()`.
 *
 * A load-affecting role never applies from the Design surface at all: `requestChange()`
 * returns a navigation intent so the Design panel can send the user to Loads, where the
 * before/after preview lives. The Design surface asks; Loads decides.
 *
 * Design-only roles (concrete, steel, …) apply in place, because the forces do not move
 * and there is nothing to preview.
 */

import { modelStore } from './model.svelte';
import { msg, type EngineMessage } from '../codes/message';
import type { DesignCodeId } from '../engine/design/code-adapter';
import {
  REGULATIONS_SCHEMA_VERSION, bindRole, defaultRegulations, findOption, isLoadAffecting,
  pendingRequiresLoadRegeneration, pendingRoles, regulationStamps, roleUsable,
  validateStack, type ProjectRegulations, type RegulationRole, type RoleBinding,
  type StackProblem, type StoredRegulations,
} from '../codes/roles';
import {
  applyChange, emptyRevisions, freshness, stamp,
  type ChangeKind, type ChangeConsequence, type RevisionStage, type RevisionVector,
  type StageStamp,
} from '../codes/revisions';

/** What the caller should do after `requestChange`. */
export type ChangeRequest =
  /** Applied immediately; nothing to preview. */
  | { kind: 'applied'; consequence: ChangeConsequence }
  /**
   * Staged as pending. The user must review it in Loads, because it changes what the
   * generated loads are and the before/after preview lives there.
   */
  | { kind: 'needsLoadReview'; role: RegulationRole; navigateTo: 'loads' }
  /** Refused, with the reason. */
  | { kind: 'refused'; problems: StackProblem[] };

function createRegulationsStore() {
  /** Set when a load-affecting change is staged, so the UI can show the banner. */
  let reviewRequested = $state<RegulationRole | null>(null);
  /**
   * Bindings displaced by a staged change, so Cancel can put them back.
   *
   * Without this, cancelling cleared the role instead of restoring what was applied
   * before — the user lost a binding by changing their mind, which is worse than the
   * change they cancelled.
   */
  let displaced = $state<Partial<Record<RegulationRole, RoleBinding>>>({});

  const stored = $derived<StoredRegulations>(
    modelStore.model.regulations
    ?? { version: REGULATIONS_SCHEMA_VERSION, roles: defaultRegulations() },
  );
  const roles = $derived<ProjectRegulations>(stored.roles);
  const revisions = $derived<RevisionVector>(modelStore.model.revisions ?? emptyRevisions());
  const validation = $derived(validateStack(roles));

  function writeRoles(next: ProjectRegulations): void {
    modelStore.model.regulations = { version: REGULATIONS_SCHEMA_VERSION, roles: next };
  }
  function writeRevisions(next: RevisionVector): void {
    modelStore.model.revisions = next;
  }

  return {
    get roles() { return roles; },
    get revisions() { return revisions; },
    get validation() { return validation; },
    get stamps() { return regulationStamps(roles); },
    get pending() { return pendingRoles(roles); },
    get pendingNeedsLoadRegeneration() { return pendingRequiresLoadRegeneration(roles); },
    get reviewRequested() { return reviewRequested; },

    binding(role: RegulationRole): RoleBinding { return roles[role]; },

    /**
     * THE design code for reinforced concrete — the one authoritative answer.
     *
     * ── Why this exists ────────────────────────────────────────────────
     *
     * The concrete design code was being chosen in three places at once. A dropdown beside
     * the Design commands wrote `verificationStore.activeCodeId`, which reached the code
     * check, the candidate search and detailing. Project Regulations bound a `concrete`
     * role, which reached only detailing's EDITION. And a legacy v1 field,
     * `codeSettings.concreteEdition`, silently rewrote the adapter inside `design-run`.
     *
     * They could disagree, and the disagreement was not cosmetic: detailing could take its
     * edition from one source and its adapter from another, so a member could be verified
     * against one edition's clauses and detailed under the other's. The dropdown also
     * offered CIRSOC 201-2005, which the role catalogue correctly marks
     * `UNAVAILABLE_SOURCE` because the official 2005 text is not supplied with this app.
     *
     * Everything that needs a concrete design code now asks here. `null` means the project
     * has not bound a usable one, and the caller must GATE rather than pick a default —
     * silently falling back to CIRSOC is how a project gets verified against rules it never
     * chose.
     */
    concreteDesignCode(): DesignCodeId | null {
      const b = roles.concrete;
      if (!b.adapterId) return null;
      if (!roleUsable(roles, 'concrete')) return null;
      return b.adapterId as DesignCodeId;
    },

    /**
     * Why `concreteDesignCode()` is null, as a structured message for the UI.
     *
     * Returns null when nothing is wrong, so a caller can render the reason only when there
     * is one.
     */
    concreteDesignProblem(): EngineMessage | null {
      const b = roles.concrete;
      if (!b.adapterId) return msg('regulations.problem.concreteUnbound');
      const opt = findOption(b.adapterId);
      if (!opt || opt.maturity === 'UNSUPPORTED') {
        return msg('regulations.problem.concreteUnsupported', {
          adapter: b.adapterId, edition: b.edition ?? '',
        });
      }
      if (!roleUsable(roles, 'concrete')) {
        return msg('regulations.problem.concreteIncomplete', { adapter: b.adapterId });
      }
      return null;
    },
    /** Bound, supported AND configured — ready to produce results. */
    usable(role: RegulationRole): boolean { return roleUsable(roles, role); },
    /**
     * Bound to a supported adapter, regardless of whether its settings are filled in yet.
     *
     * The Loads dialog needs this rather than `usable`: it IS the surface that supplies
     * the wind and seismic settings, so gating its own controls on `configComplete` was
     * circular — the checkbox stayed disabled because the configuration was missing, and
     * the configuration was missing because the checkbox was disabled.
     */
    bound(role: RegulationRole): boolean {
      const b = roles[role];
      if (!b.adapterId) return false;
      return findOption(b.adapterId)?.maturity !== 'UNSUPPORTED';
    },

    /** Is a stamped output still valid? */
    fresh(s: StageStamp | null | undefined) { return freshness(s, revisions); },
    /** Stamp an output with the revisions it was produced against. */
    stampFor(stage: RevisionStage): StageStamp { return stamp(stage, revisions); },

    /**
     * Stage a role change WITHOUT applying it.
     *
     * Returns what the caller must do next. A load-affecting change is never applied from
     * here — the user has to see the before/after in Loads first.
     */
    requestChange(role: RegulationRole, adapterId: string): ChangeRequest {
      const opt = findOption(adapterId);
      if (!opt || opt.role !== role) {
        return { kind: 'refused', problems: [{
          severity: 'error', roles: [role],
          key: 'regulations.problem.unknownAdapter', params: { adapter: adapterId },
        }] };
      }

      const previous = roles[role];
      const next: ProjectRegulations = {
        ...roles,
        [role]: {
          ...bindRole(role, adapterId, {
            jurisdiction: previous.jurisdiction,
            adoption: previous.adoption,
            settings: previous.settings,
          }),
          state: 'pending',
        },
      };

      const v = validateStack(next);
      const blocking = v.problems.filter(
        (p) => p.severity === 'error' && p.roles.includes(role));
      if (blocking.length > 0) {
        return { kind: 'refused', problems: blocking };
      }

      // Remember what we displaced BEFORE writing, so Cancel is lossless.
      if (displaced[role] === undefined) displaced = { ...displaced, [role]: previous };
      writeRoles(next);

      if (isLoadAffecting(role)) {
        reviewRequested = role;
        return { kind: 'needsLoadReview', role, navigateTo: 'loads' };
      }

      // Design-only: the forces do not move, so apply in place.
      return { kind: 'applied', consequence: this.applyPending('designRegulation') };
    },

    /** What applying the staged change would cost. */
    pendingConsequence(): ChangeKind | null {
      const p = pendingRoles(roles);
      if (p.length === 0) return null;
      return p.some(isLoadAffecting) ? 'loadRegulation' : 'designRegulation';
    },

    /**
     * Commit every pending binding and invalidate exactly what the change kind says.
     *
     * `kind` is supplied by the caller because only it knows whether the loads were
     * actually regenerated — applying a load-regulation change without regenerating would
     * leave the model's loads inconsistent with its stated regulation.
     */
    applyPending(kind: ChangeKind): ChangeConsequence {
      const next = { ...roles };
      const rev = revisions;
      for (const role of pendingRoles(roles)) {
        next[role] = { ...next[role], state: 'applied', appliedAtRevision: rev.regulationConfig + 1 };
      }
      writeRoles(next);
      displaced = {};
      const { revisions: bumped, consequence } = applyChange(rev, kind);
      writeRevisions(bumped);
      reviewRequested = null;
      return consequence;
    },

    /** Discard staged bindings, restoring exactly what was applied before. */
    cancelPending(): void {
      const next = { ...roles };
      for (const role of pendingRoles(roles)) {
        const prev = displaced[role];
        next[role] = prev !== undefined
          ? { ...prev }
          : { ...next[role], state: 'unset', adapterId: null, nameKey: '', edition: '' };
      }
      writeRoles(next);
      displaced = {};
      reviewRequested = null;
    },

    /** Update role-specific settings. Marks the binding complete when told to. */
    configureRole(
      role: RegulationRole, settings: Record<string, unknown>, complete: boolean,
    ): void {
      writeRoles({
        ...roles,
        [role]: { ...roles[role], settings: { ...roles[role].settings, ...settings }, configComplete: complete },
      });
    },

    setJurisdiction(role: RegulationRole, jurisdiction: string, adoption: RoleBinding['adoption']): void {
      writeRoles({ ...roles, [role]: { ...roles[role], jurisdiction, adoption } });
    },

    /** Apply the same jurisdiction to every bound role — the usual case. */
    setJurisdictionForAll(jurisdiction: string, adoption: RoleBinding['adoption']): void {
      const next = { ...roles };
      for (const role of Object.keys(next) as RegulationRole[]) {
        if (next[role].adapterId) next[role] = { ...next[role], jurisdiction, adoption };
      }
      writeRoles(next);
    },

    /** Record a non-regulation change and invalidate accordingly. */
    noteChange(kind: ChangeKind): ChangeConsequence {
      const { revisions: bumped, consequence } = applyChange(revisions, kind);
      writeRevisions(bumped);
      return consequence;
    },

    clearReviewRequest(): void { reviewRequested = null; },
  };
}

export const regulationsStore = createRegulationsStore();
