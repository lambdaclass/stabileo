/**
 * The deflection the sheets check on the CIRSOC 201 flexure post's beam: 20×40, 5 m simply
 * supported, D = 12 kN/m plus 2 kN/m of self-weight and L = 8 kN/m. Its service response by load
 * group is the textbook one, 5wL⁴/384 and wL²/8; the design data say what it carries.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { ensurePhysicalModel } from '../plates-from-shells';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, redesignerOf, setDeflectionSettings } from '../rc-sheets.svelte';
import { resizeHints } from '../rc-sheets-resize';
import { designData } from '../design-data';
import type { Serviceable } from '../../rc-sheets/deflection';

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('deflections in the sheets', () => {
  it('reads each load group from the analysis, spares the beam by Table 9.3.1.1, and calculates it when it carries brittle partitions', async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await modelStore.loadExample('rc-beam-flexure');
    ensurePhysicalModel(); syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    let rows = buildSheetRows();
    const span = rows.beam[0]!;
    const sv = (span.demand as typeof span.demand & Serviceable).service!;
    const L = span.length, wD = 14, wL = 8;
    expect(L).toBeCloseTo(5, 6);
    expect(sv.dead.k).toBeCloseTo((5 * wD * L ** 4) / 384, 0);
    expect(sv.dead.m).toBeCloseTo((wD * L * L) / 8, 1);
    expect(sv.live.k).toBeCloseTo((5 * wL * L ** 4) / 384, 0);
    expect(sv.live.m).toBeCloseTo((wL * L * L) / 8, 1);
    const spared = span.verifications.find((v) => v.label === 'rcSheets.v.deflectionDepth')!;
    expect(spared.ok).toBe(true);
    expect(spared.ratio).toBeCloseTo(5 / 16 / 0.4, 6);

    setDeflectionSettings({ supports: 'fragile', months: 12 });
    expect(designData().designOptions?.deflection).toEqual({ supports: 'fragile', months: 12 });
    rows = buildSheetRows();
    const r = rows.beam[0]!;
    const line = r.verifications.find((v) => v.label === 'rcSheets.v.deflection')!;
    expect(line).toBeDefined();
    expect(line.capacity).toContain('ℓ/480');
    const group = r.steps.find((g) => g.title === 'rcSheets.g.deflection')!;
    expect(group.steps.find((s) => s.label === 'rcSheets.s.defl.longTerm')!.formula).toContain('ξ = 1,4');
    expect(line.ok).toBe(r.status !== 'fail' || r.verifications.some((v) => !v.ok && v.label !== 'rcSheets.v.deflection'));
    setDeflectionSettings({ supports: undefined, months: undefined });
    expect(designData().designOptions?.deflection).toBeUndefined();
  }, 300000);

  it('offers a beam shallower only as far as it still verifies its deflection, deeper when brittle partitions ask more of it', () => {
    const shallowest = () => {
      const r = buildSheetRows().beam[0]!;
      const h = resizeHints(r).find((x) => x.what === 'beamH' && x.direction === 'shrink');
      return { r, to: h?.to?.[0] ?? r.h };
    };
    const loose = shallowest();
    expect(loose.to).toBeLessThan(loose.r.h);
    const at = redesignerOf(loose.r.key)!({ ...loose.r.demand, h: loose.to } as never);
    expect(at.status).not.toBe('fail');
    expect(at.verifications.some((v) => v.label.startsWith('rcSheets.v.deflection'))).toBe(true);
    const below = redesignerOf(loose.r.key)!({ ...loose.r.demand, h: Math.round((loose.to - 0.05) * 1000) / 1000 } as never);
    expect(below.status).toBe('fail');
    setDeflectionSettings({ supports: 'fragile' });
    const strict = shallowest();
    expect(strict.to).toBeGreaterThanOrEqual(loose.to);
    setDeflectionSettings({ supports: undefined });
  }, 300000);
});
