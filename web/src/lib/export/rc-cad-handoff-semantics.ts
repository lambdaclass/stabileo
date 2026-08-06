/**
 * The SEMANTIC half of `RcCadHandoffV1` validation — does the document MEAN something coherent?
 *
 * Kept apart from the schema half for one concrete reason: this module imports no JSON, so it can
 * be loaded by any runner. The schema half must import `rc-cad-handoff.schema.json`, and a JSON
 * import is not portable across every toolchain the repo runs (Vite resolves it, a bare Node
 * loader demands an import attribute). Splitting them means the honesty rules below can be
 * exercised from a Playwright spec against a downloaded file, which is where they matter most.
 *
 * The split is also the right one on its own terms. Shape and meaning are different questions: a
 * document can be perfectly shaped and still claim something false. Three refusals here carry the
 * weight:
 *
 *   * a `completeFootingReinforcement` claim while an unsupported condition states the mats are
 *     not modelled — the claim this whole POC exists not to make;
 *   * a footing cover requirement scoped onto the column stub — applying a footing's number to a
 *     component whose cover nobody evaluated;
 *   * a containment or cover PASS while Stabileo's own status is NOT_EVALUATED — the exact
 *     conversion the deferred-cover decision forbids.
 *
 * Pure: no store, no runes, no i18n. Messages here are developer-facing.
 */

import {
  CODE_FOOTING_MAT_NOT_MODELED,
  type RcCadHandoffV1,
} from './rc-cad-handoff-types';

export interface SemanticViolation {
  /** Stable rule identifier, so a test asserts on the rule rather than on its wording. */
  rule: string;
  message: string;
}

/**
 * Meaning.
 *
 * Takes `unknown` and narrows defensively, so it can be run on a downloaded file that has not
 * been schema-checked first without throwing on a missing field.
 */
