/**
 * How deep a second layer of bars stands below the first, as the design reads it and as the
 * detailing lays it (§25.2.2, `stackedLayerDepth`).
 *
 * ── The defect ─────────────────────────────────────────────────────
 *
 * The blog's embedded 20×40 beam (`rc-beam-flexure`) designs 6Ø10 at the start top (4 + 2 in a
 * second layer) and 8Ø12 at the end top. The continuous top pair runs support to support at the
 * larger bar, Ø12, in the outer layer (§25.7.1.2). Both the design and the detailing stepped the
 * start's second Ø10 layer from the Ø10 bars beside the pair, 10 + 25 mm, not from the pair: as
 * laid, its centre stood 34,29 mm below the pair's, 1,7 mm short of the 6 + 25 + 5 = 36 mm the
 * clear distance owes, and the repair ladder rightly refused to move it (out of the section, or
 * 3,7 mm off the verified depth). Both members read "No verifica".
 *
 * Every layer now steps from the INNER surface of the layer above, its largest bar's, by the clear
 * owed to the larger bar of the two, and the design's effective depth and the detailing's bar
 * elevations read the same function.
 */
import { describe, it, expect } from 'vitest';
import * as spacing from '../../../codes/cirsoc201/spacing';
import { layerCentroid } from '../../station-design-forces';
import { modelStore } from '../../../store/model.svelte';
import { resultsStore } from '../../../store/results.svelte';
import { detailingStore } from '../../../store/detailing.svelte';
import { designRunStore } from '../../../store/design-run.svelte';
import { verificationStore } from '../../../store/verification.svelte';
import { DEFAULT_DESIGN_FAMILIES } from '../../design/design-families';
import { isSolverReady } from '../../wasm-solver';
import type { RebarLayer } from '../../../design-contract/reinforcement';
import '../../design/adapters/cirsoc201-adapter';
import '../../design/adapters/unsupported-adapter';

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

  it('the design\'s depth reads the pair: the start top of the blog beam, before and after', () => {
    const layers: RebarLayer[] = [{ count: 4, diameter: 10, row: 0 }, { count: 2, diameter: 10, row: 1 }];
    // Without the pair, as the design read it before: (4·36 + 2·71) / 6 mm.
    expect(layerCentroid(layers, 0.025, 6)).toBeCloseTo(0.286 / 6, 9);
    // With it: two of the outer bars are the Ø12 pair at 37 mm, the second layer at 73 mm:
    // (2·37 + 2·36 + 2·73) / 6 = 48,67 mm, 1,0 mm deeper.
    expect(layerCentroid(layers, 0.025, 6, { diameterMm: 12, count: 2 })).toBeCloseTo(0.292 / 6, 9);
  });
});

const turn = () => new Promise<void>((r) => setImmediate(r));

describe('the blog beam, designed and laid as the embed runs it', () => {
  it('lays the second Ø10 layer 36 mm below the Ø12 pair, the depth the design verified, and conforms', async () => {
    expect(isSolverReady()).toBe(true);
    modelStore.clear(); resultsStore.clear(); detailingStore.clear(); designRunStore.resetMarks(); verificationStore.clear();
    await modelStore.loadExample('rc-beam-flexure');
    const solved = await modelStore.solveCombinations3DParallel(true, false, true) as { perCase: Map<number, never>; perCombo: Map<number, never>; envelope: never };
    resultsStore.setCombinationResults3D(solved.perCase as never, solved.perCombo as never, solved.envelope as never);
    await turn();
    designRunStore.designFamilies([...DEFAULT_DESIGN_FAMILIES], { verifierId: 'cirsoc201.provided.v2.2025' });
    await turn();

    // The design the embed reaches (the design decides; this pins what it decided).
    const o = verificationStore.outcomeFor(1)!;
    expect(o.outcome).toBe('VERIFIED');
    const reg = o.accepted!.regions!;
    expect(reg.topStartLayers).toEqual([{ count: 4, diameter: 10, row: 0 }, { count: 2, diameter: 10, row: 1 }]);
    expect(reg.topEndLayers).toEqual([{ count: 4, diameter: 12, row: 0 }, { count: 4, diameter: 12, row: 1 }]);

    // As laid: the pair's run and the start's second layer, their centres along the up axis.
    const assemblies = modelStore.model.detailing?.assemblies ?? detailingStore.assemblies;
    const bars = assemblies.flatMap((a) => a.bars);
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
    const ctx = verificationStore.contextFor(1)!;
    const cover = ctx.material.cover, st = ctx.material.stirrupDia;
    const s = (d: number) => cover + st / 1000 + d / 2000;
    const centroid = layerCentroid(reg.topStartLayers!, cover, st, { diameterMm: 12, count: 2 });
    const designRow1 = (6 * centroid - 2 * s(12) - 2 * s(10)) / 2;
    expect((designRow1 - s(12)) * 1000).toBeCloseTo(detailedStep * 1000, 6);

    // The bottom face, one diameter in both layers: 10 + 25 mm in both, as before.
    const bottom0 = bars.filter((b) => b.layerId === 'e1:bottom:0').map((b) => runZ(b.id).z);
    const bottom1 = bars.filter((b) => b.layerId === 'e1:bottom:1').map((b) => runZ(b.id).z);
    expect((bottom1[0]! - bottom0[0]!) * 1000).toBeCloseTo(35, 6);

    // Nothing left unresolved, and both members conform.
    const unresolved = assemblies.flatMap((a) => a.unsupported ?? []).filter((u) => u.key === 'detailing.clash.unresolved');
    expect(unresolved).toEqual([]);
    expect(verificationStore.getDisplayStatus(1)).toBe('ok');
    expect(verificationStore.getDisplayStatus(2)).toBe('ok');
  }, 120_000);
});
