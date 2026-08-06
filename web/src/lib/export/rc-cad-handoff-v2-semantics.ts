/**
 * V2 semantic validation — meaning, not shape.
 *
 * ── Why this is a separate module from `-validate.ts` ────────────────
 *
 * `-validate.ts` imports the schema JSON, and a Playwright spec running under Node's ESM loader
 * cannot import a module that does that without an import attribute. V1 solved it the same way and
 * says so in its own header: the semantics module stays free of the JSON import so an E2E spec can
 * re-validate DOWNLOADED BYTES with the very modules the bundle was built from. That
 * independent re-check is the point — it catches drift between what the validator accepted in
 * memory and what actually landed on disk.
 *
 * Pure: no store, no runes, no i18n. Messages are developer-facing.
 */

import {
  validateRcCadHandoffSemantics, type SemanticViolation,
} from './rc-cad-handoff-semantics';

export type { SemanticViolation };

const MAT_KINDS = new Set(['footingBottomMatX', 'footingBottomMatY']);
const TIE_KINDS = new Set(['starterTie', 'starterCrosstie']);

interface FamilyShape {
  familyId?: unknown;
  kind?: unknown;
  barIds?: unknown;
  mat?: { direction?: unknown; layer?: unknown } | undefined;
  tie?: unknown;
}

/**
 * Meaning. Assumes nothing about shape: every access is guarded.
 *
 * ── Why V1's rules run first ────────────────────────────────────────
 *
 * V1's semantic layer carries thirty-nine rules — identifier uniqueness, mark quantities against
 * their bars, interface participants, check-to-requirement resolution, body dimensions, cover
 * scoping, the "no findings when NOT_EVALUATED" family — and every one of them reads a field V2
 * has identically, because V2 reuses V1's shapes for everything except the family item and the
 * statuses block. Reimplementing them here would have been a second, weaker copy: a first draft of
 * this module had fifteen rules and the V1 validation suite immediately showed the twenty-four it
 * had lost.
 *
 * The two V1 rules that are genuinely V1-scope-specific do not misfire, and that is checked rather
 * than assumed: `completeness.contradiction` fires only on `completeFootingReinforcement`, which
 * V2 never uses, and `completeness.missingCondition` only on `kind === 'footingTransferCage'`,
 * which V2 never is. So the whole list applies as written.
 */
