import { describe, it, expect } from 'vitest';
import * as spacing from '../../../codes/cirsoc201/spacing';
import { anchorageFunctions } from '../../../codes/cirsoc201/anchorage';
import { beamGroups, envelopeStations, hoggingAtSupports } from '../beam-groups';
import { generateBeamBars } from '../generate-beam';
import { layerCentroid } from '../../station-design-forces';
import { modelStore } from '../../../store/model.svelte';
import { uiStore } from '../../../store/ui.svelte';
import blogBeam from '../../../templates/fixtures/rc-beam-flexure.json';
import { publishCombinations3D } from '../../../store/active-results';
import { resultsStore } from '../../../store/results.svelte';
import { detailingStore } from '../../../store/detailing.svelte';
import { designRunStore } from '../../../store/design-run.svelte';
import { verificationStore } from '../../../store/verification.svelte';
import { DEFAULT_DESIGN_FAMILIES } from '../../design/design-families';
import { isSolverReady } from '../../wasm-solver';
import type { RebarLayer } from '../../../design-contract/reinforcement';
import '../../design/adapters/cirsoc201-adapter';
import '../../design/adapters/unsupported-adapter';
import { stateSuiteCovers } from '../../../store/__tests__/suite-covers';

/** The design's seat: cover 25 mm, Ø6 stirrup, the bar's centre half its diameter inside. */
const seat = (dMm: number) => 0.025 + 0.006 + dMm / 2000;

describe('§25.2.2 stepping, by hand', () => {
  it('a Ø10 layer under a Ø12 pair steps from the pair: 25 mm clear, 36 mm centre to centre', () => {
    // The clear owed between the two layers: max(25 mm, the larger bar) = 25 mm.
    expect(spacing.layerClearBetween('2025', 12, 10)).toBeCloseTo(0.025, 9);
    // Pair centre 25 + 6 + 6 = 37 mm; its inner surface 43 mm; the Ø10 layer's outer surface
    // 25 mm further, 68 mm; its centre 73 mm. 73 − 37 = 36 = 6 + 25 + 5.
    const row1 = spacing.stackedLayerDepth([[10, 12]], 1, 10, seat);
    expect(row1).toBeCloseTo(0.073, 9);
    expect(row1 - seat(12)).toBeCloseTo(0.036, 9);
    // Before: stepped from the Ø10 bars, 36 + 10 + 25 = 71 mm, 34 mm below the pair's centre.
    expect(spacing.stackedLayerDepth([[10]], 1, 10, seat)).toBeCloseTo(0.071, 9);
  });

  it('a layer of one diameter steps as it always did: db + max(25 mm, db)', () => {
    expect(spacing.stackedLayerDepth([[16]], 1, 16, seat)).toBeCloseTo(seat(16) + 0.016 + 0.025, 9);
    expect(spacing.stackedLayerDepth([[16], [16]], 2, 16, seat)).toBeCloseTo(seat(16) + 2 * (0.016 + 0.025), 9);
    // Above Ø25 the bar's own diameter governs the clear, the design's rule now the detailing's.
    expect(spacing.layerClearBetween('2025', 32, 32)).toBeCloseTo(0.032, 9);
    expect(spacing.stackedLayerDepth([[32]], 1, 32, seat)).toBeCloseTo(seat(32) + 0.064, 9);
  });

  it('the design\'s depth reads the pair: the start top of the pin–fixed beam, before and after', () => {
    const layers: RebarLayer[] = [{ count: 4, diameter: 10, row: 0 }, { count: 2, diameter: 10, row: 1 }];
    // Without the pair, as the design read it before: (4·36 + 2·71) / 6 mm.
    expect(layerCentroid(layers, 0.025, 6)).toBeCloseTo(0.286 / 6, 9);
    // With it: two of the outer bars are the Ø12 pair at 37 mm, the second layer at 73 mm:
    // (2·37 + 2·36 + 2·73) / 6 = 48,67 mm, 1,0 mm deeper.
    expect(layerCentroid(layers, 0.025, 6, { diameterMm: 12, count: 2 })).toBeCloseTo(0.292 / 6, 9);
  });
});

const turn = () => new Promise<void>((r) => setImmediate(r));

function resetDesign() {
  expect(isSolverReady()).toBe(true);
  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = true;
  modelStore.clear();
  resultsStore.clear();
  detailingStore.clear();
  designRunStore.resetMarks();
  verificationStore.clear();
}

async function solveAndDesignBeam() {
  const solved = await modelStore.solveCombinations3DParallel(true, false, true);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  expect(solved.perCase.size).toBe(modelStore.model.loadCases.length);
  expect(solved.perCombo.size).toBe(modelStore.model.combinations.length);
  expect(solved.unstable ?? []).toEqual([]);
  publishCombinations3D(solved);
  await turn();
  designRunStore.designFamilies([...DEFAULT_DESIGN_FAMILIES], { verifierId: 'cirsoc201.provided.v2.2025' });
  await turn();
  return solved;
}