export function validateRcCadHandoffSemantics(doc: unknown): SemanticViolation[] {
  const out: SemanticViolation[] = [];
  const fail = (rule: string, message: string) => out.push({ rule, message });
  if (!doc || typeof doc !== 'object') {
    fail('document.object', 'the document is not an object');
    return out;
  }
  const d = doc as Partial<RcCadHandoffV1>;

  const bodies = d.concrete?.bodies ?? [];
  const interfaces = d.concrete?.interfaces ?? [];
  const bars = d.reinforcement?.bars ?? [];
  const marks = d.reinforcement?.marks ?? [];
  const families = d.assembly?.families ?? [];
  const checks = d.checks ?? [];
  const coverReqs = d.requirements?.cover ?? [];
  const clearReqs = d.requirements?.clearSpacing ?? [];
  const unsupported = d.unsupported ?? [];

  // ── 1. Unique identity ──────────────────────────────────────
  //
  // A duplicate id is worse than a missing one: two objects answer to the same key and a
  // review annotation lands on whichever the consumer happened to index last.
  const unique = (rule: string, label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) fail(rule, `duplicate ${label} id "${id}"`);
      seen.add(id);
    }
    return seen;
  };
  const bodyIds = unique('unique.bodyId', 'concrete body', bodies.map((b) => b.bodyId));
  const ifaceIds = unique('unique.interfaceId', 'interface', interfaces.map((i) => i.interfaceId));
  const barIds = unique('unique.barId', 'bar', bars.map((b) => b.id));
  const familyIds = unique('unique.familyId', 'family', families.map((f) => f.familyId));
  unique('unique.checkId', 'check', checks.map((c) => c.checkId));
  const requirementIds = unique('unique.requirementId', 'requirement',
    [...coverReqs.map((r) => r.requirementId), ...clearReqs.map((r) => r.requirementId)]);
  unique('unique.markId', 'mark', marks.map((m) => m.mark));
  unique('unique.findingId', 'finding',
    checks.flatMap((c) => (c.findings ?? []).map((x) => x.findingId)));

  // ── 2. References resolve ───────────────────────────────────
  const needBody = (rule: string, id: string, where: string) => {
    if (!bodyIds.has(id)) fail(rule, `${where} references unknown body "${id}"`);
  };
  const needBar = (rule: string, id: string, where: string) => {
    if (!barIds.has(id)) fail(rule, `${where} references unknown bar "${id}"`);
  };
  const needIface = (rule: string, id: string, where: string) => {
    if (!ifaceIds.has(id)) fail(rule, `${where} references unknown interface "${id}"`);
  };

  for (const b of bars) {
    if (!familyIds.has(b.familyId)) {
      fail('resolve.bar.family', `bar "${b.id}" claims unknown family "${b.familyId}"`);
    }
  }
  for (const fam of families) {
    for (const id of fam.barIds) needBar('resolve.family.bar', id, `family "${fam.familyId}"`);
  }
  for (const m of marks) {
    for (const id of m.barIds) needBar('resolve.mark.bar', id, `mark "${m.mark}"`);
  }
  // Every bar must be in exactly one family, and every family bar must exist. Without the
  // first, a bar with no stated purpose rides along in a document whose whole point is that
  // the purpose is stated.
  const familyOfBar = new Map<string, string[]>();
  for (const fam of families) {
    for (const id of fam.barIds) {
      familyOfBar.set(id, [...(familyOfBar.get(id) ?? []), fam.familyId]);
    }
  }
  for (const b of bars) {
    const owners = familyOfBar.get(b.id) ?? [];
    if (owners.length === 0) fail('family.coverage', `bar "${b.id}" belongs to no family`);
    if (owners.length > 1) {
      fail('family.exclusive', `bar "${b.id}" belongs to ${owners.length} families`);
    }
    if (owners.length === 1 && owners[0] !== b.familyId) {
      fail('family.agreement',
        `bar "${b.id}" names family "${b.familyId}" but is listed under "${owners[0]}"`);
    }
  }

  for (const c of checks) {
    for (const id of c.requirementIds ?? []) {
      if (!requirementIds.has(id)) {
        fail('resolve.check.requirement',
          `check "${c.checkId}" references unknown requirement "${id}"`);
      }
    }
    for (const id of c.scope?.bodyIds ?? []) needBody('resolve.check.body', id, `check "${c.checkId}"`);
    for (const id of c.scope?.barIds ?? []) needBar('resolve.check.bar', id, `check "${c.checkId}"`);
    for (const id of c.scope?.interfaceIds ?? []) {
      needIface('resolve.check.interface', id, `check "${c.checkId}"`);
    }
    for (const fnd of c.findings ?? []) {
      for (const id of [fnd.barIdA, fnd.barIdB]) {
        if (id !== undefined) needBar('resolve.finding.bar', id, `finding "${fnd.findingId}"`);
      }
    }
  }
  for (const r of clearReqs) {
    for (const id of [r.barIdA, r.barIdB]) {
      if (id !== undefined) needBar('resolve.requirement.bar', id, `requirement "${r.requirementId}"`);
    }
  }
  for (const r of coverReqs) {
    for (const id of r.appliesToBodyIds ?? []) {
      needBody('resolve.requirement.body', id, `requirement "${r.requirementId}"`);
    }
    for (const id of r.appliesToBarIds ?? []) {
      needBar('resolve.requirement.bar', id, `requirement "${r.requirementId}"`);
    }
    if (r.measurementScope?.withinBodyId) {
      needBody('resolve.requirement.scopeBody', r.measurementScope.withinBodyId,
        `requirement "${r.requirementId}" measurement scope`);
    }
    for (const id of r.measurementScope?.excludeInterfaceIds ?? []) {
      needIface('resolve.requirement.scopeInterface', id,
        `requirement "${r.requirementId}" measurement scope`);
    }
  }

  // ── 3. Interfaces describe a real contact ───────────────────
  for (const i of interfaces) {
    const { belowBodyId, aboveBodyId } = i.participants ?? { belowBodyId: '', aboveBodyId: '' };
    needBody('interface.participant', belowBodyId, `interface "${i.interfaceId}"`);
    needBody('interface.participant', aboveBodyId, `interface "${i.interfaceId}"`);
    if (belowBodyId === aboveBodyId) {
      fail('interface.distinct',
        `interface "${i.interfaceId}" joins body "${belowBodyId}" to itself`);
    }
    const below = bodies.find((b) => b.bodyId === belowBodyId);
    const above = bodies.find((b) => b.bodyId === aboveBodyId);
    const e = i.geometry?.elevation;
    if (below && above && typeof e === 'number') {
      // The plane must actually be where the two solids meet, within a micron. A contact
      // declared somewhere else is not a contact.
      const belowTop = below.shape.centre.z + below.shape.height / 2;
      const aboveBase = above.shape.centre.z - above.shape.height / 2;
      if (Math.abs(belowTop - e) > 1e-6) {
        fail('interface.elevation',
          `interface "${i.interfaceId}" at z=${e} is not the top of "${belowBodyId}" (${belowTop})`);
      }
      if (Math.abs(aboveBase - e) > 1e-6) {
        fail('interface.elevation',
          `interface "${i.interfaceId}" at z=${e} is not the base of "${aboveBodyId}" (${aboveBase})`);
      }
    }
    // Intentional passage must name a real interface — it does, structurally — and real bars.
    for (const id of i.intentionalBarPassage?.barIds ?? []) {
      needBar('passage.bar', id, `intentional passage across "${i.interfaceId}"`);
    }
    if (i.intentionalBarPassage && i.intentionalBarPassage.barIds.length === 0) {
      fail('passage.nonEmpty',
        `interface "${i.interfaceId}" declares an intentional passage with no bars`);
    }
  }

  // ── 4. Geometry is finite and describes a solid ─────────────
  const finitePoint = (rule: string, p: { x: number; y: number; z: number } | undefined,
    where: string) => {
    if (!p) return;
    for (const [axis, v] of [['x', p.x], ['y', p.y], ['z', p.z]] as const) {
      if (!Number.isFinite(v)) fail(rule, `${where} has non-finite ${axis} (${String(v)})`);
    }
  };
  for (const b of bodies) {
    const s = b.shape;
    for (const [name, v] of [['B', s?.B], ['L', s?.L], ['height', s?.height]] as const) {
      if (!(typeof v === 'number' && Number.isFinite(v) && v > 0)) {
        fail('body.dimension', `body "${b.bodyId}" has ${name}=${String(v)}, which is not a positive length`);
      }
    }
    finitePoint('body.centre', s?.centre, `body "${b.bodyId}" centre`);
    if (!Number.isFinite(s?.rotationDeg)) {
      fail('body.rotation', `body "${b.bodyId}" has a non-finite rotation`);
    }
  }
  for (const i of interfaces) {
    finitePoint('interface.centre', i.geometry?.centre, `interface "${i.interfaceId}" centre`);
    if (!Number.isFinite(i.geometry?.elevation)) {
      fail('interface.elevationFinite', `interface "${i.interfaceId}" has a non-finite elevation`);
    }
  }

  for (const b of bars) {
    if (!(b.diameterMm > 0)) {
      fail('bar.diameter', `bar "${b.id}" has diameter ${b.diameterMm}, which is not positive`);
    }
    if (!(b.cuttingLength > 0)) {
      fail('bar.cuttingLength', `bar "${b.id}" has cutting length ${b.cuttingLength}`);
    }
    if ((b.segments ?? []).length === 0) fail('bar.segments', `bar "${b.id}" has no segments`);
    (b.segments ?? []).forEach((s, k) => {
      const at = `bar "${b.id}" segment ${k}`;
      finitePoint('segment.point', s.start, `${at} start`);
      finitePoint('segment.point', s.end, `${at} end`);
      if (!(s.length > 0)) fail('segment.length', `${at} has length ${s.length}`);
      if (s.kind !== 'arc') {
        // A straight segment carrying arc data is a contradiction the consumer would have to
        // guess its way out of.
        if (s.centre || s.radius !== undefined || s.sweepDeg !== undefined) {
          fail('segment.straightWithArcData', `${at} is straight but carries arc data`);
        }
        return;
      }
      if (!(typeof s.radius === 'number' && s.radius > 0)) {
        fail('segment.arcRadius', `${at} is an arc with radius ${String(s.radius)}`);
      }
      // THE exactness rule. An arc without a centre is not reconstructable beyond its chord,
      // so silence here would be a claim of exactness that the data does not support.
      if (s.centre) {
        finitePoint('segment.arcCentre', s.centre, `${at} centre`);
        if (s.arcApproximated === true) {
          fail('segment.arcClaim', `${at} has an exact centre but is flagged as approximated`);
        }
      } else if (s.arcApproximated !== true) {
        fail('segment.arcClaim',
          `${at} is an arc with no centre and must set arcApproximated: true`);
      }
    });
  }
  for (const m of marks) {
    if (!(m.quantity >= 1)) fail('mark.quantity', `mark "${m.mark}" has quantity ${m.quantity}`);
    if (m.quantity !== m.barIds.length) {
      fail('mark.quantityMatchesBars',
        `mark "${m.mark}" states quantity ${m.quantity} but lists ${m.barIds.length} bars`);
    }
  }

  // ── 5. The completeness claim ───────────────────────────────
  const matNotModelled = unsupported.some((n) => n.code === CODE_FOOTING_MAT_NOT_MODELED);
  if (d.assembly?.completeness === 'completeFootingReinforcement' && matNotModelled) {
    fail('completeness.contradiction',
      `the assembly claims completeFootingReinforcement while ${CODE_FOOTING_MAT_NOT_MODELED} is `
      + 'declared as an unsupported condition');
  }
  if (d.assembly?.kind === 'footingTransferCage' && !matNotModelled) {
    // The condition is not decoration. A transfer cage that does not say the mats are missing
    // reads as the footing's whole reinforcement.
    fail('completeness.missingCondition',
      `a footingTransferCage must declare ${CODE_FOOTING_MAT_NOT_MODELED} in unsupported[]`);
  }

  // ── 6. Cover scoping ────────────────────────────────────────
  const stubIds = new Set(bodies.filter((b) => b.role === 'supportedColumn').map((b) => b.bodyId));
  for (const r of coverReqs) {
    if (r.elementType !== 'footing') continue;
    for (const id of r.appliesToBodyIds ?? []) {
      if (stubIds.has(id)) {
        fail('cover.notOnColumnStub',
          `footing cover requirement "${r.requirementId}" is applied to column stub "${id}"`);
      }
    }
    if (r.measurementScope && stubIds.has(r.measurementScope.withinBodyId)) {
      fail('cover.notOnColumnStub',
        `footing cover requirement "${r.requirementId}" is measured inside column stub `
        + `"${r.measurementScope.withinBodyId}"`);
    }
    // An internal contact is not an exposed face. If the document declares an interface and the
    // requirement does not exclude it, a consumer measuring "cover" would measure to the
    // column — and every dowel would fail.
    const scoped = new Set(r.measurementScope?.excludeInterfaceIds ?? []);
    for (const i of interfaces) {
      const touchesBody = (r.appliesToBodyIds ?? []).includes(i.participants.belowBodyId)
        || (r.appliesToBodyIds ?? []).includes(i.participants.aboveBodyId);
      if (touchesBody && !scoped.has(i.interfaceId)) {
        fail('cover.excludesInterface',
          `cover requirement "${r.requirementId}" does not exclude interface "${i.interfaceId}", `
          + 'so an internal contact would be measured as an exposed face');
      }
    }
  }

  // ── 7. No verdict Stabileo did not reach ────────────────────
  for (const c of checks) {
    if (c.evaluationStatus === 'NOT_EVALUATED') {
      if (!c.notEvaluatedReason || c.notEvaluatedReason.trim() === '') {
        fail('check.reasonRequired',
          `check "${c.checkId}" is NOT_EVALUATED without a reason`);
      }
      if ((c.findings ?? []).length > 0) {
        fail('check.noFindingsWhenNotEvaluated',
          `check "${c.checkId}" is NOT_EVALUATED but carries ${c.findings!.length} findings, `
          + 'which would read as a completed evaluation');
      }
      if (c.authority === 'stabileo') {
        fail('check.authorityWithoutEvaluation',
          `check "${c.checkId}" claims Stabileo authority but was not evaluated`);
      }
      if (c.consumerObservationPolicy === 'MAY_CROSS_CHECK') {
        // There is nothing to cross-check against. Permitting it invites a consumer to
        // present its own measurement as agreement with a verdict that does not exist.
        fail('check.noCrossCheckWithoutVerdict',
          `check "${c.checkId}" was not evaluated, so MAY_CROSS_CHECK has no verdict to compare `
          + 'against; use MAY_OBSERVE_NOT_COMPARABLE or OUT_OF_SCOPE');
      }
    } else {
      if (c.authority !== 'stabileo') {
        fail('check.evaluatedNeedsAuthority',
          `check "${c.checkId}" is EVALUATED but claims authority "${c.authority}"`);
      }
      if (c.notEvaluatedReason !== undefined || c.notEvaluatedCode !== undefined) {
        fail('check.reasonOnEvaluated',
          `check "${c.checkId}" is EVALUATED but carries a not-evaluated reason`);
      }
    }
  }
  // Containment specifically: this release has no production containment checker, so a
  // containment check that claims a Stabileo verdict is wrong by construction.
  for (const c of checks) {
    if (c.checkKind !== 'reinforcementContainment') continue;
    if (c.evaluationStatus === 'EVALUATED' || c.authority === 'stabileo') {
      fail('containment.notEvaluatedInThisRelease',
        `check "${c.checkId}" reports a containment verdict; Stabileo has no production `
        + 'containment checker, so containment must be NOT_EVALUATED with authority "none"');
    }
  }
  // Every concrete body must have a cover check of its own, so a component nobody evaluated
  // cannot inherit another's status by omission.
  for (const b of bodies) {
    const covered = checks.some((c) => c.checkKind === 'concreteCover'
      && (c.scope?.bodyIds ?? []).includes(b.bodyId));
    if (!covered) {
      fail('cover.perBodyCheck',
        `no concreteCover check is scoped to body "${b.bodyId}", so its cover status is unstated`);
    }
  }

  return out;
}

