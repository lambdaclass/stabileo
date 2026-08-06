/**
 * The committed golden V2 manifest — the artifact the CAD side actually consumes.
 *
 * ── Why this lives in its own file ──────────────────────────────
 *
 * `verificationStore.demandRevision` is a monotonic counter for the life of the process, so the
 * revision a manifest carries depends on how many design runs preceded it. Vitest isolates test
 * FILES, so the chain below is the first in a fresh worker and the manifest it produces is the one
 * a user's FIRST export produces, not whatever a suite of earlier cases left the counter at.
 *
 * Regenerate with:
 *   WRITE_MANIFEST_V2=1 npx vitest run src/lib/export/__tests__/rc-cad-handoff-v2-golden.test.ts
 *
 * Review the diff before committing. A change here is a change to the contract.
 *
 * ── These bytes are NOT the production download's bytes ─────────
 *
 * `runProductionChain` translates through `keyTranslate`, so every `text` field holds a raw i18n
 * key and its params. A real export passes the app's `tp` and those fields hold localized prose,
 * which makes the two documents semantically identical and byte-different by construction.
 * Localized display text is not a byte-comparison boundary: the contract a CAD consumer relies on
 * is the stable part — codes, message keys, params, ids, families, geometry, revisions, statuses
 * and certificate provenance — and that is what the assertions below pin.
 *
 * ── What the V1 golden still does ───────────────────────────────
 *
 * Nothing here touches it. `rc-footing-cad-poc.handoff.json` is frozen and its regression is
 * consumer-side, in `rc-cad-handoff-v1-frozen.test.ts`: parse, dispatch, schema, semantics. It is
 * no longer rebuilt from the live chain, because the live chain no longer produces a V1 subject.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildFootingCadHandoffV2 } from '../../store/rc-cad-export';
import { validateRcCadHandoffV2 } from '../rc-cad-handoff-v2-validate';
import { dispatchHandoffVersion } from '../rc-cad-handoff-v2-types';
import type { RcCadHandoffV2 } from '../rc-cad-handoff-v2-types';
import { runProductionChain, keyTranslate } from './rc-cad-chain';

const GOLDEN = fileURLToPath(
  new URL('../__fixtures__/rc-footing-cad-poc.handoff.v2.json', import.meta.url));

/**
 * The measured facts of the canonical fixture.
 *
 * Exact numbers, on purpose. A range would pass if the derivation quietly changed, and the whole
 * point of a golden is that it does not.
 */
const EXPECTED = {
  bars: 46,
  families: {
    columnDowel: 8,
    starterTie: 6,
    starterCrosstie: 12,
    footingBottomMatX: 10,
    footingBottomMatY: 10,
  },
  arcs: 62,
  marks: 6,
  collisionFindings: 0,
  spacingFindings: 4,
  /** The four mat/starter pairs, measured. */
  spacingMeasuredMm: 27.97,
  spacingRequiredMm: 40.0,
} as const;

let doc: RcCadHandoffV2;
let json: string;

beforeAll(async () => {
  await runProductionChain();
  const out = buildFootingCadHandoffV2(1, keyTranslate);
  if (!out.ok) {
    throw new Error(`export refused: ${JSON.stringify(out.refusals)} ${JSON.stringify(out.invalid)}`);
  }
  doc = out.handoff;
  json = out.json;
  if (process.env.WRITE_MANIFEST_V2 === '1') {
    writeFileSync(GOLDEN, json, 'utf8');
    // The checksum is written BESIDE the fixture and committed with it, so a regeneration shows
    // up as two changed files in review rather than as one file whose bytes nobody compared.
    writeFileSync(`${GOLDEN}.sha256`,
      `${createHash('sha256').update(json, 'utf8').digest('hex')}\n`, 'utf8');
  }
}, 180_000);

