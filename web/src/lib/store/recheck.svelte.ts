/**
 * The re-check prompt for projects last solved with an older version (roadmap: "Trust and
 * verification backlog", item 8).
 *
 * ── What it holds ──────────────────────────────────────────────────
 *
 *   stamp        which build last solved the project on screen (`provenance/solve-stamp.ts`).
 *                Session-authoritative, like the export record: captured into every snapshot,
 *                adopted on open, replaced by every solve, never touched by undo.
 *   assessment   computed once when the project is opened: the registered result changes that
 *                concern THIS model (`provenance/applicability.ts`).
 *
 * ── The rules ──────────────────────────────────────────────────────
 *
 *   - The notice is shown when the assessment lists changes and they have not been
 *     acknowledged, even when a solve (live calc) has already made the numbers current. It
 *     cannot be dismissed any other way: no close button, no Escape, no click outside. Acknowledging is a statement the engineer makes ("I have read what
 *     changed"), so it is a checkbox and a button, not a reflex.
 *   - Acknowledged is per stamp and remembered in this browser, so a reload or a restart does not
 *     ask again for what was already read. Another browser (a colleague) is asked, and a stamp
 *     the notice has not been read for (a newer change registered) is asked about anew.
 *   - Until the model is solved again in this build, its results are STALE, acknowledged or
 *     not, and say so (`stale`). A solve stamps the current version and clears it; the static
 *     (linear) solve, not a modal or P-Δ run alone. An advisory about one analysis (harmonic)
 *     stays up until that analysis is run again.
 */
import type { RecheckAssessment } from '../provenance/applicability';
import type { Advisory } from '../provenance/advisories';
import { analysesContext, freshStamp, readStamp, stampSolve, unknownStamp, type SolveStamp } from '../provenance/solve-stamp';
import { RESULTS_VERSION } from '../provenance/registry';
import { loadsGeneratedWith, modelFeatures, type AnalysisKind, type FeatureSnapshot } from '../provenance/model-features';

/**
 * Independent of the latest solve: retained until the original notice is read, and saved after
 * that while a solve has replaced the stamp but something it lists has not been run again.
 */
export interface PendingRecheckNotice {
  stamp: SolveStamp;
  features: string[];
}

const ACK_KEY = 'stabileo-recheck-acknowledged';
const ACK_KEEP = 300;

