/**
 * Generator + restoration proof for the canonical PR19 CAD footing project.
 *
 * The fixture is built ONLY through production paths:
 *
 *   modelStore.loadExample('rc-design-qa-8')   the production example loader
 *   modelStore.addSoilProfile / updateSoilProfile
 *   modelStore.addFooting / updateFooting      the actions FoundationsPanel.svelte calls
 *   serializeProject()                         the production .ded writer
 *
 * and it is read back through `deserializeProject()` -> `modelStore.restore()`, which is the
 * only path that actually exercises snapshot restoration. `templates/fixtures/*.json` is
 * replayed by `loadFixture` instead and never reaches `restore()`, which is why the canonical
 * fixture is a `.ded` DedalFile rather than a bare model JSON.
 *
 * Regenerate with:  WRITE_FIXTURE=1 npx vitest run src/lib/templates/__tests__/generate-rc-footing-cad-fixture.test.ts
 *
 * The fixture carries the timestamp the production serializer produces. That is deliberate:
 * nothing is patched to force a fixed timestamp, so determinism is asserted on the CAD handoff
 * downstream, never on repeated project saves.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { modelStore } from '../../store/model.svelte';
import { serializeProject, deserializeProject } from '../../store/file';

const FIXTURE_URL = new URL('../__fixtures__/rc-footing-cad-poc.ded.json', import.meta.url);
const FIXTURE_PATH = fileURLToPath(FIXTURE_URL);

/** Footing and soil inputs. Illustrative, in-domain values — NOT project-derived. */
const INPUTS = {
  soilName: 'Arena densa (ilustrativo)',
  allowableBearingKPa: 250,
  provenance: { source: 'assumed' as const, reference: 'POC PR19 — valor ilustrativo' },
  footingName: 'Z1',
  B: 2.0,
  L: 2.0,
  thickness: 0.5,
  /** Read back from the model by the exporter. Never hard-coded downstream. */
  cover: 0.05,
  foundingElevation: -1.2,
};

/** The vertical element rising from the founded node — the column the footing supports. */
function columnElementIdAt(nodeId: number): number {
  const nodes = modelStore.model.nodes;
  const cands = [...modelStore.model.elements.values()].filter(
    (e) => e.nodeI === nodeId || e.nodeJ === nodeId,
  );
  const vertical = cands.filter((e) => {
    const a = nodes.get(e.nodeI); const b = nodes.get(e.nodeJ);
    if (!a || !b) return false;
    const dz = Math.abs((b.z ?? 0) - (a.z ?? 0));
    const dxy = Math.hypot((b.x ?? 0) - (a.x ?? 0), (b.y ?? 0) - (a.y ?? 0));
    return dz > dxy;
  });
  expect(vertical.length, 'the founded node must carry a column for the footing to check')
    .toBeGreaterThan(0);
  return vertical.sort((x, y) => x.id - y.id)[0].id;
}

/** The lowest fully-fixed support node, chosen dynamically because loadFixture remaps ids. */
function groundSupportNodeId(): number {
  const supports = [...modelStore.model.supports.values()];
  const nodes = modelStore.model.nodes;
  const fixed = supports.filter((s) => String(s.type).startsWith('fixed'));
  expect(fixed.length, 'base fixture must provide a fixed support to found on').toBeGreaterThan(0);
  const withZ = fixed
    .map((s) => ({ id: s.nodeId, z: nodes.get(s.nodeId)?.z ?? 0 }))
    .sort((a, b) => a.z - b.z || a.id - b.id);
  return withZ[0].id;
}

async function buildProject(): Promise<{ ded: string; nodeId: number; footingId: number }> {
  modelStore.clear();
  await modelStore.loadExample('rc-design-qa-8');

  const nodeId = groundSupportNodeId();

  const profileId = modelStore.addSoilProfile(INPUTS.soilName);
  modelStore.updateSoilProfile(profileId, {
    bearing: { kind: 'allowablePressure', allowableBearingKPa: INPUTS.allowableBearingKPa },
    provenance: INPUTS.provenance,
  } as never);

  const footingId = modelStore.addFooting(nodeId, INPUTS.footingName);
  modelStore.updateFooting(footingId, {
    B: INPUTS.B,
    L: INPUTS.L,
    thickness: INPUTS.thickness,
    cover: INPUTS.cover,
    foundingElevation: INPUTS.foundingElevation,
    soilProfileId: profileId,
    // Without this the production run reports footing.run.noColumn and produces no entry.
    columnElementId: columnElementIdAt(nodeId),
  } as never);

  return { ded: serializeProject(), nodeId, footingId };
}

