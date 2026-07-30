/**
 * Member force-orientation diagnostic.
 *
 * BACKGROUND (PR15 investigation)
 * ──────────────────────────────
 * The `rc-design-frame` example showed its 128 X-direction beams bending about
 * local y (My/Vz — correct for gravity under the canonical Z-up convention, where
 * `buildSolverInput3D` forces local z = global up) while its 120 Y-direction beams
 * bent about local z (Mz/Vy). A controlled equivalence test — identical geometry,
 * section, material and loading, one member along global X and one along global Y —
 * proved BOTH the app-side axis construction (`computeLocalAxes3D`) and the WASM
 * solver reconstruct the frame identically: gravity always lands in My/Vz.
 *
 * The divergence was therefore neither app-side nor solver-side: the FIXTURE
 * authored the Y-beams' gravity load in the local **y** component (`qYI`), which is
 * horizontal for every horizontal member, so those beams were loaded sideways.
 * That is fixed in the fixture. This module exists so the same class of error can
 * never again silently produce a "designed" member.
 *
 * The diagnostic is geometric and load-based, not a workaround: it never selects
 * whichever force component makes a candidate pass. A flagged member cannot be
 * certified (approved decision O6).
 *
 * Pure: no store access, no side effects.
 */

import { classifyElement } from '../codes/argentina/cirsoc201';
import { peakMy, peakMz } from './design-axes';
import type { ElementDesignDemands } from '../station-design-forces';
import type { ContextModelData } from './member-context';

export type OrientationIssueKind =
  /** A horizontal member with an upright section is bending about its weak axis. */
  | 'weakAxisGravityBending'
  /** A horizontal member carries a local-y (horizontal) distributed load and no
   *  local-z load — the signature of gravity authored in the wrong component. */
  | 'horizontalGravityLoad';

export interface OrientationIssue {
  elementId: number;
  kind: OrientationIssueKind;
  /** i18n key + params for user-facing text. */
  messageKey: string;
  params: Record<string, string | number>;
}

export interface OrientationDiagnosticResult {
  issues: OrientationIssue[];
  /** Element ids that must not be certified. */
  suspect: Set<number>;
}

/** A member is "horizontal" when its rise is a small fraction of its run. */
const HORIZONTAL_SLOPE_TOL = 0.15;
/** Section aspect above which "upright" is unambiguous (h/b). */
const UPRIGHT_ASPECT = 1.2;
/** Mz must exceed My by this factor before weak-axis bending is called out. */
const WEAK_AXIS_DOMINANCE = 2.0;
/** Ignore members whose moments are numerically negligible. */
const MOMENT_FLOOR = 1.0; // kN·m

/** Minimal load shape needed for the load-authoring check. */
export interface DiagnosticLoad {
  type: string;
  data: { elementId?: number; qYI?: number; qYJ?: number; qZI?: number; qZJ?: number };
}

export function runOrientationDiagnostic(
  model: ContextModelData,
  demands: Map<number, ElementDesignDemands> | undefined,
  loads?: readonly DiagnosticLoad[],
): OrientationDiagnosticResult {
  const issues: OrientationIssue[] = [];
  const suspect = new Set<number>();

  // ── Load-authoring check: horizontal member loaded in the horizontal local axis ──
  if (loads) {
    const byElement = new Map<number, { qY: number; qZ: number }>();
    for (const l of loads) {
      const eid = l.data?.elementId;
      if (eid === undefined) continue;
      if (l.type !== 'distributed3d' && l.type !== 'distributed') continue;
      const acc = byElement.get(eid) ?? { qY: 0, qZ: 0 };
      acc.qY += Math.abs(l.data.qYI ?? 0) + Math.abs(l.data.qYJ ?? 0);
      acc.qZ += Math.abs(l.data.qZI ?? 0) + Math.abs(l.data.qZJ ?? 0);
      byElement.set(eid, acc);
    }
    for (const [eid, q] of byElement) {
      if (q.qY <= 1e-9) continue;
      if (q.qZ > 1e-9) continue; // both components present — an intentional skew load
      const elem = model.elements.get(eid);
      if (!elem) continue;
      const nI = model.nodes.get(elem.nodeI);
      const nJ = model.nodes.get(elem.nodeJ);
      if (!nI || !nJ) continue;
      if (!isHorizontal(nI, nJ)) continue;
      suspect.add(eid);
      issues.push({
        elementId: eid, kind: 'horizontalGravityLoad',
        messageKey: 'design.orient.horizontalGravityLoad',
        params: { elementId: eid, qY: +q.qY.toFixed(2) },
      });
    }
  }

  // ── Weak-axis gravity bending check ──
  if (demands) {
    for (const [id, dd] of demands) {
      const elem = model.elements.get(id);
      if (!elem) continue;
      const nI = model.nodes.get(elem.nodeI);
      const nJ = model.nodes.get(elem.nodeJ);
      const sec = model.sections.get(elem.sectionId);
      if (!nI || !nJ || !sec?.b || !sec?.h) continue;
      if (!isHorizontal(nI, nJ)) continue;
      const cls = classifyElement(nI.x, nI.y, nI.z ?? 0, nJ.x, nJ.y, nJ.z ?? 0, sec.b, sec.h);
      if (cls !== 'beam') continue;
      // Only meaningful for an upright section: a genuinely wide-flat member has no
      // "weak axis" story to tell.
      if (sec.h / sec.b < UPRIGHT_ASPECT) continue;
      const my = peakMy(dd);
      const mz = peakMz(dd);
      if (mz < MOMENT_FLOOR) continue;
      if (mz <= my * WEAK_AXIS_DOMINANCE) continue;
      suspect.add(id);
      issues.push({
        elementId: id, kind: 'weakAxisGravityBending',
        messageKey: 'design.orient.weakAxisGravityBending',
        params: { elementId: id, mz: +mz.toFixed(1), my: +my.toFixed(1), b: sec.b, h: sec.h },
      });
    }
  }

  issues.sort((a, b) => a.elementId - b.elementId || a.kind.localeCompare(b.kind));
  return { issues, suspect };
}

function isHorizontal(
  nI: { x: number; y: number; z?: number },
  nJ: { x: number; y: number; z?: number },
): boolean {
  const dx = nJ.x - nI.x, dy = nJ.y - nI.y, dz = (nJ.z ?? 0) - (nI.z ?? 0);
  const run = Math.sqrt(dx * dx + dy * dy);
  if (run < 1e-9) return false;
  return Math.abs(dz) / run <= HORIZONTAL_SLOPE_TOL;
}
