/**
 * A seven-storey building on presumed 150 kPa with property lines on all four sides, read from the
 * engineer's own file where this machine has it (it is not in the repository): every layout is
 * what it says, and either verifies or says what it needs; the mat, held at the four lines, takes
 * the punching of its columns with stirrups or a drop under them; on a soil too weak for the plan
 * the lines allow, it says the allowable pressure it verifies at.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { deserializeProject } from '../file';
import { preparePlatesForAnalysis } from '../physical-plates';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { buildSheetRows, setSheetCode } from '../rc-sheets.svelte';
import { patchDesignData } from '../design-data';
import { setFoundationSystem } from '../rc-sheets-footings';
import type { FootingRow } from '../../rc-sheets/footing-types';

const FILE = '/Users/batui/Downloads/Seven-story RC building.ded';
const ALL = { minX: true, maxX: true, minY: true, maxY: true };
const failing = (r: FootingRow) => r.verifications.filter((v) => !v.ok).map((v) => v.label);

describe.skipIf(!existsSync(FILE))('the engineer\'s seven-storey building, all four property lines', () => {
  beforeAll(async () => {
    await wasmSolver.initSolver();
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    expect(deserializeProject(readFileSync(FILE, 'utf8'))).toBe(true);
    uiStore.analysisMode = 'pro';
    preparePlatesForAnalysis();
    syncDefinedLoadsForAnalysis();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    setSheetCode('cirsoc201-2025');
  }, 600_000);

  it('at 150 kPa every layout keeps its own kind; the recommendation and the mat verify; footings only says what overlaps; the strips at the lines take their offset by strap beams and say what overlaps and the pressure they need', () => {
    patchDesignData({ propertyLines: ALL, presumedBearingKPa: 150 });
    setFoundationSystem(null);
    const layouts = buildSheetRows().footingLayouts!;
    const of = (s: string) => layouts.find((l) => l.system === s)!;
    for (const l of layouts) console.log(l.system, JSON.stringify(l.summary), l.rows.map((r) => `${r.name} ${r.B}×${r.L}×${r.h} ${r.status} ${failing(r).join(',')}`).join(' | '));
    for (const s of ['auto', 'mat']) {
      const l = of(s);
      expect(l.rows).toHaveLength(1);
      expect(l.rows[0]!.group?.kind).toBe('mat');
      expect(l.summary.failing, failing(l.rows[0]!).join('; ')).toBe(0);
      const fixed = l.rows[0]!.group!.columns.filter((c) => c.punching?.fix);
      expect(fixed.some((c) => c.punching!.fix!.cage)).toBe(true);
      expect(fixed.some((c) => c.punching!.fix!.drop)).toBe(true);
    }
    const feet = of('footings');
    expect(feet.rows.length).toBeGreaterThan(1);
    expect(feet.rows.some((r) => r.group)).toBe(false);
    for (const r of feet.rows.filter((x) => x.status === 'fail')) expect(failing(r).length, r.name).toBeGreaterThan(0);
    const strips = of('strips');
    expect(strips.rows.every((r) => r.group?.kind === 'strip')).toBe(true);
    expect(strips.rows.length).toBe(3);
    for (const r of strips.rows.filter((x) => x.group!.anchor[x.group!.axis === 'x' ? 1 : 0] !== 0)) {
      expect(r.group!.straps.length, r.name).toBe(r.group!.columns.length);
      expect(r.group!.ties, r.name).toEqual([]);
    }
    for (const r of strips.rows.filter((x) => x.status === 'fail')) expect(failing(r).every((l) => ['rcSheets.v.footOverlap', 'rcSheets.v.footBearing', 'rcSheets.v.footNeedsSoil'].includes(l)), `${r.name}: ${failing(r).join(', ')}`).toBe(true);
  }, 900_000);

  it('on a soil too weak for the plan the lines allow, the mat is designed through and says the allowable pressure it verifies at', () => {
    patchDesignData({ propertyLines: ALL, presumedBearingKPa: 80 });
    setFoundationSystem('mat');
    const mat = buildSheetRows().footing[0]!;
    expect(mat.group?.kind).toBe('mat');
    expect(mat.sizing.needs).toBeGreaterThan(80);
    const line = mat.verifications.find((v) => v.label === 'rcSheets.v.footNeedsSoil')!;
    expect(line.demand).toBe(`qadm ≥ ${mat.sizing.needs} kPa`);
    expect(failing(mat).every((l) => l === 'rcSheets.v.footBearing' || l === 'rcSheets.v.footNeedsSoil'), failing(mat).join('; ')).toBe(true);
    expect(buildSheetRows().footingLayouts!.find((l) => l.system === 'mat')!.summary.needs).toBe(mat.sizing.needs);
    patchDesignData({ presumedBearingKPa: 150 });
    setFoundationSystem(null);
  }, 900_000);
});
