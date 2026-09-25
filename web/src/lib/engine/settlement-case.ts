/**
 * Imposed support displacements, solved once and added once to every combination.
 *
 * ── What was wrong ────────────────────────────────────────────────
 *
 * A support's prescribed displacement (`dx … drz`) lives on the support, and the support is
 * part of the structure every load case is solved on. So each case was solved WITH the
 * settlement, and each combination, summing its cases with their factors, carried it Σfᵢ times:
 * 1.2D + 1.6L applied a 10 mm settlement as 28 mm, and a case table read a settlement in the
 * wind case. A settlement is not a load that scales with a factor; it happens once.
 *
 * ── What is done ──────────────────────────────────────────────────
 *
 * The cases are solved on the structure without the prescribed displacements. The structure
 * with them, and no load at all, is solved once more — the settlement case — and added with
 * factor 1 to every combination. Linear superposition makes that exact. A solve with no
 * combinations (the single-case solve) is unchanged: it applies loads and settlement together.
 *
 * The settlement case is kept in `perCase` under `SETTLEMENT_CASE_ID`, which no load case can
 * have, so a reader can show what the settlement alone does.
 */
import { combineResults3D, computeEnvelope3D } from './wasm-solver';
import { enrichComboShellStresses } from './shell-combos';
import { postProcessShellStresses } from './solver-shells';
import type { AnalysisResults3D, FullEnvelope3D } from './types-3d';

/**
 * The case id the settlement is published under: one no load case will reach (they count up
 * from 1). Not negative, because the engine's combiner takes case ids as unsigned.
 */
export const SETTLEMENT_CASE_ID = 2 ** 31 - 1;

/** A result case's name: its load case's, or the settlement case's. */
export function resultCaseName(id: number, loadCases: ReadonlyArray<{ id: number; name: string }>, settlementName: string, fallback: string): string {
  if (id === SETTLEMENT_CASE_ID) return settlementName;
  return loadCases.find((c) => c.id === id)?.name ?? `${fallback}${id}`;
}

const FIELDS = ['dx', 'dy', 'dz', 'drx', 'dry', 'drz'] as const;
type Prescribed = Partial<Record<(typeof FIELDS)[number], number>>;

/** Whether any support imposes a displacement. */
export function hasSettlement(supports: Iterable<Prescribed>): boolean {
  for (const s of supports) for (const f of FIELDS) if (s[f] !== undefined && s[f] !== 0) return true;
  return false;
}

/** The same supports with no prescribed displacement. */
export function withoutSettlement<S extends Prescribed>(supports: Map<number, S>): Map<number, S> {
  return new Map([...supports].map(([id, s]) => {
    const c = { ...s };
    for (const f of FIELDS) delete c[f];
    return [id, c];
  }));
}

type Bundle = { perCase: Map<number, AnalysisResults3D>; perCombo: Map<number, AnalysisResults3D>; envelope: FullEnvelope3D };

interface ShellContext {
  nodes: Parameters<typeof postProcessShellStresses>[1];
  quads: Parameters<typeof postProcessShellStresses>[2];
  plates: Parameters<typeof postProcessShellStresses>[3];
  materials: Parameters<typeof postProcessShellStresses>[4];
}

/**
 * Add the settlement case, factor 1, to every combination of `bundle`, and rebuild the
 * envelope. `combinations` are the ones the bundle was solved for.
 */
export function addSettlementCase(
  bundle: Bundle,
  settlement: AnalysisResults3D,
  combinations: Array<{ id: number; factors: Array<{ caseId: number; factor: number }> }>,
  shells?: ShellContext,
): Bundle | null {
  if (shells) postProcessShellStresses(settlement, shells.nodes, shells.quads, shells.plates, shells.materials);
  const perCase = new Map(bundle.perCase);
  perCase.set(SETTLEMENT_CASE_ID, settlement);
  const withIt = combinations.map((c) => ({ ...c, factors: [...c.factors, { caseId: SETTLEMENT_CASE_ID, factor: 1 }] }));
  const perCombo = new Map<number, AnalysisResults3D>();
  for (const combo of withIt) {
    const combined = combineResults3D(combo.factors, perCase);
    if (!combined) continue;
    if (shells) postProcessShellStresses(combined, shells.nodes, shells.quads, shells.plates, shells.materials);
    perCombo.set(combo.id, combined);
  }
  const envelope = computeEnvelope3D([...perCombo.values()]);
  if (!envelope) return null;
  if (shells) enrichComboShellStresses(perCase, perCombo, envelope.maxAbsResults3D, withIt as never);
  return { perCase, perCombo, envelope };
}