describe('the golden RcCadHandoffV2 manifest', () => {
  it('is committed, and the production chain reproduces its bytes exactly', () => {
    expect(existsSync(GOLDEN), `${GOLDEN} must be committed`).toBe(true);
    expect(json, 'produced manifest vs committed golden').toBe(readFileSync(GOLDEN, 'utf8'));
  });

  it('has the checksum the record states', () => {
    const sha = createHash('sha256').update(json, 'utf8').digest('hex');
    // Pinned so a silent regeneration cannot pass review as "no change".
    expect(sha).toBe(readFileSync(`${GOLDEN}.sha256`, 'utf8').trim());
  });

  it('dispatches as V2 and validates against its own schema and semantics', () => {
    expect(dispatchHandoffVersion(JSON.parse(json))).toEqual({ ok: true, version: 2 });
    const v = validateRcCadHandoffV2(doc);
    expect(v.schema, JSON.stringify(v.schema)).toEqual([]);
    expect(v.semantic, JSON.stringify(v.semantic)).toEqual([]);
  });

  it('carries the coordinated assembly, not the transfer cage', () => {
    expect(doc.schema).toBe('RcCadHandoffV2');
    expect(doc.schemaVersion).toBe(2);
    expect(doc.assembly.kind).toBe('footingReinforcementAssembly');
    expect(doc.assembly.completeness).toBe('bottomMatAndConnection');
  });

  it('carries every bar of all five families, and exactly them', () => {
    expect(doc.reinforcement.bars).toHaveLength(EXPECTED.bars);
    const byKind = new Map(doc.assembly.families.map((f) => [f.kind, f.barIds.length]));
    for (const [kind, n] of Object.entries(EXPECTED.families)) {
      expect(byKind.get(kind as never), kind).toBe(n);
    }
    // The counts add up to the document, so no family is missing and none double-counts.
    expect([...byKind.values()].reduce((a, b) => a + b, 0)).toBe(EXPECTED.bars);
    expect(doc.reinforcement.marks).toHaveLength(EXPECTED.marks);
    expect(doc.reinforcement.bars.flatMap((b) => b.segments.filter((s) => s.kind === 'arc')))
      .toHaveLength(EXPECTED.arcs);
  });

  it('states the resolved layer order and each mat direction once', () => {
    expect(doc.assembly.bottomMatLayerOrder)
      .toEqual({ lowerDirection: 'X', resolution: 'X_BELOW_Y' });
    const mx = doc.assembly.families.find((f) => f.kind === 'footingBottomMatX')!.mat!;
    const my = doc.assembly.families.find((f) => f.kind === 'footingBottomMatY')!.mat!;
    expect(mx.direction).toBe('X');
    expect(mx.layer).toBe('LOWER');
    expect(my.direction).toBe('Y');
    expect(my.layer).toBe('UPPER');
    // The two elevations are 16 mm apart — one lower-layer diameter — and the upper layer's
    // clear cover is larger by the same amount. Both measured, not assumed.
    expect((my.axisElevation - mx.axisElevation) * 1000).toBeCloseTo(16, 6);
    expect(mx.clearCoverToSoffit * 1000).toBeCloseTo(50, 6);
    expect(my.clearCoverToSoffit * 1000).toBeCloseTo(66, 6);
    for (const m of [mx, my]) {
      expect(m.regions).toHaveLength(1);
      expect(m.regions[0].kind).toBe('UNIFORM_FULL_WIDTH');
      expect(m.regions[0].barIds).toHaveLength(10);
    }
  });

  it('separates closed starter ties from crossties by legs contributed', () => {
    const tie = doc.assembly.families.find((f) => f.kind === 'starterTie')!.tie!;
    const cross = doc.assembly.families.find((f) => f.kind === 'starterCrosstie')!.tie!;
    expect(tie.legsContributed).toBe(2);
    expect(cross.legsContributed).toBe(1);
    expect(tie.stations.length).toBeGreaterThan(0);
    expect(cross.stations).toEqual(tie.stations);
  });

  it('reports zero interpenetrations and the four clear-spacing failures', () => {
    const collision = doc.checks.find((c) => c.checkKind === 'barCollision')!;
    expect(collision.evaluationStatus).toBe('EVALUATED');
    // A real result, not an absence: the starter hooks used to interpenetrate twelve ways.
    expect(collision.findings ?? []).toHaveLength(EXPECTED.collisionFindings);

    const spacing = doc.checks.find((c) => c.checkKind === 'barClearSpacing')!;
    expect(spacing.evaluationStatus).toBe('EVALUATED');
    const findings = spacing.findings ?? [];
    expect(findings).toHaveLength(EXPECTED.spacingFindings);
    for (const fnd of findings) {
      expect(fnd.pairClass).toBe('sameLayerSpacing');
      expect(fnd.severity).toBe('clearance');
      expect((fnd.measured ?? 0) * 1000).toBeCloseTo(EXPECTED.spacingMeasuredMm, 2);
      expect((fnd.required ?? 0) * 1000).toBeCloseTo(EXPECTED.spacingRequiredMm, 6);
      // A shortfall, not an overlap: clear concrete between the surfaces, and no
      // CONTACT_ALLOWANCE anywhere near it.
      expect(fnd.measured!).toBeGreaterThan(0);
      expect(fnd.measured!).toBeLessThan(fnd.required!);
    }
    // Each pair is one mat bar and one starter — the pairs V1 could not carry, because one of
    // the two bars was outside its declared scope.
    const ids = new Set(doc.reinforcement.bars.map((b) => b.id));
    for (const fnd of findings) {
      expect(ids.has(fnd.barIdA!)).toBe(true);
      expect(ids.has(fnd.barIdB!)).toBe(true);
      const pair = [fnd.barIdA!, fnd.barIdB!];
      expect(pair.some((id) => id.includes('mat')), pair.join('/')).toBe(true);
      expect(pair.some((id) => id.includes('dowel')), pair.join('/')).toBe(true);
    }
  });

  it('keeps the four statuses apart, with the producer’s own words', () => {
    expect(doc.statuses.constructible).toBe(false);
    expect(doc.statuses.constructibilityBlockers)
      .toEqual(['MAT_STARTER_CLEAR_SPACING_FAILURE']);
    expect(doc.statuses.bottomFlexure).toBe('OK');
    expect(doc.statuses.bottomMatGeometry).toBe('MODELED');
    // FAILED, explicitly. Not NOT_EVALUATED, not OK, not an optional warning: the record's own
    // anchorage outcome for this footing is a failure and the document says so.
    expect(doc.statuses.bottomAnchorage).toBe('FAILED');
    expect(doc.statuses.topReinforcement).toBe('NOT_EVALUATED');
    expect(doc.statuses.punchingMomentTransfer).toBe('UNSUPPORTED');
  });

  it('names every limitation as a coded condition', () => {
    const codes = doc.unsupported.map((u) => u.code);
    expect(codes).toContain('FOOTING_BOTTOM_MAT_MODELED');
    expect(codes).toContain('FOOTING_TOP_REINFORCEMENT_NOT_EVALUATED');
    expect(codes).toContain('PUNCHING_UNBALANCED_MOMENT_UNSUPPORTED');
    expect(codes).toContain('MAT_STARTER_CLEAR_SPACING_FAILURE');
    // And NOT the V1 condition that said the mats were drawing requirements rather than bars.
    expect(codes).not.toContain('FOOTING_MAT_GEOMETRY_NOT_MODELED');
  });

  it('is not presented as ready to build', () => {
    // The load-bearing negative. A consumer keying on `constructible` must find false, and no
    // field anywhere may claim complete footing reinforcement.
    expect(doc.statuses.constructible).toBe(false);
    expect(JSON.stringify(doc)).not.toContain('completeFootingReinforcement');
  });
});
