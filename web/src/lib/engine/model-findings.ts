/**
 * The engine's structured diagnostics, in the shape the diagnostics UI reads,
 * and the rules both panels share for merging, selecting and printing them.
 *
 * `structuredDiagnostics` mixes three things, and they are sorted here:
 *
 *  - What the pre-solve gates and the constraint checks found about the model
 *    (phases `pre_solve`, `constraints`): always shown, as `source: 'model'`.
 *  - Warnings and errors from the solve itself — conditioning, a residual that
 *    missed its tolerance, a displacement large enough to mean a mechanism:
 *    shown, as `source: 'solver'` (a mechanism warning describes the model, so
 *    it keeps `'model'`). The 2D solver reports these nowhere else: its
 *    `solverDiagnostics` is empty.
 *  - The run's own notes — which factorization it used, a residual that was
 *    fine, the fill ratio: dropped. Shown, a clean cantilever read
 *    "Diagnostics (2)" and the PRO panel's no-issues state never appeared.
 *
 * Pure, and kept out of the results store, which only calls it.
 */
import type { SolverDiagnostic, StructuredDiagnostic } from './types';

const MODEL_PHASES = new Set(['pre_solve', 'constraints']);
/** Warnings that describe the model rather than the numerics of the solve. */
const MODEL_CODES = new Set(['excessive_displacement']);
/** Warning-level notes about performance, not correctness. */
const NOT_A_FINDING = new Set(['sparse_fill_ratio']);

/**
 * Selection keys for the shells a diagnostic names — `q{id}` for quads and
 * curved shells, `p{id}` for plates, the keys `uiStore.selectedShells` uses.
 * Frames, plates and quads number independently, so these ids must never be
 * read as frame elements: a collapsed "Quad 7" used to select frame 7. Quad9
 * and solid shells have no editor entity on this side, so they select nothing.
 * `null` for frames and for diagnostics that name no element.
 */
function shellKeys(d: StructuredDiagnostic): string[] | null {
  const ids = d.elementIds ?? [];
  switch (d.elementKind) {
    case 'quad':
    case 'curved_shell':
      return ids.map((id) => `q${id}`);
    case 'plate':
      return ids.map((id) => `p${id}`);
    case 'quad9':
    case 'solid_shell':
      return [];
    default:
      return null;
  }
}

