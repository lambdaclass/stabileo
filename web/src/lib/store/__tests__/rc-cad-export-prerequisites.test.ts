/**
 * When the CAD export must REFUSE.
 *
 * A manifest describing a cage the current model no longer produces is worse than no manifest,
 * because its revision stamps look authoritative and a reviewer has no way to tell. So the
 * refusals are as much a deliverable as the document, and each one names a condition the user
 * can act on rather than disabling a button without explanation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { detailingStore } from '../detailing.svelte';
import { verificationStore } from '../verification.svelte';
import { buildFootingCadHandoffV2, assemblyForFooting } from '../rc-cad-export';
import { runProductionChain, keyTranslate } from '../../export/__tests__/rc-cad-chain';

const FOOTING_ID = 1;

/** The refusal codes from an attempt that must fail. */
function refuse(footingId = FOOTING_ID): string[] {
  const out = buildFootingCadHandoffV2(footingId, keyTranslate);
  expect(out.ok, 'the export was expected to refuse').toBe(false);
  return out.ok ? [] : out.refusals.map((r) => r.code);
}

describe('a missing detailing block', () => {
  beforeEach(() => {
    modelStore.clear();
    detailingStore.clear();
  });

  it('refuses when the footing does not exist', () => {
    expect(refuse(999)).toEqual(['FOOTING_NOT_FOUND']);
  });

  it('refuses when nothing has been detailed yet', async () => {
    await runProductionChain();
    // Clear only the detailing, leaving the model and its design intact — the state a user is
    // in after editing geometry and before regenerating.
    detailingStore.clear();
    expect(refuse()).toEqual(['NO_ASSEMBLY']);
  }, 180_000);

  it('refuses when the detailing block holds no assembly for THIS footing', async () => {
    await runProductionChain();
    const persisted = modelStore.model.detailing!;
    // Keep a detailing block, drop the footing's assembly. A different footing's assembly must
    // never be picked up as a substitute.
    modelStore.model.detailing = {
      ...persisted,
      assemblies: persisted.assemblies.filter(
        (a) => !(a.families ?? []).some((r) => r.ownerId === `F${FOOTING_ID}`)),
    };
    expect(refuse()).toEqual(['NO_ASSEMBLY']);
  }, 180_000);
});

describe('a stale assembly', () => {
  it('refuses when the bars were generated against demands that have since moved', async () => {
    await runProductionChain();
    // Sanity: it exports before the demand moves.
    expect(buildFootingCadHandoffV2(FOOTING_ID, keyTranslate).ok).toBe(true);

    // Move the demand revision the way a real regulation change does. The assembly and its bars
    // are untouched, which is exactly the dangerous state: it still looks complete.
    const before = verificationStore.demandRevision;
    verificationStore.invalidateForCodeChange();
    expect(verificationStore.demandRevision).toBeGreaterThan(before);

    expect(refuse()).toEqual(['STALE_ASSEMBLY']);
  }, 180_000);

  it('names both revisions in the refusal, so the user knows what moved', async () => {
    await runProductionChain();
    const assembly = assemblyForFooting(FOOTING_ID, modelStore.model.detailing?.assemblies ?? [])!;
    verificationStore.invalidateForCodeChange();
    const out = buildFootingCadHandoffV2(FOOTING_ID, keyTranslate);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.refusals[0].params).toEqual({
      footing: 'Z1',
      generated: assembly.demandRevision,
      current: verificationStore.demandRevision,
    });
  }, 180_000);
});

describe('data that cannot determine the connection', () => {
  it('refuses a footing with no column reference rather than inventing a column', async () => {
    await runProductionChain();
    const f = modelStore.model.footings.get(FOOTING_ID)!;
    // Drop the reference without touching the assembly, so the refusal is about the missing
    // footprint and not about missing bars.
    modelStore.model.footings.set(FOOTING_ID, { ...f, columnElementId: undefined });
    expect(refuse()).toEqual(['NO_COLUMN_REFERENCE']);
  }, 180_000);

  it('refuses a plan eccentricity, because two readings of it disagree', async () => {
    await runProductionChain();
    const f = modelStore.model.footings.get(FOOTING_ID)!;
    // `Footing.eccentricityB` is documented as the offset of the footing CENTROID, while
    // `run-footing-design` uses node + eccentricity as the COLUMN centre. At zero the two
    // coincide; at 0,15 m they are different places and picking one would be a guess.
    modelStore.model.footings.set(FOOTING_ID, { ...f, eccentricityB: 0.15 });
    expect(refuse()).toEqual(['FOOTING_ECCENTRICITY_NOT_RESOLVED']);
  }, 180_000);

  it('refuses a pedestal, which is a third component with its own interfaces', async () => {
    await runProductionChain();
    const f = modelStore.model.footings.get(FOOTING_ID)!;
    modelStore.model.footings.set(FOOTING_ID, {
      ...f, pedestal: { B: 0.6, L: 0.6, height: 0.4 },
    });
    expect(refuse()).toEqual(['PEDESTAL_NOT_SUPPORTED']);
  }, 180_000);

  it('refuses a rotated footing rather than treating global axes as local ones', async () => {
    await runProductionChain();
    const f = modelStore.model.footings.get(FOOTING_ID)!;
    modelStore.model.footings.set(FOOTING_ID, { ...f, rotationDeg: 30 });
    expect(refuse()).toEqual(['FOOTING_ROTATION_NOT_RESOLVED']);
  }, 180_000);

  it('refuses when the assembly carries no dowels', async () => {
    await runProductionChain();
    const persisted = modelStore.model.detailing!;
    modelStore.model.detailing = {
      ...persisted,
      assemblies: persisted.assemblies.map((a) => ({
        ...a, bars: a.bars.filter((b) => b.role !== 'longitudinal'),
      })),
    };
    expect(refuse()).toEqual(['NO_COLUMN_DOWELS']);
  }, 180_000);

  it('refuses a cage bar whose family it cannot state', async () => {
    await runProductionChain();
    const persisted = modelStore.model.detailing!;
    modelStore.model.detailing = {
      ...persisted,
      assemblies: persisted.assemblies.map((a) => ({
        ...a,
        bars: a.bars.map((b, i) => (i === 0
          // A role this exporter maps to no family. Assigning it to an existing one would
          // misdescribe the steel, so the export stops instead.
          ? { ...b, role: 'diagonal' as unknown as typeof b.role }
          : b)),
      })),
    };
    const codes = refuse();
    expect(codes).toContain('UNCLASSIFIED_CAGE_BAR');
  }, 180_000);
});

describe('a successful export', () => {
  it('reports the filename and the byte length of what it wrote', async () => {
    await runProductionChain();
    const out = buildFootingCadHandoffV2(FOOTING_ID, keyTranslate);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.filename).toMatch(/^rc-cad-handoff-v2-Z1-det\d+-dem\d+\.json$/);
    // Bytes, not characters: the reported size must match the file on disk.
    expect(out.byteLength).toBe(new TextEncoder().encode(out.json).length);
    expect(JSON.parse(out.json)).toEqual(JSON.parse(JSON.stringify(out.handoff)));
  }, 180_000);
});
