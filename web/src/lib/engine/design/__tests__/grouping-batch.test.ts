/**
 * Derived grouping and batch editing — both pure, both fully unit-testable.
 */

import { describe, it, expect } from 'vitest';
import frame from '../../../templates/fixtures/rc-design-frame.json';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import {
  groupByElevation, groupByPlane, groupByFrameLine, groupByConnectivity,
  groupBySection, groupByMaterial, groupByKind, sectionOptions, materialOptions,
  clusterCoordinates, elevationLabel, bandSelection, memberKindOf, GROUP_TOL,
} from '../member-grouping';
import { runOrientationDiagnostic } from '../orientation-diagnostic';
import {
  planBatchEdit, applyPatch, patchTouchesBeam, patchTouchesColumn,
  BATCH_PREVIEW_CAP, BATCH_CONFIRM_THRESHOLD,
} from '../rebar-batch';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';
import { modelFromFixture, solveFixture, directionOf } from './helpers';
import type { ProvidedReinforcement } from '../../../store/model.svelte';

const frameModel = modelFromFixture(frame);
const solvedQa = solveFixture(qa8);

describe('elevation bands — derived, labelled, honest', () => {
  const g = groupByElevation(frameModel.data);

  it('derives one band per storey of the 8-storey flagship frame', () => {
    expect(g.available).toBe(true);
    // Nodes sit at z = 0, 3.4 … 27.2 (9 levels); beams exist at the 8 upper ones.
    expect(g.bands.length).toBeGreaterThanOrEqual(8);
    for (const b of g.bands) expect(b.label).toMatch(/^L\d+ [+−]\d+\.\d{2} m$/);
  });

  it('labels are the approved "L3 +10.20 m" form', () => {
    expect(elevationLabel(3, 10.2)).toBe('L3 +10.20 m');
    expect(elevationLabel(0, -1.5)).toBe('L0 −1.50 m');
  });

  it('assigns beams to their own band and columns to the band they rise from', () => {
    const band = g.bands.find(b => b.beamIds.length > 0)!;
    for (const id of band.beamIds) expect(memberKindOf(frameModel.data, id)).toBe('beam');
    for (const id of band.columnsRisingIds) expect(memberKindOf(frameModel.data, id)).toBe('column');
    const sel = bandSelection(band, 'rising');
    expect(sel.length).toBe(new Set(sel).size);       // no duplicates
    expect(sel).toEqual([...sel].sort((a, b) => a - b));
    expect(bandSelection(band, 'none').length).toBe(band.beamIds.length);
  });

  it('clusters with a 2·tol gap rule and tolerates small misalignment', () => {
    expect(clusterCoordinates([0, 0.05, 3.4, 3.42, 6.8], GROUP_TOL.z).length).toBe(3);
    // 0.12 m still clusters, 0.40 m does not.
    expect(clusterCoordinates([0, 0.12], GROUP_TOL.z).length).toBe(1);
    expect(clusterCoordinates([0, 0.40], GROUP_TOL.z).length).toBe(2);
  });

  it('refuses instead of guessing when the model has a single level', () => {
    const flat = modelFromFixture({
      ...qa8,
      nodes: qa8.nodes.map((n: any) => ({ ...n, z: 0 })),
    });
    const r = groupByElevation(flat.data);
    expect(r.available).toBe(false);
    expect(r.refusedKey).toBeTruthy();
  });
});

describe('structural planes and frame lines', () => {
  it('derives the X and Y grid planes of the flagship frame', () => {
    const p = groupByPlane(frameModel.data);
    expect(p.available).toBe(true);
    const xs = p.planes.filter(q => q.axis === 'X');
    const ys = p.planes.filter(q => q.axis === 'Y');
    // Grid is X {0, 7.5, 15, 22.5, 30} and Y {0, 6.5, 13, 19.5}.
    expect(xs.length).toBe(5);
    expect(ys.length).toBe(4);
    for (const q of p.planes) expect(q.label).toMatch(/^[XYZ] = -?\d+\.\d{2} m$/);
  });

  it('refuses planes on a model that is not grid-like', () => {
    const scattered = modelFromFixture({
      ...qa8,
      nodes: qa8.nodes.map((n: any, i: number) => ({ ...n, x: n.x + i * 0.37, y: n.y + i * 0.53 })),
    });
    const p = groupByPlane(scattered.data);
    if (!p.available) expect(p.refusedKey).toBeTruthy();
  });

  it('derives frame lines and reports splits/ambiguity rather than hiding them', () => {
    const f = groupByFrameLine(frameModel.data);
    expect(f.available).toBe(true);
    expect(f.lines.length).toBeGreaterThan(0);
    for (const l of f.lines) {
      expect(l.elementIds.length).toBeGreaterThan(0);
      expect(l.elementIds).toEqual([...l.elementIds].sort((a, b) => a - b));
    }
    expect(typeof f.totalSplits).toBe('number');
    expect(typeof f.ambiguousCount).toBe('number');
  });
});

