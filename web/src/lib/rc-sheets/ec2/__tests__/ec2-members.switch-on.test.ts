import { describe, it, expect } from 'vitest';
import type { ColumnDemand } from '../../column-row';
import type { SlabDemand } from '../../slab-row';
import type { WallDemand } from '../../wall-row';
import type { PunchingDemand } from '../../punching-row';
import { makeFmt } from '../../format';
import { EC2_SET, UK_SET } from '../basis';
import { effectiveLength, makeColumnRow, tieSpacingMax } from '../column-row';
import { makeSlabRow, slabSpacing } from '../slab-row';
import { makeWallRow } from '../wall-row';
import { makePunchingRow } from '../punching-row';

const f = makeFmt('.');
const find = (r: { verifications: Array<{ label: string; ok: boolean; demand?: string; capacity?: string }> }, label: string) => r.verifications.find((v) => v.label === label);

describe('EC2 column row', () => {
  const col: ColumnDemand = {
    key: 'column:1:0', name: 'C1', b: 0.3, h: 0.3, length: 3, lu: 2.6, psiTop: 1, psiBot: 1,
    cases: [{ combo: 'U', pu: 1500, puMin: 1480, puD: 1000, mxTop: 20, mxBot: -10, myTop: 5, myBot: -5, vx: 20, vy: 10 }],
  };
  const ctx = { mat: { fc: 30, fy: 500 }, cover: 0.03, tieDia: 8, diameters: [8, 10, 12, 16, 20, 25] };

  it('takes l0 of Eq. 5.15 with k = Ψ/2 and As,min of 9.5.2(2)', () => {
    // k1 = k2 = 0.5: l0 = 0.5·2.6·(1 + 0.5/0.95) = 1.984 m.
    expect(effectiveLength(2.6, 1, 1).l0).toBeCloseTo(0.5 * 2.6 * (1 + 0.5 / 0.95), 4);
    const r = makeColumnRow(EC2_SET)(col, ctx, undefined, f);
    // As,min = max(0.10·1500/434.78; 0.002·900) = max(3.45; 1.80) = 3.45 cm².
    expect(r.req.ast).toBeGreaterThanOrEqual(0.1 * 1500 / (500 / 1.15) * 10 - 1e-6);
    expect(r.checks.area).toBeGreaterThanOrEqual(r.req.ast - 1e-6);
    expect(r.verifications.every((v) => v.ok)).toBe(true);
  });

  it('limits the ties by 9.5.3: Ø ≥ max(6; φ/4), s ≤ 0.6·min(20φ; b; 400 mm)', () => {
    expect(tieSpacingMax(16, 0.3, 0.3)).toBeCloseTo(0.3, 6);
    const r = makeColumnRow(EC2_SET)(col, ctx, { corner: 16, nx: 0, dx: 16, ny: 0, dy: 16, tieDia: 6, tieSpacing: 0.25 }, f);
    expect(find(r, 'rcSheets.v.tieSpacing')!.ok).toBe(false);
    const ok = makeColumnRow(EC2_SET)(col, ctx, { corner: 20, nx: 0, dx: 20, ny: 0, dy: 20, tieDia: 6, tieSpacing: 0.175 }, f);
    expect(find(ok, 'rcSheets.v.tieSpacing')!.ok).toBe(true);
  });

  it('reads the least bar diameter of 9.5.2(1): 8 mm recommended, 12 mm in the UK National Annex', () => {
    const a = { corner: 10, nx: 1, dx: 10, ny: 1, dy: 10, tieDia: 6, tieSpacing: 0.1 };
    expect(find(makeColumnRow(EC2_SET)(col, ctx, a, f), 'rcSheets.ec2.v.colBarMin')!.ok).toBe(true);
    expect(find(makeColumnRow(UK_SET)(col, ctx, a, f), 'rcSheets.ec2.v.colBarMin')!.ok).toBe(false);
  });
});

describe('EC2 slab row', () => {
  const slab: SlabDemand = {
    key: 'slab:1', name: 'L1', lx: 5, ly: 6, h: 0.2,
    m: { bottomX: { value: 30 }, bottomY: { value: 20 }, topX: { value: 0 }, topY: { value: 0 } },
    q: { x: { value: 40 }, y: { value: 30 } },
  };
  const ctx = { mat: { fc: 25, fy: 500 }, cover: 0.025, diameters: [6, 8, 10, 12, 16] };

  it('designs a metre strip and checks the spacing of 9.3.1.1(3)', () => {
    // d = 200 − 25 − 5 = 170 mm: 13 333·x·(0.17 − 0.4x) = 30 → x = 0.013678 m, z = 0.16453 m, As = 30/(434 783·0.16453) = 4.19 cm²/m.
    const x = (2266.67 - Math.sqrt(2266.67 ** 2 - 4 * 5333.33 * 30)) / (2 * 5333.33);
    const as = 30 / ((500 / 1.15) * 1000 * (0.17 - 0.4 * x)) * 1e4;
    const r = makeSlabRow(EC2_SET)(slab, ctx, { bottomX: { dia: 10, spacing: 0.15 }, bottomY: { dia: 10, spacing: 0.15 }, topX: { dia: 0, spacing: 0 }, topY: { dia: 0, spacing: 0 } }, f);
    expect(r.faces.bottomX.asStrength).toBeCloseTo(as, 2);
    expect(slabSpacing(0.2, true, true)).toBeCloseTo(0.25, 6);
    expect(slabSpacing(0.2, true, false)).toBeCloseTo(0.4, 6);
    const wide = makeSlabRow(EC2_SET)(slab, ctx, { bottomX: { dia: 12, spacing: 0.3 }, bottomY: { dia: 10, spacing: 0.15 }, topX: { dia: 0, spacing: 0 }, topY: { dia: 0, spacing: 0 } }, f);
    expect(find(wide, 'rcSheets.v.slabSpacing')!.ok).toBe(false);
  });

  it('checks shear per metre without links (6.2.2(1))', () => {
    // Ø10 c/15 = 5.236 cm²/m, d = 0.17: k = 1 + √(200/170) = 2 (capped), ρl = 0.00308; 0.12·2·(100·0.00308·25)^⅓ = 0.474 MPa
    // against vmin = 0.035·2^1.5·5 = 0.495 MPa: vmin governs, VRd,c = 0.495·0.17·1000 = 84.2 kN/m.
    const r = makeSlabRow(EC2_SET)(slab, ctx, { bottomX: { dia: 10, spacing: 0.15 }, bottomY: { dia: 10, spacing: 0.15 }, topX: { dia: 0, spacing: 0 }, topY: { dia: 0, spacing: 0 } }, f);
    expect(r.shear.x.phiVc).toBeCloseTo(0.035 * 2 ** 1.5 * 5 * 0.17 * 1000, 1);
    expect(makeSlabRow(EC2_SET)(slab, ctx, undefined, f).status).not.toBe('fail');
  });
});