describe('the blog beam, designed and laid as the embed runs it', () => {
  it('designs the simply supported beam with free end rotations', async () => {
    resetDesign();
    await modelStore.loadExample('rc-beam-flexure');
    stateSuiteCovers();
    const solved = await solveAndDesignBeam();
    for (const result of [...solved.perCase.values(), ...solved.perCombo.values()]) {
      expect(result.elementForces.find((f) => f.elementId === 1)!.myStart).toBeCloseTo(0, 9);
      expect(result.elementForces.find((f) => f.elementId === 2)!.myEnd).toBeCloseTo(0, 9);
    }
    expect(verificationStore.getDisplayStatus(1)).toBe('ok');
    expect(verificationStore.getDisplayStatus(2)).toBe('ok');
  }, 120_000);
});

describe('a pin–fixed beam with mixed top layers', () => {
  it('holds the shear-depth refusal and lays the candidate’s second Ø10 layer 36 mm below the Ø12 pair in isolation', async () => {
    resetDesign();
    await modelStore.loadExample('layer-stepping', async () => ({
      ...blogBeam,
      supports: [
        { id: 1, nodeId: 1, type: 'pinned3d' },
        { id: 2, nodeId: 3, type: 'fixed3d' },
      ],
    }));
    stateSuiteCovers();
    await solveAndDesignBeam();

    const o = verificationStore.outcomeFor(1)!;
    expect(o.outcome).toBe('UNSUPPORTED');
    expect(o.reasons).toContainEqual({ key: 'diag.rcShearDepth' });
    expect(o.accepted).toBeUndefined();
    const candidate = o.provisional!.candidate;
    const reg = candidate.regions!;
    expect(reg.topStartLayers).toEqual([{ count: 4, diameter: 10, row: 0 }, { count: 2, diameter: 10, row: 1 }]);
    expect(reg.topEndLayers).toEqual([{ count: 4, diameter: 12, row: 0 }, { count: 4, diameter: 12, row: 1 }]);

    // As laid: the pair's run and the start's second layer, their centres along the up axis.
    const ctx = verificationStore.contextFor(1)!;
    const { cover, fc, fy } = ctx.material;
    const edition = '2025';
    const maxAggregateSizeMm = ctx.material.maxAggregateSize.value;
    const stations = envelopeStations(ctx);
    const groups = beamGroups(candidate, { ctx, edition, maxAggregateSizeMm, hogging: hoggingAtSupports(ctx) })!;
    const support = reg.stirrupsSupport!, span = reg.stirrupsSpan!;
    const stirrupDia = Math.max(support.diameter, span.diameter);
    const region = (reg.regionT ?? 0.25) * ctx.L;
    const { bars } = generateBeamBars({
      ...groups, elementId: 1, L: ctx.L, b: ctx.section.b, h: ctx.section.h,
      d: ctx.section.h - cover - stirrupDia / 1000, cover, stirrupDia, fc, fy, maxAggregateSizeMm, edition,
      stations, supportI: 'simple', supportJ: 'continuous',
      lateralSystem: true, ld: anchorageFunctions({ fy, fc, favourableSpacing: true, psiT: 1.3, edition }).ld,
      origin: { x: 0, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 },
      bentUp: { seismicDesign: 'unstated', optOut: false },
      designedStirrups: { support, span, regionI: region, regionJ: region },
    });
    const runZ = (id: string) => {
      const b = bars.find((x) => x.id === id)!;
      const s = b.segments.find((g) => g.kind === 'straight' && Math.abs(g.start.z - g.end.z) < 1e-9)!;
      return { y: s.start.y, z: s.start.z };
    };
    const pair = ['e1-topRun-0', 'e1-topRun-1'].map(runZ);
    const second = bars.filter((b) => b.layerId === 'e1:topI:1').map((b) => runZ(b.id));
    expect(second.length).toBe(2);
    const detailedStep = pair[0]!.z - second[0]!.z;
    for (const s of second) expect(pair[0]!.z - s.z).toBeCloseTo(detailedStep, 9);
    // Before: 34,29 mm, 1,71 mm short.
    expect(detailedStep * 1000).toBeCloseTo(36, 6);

    // The design's step, from the centroid the verifier reads for the start top: two bars at the
    // pair's seat, two at the Ø10 seat, two in the second layer.
    const st = ctx.material.stirrupDia;
    const s = (d: number) => cover + st / 1000 + d / 2000;
    const centroid = layerCentroid(reg.topStartLayers!, cover, st, { diameterMm: 12, count: 2 });
    const designRow1 = (6 * centroid - 2 * s(12) - 2 * s(10)) / 2;
    expect((designRow1 - s(12)) * 1000).toBeCloseTo(detailedStep * 1000, 6);

    // The bottom face, one diameter in both layers: 10 + 25 mm in both, as before.
    const bottom0 = bars.filter((b) => b.layerId === 'e1:bottom:0').map((b) => runZ(b.id).z);
    const bottom1 = bars.filter((b) => b.layerId === 'e1:bottom:1').map((b) => runZ(b.id).z);
    expect((bottom1[0]! - bottom0[0]!) * 1000).toBeCloseTo(35, 6);

    const assemblies = modelStore.model.detailing?.assemblies ?? detailingStore.assemblies;
    expect(assemblies.flatMap(a => a.bars)).toEqual([]);
    expect(verificationStore.getDisplayStatus(1)).toBe('unavailable');
    expect(verificationStore.getDisplayStatus(2)).toBe('unavailable');
  }, 120_000);
});
