/**
 * What the engine's pre-solve gates found about the model, in the shape the
 * diagnostics UI reads.
 *
 * `structuredDiagnostics` is not only the gates' findings. Every solve also
 * appends its own run notes — the factorization it used (`dense_lu`,
 * `sparse_cholesky`), its residual (`residual_ok`), conditioning — and a
 * constrained solve used to add a `residual_high` Warning to every correct
 * solution. Passed through as "model" findings, a clean cantilever showed
 * "Diagnostics (2)" and the PRO panel's no-issues state never rendered. Only
 * the phases that describe the model itself are kept: `pre_solve` (the gates)
 * and `constraints` (conflicting or circular ties). The run notes the panels
 * need already arrive through `solverDiagnostics`.
 *
 * Pure, and kept out of the results store, which only calls it.
 */
import type { SolverDiagnostic, StructuredDiagnostic } from './types';

const MODEL_PHASES = new Set(['pre_solve', 'constraints']);

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

function toSolverDiagnostic(d: StructuredDiagnostic): SolverDiagnostic {
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
    source: 'model',
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
}

/** The model findings in a solve's structured diagnostics; the run notes are dropped. */
export function modelFindings(structured: StructuredDiagnostic[] | undefined): SolverDiagnostic[] {
  if (!structured) return [];
  return structured.filter((d) => d.phase !== undefined && MODEL_PHASES.has(d.phase)).map(toSolverDiagnostic);
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
 * Whether `incoming` says what `existing` already says. For a gate finding
 * `checkModel` also makes: same finding, and every node the engine names is
 * among those `checkModel` named (its tolerance is wider, so it can group
 * more). Otherwise the exact comparison the panel always used.
 */
export function sameFinding(existing: SolverDiagnostic, incoming: SolverDiagnostic): boolean {
  const mapped = SAME_AS_CHECK_MODEL[incoming.code];
  if (mapped && existing.code === mapped) {
    const named = new Set(existing.nodeIds ?? []);
    const nodes = incoming.nodeIds ?? [];
    return nodes.length > 0 && nodes.every((n) => named.has(n));
  }
  return existing.code === incoming.code && existing.message === incoming.message
    && JSON.stringify(existing.elementIds) === JSON.stringify(incoming.elementIds)
    && JSON.stringify(existing.nodeIds) === JSON.stringify(incoming.nodeIds);
}

/** A detail value as the panel prints it: small magnitudes in exponent form, not "0.000". */
export function formatDetailValue(v: unknown): string {
  if (typeof v !== 'number') return Array.isArray(v) ? v.join(', ') : String(v);
  return v !== 0 && Math.abs(v) < 1e-3 ? v.toExponential(2) : v.toFixed(3);
}