describe('EC2 wall row', () => {
  const wall: WallDemand = {
    key: 'wall:1', name: 'M1', length: 3, height: 3, thickness: 0.2,
    combos: [{ combo: 'U', pu: 800, mu: 300, vu: 150, muV: 2, muH: 1 }],
  };
  it('lays the minimum vertical (9.6.2) and horizontal (9.6.3) steel at the spacings the code allows', () => {
    const r = makeWallRow(EC2_SET)(wall, { mat: { fc: 25, fy: 500 }, cover: 0.025, barDia: 10, diameters: [8, 10, 12, 16] }, undefined, f);
    expect(r.req.rhoL).toBeCloseTo(0.002, 6);
    expect(r.req.sMaxV).toBeCloseTo(0.4, 6);
    expect(r.req.sMaxH).toBeCloseTo(0.4, 6);
    expect(r.adopted.curtains).toBe(2);
    expect(r.verifications.every((v) => v.ok)).toBe(true);
  });
});

describe('EC2 punching row', () => {
  const quad = (id: number, pts: Array<[number, number]>) => ({ elementId: id, nodeIds: [1, id * 10 + 1, id * 10 + 2, id * 10 + 3], points: pts.map(([x, y]) => ({ x, y })) });
  const demand: PunchingDemand = {
    key: 'punch:1', name: 'P1', thickness: 0.25,
    joint: {
      nodeId: 1, at: { x: 0, y: 0 }, columnElementId: 5, b: 0.4, h: 0.4, elementBelow: 5, elementAbove: 6,
      forces: [{ combinationId: 1, combinationName: 'U', axialBelow: 900, axialAbove: 300, directlyDelivered: 0, unbalancedMomentX: 0, unbalancedMomentY: 0 }],
    },
    adjoining: [
      quad(1, [[0, 0], [5, 0], [5, 5], [0, 5]]), quad(2, [[0, 0], [0, 5], [-5, 5], [-5, 0]]),
      quad(3, [[0, 0], [-5, 0], [-5, -5], [0, -5]]), quad(4, [[0, 0], [0, -5], [5, -5], [5, 0]]),
    ],
  };
  const ctx = { fc: 30, fy: 500, cover: 0.025, topBarDia: 12 };

  it('checks an interior column at u1 = 2d with β = 1.15 (6.4.3(6), 6.4.4(1))', () => {
    // d = 250 − 25 − 12 = 213 mm; u1 = 2·(0.4 + 0.4) + 4π·0.213 = 4.2767 m; vEd = 1.15·600/(4.2767·213) = 0.7575 MPa.
    // k = 1 + √(200/213) = 1.969; ρl,req = (0.7575/(0.12·1.969))³/(100·30) = 1.10 %.
    const r = makePunchingRow(EC2_SET)(demand, ctx, f);
    const dd = 0.213, u1 = 1.6 + 4 * Math.PI * dd, vEd = 1.15 * 600 / (u1 * dd * 1000);
    const k = 1 + Math.sqrt(200 / 213);
    expect(r.position).toBe('interior');
    expect(r.vu).toBeCloseTo(600, 6);
    expect(find(r, 'rcSheets.v.punching')!.demand).toBe(`vEd = ${vEd.toFixed(3)} MPa`);
    expect(find(r, 'rcSheets.ec2.v.punchingRho')!.demand).toBe(`ρl ≥ ${((vEd / (0.12 * k)) ** 3 / 3000 * 100).toFixed(3)} %`);
    expect(r.status).toBe('warn');
  });

  it('limits vEd at u0 to 0.4·ν·fcd (recommended) or 0.5·ν·fcd (UK National Annex)', () => {
    // ν = 0.6·(1 − 30/250) = 0.528, fcd = 20 MPa: 4.224 and 5.28 MPa.
    expect(find(makePunchingRow(EC2_SET)(demand, ctx, f), 'rcSheets.ec2.v.punchingMax')!.capacity).toBe('4.224 MPa');
    expect(find(makePunchingRow(UK_SET)(demand, ctx, f), 'rcSheets.ec2.v.punchingMax')!.capacity).toBe('5.280 MPa');
  });

  it('asks for punching reinforcement when ρl = 2 % is not enough (6.4.5)', () => {
    const heavy = { ...demand, joint: { ...demand.joint, forces: [{ ...demand.joint.forces[0]!, axialBelow: 1700 }] } };
    const r = makePunchingRow(EC2_SET)(heavy, ctx, f);
    expect(find(r, 'rcSheets.ec2.v.punchingLinks')?.ok).toBe(false);
    expect(r.status).toBe('fail');
  });
});
