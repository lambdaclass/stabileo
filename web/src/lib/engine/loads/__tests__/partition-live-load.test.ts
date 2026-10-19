/**
 * CIRSOC 101-2025 §4.3.2: the partition minimum is a LIVE load.
 *
 * The generator loaded the 0,75 kN/m² minimum as a dead row of the floor build-up, so it entered
 * 1,2 D (0,90 kN/m² factored) where the article puts it in L (1,6 L: 1,20). The article is in
 * chapter 4 (Sobrecargas de diseño) and releases the designer with "no se requerirá sobrecarga de
 * repartición"; §3.1.4 (chapter 3, dead loads) keeps the weight of KNOWN partitions as dead.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';
import {
  PARTITION_LIVE_EXEMPTION_KNM2, PARTITION_LIVE_MINIMUM_KNM2, partitionLiveAllowance,
} from '../../../codes/cirsoc101/live-loads';

const MD = (f: string) => readFileSync(fileURLToPath(new URL(`../../../../../../docs/codes/CIRSOC/markdown/cirsoc-101-2025/${f}`, import.meta.url)), 'utf8');

/** One storey, 6 × 6, four columns and four beams, loaded by width. */
function frame(): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  const corners = [[0, 0], [6, 0], [6, 6], [0, 6]];
  corners.forEach(([x, y], i) => {
    nodes.set(i + 1, { id: i + 1, x, y, z: 0 });
    nodes.set(i + 5, { id: i + 5, x, y, z: 3 });
    elements.set(i + 1, { id: i + 1, nodeI: i + 1, nodeJ: i + 5, sectionId: 1, materialId: 1 });
    elements.set(i + 5, { id: i + 5, nodeI: i + 5, nodeJ: ((i + 1) % 4) + 5, sectionId: 1, materialId: 1 });
  });
  return {
    nodes, elements,
    sections: new Map([[1, { id: 1, a: 0.09 }]]),
    materials: new Map([[1, { id: 1, rho: 25 }]]),
    loadCases: [{ id: 1, type: 'D', name: 'Dead' }, { id: 2, type: 'L', name: 'Live' }],
  };
}

function applied(reg: ProjectRegulations): ProjectRegulations {
  const out = { ...reg };
  for (const k of Object.keys(out) as Array<keyof ProjectRegulations>) {
    if (out[k].adapterId) out[k] = { ...out[k], configComplete: true, state: 'applied' };
  }
  return out;
}

const DEAD = 1.77; // the default build-up: 8 cm screed 1,44 + tile 0,28 + ceiling 0,05

function input(over: Partial<LoadPlanInput> = {}): LoadPlanInput {
  return {
    regulations: applied(defaultRegulations()),
    model: frame(),
    dead: [{ labelKey: 'build-up', q: DEAD }],
    occupancyKey: 'vivienda',
    tributaryWidth: 3,
    gravity: { mode: 'width' },
    reductionElementKind: 'interiorBeam',
    floorsSupported: 1,
    applyLiveReduction: false,
    generateCombinations: false,
    ...over,
  };
}

/** The line load of a beam (element 5) in a case, kN/m, downward positive. */
function beamLoad(p: ReturnType<typeof buildLoadPlan>, type: 'D' | 'L'): number {
  const idx = p.cases.findIndex((c) => c.type === type);
  return -p.distributed
    .filter((d) => d.elementId === 5 && d.caseType === type && (d.caseIndex === undefined || d.caseIndex === idx) && d.a === undefined)
    .reduce((s, d) => s + d.q, 0);
}

describe('the text', () => {
  it('§4.3.2 is in chapter 4 and calls the allowance a live load; §3.1.4 is in chapter 3', () => {
    const ch3 = MD('capitulo-3-cargas-permanentes.md').replace(/\s+/g, ' ');
    const ch4 = MD('capitulo-4-sobrecargas-de-diseno.md');
    const a432 = ch4.slice(ch4.indexOf('### 4.3.2'), ch4.indexOf('### 4.3.3'))
      .split('\n').map((l) => l.slice(0, 60)).join(' ').replace(/\s+/g, ' ');
    expect(a432).toMatch(/deberá ser mayor o igual que 0,75 kN\/m2/);
    expect(a432).toMatch(/mayor que 3,85 kN\/m2 no se requerirá sobrecarga de repartición/);
    expect(ch3).toMatch(/3\.1\.4 Carga debida a elementos divisorios/);
    expect(PARTITION_LIVE_MINIMUM_KNM2).toBe(0.75);
    expect(PARTITION_LIVE_EXEMPTION_KNM2).toBe(3.85);
  });
});

