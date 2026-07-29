/**
 * Regression pin: the slab and wall engines must be reachable through the STORE.
 *
 * PR18 shipped `designSlabPanel`, `designWall`, `checkFooting` and `buildFloorAssembly`
 * with no caller outside their own unit tests, and an e2e spec that injected a
 * hand-written `DetailingAssembly` through `seedDetailing`. Every engine-level test was
 * green and no user action could reach any of it.
 *
 * So this file drives the production command — `detailingStore.generateFloors()` — over a
 * model built through `modelStore`'s own API, and asserts that real assemblies with real
 * bars come out. Nothing is seeded.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { detailingStore } from '../detailing.svelte';
import { resultsStore } from '../results.svelte';
import type { ElementForces3D, QuadStress } from '../../engine/types-3d';

/**
 * The assemblies as PERSISTED on the model.
 *
 * Read from the model rather than from `detailingStore.assemblies`, which is a `$derived`
 * and does not recompute inside the synchronous call that wrote it. The model is the thing
 * that actually persists, so it is also the stronger assertion.
 */
function persistedIds(): string[] {
  return (modelStore.model.detailing?.assemblies ?? []).map((a) => a.id);
}

/** Publish shell results the way the solve path does. */
function publishStresses(quadStresses: QuadStress[]) {
  resultsStore.setResults3D({
    displacements: [], reactions: [], elementForces: [], quadStresses,
  });
}

/** A column end-force record, axial with TENSION positive as `ElementForces3D` reports it. */
function columnForces(elementId: number, axialTension: number): ElementForces3D {
  return {
    elementId, length: 3,
    nStart: axialTension, nEnd: axialTension,
    vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0,
    mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
    releaseMyStart: false, releaseMyEnd: false,
    releaseMzStart: false, releaseMzEnd: false,
    releaseTStart: false, releaseTEnd: false,
  } as ElementForces3D;
}

/**
 * Publish per-combination results carrying real column axial forces.
 *
 * Through `setCombinationResults3D`, the setter the solve path uses — not a test hook. This is
 * what the punching collector reads: the axial force at the column end that sits at the slab
 * joint, per combination.
 */
function publishCombinations(
  quadStresses: QuadStress[], columns: readonly number[], axialTension: number,
) {
  const res = (scale: number) => ({
    displacements: [], reactions: [], quadStresses,
    elementForces: columns.map((c) => columnForces(c, axialTension * scale)),
  }) as never;
  // One result per combination the MODEL defines. Publishing an arbitrary pair would leave the
  // solved set and the model's own combinations disagreeing, which is exactly the divergence
  // `analysisStaleForFloor` measures — and the run would then refuse to read the forces.
  const combos = modelStore.model.combinations;
  const perCombo = new Map(combos.map((c, i) => [c.id, res(1 - i * 0.1)]));
  resultsStore.setCombinationResults3D(
    new Map(modelStore.model.loadCases.map((c) => [c.id, res(1)])),
    perCombo,
    {} as never,
  );
}

/** A 5 × 5 m slab quad at +3,00 carrying a surface load, on four columns. */
function buildSlabModel() {
  modelStore.clear();
  const base = [
    modelStore.addNode(0, 0, 0), modelStore.addNode(5, 0, 0),
    modelStore.addNode(5, 5, 0), modelStore.addNode(0, 5, 0),
  ];
  const top = [
    modelStore.addNode(0, 0, 3), modelStore.addNode(5, 0, 3),
    modelStore.addNode(5, 5, 3), modelStore.addNode(0, 5, 3),
  ];
  for (const n of base) modelStore.addSupport(n, 'fixed3d');
  const columns: number[] = [];
  for (let i = 0; i < 4; i++) columns.push(modelStore.addElement(base[i], top[i], 'frame'));
  // A real 400 × 400 section, so the punching perimeter has a column face to stand off from.
  const sectionId = modelStore.addSection({
    name: '40×40', a: 0.16, iz: 0.00213, b: 0.4, h: 0.4,
  });
  for (const c of columns) modelStore.updateElementSection(c, sectionId);
  const material = [...modelStore.model.materials.keys()][0];
  const quad = modelStore.addQuad([top[0], top[1], top[2], top[3]], material, 0.20);
  return { quad, top, columns };
}

