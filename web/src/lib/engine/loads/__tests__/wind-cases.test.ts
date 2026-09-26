/**
 * The four design wind load cases of CIRSOC 102-2025 Fig. 2.4-8, checked by statics: each case's
 * resultant force and torsional moment per level against the figure's fractions and e = ±0,15 B,
 * and the roof loads against p = q_h·G·C_p − q_i·(GC_pi) zone by zone.
 */
import { describe, it, expect } from 'vitest';
import { levelLoads, roofMembers, roofLoads, windLoadCases, type WindAxis, type WindModel } from '../wind-cases';
import { flatRoofCp, G_RIGID, type WindProject } from '../../../codes/cirsoc102/wind';

/** A one-storey box: 4 columns at the corners of Bx × By, 4 roof beams at height h. */
function box(bx: number, by: number, h: number): WindModel {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const pts: Array<[number, number]> = [[0, 0], [bx, 0], [bx, by], [0, by]];
  pts.forEach(([x, y], i) => {
    nodes.set(i + 1, { id: i + 1, x, y, z: 0 });
    nodes.set(i + 5, { id: i + 5, x, y, z: h });
  });
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number }>();
  let id = 1;
  for (let i = 1; i <= 4; i++) elements.set(id, { id: id++, nodeI: i, nodeJ: i + 4 });
  for (let i = 5; i <= 8; i++) elements.set(id, { id: id++, nodeI: i, nodeJ: i === 8 ? 5 : i + 1 });
  return { nodes, elements };
}

const project = (along: number, across: number, h: number): WindProject => ({
  basicSpeed: 45, exposure: 'C', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, structureKind: 'building',
  enclosure: 'enclosed', meanRoofHeight: h, L: along, B: across, roofSlopeDeg: 0, rigid: true,
});

function axes(bx: number, by: number, h: number, fx: number, fy: number): WindAxis[] {
  const top = [5, 6, 7, 8];
  return [
    { axis: 'x', across: by, along: bx, levels: [{ elevation: h, nodeIds: top, force: fx, pressureForce: fx }], project: project(bx, by, h), qhNm2: 800, gcpi: 0.18 },
    { axis: 'y', across: bx, along: by, levels: [{ elevation: h, nodeIds: top, force: fy, pressureForce: fy }], project: project(by, bx, h), qhNm2: 800, gcpi: 0.18 },
  ];
}

/** Resultant of a case's nodal loads: forces and the moment about the vertical through (cx, cy). */
function resultant(model: WindModel, nodal: Array<{ nodeId: number; fx: number; fy: number; mz: number }>, cx: number, cy: number) {
  let fx = 0, fy = 0, mz = 0;
  for (const n of nodal) {
    const p = model.nodes.get(n.nodeId)!;
    fx += n.fx; fy += n.fy;
    mz += (p.x - cx) * n.fy - (p.y - cy) * n.fx + n.mz;
  }
  return { fx, fy, mz };
}

describe('levelLoads', () => {
  it('spreads a force and a torsional moment with exactly that resultant', () => {
    const m = box(12, 8, 4);
    const r = resultant(m, levelLoads(m.nodes, [5, 6, 7, 8], 30, -10, 45), 6, 4);
    expect(r.fx).toBeCloseTo(30, 10);
    expect(r.fy).toBeCloseTo(-10, 10);
    expect(r.mz).toBeCloseTo(45, 10);
  });

  it('puts the moment on the node when a level has only one', () => {
    const m = box(12, 8, 4);
    expect(levelLoads(m.nodes, [5], 3, 0, 7)).toEqual([{ nodeId: 5, fx: 3, fy: 0, mz: 7 }]);
  });
});