function toSolverDiagnostic(d: StructuredDiagnostic, source: SolverDiagnostic['source']): SolverDiagnostic {
  const shells = shellKeys(d);
  // Only what the diagnostic actually carries: every key used to be written,
  // and the panel printed "value: undefined | threshold: undefined".
  const details: Record<string, unknown> = {};
  if (d.value !== undefined) details.value = d.value;
  if (d.threshold !== undefined) details.threshold = d.threshold;
  if (d.dofIndices && d.dofIndices.length > 0) details.dofIndices = d.dofIndices;
  return {
    severity: d.severity,
    code: d.code,
    message: d.message,
    ...(shells ? (shells.length > 0 ? { shellKeys: shells } : {})
      : d.elementIds && d.elementIds.length > 0 ? { elementIds: d.elementIds } : {}),
    ...(d.nodeIds && d.nodeIds.length > 0 ? { nodeIds: d.nodeIds } : {}),
    source,
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
}

/**
 * The findings in a solve's structured diagnostics; the run's own notes are dropped.
 *
 * `legacy` is the same result's `solverDiagnostics`. The 3D solver repeats its
 * conditioning warnings there, in other words ("5 near-zero diagonal(s)
 * detected at DOFs: …" beside "5 near-zero diagonal entries") and without a
 * code, so no comparison can pair them; when that list already carries
 * conditioning, the structured copies are left out and each fact appears once.
 */
export function modelFindings(
  structured: StructuredDiagnostic[] | undefined,
  legacy: ReadonlyArray<{ category?: string }> = [],
): SolverDiagnostic[] {
  if (!structured) return [];
  const conditioningShown = legacy.some((d) => d.category === 'conditioning');
  const out: SolverDiagnostic[] = [];
  for (const d of structured) {
    if (d.phase !== undefined && MODEL_PHASES.has(d.phase)) {
      out.push(toSolverDiagnostic(d, 'model'));
    } else if (d.phase === 'conditioning' && conditioningShown) {
      continue;
    } else if (d.severity !== 'info' && !NOT_A_FINDING.has(d.code)) {
      out.push(toSolverDiagnostic(d, MODEL_CODES.has(d.code) ? 'model' : 'solver'));
    }
  }
  return out;
}

/**
 * Engine gate codes that `checkModel` also reports, under its own code and
 * with an i18n key for a message. Comparing code and message, as the panel
 * did, could never match one to the other, and coincident nodes were listed
 * twice.
 */
const SAME_AS_CHECK_MODEL: Record<string, string> = {
  near_duplicate_nodes: 'MODEL_COINCIDENT_NODES',
  disconnected_node: 'MODEL_DISCONNECTED_NODE',
};

/**
 * Whether `incoming` says what `existing` already says.
 *
 *  - A gate finding `checkModel` also makes: same finding, and every node the
 *    engine names is among those `checkModel` named (its tolerance is wider,
 *    so it can group more).
 *  - An entry without a code (the legacy `solverDiagnostics`) and one that
 *    says the same thing word for word are the same finding.
 *  - Otherwise the exact comparison the panel always used.
 */
export function sameFinding(existing: SolverDiagnostic, incoming: SolverDiagnostic): boolean {
  const mapped = SAME_AS_CHECK_MODEL[incoming.code];
  if (mapped && existing.code === mapped) {
    const named = new Set(existing.nodeIds ?? []);
    const nodes = incoming.nodeIds ?? [];
    return nodes.length > 0 && nodes.every((n) => named.has(n));
  }
  if ((!existing.code || !incoming.code) && existing.message === incoming.message) return true;
  return existing.code === incoming.code && existing.message === incoming.message
    && JSON.stringify(existing.elementIds) === JSON.stringify(incoming.elementIds)
    && JSON.stringify(existing.nodeIds) === JSON.stringify(incoming.nodeIds);
}

/** `first` followed by every entry of `rest` that says something not already said. */
export function mergeFindings(first: SolverDiagnostic[], ...rest: SolverDiagnostic[][]): SolverDiagnostic[] {
  const merged = [...first];
  for (const list of rest) {
    for (const d of list) if (!merged.some((m) => sameFinding(m, d))) merged.push(d);
  }
  return merged;
}

/** What a click on a diagnostic selects: shells, members or nodes, in that order. */
export function selectionOf(d: SolverDiagnostic): { nodes: number[]; elements: number[]; shells: string[] } | null {
  if (d.shellKeys && d.shellKeys.length > 0) return { nodes: [], elements: [], shells: d.shellKeys };
  if (d.elementIds && d.elementIds.length > 0) return { nodes: [], elements: d.elementIds, shells: [] };
  if (d.nodeIds && d.nodeIds.length > 0) return { nodes: d.nodeIds, elements: [], shells: [] };
  return null;
}

/** A shell selection key as a kind and an id: 'q7' → quad 7, 'p4' → plate 4. */
export function shellRef(key: string): { kind: 'quad' | 'plate'; id: number } {
  return { kind: key.startsWith('p') ? 'plate' : 'quad', id: Number(key.slice(1)) };
}

/** A detail value as the panel prints it: small magnitudes in exponent form, not "0.000". */
export function formatDetailValue(v: unknown): string {
  if (typeof v !== 'number') return Array.isArray(v) ? v.join(', ') : String(v);
  return v !== 0 && Math.abs(v) < 1e-3 ? v.toExponential(2) : v.toFixed(3);
}

/** A diagnostic's details as one line: "value: 0.040 | threshold: 0.100". */
export function formatDetails(details: Record<string, unknown>): string {
  return Object.entries(details)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${formatDetailValue(v)}`)
    .join(' | ');
}