function readAcknowledged(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(ACK_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

function writeAcknowledged(ids: Iterable<string>): void {
  try { localStorage.setItem(ACK_KEY, JSON.stringify([...ids].slice(-ACK_KEEP))); } catch { /* remembered for this session only */ }
}

export function createRecheckStore(load = () => import('../provenance/applicability'), remember = true) {
  // The project on screen at start-up is a new one, made in this build.
  let stamp = $state.raw<SolveStamp | null>(freshStamp());
  let assessment = $state.raw<RecheckAssessment | null>(null);
  /** The stamp the assessment was made against: a solve replaces `stamp` and ends staleness. */
  let assessedStampId = $state<string | null>(null);
  let currentAssessmentStampId = $state<string | null>(null);
  let acknowledged = $state.raw<ReadonlySet<string>>(new Set(remember ? readAcknowledged() : []));

  let outstanding = $state.raw<PendingRecheckNotice | undefined>(undefined);
  let pending = $state(false);
  let loadFailed = $state(false);
  let generation = 0;
  let retry = () => Promise.resolve();

  const rerun = (kind: AnalysisKind): boolean =>
    stamp !== null && stamp.id !== assessedStampId && stamp.id !== currentAssessmentStampId && stamp.analyses.includes(kind);
  const openAdvisories = (): Advisory[] => assessment?.advisories.filter((a) => !rerun(a.analysis ?? 'linear')) ?? [];
  const stale = (): boolean =>
    !!assessment && (((pending || assessment.changes.length > 0) && !rerun('linear')) || openAdvisories().length > 0);

  return {
    get pending() { return pending; },
    get loadFailed() { return loadFailed; },
    retry() { return retry(); },
    get stamp() { return stamp; },
    get assessment() { return assessment; },
    /** Results on hand (or about to be produced from saved design state) predate registered changes. */
    get stale() { return stale(); },
    /** The static solve has run in this build since the project was opened. */
    get solvedAgain() { return rerun('linear'); },
    /** The advisories whose analysis has not been run again in this build. */
    get openAdvisories() { return openAdvisories(); },
    /** The blocking notice is up. */
    get noticeOpen() {
      // Not tied to `stale`: live calc may re-solve the moment a project opens, and the notice
      // must still be read. What changed is worth knowing even once the numbers are current.
      return !!assessment && (pending || assessment.changes.length > 0 || assessment.advisories.length > 0) && assessedStampId !== null && !acknowledged.has(assessedStampId);
    },
    /** Opened in an older build than the one that solved it. */
    get solvedWithNewer() { return !!stamp && stamp.resultsVersion > RESULTS_VERSION; },

    /**
     * A project was opened (file, tab, autosave, link). `snapshot`: what was opened, as stored.
     * A project without a stamp is assessed as solved with version 0.
     */
    openProject(snapshot: FeatureSnapshot & { solvedWith?: unknown; pendingRecheckNotice?: PendingRecheckNotice }, analysisMode?: string): void {
      // No stamp: an explicit "unknown" one (version 0), so the project keeps one identity while
      // it travels between tabs and an acknowledgement given in this session holds for it.
      const stored = readStamp(snapshot.solvedWith) ?? unknownStamp();
      stamp = stored;
      const request = ++generation;
      const savedNotice = snapshot.pendingRecheckNotice;
      const original = readStamp(savedNotice?.stamp) ?? stored;
      assessedStampId = original.id;
      currentAssessmentStampId = stored.resultsVersion < RESULTS_VERSION ? stored.id : null;
      const loadsVersion = loadsGeneratedWith(snapshot);
      pending = original.resultsVersion < RESULTS_VERSION || stored.resultsVersion < RESULTS_VERSION || loadsVersion < RESULTS_VERSION;
      const currentFeatures = modelFeatures(snapshot, { analysisMode, ...analysesContext(stored) });
      // Capture before attempting the lazy import. Solves and edits must not replace
      // the version or applicability of the notice the engineer has yet to read.
      outstanding = pending ? {
        stamp: original,
        // Save current applicability before loading, so failed downloads followed by
        // an automatic solve cannot erase newly relevant warnings on reload.
        features: [...new Set([
          ...(Array.isArray(savedNotice?.features) && savedNotice.features.every(f => typeof f === 'string')
            ? savedNotice.features
            : modelFeatures(snapshot, { analysisMode, ...analysesContext(original) })),
          ...currentFeatures,
        ])],
      } : undefined;
      loadFailed = false;
      assessment = {
        solvedVersion: original.resultsVersion, currentVersion: RESULTS_VERSION,
        older: pending, newer: stored.resultsVersion > RESULTS_VERSION, changes: [], advisories: [], maybe: [],
      };
      const features = new Set(outstanding?.features);
      retry = async () => {
        if (request !== generation || !pending) return;
        loadFailed = false;
        try {
          const { assessProject } = await load();
          if (request !== generation) return;
          const preserved = assessProject({}, original, analysisMode, undefined, features, loadsVersion);
          const current = assessProject({}, stored, analysisMode, undefined, currentFeatures, loadsVersion);
          currentAssessmentStampId = current.changes.length ? stored.id : null;
          assessment = {
            ...preserved,
            newer: current.newer,
            changes: [...new Map([...preserved.changes, ...current.changes].map(c => [c.id, c])).values()]
              .sort((a, b) => a.resultsVersion - b.resultsVersion || a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
            advisories: [...new Map([...preserved.advisories, ...current.advisories].map(x => [x.id, x])).values()],
            maybe: [...new Set([...preserved.maybe, ...current.maybe])].filter(id =>
              ![preserved, current].some(r => r.advisories.some(x => x.id === id) && !r.maybe.includes(id))),
          };
          // An empty assessment has no notice to preserve. Never let its frozen
          // features suppress changes applicable to a later edited snapshot.
          if (!assessment.changes.length && !assessment.advisories.length) outstanding = undefined;
          pending = false;
          retry = () => Promise.resolve();
        } catch {
          if (request === generation) loadFailed = true;
        }
      };
      void retry();
    },

    /** A new, empty project: nothing was solved, nothing is stale, and it belongs to this build. */
    reset(): void {
      ++generation;
      retry = () => Promise.resolve();
      pending = false;
      loadFailed = false;
      outstanding = undefined;
      stamp = freshStamp();
      assessment = null;
      assessedStampId = null;
      currentAssessmentStampId = null;
    },

    /** An analysis of `kind` just published results in this build. */
    noteSolved(kind: AnalysisKind): void {
      stamp = stampSolve(kind, stamp);
    },

    /**
     * Put back a stamp taken earlier (Explore's baseline): the solves of a what-if model are not
     * solves of the project, and must not end its stale state or change what it records.
     */
    restoreStamp(s: SolveStamp | undefined): void {
      stamp = s ? { ...s, analyses: [...s.analyses] } : null;
    },

    /** The engineer read the notice. Results stay marked stale until re-run. */
    acknowledge(): void {
      if (!pending && assessedStampId) {
        acknowledged = new Set([...acknowledged, assessedStampId]);
        if (remember) writeAcknowledged(acknowledged);
      }
    },

    captureNotice(): PendingRecheckNotice | undefined {
      if (!outstanding) return undefined;
      if (acknowledged.has(outstanding.stamp.id) && !(stale() && stamp?.id !== outstanding.stamp.id)) return undefined;
      return { stamp: { ...outstanding.stamp, analyses: [...outstanding.stamp.analyses] }, features: [...outstanding.features] };
    },

    /** What a snapshot carries: the stamp, or nothing when the project was never solved. */
    capture(): SolveStamp | undefined {
      return stamp ? { ...stamp, analyses: [...stamp.analyses] } : undefined;
    },
  };
}

export const recheckStore = createRecheckStore();
