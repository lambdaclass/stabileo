/**
 * Snow on the part of a pitched roof that its eaves carry (`plan-gravity.ts`, the roof's fringe):
 * every code reads the shape factor at the slope of the roof over the panel (`snowSlopes`), as it
 * does on the rafters, not as a flat roof. A rafter is at most 30° (`beamLike`), so the factors that
 * move below that are the slippery ones (CIRSOC 104 and ASCE 7 Cs from 5°) and ASCE 7's low-slope
 * minimum (§7.3.4, under 15°); EN 1991-1-3 μ1 and TS 498 Çizelge 3 are flat up to 30°.
 */
import { describe, expect, it } from 'vitest';
import { gravityLayout, type GravityModel } from '../plan-gravity';
import { snowSlopes } from '../snow-loads';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { planInput } from '../../../codes/__tests__/family-plan-helpers';
import type { LoadFamilyChoice } from '../../../codes/families/stacks';
import { slopeFactor } from '../../../codes/cirsoc104/snow';
import { PSF } from '../../../codes/asce7/refs';

/** A 6 × 6 m shed: columns 3 m, an eave ring, rafters at x = 0, 3, 6 up to a ridge at 4,5 m along y = 3. */
function shed(): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  let n = 1, e = 1;
  const node = (x: number, y: number, z: number) => { nodes.set(n, { id: n, x, y, z }); return n++; };
  const bar = (i: number, j: number) => { elements.set(e, { id: e, nodeI: i, nodeJ: j, sectionId: 1, materialId: 1 }); return e++; };
  const eave: number[][] = [];
  for (const x of [0, 3, 6]) {
    const lo = node(x, 0, 3), hi = node(x, 6, 3), ridge = node(x, 3, 4.5);
    eave.push([lo, hi]);
    bar(lo, ridge); bar(ridge, hi);
    if (x !== 3) { bar(node(x, 0, 0), lo); bar(node(x, 6, 0), hi); }
  }
  for (const side of [0, 1]) { bar(eave[0]![side]!, eave[1]![side]!); bar(eave[1]![side]!, eave[2]![side]!); }
  bar(eave[0]![0]!, eave[0]![1]!); bar(eave[2]![0]!, eave[2]![1]!);
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.01 }]]), materials: new Map([[1, { id: 1, rho: 78.5 }]]), loadCases: [] };
}

const SLOPE = (Math.atan(1.5 / 3) * 180) / Math.PI;
const layoutOf = () => gravityLayout(shed() as GravityModel, { mode: 'panels', tributaryWidth: 1 });

describe('the slope of a roof panel', () => {
  it('the eaves carry a part of the roof, and it takes the rafters\' slope', () => {
    const layout = layoutOf();
    const roofPieces = layout.pieces.filter((p) => p.roof);
    expect(roofPieces.length).toBeGreaterThan(0);
    const s = snowSlopes(shed(), layout);
    for (const p of roofPieces) expect(s.panel(p.panel)).toBeCloseTo(SLOPE, 6);
  });
});

describe('the snow codes read the panel at the roof slope', () => {
  const run = (family: LoadFamilyChoice, codeInputs: LoadPlanInput['codeInputs'], slippery: boolean) => buildLoadPlan(planInput(family, {
    model: shed(), tributaryWidth: 1, gravity: { mode: 'panels' }, codeInputs,
    snow: { enabled: true, pg: 1, source: 'site', terrain: 'C', exposure: 'partial', thermal: 'normal', category: 'II', roofKind: 'mono', slippery, partial: false } as LoadPlanInput['snow'],
  }));
  /** The balanced snow per m² of plan on the eaves' roof pieces. */
  const onPanels = (p: ReturnType<typeof buildLoadPlan>) => {
    const pieces = layoutOf().pieces.filter((x) => x.roof && x.wI > 1e-6);
    const s = p.cases.findIndex((c) => c.type === 'S');
    const ratios = pieces.map((pc) => {
      const d = p.distributed.find((x) => x.caseIndex === s && x.elementId === pc.elementId && (x.a ?? 0) === (pc.a ?? 0) && Math.abs(x.q) > 0);
      return d ? -d.q / pc.wI : NaN;
    }).filter(Number.isFinite);
    expect(ratios.length).toBeGreaterThan(0);
    return ratios[0]!;
  };
  it('CIRSOC 104: Cs of a slippery roof at the roof slope', () => {
    const slippery = run('cirsoc', {}, true), rough = run('cirsoc', {}, false);
    expect(slippery.outcome).toBe('READY');
    expect(onPanels(slippery) / onPanels(rough)).toBeCloseTo(slopeFactor(SLOPE, 1, true), 6);
  });
  it('ASCE 7-22: Cs at the roof slope, and no low-slope minimum on it', () => {
    const p = run('us', { 'asce7-22-snow': { pg: 20 * PSF, ce: 1, ct: 1, slippery: true } }, true);
    expect(p.outcome).toBe('READY');
    expect(onPanels(p)).toBeCloseTo(0.7 * 20 * PSF * slopeFactor(SLOPE, 1, true), 6);
  });
  it('EN 1991-1-3 and TS 498: flat up to 30°, the same value on the panel and the rafters', () => {
    const ec = run('eurocode', { 'en1991-1-3': { sk: 1, roof: 'monopitch' } }, false);
    expect(onPanels(ec)).toBeCloseTo(0.8, 6);
    const tr = run('turkey', { 'ts498-1997-snow': { zone: 'II', altitudeM: 900 } }, false);
    expect(onPanels(tr)).toBeCloseTo(0.95, 6);
  });
});