/* eslint-disable-next-line complexity */
export function validateRcCadHandoffV2Semantics(doc: unknown): SemanticViolation[] {
  const out: SemanticViolation[] = [...validateRcCadHandoffSemantics(doc)];
  const violate = (rule: string, message: string) => out.push({ rule, message });
  if (typeof doc !== 'object' || doc === null) {
    violate('document.notAnObject', 'The document is not an object.');
    return out;
  }
  const d = doc as Record<string, unknown>;
  const assembly = (d.assembly ?? {}) as Record<string, unknown>;
  const families = Array.isArray(assembly.families)
    ? (assembly.families as FamilyShape[]) : [];
  const reinforcement = (d.reinforcement ?? {}) as Record<string, unknown>;
  const bars = Array.isArray(reinforcement.bars)
    ? (reinforcement.bars as Array<Record<string, unknown>>) : [];
  const statuses = (d.statuses ?? {}) as Record<string, unknown>;
  const checks = Array.isArray(d.checks) ? (d.checks as Array<Record<string, unknown>>) : [];

  // ── Families and bars resolve to each other, exactly once ────
  const barIds = new Set(bars.map((b) => String(b.id)));
  const familyIds = new Set(families.map((f) => String(f.familyId)));
  const timesClaimed = new Map<string, number>();
  for (const fam of families) {
    const ids = Array.isArray(fam.barIds) ? fam.barIds.map(String) : [];
    for (const id of ids) {
      timesClaimed.set(id, (timesClaimed.get(id) ?? 0) + 1);
      if (!barIds.has(id)) {
        violate('family.barNotInDocument',
          `Family ${String(fam.familyId)} lists bar ${id}, which is not in reinforcement.bars.`);
      }
    }
  }
  for (const b of bars) {
    const id = String(b.id);
    const fid = b.familyId === undefined ? '' : String(b.familyId);
    if (!familyIds.has(fid)) {
      violate('bar.familyNotDeclared',
        `Bar ${id} names familyId ${fid}, which no family declares.`);
    }
    const n = timesClaimed.get(id) ?? 0;
    if (n !== 1) {
      violate('bar.familyCountNotOne',
        `Bar ${id} is claimed by ${n} families; every bar belongs to exactly one.`);
    }
  }

  // ── A family's detail must match its kind ───────────────────
  for (const fam of families) {
    const kind = String(fam.kind);
    if (MAT_KINDS.has(kind) && fam.mat === undefined) {
      violate('family.matDetailMissing',
        `Family ${kind} carries no mat detail; direction, layer and regions are what make a mat `
        + 'family readable without inferring elevations.');
    }
    if (!MAT_KINDS.has(kind) && fam.mat !== undefined) {
      violate('family.matDetailOnNonMat', `Family ${kind} carries mat detail but is not a mat.`);
    }
    if (TIE_KINDS.has(kind) && fam.tie === undefined) {
      violate('family.tieDetailMissing', `Family ${kind} carries no tie detail.`);
    }
    if (!TIE_KINDS.has(kind) && fam.tie !== undefined) {
      violate('family.tieDetailOnNonTie', `Family ${kind} carries tie detail but is not a tie.`);
    }
    if (MAT_KINDS.has(kind) && fam.mat) {
      const expected = kind === 'footingBottomMatX' ? 'X' : 'Y';
      if (String(fam.mat.direction) !== expected) {
        violate('family.matDirectionMismatch',
          `Family ${kind} states direction ${String(fam.mat.direction)}; the two cannot disagree.`);
      }
    }
  }

  // ── The layer order and the families must agree ─────────────
  const order = assembly.bottomMatLayerOrder as { lowerDirection?: unknown } | null | undefined;
  const matFamilies = families.filter((f) => MAT_KINDS.has(String(f.kind)));
  if (order && order.lowerDirection !== undefined) {
    const lower = String(order.lowerDirection);
    for (const fam of matFamilies) {
      if (!fam.mat) continue;
      const dir = String(fam.mat.direction);
      const wanted = dir === lower ? 'LOWER' : 'UPPER';
      if (String(fam.mat.layer) !== wanted) {
        violate('assembly.layerOrderContradicted',
          `bottomMatLayerOrder says ${lower} is lower, so the ${dir} family must be ${wanted}; `
          + `it says ${String(fam.mat.layer)}.`);
      }
    }
  } else if (matFamilies.length > 0) {
    violate('assembly.layerOrderMissing',
      'Mat families are present but bottomMatLayerOrder is null; which layer is underneath is '
      + 'then unstated and a consumer would have to cluster elevations to recover it.');
  }

  // ── Completeness, mat presence and the mat status agree ─────
  const completeness = String(assembly.completeness);
  const matStatus = String(statuses.bottomMatGeometry);
  if (completeness === 'bottomMatAndConnection' && matFamilies.length === 0) {
    violate('assembly.completenessClaimsMats',
      'completeness is bottomMatAndConnection and no mat family is present.');
  }
  if (completeness === 'connectionOnly' && matFamilies.length > 0) {
    violate('assembly.completenessDeniesMats',
      'completeness is connectionOnly and mat families are present.');
  }
  if (matStatus === 'MODELED' && matFamilies.length === 0) {
    violate('statuses.matModeledWithoutFamilies',
      'bottomMatGeometry is MODELED and no mat family carries the bars.');
  }
  if (matStatus !== 'MODELED' && matFamilies.length > 0) {
    violate('statuses.matFamiliesWithoutModeled',
      `bottomMatGeometry is ${matStatus} while mat families carry bars.`);
  }

  // ── The verdict and its causes agree ────────────────────────
  const constructible = statuses.constructible;
  const blockers = Array.isArray(statuses.constructibilityBlockers)
    ? statuses.constructibilityBlockers : [];
  if (constructible === false && blockers.length === 0) {
    violate('statuses.unexplainedFailure',
      'constructible is false with no blocker named; a verdict nobody can act on.');
  }
  if (constructible === true && blockers.length > 0) {
    violate('statuses.blockedButConstructible',
      `constructible is true while ${blockers.length} blocker(s) are named.`);
  }

  const findingsOf = (kind: string) => {
    const c = checks.find((x) => x.checkKind === kind);
    return Array.isArray(c?.findings) ? (c!.findings as Array<Record<string, unknown>>) : [];
  };
  const spacingFindings = findingsOf('barClearSpacing');
  const collisionFindings = findingsOf('barCollision');
  if ((spacingFindings.length > 0 || collisionFindings.length > 0) && constructible !== false) {
    violate('statuses.cleanPassWithFindings',
      `${spacingFindings.length + collisionFindings.length} measured finding(s) with `
      + 'constructible not false. This is the clean-pass claim V2 exists to prevent.');
  }

  // ── A finding may only name bars this document carries ──────
  //
  // V1's rule, and the reason V1 could not carry these four findings at all: one of the two bars
  // was a mat bar, outside its scope. In V2 both are here, so the rule is satisfiable rather than
  // a reason to drop them.
  for (const c of checks) {
    const fs = Array.isArray(c.findings) ? (c.findings as Array<Record<string, unknown>>) : [];
    for (const fnd of fs) {
      for (const key of ['barIdA', 'barIdB'] as const) {
        const id = fnd[key];
        if (id !== undefined && !barIds.has(String(id))) {
          violate('finding.barNotInDocument',
            `Check ${String(c.checkId)} reports a finding naming ${String(id)}, which is not in `
            + 'reinforcement.bars.');
        }
      }
    }
  }

  return out;
}
