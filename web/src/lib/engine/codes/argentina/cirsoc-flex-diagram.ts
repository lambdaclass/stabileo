/**
 * The interaction diagram as the sheets plot it — both edges, both curves.
 *
 * ── Two curves, not one ────────────────────────────────────────────
 *
 * Every column sheet's chart carries a pair of series: "Con limitación de
 * Φ Pn (máx)" and "Sin limitación de Φ Pn (máx)". The first is the design
 * diagram, flat-topped at §10.3.6's ceiling; the second is the same section
 * without that ceiling, running up to φ·Po. Showing both says how much of the
 * section's pure-compression strength the code refuses to credit, which is
 * the one thing the capped curve alone hides.
 *
 * ── Both edges, computed — not mirrored ────────────────────────────
 *
 * The first figure drew one edge and reflected it about the axial axis. That
 * is only true of a symmetric section, and the sheets are full of sections
 * that are not: FCR with A′s/As = 0.5, FCR-VERIF with five arbitrary levels.
 * Each edge here is its own curve, from its own neutral-axis direction.
 *
 * Moments carry the SHEET's sign: positive with the top face compressed —
 * "positivo tracciona fibra inferior". `sectionPoint` reports that state with
 * a negative Mnx, so it is flipped once, here.
 */
import { interactionCurve, type Bar, type Outline, type Materials } from './cirsoc201-section';

export interface DiagramPoint { m: number; n: number }

export interface DiagramSeries {
  /** The design diagram, capped at φPn(max). A closed loop. */
  capped: DiagramPoint[];
  /** The same section with no ceiling on the axial load. */
  uncapped: DiagramPoint[];
}

export function diagramSeries(
  outline: Outline, bars: readonly Bar[], mat: Materials, nPoints = 160,
): DiagramSeries {
  /* Top compressed: positive moment, from full compression down to tension. */
  const top = interactionCurve(outline, bars, mat, Math.PI / 2, nPoints);
  /* Bottom compressed: negative moment, walked back up so the loop closes. */
  const bottom = interactionCurve(outline, bars, mat, -Math.PI / 2, nPoints).reverse();
  const loop = [...top, ...bottom];
  return {
    capped: loop.map((p) => ({ m: -p.phiMnx, n: p.phiPn })),
    uncapped: loop.map((p) => ({ m: -p.phi * p.Mnx, n: p.phi * p.Pn })),
  };
}
