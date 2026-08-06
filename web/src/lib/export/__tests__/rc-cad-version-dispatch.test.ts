/**
 * Which reader a document belongs to, and the four ways that question is answered wrongly.
 *
 * Version dispatch is the only part of a versioned interchange format that every consumer runs
 * before anything else, so it is the one place a mistake is guaranteed to matter. The committed
 * V1 fixture is used as the V1 case rather than a literal, because "the reader accepts the
 * document we actually shipped" is the claim worth making.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  dispatchHandoffVersion, RC_CAD_HANDOFF_V2_SCHEMA, RC_CAD_HANDOFF_V2_SCHEMA_VERSION,
  SUPPORTED_HANDOFF_VERSIONS,
} from '../rc-cad-handoff-v2-types';

const V1_FIXTURE = fileURLToPath(
  new URL('../__fixtures__/rc-footing-cad-poc.handoff.json', import.meta.url));

describe('accepting the two declared versions', () => {
  it('accepts the committed V1 document as V1', () => {
    const doc = JSON.parse(readFileSync(V1_FIXTURE, 'utf8'));
    // The frozen artefact still declares what it always declared.
    expect(doc.schema).toBe('RcCadHandoffV1');
    expect(doc.schemaVersion).toBe(1);
    expect(dispatchHandoffVersion(doc)).toEqual({ ok: true, version: 1 });
  });

  it('accepts a V2 envelope as V2', () => {
    const doc = { schema: RC_CAD_HANDOFF_V2_SCHEMA, schemaVersion: RC_CAD_HANDOFF_V2_SCHEMA_VERSION };
    expect(dispatchHandoffVersion(doc)).toEqual({ ok: true, version: 2 });
  });

  it('declares exactly the versions it accepts', () => {
    expect([...SUPPORTED_HANDOFF_VERSIONS]).toEqual([1, 2]);
  });
});

describe('refusing everything else, structurally', () => {
  it('refuses an unknown FUTURE version instead of reading what it recognises', () => {
    // The dangerous case: a V3 document has V2's fields plus more, so a lenient reader parses it
    // and is silently wrong about whatever V3 added.
    expect(dispatchHandoffVersion({ schema: 'RcCadHandoffV3', schemaVersion: 3 }))
      .toEqual({ ok: false, reason: 'UNSUPPORTED_VERSION', found: 3 });
  });

  it('refuses a version-0 or negative claim', () => {
    expect(dispatchHandoffVersion({ schema: 'RcCadHandoffV1', schemaVersion: 0 }).ok).toBe(false);
    expect(dispatchHandoffVersion({ schema: 'RcCadHandoffV1', schemaVersion: -1 }).ok).toBe(false);
  });

  it('refuses a document with no version at all', () => {
    expect(dispatchHandoffVersion({ schema: 'RcCadHandoffV1' }))
      .toEqual({ ok: false, reason: 'MISSING_VERSION', found: undefined });
    for (const bad of [{}, null, 'RcCadHandoffV2', 42, []]) {
      const r = dispatchHandoffVersion(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.reason).toBe('MISSING_VERSION');
    }
  });

  it('refuses a name and a version that disagree, in both directions', () => {
    // Neither field is trusted over the other. A document whose two self-descriptions conflict
    // is refused, because resolving it means picking one and being wrong half the time.
    expect(dispatchHandoffVersion({ schema: 'RcCadHandoffV1', schemaVersion: 2 }))
      .toEqual({ ok: false, reason: 'SCHEMA_NAME_MISMATCH', found: 'RcCadHandoffV1' });
    expect(dispatchHandoffVersion({ schema: 'RcCadHandoffV2', schemaVersion: 1 }))
      .toEqual({ ok: false, reason: 'SCHEMA_NAME_MISMATCH', found: 'RcCadHandoffV2' });
  });

  it('refuses a stringified version, rather than coercing it', () => {
    expect(dispatchHandoffVersion({ schema: 'RcCadHandoffV2', schemaVersion: '2' }))
      .toEqual({ ok: false, reason: 'MISSING_VERSION', found: '2' });
  });
});