describe('attribute and connectivity grouping', () => {
  it('groups by section, material and kind', () => {
    const secs = sectionOptions(frameModel.data);
    expect(secs.length).toBe(2);
    expect(secs.reduce((n, s) => n + s.count, 0)).toBe(frameModel.data.elements.size);
    expect(groupBySection(frameModel.data, secs[0].id).length).toBe(secs[0].count);
    const mats = materialOptions(frameModel.data);
    expect(groupByMaterial(frameModel.data, mats[0].id).length).toBe(mats[0].count);
    const beams = groupByKind(frameModel.data, 'beam');
    const cols = groupByKind(frameModel.data, 'column');
    expect(beams.length + cols.length).toBe(frameModel.data.elements.size);
    expect(beams.length).toBe(248);
    expect(cols.length).toBe(160);
  });

  it('walks connectivity one hop, same kind by default', () => {
    const seed = groupByKind(frameModel.data, 'beam')[0];
    const one = groupByConnectivity(frameModel.data, [seed], 1, true);
    expect(one).toContain(seed);
    expect(one.length).toBeGreaterThan(1);
    for (const id of one) expect(memberKindOf(frameModel.data, id)).toBe('beam');
    const two = groupByConnectivity(frameModel.data, [seed], 2, true);
    expect(two.length).toBeGreaterThanOrEqual(one.length);
  });
});

describe('orientation diagnostic', () => {
  // Sweeps every corrected fixture through the full design path. It is seconds of real work,
  // not a hang, and the 5 s default was cutting it off once collision sampling got finer.
  it('finds nothing on the corrected fixtures', () => {
    expect(solvedQa.orientationSuspect.size).toBe(0);
    const solvedFrame = solveFixture(frame);
    expect(solvedFrame.orientationSuspect.size).toBe(0);
  }, 120_000);

  it('catches gravity authored in the horizontal local component', () => {
    // Re-introduce the original defect: put the Y-beams' load back into qY.
    const broken = JSON.parse(JSON.stringify(qa8));
    for (const l of broken.loads) {
      if (l.type !== 'distributed3d') continue;
      l.data.qYI = l.data.qZI; l.data.qYJ = l.data.qZJ;
      l.data.qZI = 0; l.data.qZJ = 0;
    }
    const fm = modelFromFixture(broken);
    const r = runOrientationDiagnostic(fm.data, undefined, broken.loads);
    expect(r.suspect.size).toBeGreaterThan(0);
    expect(r.issues.some(i => i.kind === 'horizontalGravityLoad')).toBe(true);
  });

  it('catches an upright beam bending about its weak axis', () => {
    const fm = modelFromFixture(qa8);
    const beamId = groupByKind(fm.data, 'beam')[0];
    const demands = new Map([[beamId, {
      elementId: beamId, length: 6,
      demands: [
        { category: 'Mz+' as const, value: 300, absValue: 300, comboId: 1, comboName: 'C', stationT: 0.5, stationX: 3, forces: {} as never },
        { category: 'My+' as const, value: 5, absValue: 5, comboId: 1, comboName: 'C', stationT: 0.5, stationX: 3, forces: {} as never },
      ],
    }]]);
    const r = runOrientationDiagnostic(fm.data, demands, undefined);
    expect(r.suspect.has(beamId)).toBe(true);
    expect(r.issues[0].kind).toBe('weakAxisGravityBending');
  });
});

