/**
 * The committed golden manifest — the artifact the CAD side actually consumes.
 *
 * ── Why this lives in its own file ──────────────────────────────
 *
 * `verificationStore.demandRevision` is a monotonic counter for the life of the process, so the
 * revision a manifest carries depends on how many design runs preceded it. Vitest isolates test
 * FILES, so the chain below is the first in a fresh worker and the manifest it produces is the one
 * a user's FIRST export produces — `demand: 2`, not whatever a suite of earlier cases happened to
 * leave the counter at.
 *
 * That is not a technicality. A golden fixture that carried a revision no real first export ever
 * reaches would be a contract sample nobody could reproduce, and reproducing it is the entire
 * point: Decision 2A makes this file a shared fixture, so the consumer keeps a copy and any
 * divergence surfaces as a fixture diff rather than as a mysterious import failure.
 *
 * Regenerate with:
 *   WRITE_MANIFEST=1 npx vitest run src/lib/export/__tests__/rc-cad-handoff-golden.test.ts
 *
 * Review the diff before committing. A change here is a change to the contract.
 *
 * ── This file's bytes are NOT the production download's bytes ──
 *
 * `runProductionChain` translates through `keyTranslate`, so every `text` field here holds a
 * raw i18n key and its params. A real export passes the app's `tp` and those same fields hold
 * localized prose, which makes the two documents semantically identical and byte-different by
 * construction. Neither is a defect in the other, and locale-dependent display text is not a
 * byte-comparison boundary: the contract a CAD consumer relies on is the stable part — codes,
 * message keys, params, ids, geometry, revisions, and certificate provenance.
 *
 * `e2e/rc-cad-production-download.spec.ts` is the other half of this pair. It drives the real
 * controls and asserts that stable part, which is where the empty `certificate.verifierId` was
 * found: this chain passes a verifier explicitly, so it could never have seen it.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildFootingCadHandoff } from '../../store/rc-cad-export';
import { validateRcCadHandoff } from '../rc-cad-handoff-validate';
import { rcCadHandoffFilename } from '../rc-cad-handoff';
import type { RcCadHandoffV1 } from '../rc-cad-handoff-types';
import { dispatchHandoffVersion } from '../rc-cad-handoff-v2-types';
import { runProductionChain, fixtureText, keyTranslate } from './rc-cad-chain';

const GOLDEN = fileURLToPath(
  new URL('../__fixtures__/rc-footing-cad-poc.handoff.json', import.meta.url));

/** The numbers the PR record states. Asserted, so the record cannot drift from the file. */
const REPORTED = {
  byteLength: 88101,
  sha256: '795e9de26f2eb8ce8d51f2ac7130336702fc534588f390071e3bd40bc03aa0e7',
  fixtureSha256: '15ce4e150919bf8f91ef1e3fae36dcde584b770fea45861465742654153e3e79',
};

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('the frozen RcCadHandoffV1 manifest', () => {
  /**
   * FROZEN, and no longer rebuilt from the live chain.
   *
   * V1 declares two reinforcement families and the live chain now produces five: PR18 made the
   * footing's bottom mat physical steel, so the current assembly is not a V1 subject and V1's
   * builder refuses it by name — `INPUT_NOT_V1_COMPATIBLE`. Regenerating this golden is therefore
   * impossible, which is precisely what "frozen" has to mean for a shipped interchange contract:
   * the bytes are the artifact, and their regression is a CONSUMER-side one.
   *
   * So these bars are still parsed, dispatched, schema-validated and semantically validated —
   * everything a consumer with an old V1 document on disk does — and nothing rebuilds them. The
   * live chain's coverage moved to `rc-cad-handoff-v2-golden.test.ts`.
   */
  it('is committed, unchanged, and still refused by the live V1 builder', async () => {
    expect(existsSync(GOLDEN), 'the golden manifest must be committed').toBe(true);

    // The live chain no longer produces a V1 subject, and V1 says so rather than describing mat
    // bars as column dowels or dropping them. This is the assertion that makes the freeze real:
    // if V1 ever silently accepted this input again, the refusal would be gone and so would the
    // guarantee that a V1 document means what V1 says it means.
    await runProductionChain();
    const out = buildFootingCadHandoff(1, keyTranslate);
    expect(out.ok, 'V1 must refuse the coordinated assembly').toBe(false);
    if (out.ok) return;
    expect(out.refusals.map((r) => r.code)).toContain('INPUT_NOT_V1_COMPATIBLE');
    const refusal = out.refusals.find((r) => r.code === 'INPUT_NOT_V1_COMPATIBLE')!;
    expect(refusal.messageKey).toBe('footing.cad.refusal.incompatibleWithV1');
    // Named families, so the remedy is obvious: export V2.
    expect(String(refusal.params!.families)).toBe(
      'footingBottomMatX, footingBottomMatY, starterCrosstie');
    expect(refusal.params!.bars).toBe(32);
  }, 180_000);

  it('dispatches as V1, so an old document on disk still reaches the V1 reader', () => {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    expect(dispatchHandoffVersion(golden)).toEqual({ ok: true, version: 1 });
  });

  it('the committed golden is valid on both layers', () => {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as RcCadHandoffV1;
    const v = validateRcCadHandoff(golden);
    expect(v.schema, 'schema violations').toEqual([]);
    expect(v.semantic, 'semantic violations').toEqual([]);
  });

  it('states its own identity, size and checksum', () => {
    const text = readFileSync(GOLDEN, 'utf8');
    const golden = JSON.parse(text) as RcCadHandoffV1;
    expect(golden.schema).toBe('RcCadHandoffV1');
    expect(golden.schemaVersion).toBe(1);
    expect(golden.generator).toEqual({ name: 'stabileo-rc-cad-handoff', version: '1.0.0' });
    expect(rcCadHandoffFilename(golden)).toBe('rc-cad-handoff-Z1-det3-dem2.json');
    expect(new TextEncoder().encode(text).length).toBe(REPORTED.byteLength);
    expect(sha256(text)).toBe(REPORTED.sha256);
    // And the source it was derived from, so the pair can be reconciled without guesswork.
    expect(sha256(fixtureText())).toBe(REPORTED.fixtureSha256);
  });
});