/**
 * The same panel with NO columns: a slab bearing directly on its supported corners.
 *
 * A separate fixture, because `buildSlabModel` is a flat plate on four columns and calling it
 * "beam-supported" is what let a punching assertion pass for the wrong reason. Two-way shear
 * applies to THIS panel at no joint, and that has to be tested on a panel where it is true.
 */
function buildBeamSupportedSlabModel() {
  modelStore.clear();
  const top = [
    modelStore.addNode(0, 0, 3), modelStore.addNode(5, 0, 3),
    modelStore.addNode(5, 5, 3), modelStore.addNode(0, 5, 3),
  ];
  for (const n of top) modelStore.addSupport(n, 'fixed3d');
  const material = [...modelStore.model.materials.keys()][0];
  const quad = modelStore.addQuad([top[0], top[1], top[2], top[3]], material, 0.20);
  return { quad, top };
}

describe('detailingStore.generateFloors — the production command', () => {
  beforeEach(() => {
    modelStore.clear();
    detailingStore.clear();
  });

  it('explains itself rather than being silently inert with no shells', () => {
    modelStore.clear();
    const r = detailingStore.floorReadiness;
    expect(r.ready).toBe(false);
    expect(r.reasons.map((m) => m.key)).toContain('detailing.floorRun.noShells');
  });

  it('will not claim to be ready before the model is solved', () => {
    buildSlabModel();
    const r = detailingStore.floorReadiness;
    expect(r.ready).toBe(false);
    expect(r.shellCount).toBeGreaterThan(0);
    expect(r.reasons.map((m) => m.key)).toContain('detailing.floorRun.notSolved');
  });

  it('reads the shells out of the model, quads and plates alike', () => {
    const { quad } = buildSlabModel();
    expect(quad).toBeGreaterThan(0);
    expect(detailingStore.floorReadiness.shellCount).toBe(1);
  });

  it('produces assemblies with real bars from real geometry, seeding nothing', () => {
    const { quad } = buildSlabModel();
    modelStore.addSurfaceLoad3D(quad, 12);

    // Shell results are published through `resultsStore.setResults3D`, which is the same
    // setter the solve path uses — not a test-only hook. Everything below it (geometry,
    // loads, combinations, materials, the whole design chain) is the model's own.
    publishStresses([
      { elementId: quad, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 40, my: 30, mxy: 8, vonMises: 0 },
    ]);
    const result = detailingStore.generateFloors();

    expect(result).not.toBeNull();
    expect(result!.slabs).toHaveLength(1);
    expect(result!.assemblies.length).toBeGreaterThan(0);

    const bars = result!.assemblies.flatMap((a) => a.bars);
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.some((b) => b.id.startsWith(`P${quad}-`))).toBe(true);
  });

  it('writes the assemblies onto the model, so they persist', () => {
    const { quad } = buildSlabModel();
    modelStore.addSurfaceLoad3D(quad, 12);
    publishStresses([
      { elementId: quad, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 40, my: 30, mxy: 8, vonMises: 0 },
    ]);
    detailingStore.generateFloors();
    expect(persistedIds().some((id) => id.startsWith('FLOOR-'))).toBe(true);
  });

  it('does not destroy beam assemblies when floors are generated', () => {
    const { quad } = buildSlabModel();
    modelStore.addSurfaceLoad3D(quad, 12);
    // A beam-line assembly already present, as `generate()` would have left it.
    detailingStore.setAssemblies([{
      id: 'BEAM-1', kind: 'beamLine', label: 'Beams', elementIds: [1],
      bars: [], marks: [], joints: [], conflicts: [], unsupported: [],
      detailingRevision: 1, demandRevision: 1, state: 'COORDINATED',
      maturity: 'IMPLEMENTED_PROVISIONAL',
      provenance: { edition: '2025', verifierId: '', trace: [], assumptions: [] },
    } as never]);

    publishStresses([
      { elementId: quad, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 40, my: 30, mxy: 8, vonMises: 0 },
    ]);
    detailingStore.generateFloors();

    const ids = persistedIds();
    expect(ids).toContain('BEAM-1');
    expect(ids.some((id) => id.startsWith('FLOOR-'))).toBe(true);
  });

  it('re-running replaces its own floor assemblies rather than accumulating them', () => {
    const { quad } = buildSlabModel();
    modelStore.addSurfaceLoad3D(quad, 12);
    publishStresses([
      { elementId: quad, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 40, my: 30, mxy: 8, vonMises: 0 },
    ]);
    detailingStore.generateFloors();
    const first = persistedIds().filter((id) => id.startsWith('FLOOR-')).length;
    detailingStore.generateFloors();
    const second = persistedIds().filter((id) => id.startsWith('FLOOR-')).length;
    expect(second).toBe(first);
  });

  it('factors the area load through the project combinations, not a nominal figure', () => {
    const { quad } = buildSlabModel();
    // 10 kPa dead on case 1. The default combination set factors D above 1,0, so the
    // factored load the shear check receives must exceed the load that was applied.
    modelStore.addSurfaceLoad3D(quad, 10, 1);
    publishStresses([
      { elementId: quad, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 40, my: 30, mxy: 8, vonMises: 0 },
    ]);
    const r = detailingStore.generateFloors();
    expect(r).not.toBeNull();
    const memo = r!.slabs[0].shear.memo;
    const qu = Number(/vu = ([\d.]+)/.exec(memo)?.[1] ?? '0');
    expect(qu).toBeGreaterThan(10);
  });

  /**
   * A shell floor's evidence is its OWN certificate — not a frame verification it never had.
   *
   * This assertion used to be `blocking` contains `allMembersReverified`, and it was right
   * for as long as the gate had only one certificate instrument: a floor could not reach
   * CONSTRUCTIBLE because the frame verifier had not run on it, and the only alternative was
   * to claim it had. Both answers were wrong about the same thing — that a slab's evidence is
   * a frame member's evidence.
   *
   * The frame conditions now count FRAME members, of which a shell floor has none, so they
   * are satisfied by a measured zero rather than by a flag. The real evidence is the slab's
   * design record and the certificate issued against its actual cage, and that is what these
   * assertions check.
   */
  it('reaches readiness on its own family certificate, not on frame verification', () => {
    // The full per-combination results are published, not only the shell stresses: this panel
    // supports four columns, so its punching is a real check and a certificate issued without
    // running it would be a certificate for a design nobody completed.
    const { quad, columns } = buildSlabModel();
    modelStore.addSurfaceLoad3D(quad, 12, 1);
    publishCombinations(
      [{ elementId: quad, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 40, my: 30, mxy: 8, vonMises: 0 }],
      columns, -220,
    );
    const r = detailingStore.generateFloors();
    const a = r!.assemblies[0];

    // No frame members, so nothing to reverify — and the gate says so as a MEASUREMENT.
    const cond = (k: string) => a.constructibility!.conditions.find((c) => c.condition === k)!;
    expect(cond('allMembersReverified').passed).toBe(true);
    expect(cond('allMembersReverified').failing).toBe(0);

    // The evidence that actually carries the claim: a persisted slab record, certified
    // against the bars in this assembly.
    const slab = a.families?.find((f) => f.family === 'slab');
    expect(slab, 'the production run must persist a slab design record').toBeTruthy();
    expect(slab!.certificate.status).toBe('CERTIFIED');
    expect(cond('allApplicableFamiliesCertified').passed).toBe(true);

    // And it is bound to the real steel: the record's bars are this assembly's bars.
    const ids = new Set(a.bars.map((b) => b.id));
    expect(slab!.barIds.length).toBeGreaterThan(0);
    for (const id of slab!.barIds) expect(ids.has(id), id).toBe(true);
  });

  it('records the raw mx, my and mxy the design read, not only the transform', () => {
    // `mxy` is the field a naive slab design discards, and discarding it under-reinforces a
    // twisted panel. Both the raw triple and the Wood-Armer pair are persisted so the
    // transformation is auditable rather than taken on trust.
    const { quad } = buildSlabModel();
    // On case 1, so the load is factored by the project's own combinations and `qu` is the
    // real factored demand the shear check received rather than an unfactored zero.
    modelStore.addSurfaceLoad3D(quad, 12, 1);
    publishStresses([
      { elementId: quad, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 40, my: 30, mxy: 8, vonMises: 0 },
    ]);
    const a = detailingStore.generateFloors()!.assemblies[0];
    const slab = a.families!.find((f) => f.family === 'slab')!;
    if (slab.family !== 'slab') throw new Error('narrowing');
    const d = slab.demands[0];
    expect(d.mx).toBe(40);
    expect(d.my).toBe(30);
    expect(d.mxy).toBe(8);
    // Wood-Armer folds |mxy| in rather than dropping it, so each bottom moment exceeds its
    // raw counterpart.
    expect(d.woodArmer.mxBottom).toBeGreaterThan(40);
    expect(d.woodArmer.myBottom).toBeGreaterThan(30);
    expect(d.qu).toBeGreaterThan(0);
  });

  it('does not claim punching on a panel that supports no column', () => {
    // Two-way shear is a property of a joint. A panel bearing on its own supports has none,
    // and reporting one as unverified there would make an ordinary floor permanently
    // uncertifiable for a condition that does not arise in it.
    //
    // This used to run on `buildSlabModel`, which is a flat plate on FOUR COLUMNS. It passed
    // because the collector identified columns from `verificationStore.contexts`, which no
    // design run had populated — so the assertion held for a panel where it is false. The
    // fixture is now a panel that genuinely supports nothing.
    const { quad } = buildBeamSupportedSlabModel();
    modelStore.addSurfaceLoad3D(quad, 12);
    publishStresses([
      { elementId: quad, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 40, my: 30, mxy: 8, vonMises: 0 },
    ]);
    const a = detailingStore.generateFloors()!.assemblies[0];
    const slab = a.families!.find((f) => f.family === 'slab')!;
    if (slab.family !== 'slab') throw new Error('narrowing');
    expect(slab.punching).toEqual([]);
    expect(slab.checks.some((c) => c.key === 'punching')).toBe(false);
  });

  /**
   * PRODUCTION-CALLER LIVENESS for slab–column punching.
   *
   * The whole point of the collector: a flat plate on columns, solved, run through
   * `generateFloors()`, and the punching check comes out VERIFIED with the forces the solver
   * produced. Nothing is seeded and no engine is called directly — if the wiring from
   * `collectSlabColumns` through `runFloorDesign` to the persisted record breaks anywhere, the
   * status here falls back to UNSUPPORTED and this test fails.
   */
  it('CHECKS slab-column punching from the solved column forces', () => {
    const { quad, columns } = buildSlabModel();
    modelStore.addSurfaceLoad3D(quad, 12, 1);
    // 220 kN of compression in each column, reported with tension positive.
    publishCombinations(
      [{ elementId: quad, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 40, my: 30, mxy: 8, vonMises: 0 }],
      columns, -220,
    );
    const a = detailingStore.generateFloors()!.assemblies[0];
    const slab = a.families!.find((f) => f.family === 'slab')!;
    if (slab.family !== 'slab') throw new Error('narrowing');

    // One joint per column the panel supports.
    expect(slab.punching).toHaveLength(4);
    for (const p of slab.punching) {
      expect(p.status, `joint ${p.nodeId}`).not.toBe('UNSUPPORTED');
      // The demand is the column's own axial force, compression positive, less what stands
      // inside the perimeter — not zero, and not the tension-positive figure.
      expect(p.axialBelow).toBeCloseTo(220, 6);
      expect(p.Vu).toBeGreaterThan(0);
      expect(p.Vu).toBeLessThan(220);
      expect(p.phiVc).toBeGreaterThan(0);
      // A single panel on four corner columns: every joint IS a corner.
      expect(p.position).toBe('corner');
      expect(p.coverageDeg).toBeCloseTo(90, 3);
      expect(p.truncatedSides).toBe(2);
      // The column above is genuinely absent at a roof joint; the column below is the source.
      expect(p.elementAbove).toBeNull();
      expect(p.elementBelow).toBe(p.columnElementId);
      // The free body closed.
      expect(Math.abs(p.equilibriumResidual!)).toBeLessThan(1e-6);
      // Real perimeter geometry, for the drawing and the report.
      expect(p.perimeter!.bo).toBeGreaterThan(0);
      expect(p.perimeter!.enclosedArea).toBeGreaterThan(0);
      // Every combination the project defines was considered, and one of them governs.
      expect(p.contributions!.length).toBe(modelStore.model.combinations.length);
      expect(p.governingCombination).toBeTruthy();
    }

    // And the family check row carries it, so the certificate is decided on a measured check.
    const check = slab.checks.find((c) => c.key === 'punching');
    expect(check).toBeTruthy();
    expect(check!.status).not.toBe('UNSUPPORTED');
    expect(check!.utilization).toBeGreaterThan(0);
    expect(check!.governingCombination).toBeTruthy();
  });

  it('refuses punching when the solved set and the model combinations disagree', () => {
    const { quad, columns } = buildSlabModel();
    modelStore.addSurfaceLoad3D(quad, 12, 1);
    const res = () => ({
      displacements: [], reactions: [],
      quadStresses: [
        { elementId: quad, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 40, my: 30, mxy: 8, vonMises: 0 },
      ],
      elementForces: columns.map((c) => columnForces(c, -220)),
    }) as never;
    // A per-combination set keyed by an id the model does not define: reading forces from it
    // would attribute one combination's forces to another.
    resultsStore.setCombinationResults3D(new Map(), new Map([[9999, res()]]), {} as never);

    const a = detailingStore.generateFloors()!.assemblies[0];
    const slab = a.families!.find((f) => f.family === 'slab')!;
    if (slab.family !== 'slab') throw new Error('narrowing');
    expect(slab.punching.length).toBeGreaterThan(0);
    for (const p of slab.punching) {
      expect(p.status).toBe('UNSUPPORTED');
      expect(p.unsupported.map((m) => m.key))
        .toContain('detailing.slabPunching.staleAnalysis');
    }
  });

  it('does not certify a flat plate whose punching could not be checked', () => {
    // The gate that matters. A panel supporting columns, with no element forces published, has
    // its governing check unverified — and a certificate that said CERTIFIED there would be
    // the exact false pass the certificate model exists to prevent.
    const { quad } = buildSlabModel();
    modelStore.addSurfaceLoad3D(quad, 12);
    publishStresses([
      { elementId: quad, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 40, my: 30, mxy: 8, vonMises: 0 },
    ]);
    const a = detailingStore.generateFloors()!.assemblies[0];
    const slab = a.families!.find((f) => f.family === 'slab')!;
    if (slab.family !== 'slab') throw new Error('narrowing');
    expect(slab.punching.every((p) => p.status === 'UNSUPPORTED')).toBe(true);
    expect(slab.certificate.status).toBe('UNSUPPORTED');
  });

  it('stamps the record with three distinct upstream revisions', () => {
    // One number cannot say whether the loads, the analysis or the regulation moved, and the
    // three have different remedies. A certificate that cannot say which is stale is a
    // certificate an engineer cannot act on.
    const { quad } = buildSlabModel();
    modelStore.addSurfaceLoad3D(quad, 12);
    publishStresses([
      { elementId: quad, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 40, my: 30, mxy: 8, vonMises: 0 },
    ]);
    const a = detailingStore.generateFloors()!.assemblies[0];
    const rec = a.families![0];
    for (const k of ['analysis', 'loads', 'regulation', 'entity'] as const) {
      expect(typeof rec.revisions[k], k).toBe('number');
    }
    // The certificate carries the same vector it was stamped with — not a fresh read, which
    // would always compare equal and could never detect staleness.
    expect(rec.certificate.revisions).toEqual(rec.revisions);
  });
});