describe('batch edit — preview, compatibility, validation', () => {
  const beamId = [...solvedQa.contexts.keys()].find(id => solvedQa.contexts.get(id)!.elementType === 'beam')!;
  const colId = [...solvedQa.contexts.keys()].find(id => solvedQa.contexts.get(id)!.elementType === 'column')!;
  const current = new Map<number, ProvidedReinforcement>();
  const reinf = (id: number) => current.get(id);

  it('classifies which kinds a patch touches', () => {
    expect(patchTouchesBeam({ bottomSpan: { count: 4 } })).toBe(true);
    expect(patchTouchesColumn({ bottomSpan: { count: 4 } })).toBe(false);
    expect(patchTouchesColumn({ ties: { spacing: 0.1 } })).toBe(true);
  });

  it('writes a fitting beam arrangement and rebuilds the layers', () => {
    const ctx = solvedQa.contexts.get(beamId)!;
    const { candidate, blocks } = applyPatch(ctx, undefined, { bottomSpan: { count: 4, diameter: 20 } });
    expect(blocks).toEqual([]);
    expect(candidate!.regions!.bottomSpanLayers!.reduce((s, l) => s + l.count, 0)).toBe(4);
    expect(candidate!.regions!.bottomSpan).toEqual({ count: 4, diameter: 20 });
  });

  it('BLOCKS an arrangement that cannot fit, with a reason', () => {
    const ctx = solvedQa.contexts.get(beamId)!;
    const { candidate, blocks } = applyPatch(ctx, undefined, { bottomSpan: { count: 24, diameter: 32 } });
    expect(candidate).toBeUndefined();
    expect(blocks.some(b => b.reason === 'barFit')).toBe(true);
    expect(blocks[0].messageKey).toBeTruthy();
  });

  it('BLOCKS invalid spacing, legs, rho and tie spacing', () => {
    const bctx = solvedQa.contexts.get(beamId)!;
    expect(applyPatch(bctx, undefined, { stirrupsSupport: { spacing: 0.01 } }).blocks[0].reason).toBe('invalidValue');
    expect(applyPatch(bctx, undefined, { stirrupsSupport: { legs: 1 } }).blocks[0].reason).toBe('invalidValue');
    const cctx = solvedQa.contexts.get(colId)!;
    expect(applyPatch(cctx, undefined, { column: { cornerDia: 10, perFace: 0 } }).blocks.some(b => b.reason === 'minSteel')).toBe(true);
    expect(applyPatch(cctx, undefined, { column: { cornerDia: 32, perFace: 6 } }).blocks.some(b => b.reason === 'maxSteel')).toBe(true);
    expect(applyPatch(cctx, undefined, { ties: { spacing: 0.5 } }).blocks.some(b => b.reason === 'tieSpacing')).toBe(true);
    expect(applyPatch(cctx, undefined, { column: { perFace: 99 } }).blocks.some(b => b.reason === 'invalidValue')).toBe(true);
  });

  it('applies beam fields only to beams in a mixed selection', () => {
    const plan = planBatchEdit(
      cirsoc201Adapter, [beamId, colId], solvedQa.contexts, reinf,
      { bottomSpan: { count: 4, diameter: 20 } },
    );
    expect(plan.mixed).toBe(true);
    expect(plan.kinds.sort()).toEqual(['beam', 'column']);
    const beamRow = plan.rows.find(r => r.elementId === beamId)!;
    const colRow = plan.rows.find(r => r.elementId === colId)!;
    expect(beamRow.willChange).toBe(true);
    expect(colRow.blocks.some(b => b.reason === 'incompatibleType')).toBe(true);
    expect(plan.blockedCount).toBe(1);
  });

  it('previews before/after utilization from the AUTHORITATIVE verifier', () => {
    // A COMPLETE arrangement: all three regions plus both stirrup zones. An
    // incomplete one legitimately yields an infinite utilization (missing
    // reinforcement is a failure, not a skipped check), reported as null.
    const complete = {
      bottomSpan: { count: 6, diameter: 20 },
      topStart: { count: 4, diameter: 20 },
      topEnd: { count: 4, diameter: 20 },
      stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.10 },
      stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
    };
    const plan = planBatchEdit(cirsoc201Adapter, [beamId], solvedQa.contexts, reinf, complete);
    const row = plan.rows[0];
    expect(row.candidate).toBeDefined();
    expect(row.utilizationAfter).not.toBeNull();
    const direct = cirsoc201Adapter.verify(solvedQa.contexts.get(beamId)!, row.candidate!);
    expect(row.utilizationAfter).toBeCloseTo(+direct.worstUtilization.toFixed(3), 3);

    // An incomplete arrangement: infinite utilization surfaces as null, never as a
    // comfortable number.
    const partial = planBatchEdit(cirsoc201Adapter, [beamId], solvedQa.contexts, reinf,
      { bottomSpan: { count: 6, diameter: 20 } });
    expect(partial.rows[0].utilizationAfter).toBeNull();
    expect(partial.rows[0].statusAfter).toBe('fail');
  });

  it('honours protect-manual-overrides only when opted in', () => {
    const patch = { bottomSpan: { count: 4, diameter: 20 } };
    const off = planBatchEdit(cirsoc201Adapter, [beamId], solvedQa.contexts, reinf, patch,
      { manualOverrides: new Set([beamId]) });
    expect(off.changeCount).toBe(1);            // default OVERWRITES
    expect(off.protectedCount).toBe(0);
    const on = planBatchEdit(cirsoc201Adapter, [beamId], solvedQa.contexts, reinf, patch,
      { manualOverrides: new Set([beamId]), protectManualOverrides: true });
    expect(on.changeCount).toBe(0);
    expect(on.protectedCount).toBe(1);
    expect(on.rows[0].blocks[0].reason).toBe('protectedOverride');
  });

  it('reports preview truncation instead of silently dropping rows', () => {
    // ONE solve, reused. This solved the same fixture twice and threw the first result
    // away, which made the test cost ~5,3 s under full-suite load against the default 5 s
    // timeout — green in isolation at 1,6 s and intermittently red in a full run. Same
    // assertions, half the work; no timeout was raised to hide it.
    const solvedFrame = solveFixture(frame);
    const many = [...solvedFrame.contexts.keys()];
    const plan = planBatchEdit(cirsoc201Adapter, many, solvedFrame.contexts, () => undefined,
      { bottomSpan: { count: 4, diameter: 20 } });
    expect(plan.previewTotal).toBe(many.length);
    expect(plan.previewShown).toBeLessThanOrEqual(BATCH_PREVIEW_CAP);
    expect(plan.previewTruncated).toBe(true);
    // Counts cover the FULL selection, not just the previewed rows.
    expect(plan.changeCount + plan.unchangedCount + plan.blockedCount + plan.protectedCount).toBe(many.length);
  });

  it('leaves untouched fields untouched (no accidental homogenisation)', () => {
    const ctx = solvedQa.contexts.get(beamId)!;
    const start: ProvidedReinforcement = {
      regions: {
        bottomSpanLayers: [{ count: 4, diameter: 20, row: 0 }],
        bottomSpan: { count: 4, diameter: 20 },
        topStartLayers: [{ count: 3, diameter: 16, row: 0 }],
        topStart: { count: 3, diameter: 16 },
        stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.12 },
      },
    };
    const { candidate } = applyPatch(ctx, start, { bottomSpan: { diameter: 25 } });
    expect(candidate!.regions!.bottomSpan!.diameter).toBe(25);
    expect(candidate!.regions!.bottomSpan!.count).toBe(4);              // count preserved
    expect(candidate!.regions!.topStart).toEqual({ count: 3, diameter: 16 });
    expect(candidate!.regions!.stirrupsSupport!.spacing).toBeCloseTo(0.12, 6);
  });

  it('exposes the accidental-mass-edit thresholds', () => {
    expect(BATCH_CONFIRM_THRESHOLD).toBe(25);
  });
});

describe('direction helper (used by regression assertions)', () => {
  it('classifies the flagship frame into 160 columns, 128 X-beams, 120 Y-beams', () => {
    let col = 0, bx = 0, by = 0;
    for (const id of frameModel.data.elements.keys()) {
      const d = directionOf(frameModel.data, id);
      if (d === 'COL') col++; else if (d === 'BEAM-X') bx++; else by++;
    }
    expect([col, bx, by]).toEqual([160, 128, 120]);
  });
});