describe('the cases of Fig. 2.4-8', () => {
  const bx = 12, by = 8, h = 4, FX = 40, FY = 60;
  const m = box(bx, by, h);
  const run = windLoadCases({ model: m, axes: axes(bx, by, h, FX, FY), set: 'all', bothSenses: true, tributaryWidth: 2, speed: 45 });
  const byKey = (key: string, params: Record<string, string>) => run.cases.filter((c) =>
    c.nameKey === key && Object.entries(params).every(([k, v]) => c.nameParams[k] === v));

  it('case 1: the full force along one axis, in each sense, with no torsion', () => {
    for (const c of byKey('autoLoad.windCase1Gcpi', { dir: '+X' })) {
      const r = resultant(m, c.nodal, bx / 2, by / 2);
      expect(r.fx).toBeCloseTo(FX, 9); expect(r.fy).toBeCloseTo(0, 9); expect(r.mz).toBeCloseTo(0, 9);
    }
    for (const c of byKey('autoLoad.windCase1Gcpi', { dir: '−Y' })) {
      expect(resultant(m, c.nodal, bx / 2, by / 2).fy).toBeCloseTo(-FY, 9);
    }
  });

  it('case 2: three quarters of it with MT = 0,75·F·(±0,15 B)', () => {
    const [plus] = byKey('autoLoad.windCase2', { dir: '+X', e: '+' });
    const r = resultant(m, plus!.nodal, bx / 2, by / 2);
    expect(r.fx).toBeCloseTo(0.75 * FX, 9);
    expect(r.mz).toBeCloseTo(0.75 * FX * 0.15 * by, 9);
    const [minus] = byKey('autoLoad.windCase2', { dir: '+X', e: '−' });
    expect(resultant(m, minus!.nodal, bx / 2, by / 2).mz).toBeCloseTo(-0.75 * FX * 0.15 * by, 9);
  });

  it('case 3: three quarters along both axes at once, without torsion', () => {
    const [c] = byKey('autoLoad.windCase3', { dirX: '+X', dirY: '−Y' });
    const r = resultant(m, c!.nodal, bx / 2, by / 2);
    expect(r.fx).toBeCloseTo(0.75 * FX, 9);
    expect(r.fy).toBeCloseTo(-0.75 * FY, 9);
    expect(r.mz).toBeCloseTo(0, 9);
  });

  it('case 4: 0,563 along both axes, with both torsions in one sense', () => {
    const [c] = byKey('autoLoad.windCase4', { dirX: '+X', dirY: '+Y', e: '+' });
    const r = resultant(m, c!.nodal, bx / 2, by / 2);
    expect(r.fx).toBeCloseTo(0.563 * FX, 9);
    expect(r.fy).toBeCloseTo(0.563 * FY, 9);
    expect(r.mz).toBeCloseTo(0.563 * (FX * 0.15 * by + FY * 0.15 * bx), 9);
  });

  it('counts: 8 + 8 + 4 + 8 cases with a roof, both senses and both axes', () => {
    expect(run.cases).toHaveLength(28);
    const one = windLoadCases({ model: m, axes: axes(bx, by, h, FX, FY), set: 'cases13', bothSenses: false, tributaryWidth: 2, speed: 45 });
    // case 1: 2 axes × 2 internal-pressure signs; case 3: +X with ±Y.
    expect(one.cases).toHaveLength(4 + 2);
  });
});

describe('roof pressures', () => {
  const bx = 30, by = 8, h = 4;
  const m = box(bx, by, h);
  const roof = roofMembers(m);
  const bounds = { minX: 0, maxX: bx, minY: 0, maxY: by };
  const ax = axes(bx, by, h, 10, 10)[0]!;

  it('are carried by the top beams and not by the columns', () => {
    expect(roof.map((r) => r.id).sort()).toEqual([5, 6, 7, 8]);
  });

  it('read Cp by distance from the windward edge, with the internal pressure that adds to suction', () => {
    const q = roofLoads(roof, ax, 1, 1, 2, bounds);
    // Member 5 runs along x at y = 0, midpoint x = 15 m from the windward edge: beyond 2h.
    const cp = flatRoofCp(h / bx, 15, h).cp;
    const p = 800 * G_RIGID * Math.min(...cp) - 0.18 * 800;
    expect(q.get(5)).toBeCloseTo((-p / 1000) * 2, 10);
    // Member 8 (x = 0, parallel to the wind's front) sits on the windward edge: −0,9.
    const p8 = 800 * G_RIGID * -0.9 - 0.18 * 800;
    expect(q.get(8)).toBeCloseTo((-p8 / 1000) * 2, 10);
  });

  it('mirror their zones for wind from the other side, and reverse nothing', () => {
    const plus = roofLoads(roof, ax, 1, 1, 2, bounds), minus = roofLoads(roof, ax, -1, 1, 2, bounds);
    expect(minus.get(6)).toBeCloseTo(plus.get(8)!, 10);   // x = 30 is windward for −X
    for (const v of minus.values()) expect(v).toBeGreaterThan(0);   // still suction
  });
});