describe('canonical PR19 CAD footing project (.ded)', () => {
  beforeEach(() => { modelStore.clear(); });

  it('builds through production actions and writes the fixture when asked', async () => {
    const { ded, nodeId, footingId } = await buildProject();

    const parsed = JSON.parse(ded) as Record<string, unknown>;
    expect(typeof parsed.version).toBe('string');
    expect(parsed.snapshot, 'a .ded carries a ModelSnapshot').toBeTruthy();
    const snap = parsed.snapshot as Record<string, unknown>;
    expect(Array.isArray(snap.footings)).toBe(true);
    expect((snap.footings as unknown[]).length).toBe(1);

    if (process.env.WRITE_FIXTURE) {
      writeFileSync(FIXTURE_PATH, ded.endsWith('\n') ? ded : `${ded}\n`, 'utf8');
    }
    expect(existsSync(FIXTURE_PATH), 'fixture must be committed').toBe(true);
    expect(nodeId).toBeGreaterThan(0);
    expect(footingId).toBeGreaterThan(0);
  });

  it('restores through deserializeProject and the footing survives with its values', () => {
    const text = readFileSync(FIXTURE_PATH, 'utf8');
    modelStore.clear();
    expect(modelStore.model.footings.size).toBe(0);

    // The production restoration path: parse -> validate -> modelStore.restore(snapshot).
    expect(deserializeProject(text), 'production deserializer must accept the fixture').toBe(true);

    const footings = [...modelStore.model.footings.values()];
    expect(footings.length, 'exactly one footing').toBe(1);
    const f = footings[0];

    expect(f.name).toBe(INPUTS.footingName);
    expect(f.B).toBeCloseTo(INPUTS.B, 9);
    expect(f.L).toBeCloseTo(INPUTS.L, 9);
    expect(f.thickness).toBeCloseTo(INPUTS.thickness, 9);
    // Cover lives on the model. The exporter reads it from here; nothing downstream hard-codes it.
    expect(f.cover).toBeCloseTo(INPUTS.cover, 9);

    // Node/support relationship survived restoration.
    const node = modelStore.model.nodes.get(f.nodeId);
    expect(node, 'the footing must point at a restored node').toBeTruthy();
    const support = [...modelStore.model.supports.values()].find((s) => s.nodeId === f.nodeId);
    expect(support, 'the founded node must still carry its support').toBeTruthy();
    expect(String(support!.type)).toMatch(/^fixed/);

    // Soil profile reference resolves.
    const profiles = modelStore.model.geotechnical?.profiles ?? [];
    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles.some((p) => p.id === f.soilProfileId)).toBe(true);

    // The structure itself came back, so footing detailing has a real model to run against.
    expect(modelStore.model.nodes.size).toBeGreaterThan(1);
    expect(modelStore.model.elements.size).toBeGreaterThan(1);
  });

  it('carries no derived detailing state — the assembly must be recomputed, never seeded', () => {
    const snap = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')).snapshot as Record<string, unknown>;
    // DetailingAssembly, bar paths, marks and conflicts are derived. A fixture that carried them
    // would let a test assert against seeded output instead of production behaviour.
    for (const forbidden of ['assemblies', 'bars', 'marks', 'conflicts', 'detailingAssemblies']) {
      expect(snap[forbidden], `snapshot must not persist derived '${forbidden}'`).toBeUndefined();
    }
  });

  it('regenerating from production actions reproduces the same model content', async () => {
    const a = await buildProject();
    const b = await buildProject();
    const stripVolatile = (ded: string) => {
      const d = JSON.parse(ded) as Record<string, unknown>;
      delete d.timestamp;   // the production serializer stamps this; not patched to be fixed
      return JSON.stringify(d);
    };
    expect(stripVolatile(a.ded)).toBe(stripVolatile(b.ded));
  });
});