describe('partitionLiveAllowance', () => {
  it('applies the asked value at Lo ≤ 3,85 and none above', () => {
    expect(partitionLiveAllowance(2, 0.75).qKNm2).toBe(0.75);
    expect(partitionLiveAllowance(3.85, 0.75).qKNm2).toBe(0.75);
    const over = partitionLiveAllowance(4, 0.75);
    expect([over.qKNm2, over.exempt, over.message.key]).toEqual([0, true, 'loads.cirsoc101.live.partitionExempt']);
  });

  it('says an allowance under the minimum, and leaves the value as asked', () => {
    const r = partitionLiveAllowance(2, 0.5);
    expect(r.qKNm2).toBe(0.5);
    expect(r.message.key).toBe('loads.cirsoc101.live.partitionBelowMinimum');
    expect(partitionLiveAllowance(2, 0).message.key).toBe('loads.cirsoc101.live.partitionOff');
  });
});

describe('the load plan', () => {
  it('puts the allowance in L, not in D', () => {
    const p = buildLoadPlan(input({ partitionLive: 0.75 }));
    expect(p.outcome).toBe('READY');
    // 3 m of width: D = 1,77 · 3, L = (2,0 + 0,75) · 3.
    expect(beamLoad(p, 'D')).toBeCloseTo(DEAD * 3, 9);
    expect(beamLoad(p, 'L')).toBeCloseTo((2.0 + 0.75) * 3, 9);
    expect(p.factors.partitionLive?.value).toBe(0.75);
    expect(p.derivation.some((m) => m.key === 'loads.cirsoc101.live.partitionApplied')).toBe(true);
  });

  it('factored, 1,2 D + 1,6 L carries 0,30 kN/m² more than with the allowance as dead', () => {
    const asLive = buildLoadPlan(input({ partitionLive: 0.75 }));
    // What the generator used to produce: the 0,75 inside the dead build-up, no live allowance.
    const asDead = buildLoadPlan(input({ dead: [{ labelKey: 'build-up', q: DEAD + 0.75 }] }));
    const f = (p: typeof asLive) => 1.2 * beamLoad(p, 'D') + 1.6 * beamLoad(p, 'L');
    expect(f(asDead)).toBeCloseTo((1.2 * (DEAD + 0.75) + 1.6 * 2.0) * 3, 9);
    expect(f(asLive) - f(asDead)).toBeCloseTo((1.6 - 1.2) * 0.75 * 3, 9);
  });

  it('is added unreduced: §4.7.1 reduces Tabla 4.1 values only', () => {
    const big = input({ applyLiveReduction: true, tributaryWidth: 6 });
    const without = buildLoadPlan(big);
    const withIt = buildLoadPlan({ ...big, partitionLive: 0.75 });
    expect(beamLoad(without, 'L')).toBeLessThan(2.0 * 6);
    expect(beamLoad(withIt, 'L') - beamLoad(without, 'L')).toBeCloseTo(0.75 * 6, 9);
  });

  it('is not owed over Lo = 3,85 kN/m², and the plan says so', () => {
    const p = buildLoadPlan(input({ occupancyKey: 'reunion_otras', partitionLive: 0.75 }));
    const without = buildLoadPlan(input({ occupancyKey: 'reunion_otras' }));
    expect(beamLoad(p, 'L')).toBeCloseTo(beamLoad(without, 'L'), 9);
    expect(p.derivation.some((m) => m.key === 'loads.cirsoc101.live.partitionExempt')).toBe(true);
  });

  it('absent, the plan is the one it always was', () => {
    const p = buildLoadPlan(input());
    expect(beamLoad(p, 'L')).toBeCloseTo(2.0 * 3, 9);
    expect(p.factors.partitionLive).toBeUndefined();
  });

  it('enters the seismic weight as live, at the participation of Tabla 3.3 (CIRSOC 103 [3.15])', () => {
    const p = buildLoadPlan(input({ partitionLive: 0.75 }));
    const without = buildLoadPlan(input());
    const top = (q: typeof p) => q.levels[q.levels.length - 1]!;
    expect(top(p).liveTotalKN - top(without).liveTotalKN).toBeCloseTo(0.75 * top(p).planAreaM2, 6);
    expect(top(p).superimposedKN).toBeCloseTo(top(without).superimposedKN, 9);
  });
});
