import { describe, expect, it } from 'vitest';
import { runFloorDesign, type FloorNode, type FloorShell } from '../run-floor-design';
import { checkWallAxialFlexure, designWall } from '../wall-design';
import { readingsOf } from '../../../store/floor-readings';
import { PHI_TENSION } from '../../codes/argentina/cirsoc201-basis';

const nodes = new Map<number, FloorNode>();
for (let i = 0; i <= 4; i++) {
  nodes.set(100 + i, { x: i, y: 0, z: 0 });
  nodes.set(200 + i, { x: i, y: 0, z: 3 });
}
const shells: FloorShell[] = Array.from({ length: 4 }, (_, i) => ({
  id: 30 + i, nodes: [100 + i, 101 + i, 201 + i, 200 + i], materialId: 1, thickness: 0.2,
}));

function floor(pu: number, supplied = false, combined = false) {
  const mu = combined ? 50 : 0;
  const vu = combined ? 80 : 0;
  const stresses = shells.map(({ id }, i) => ({
    elementId: id, sigmaXx: 0, sigmaYy: -pu / 0.8 + mu * (i - 1.5), tauXy: vu / 0.8,
    mx: 0, my: combined ? 5 : 0, mxy: 0,
  }));
  return runFloorDesign({
    nodes, shells, stresses, factoredAreaLoad: new Map(), fc: 25, fy: 420,
    cover: 0.025, maxAggregateSizeMm: 20, wallBarDiameterMm: 12,
    edition: '2025', verifierId: 'cirsoc201.provided.v2.2025', demandRevision: 5,
    seismicRequired: false, membersVerified: true, regulationIds: ['cirsoc-201'],
    revisions: { analysis: 6, loads: 4, regulation: 2 },
    ...(supplied ? { wallDemands: new Map([[30, { pu, muInPlane: mu, vuInPlane: vu }]]) } : {}),
  });
}

describe.skip('known wrong result: #2655 wall axial tension', () => {
  it.each([-400, -1, 0, 1, 400])('retains %s kN through design, evidence and the report', (pu) => {
    const run = floor(pu);
    const wall = run.walls[0]!;
    const check = wall.axialFlexure;
    const record = run.assemblies.flatMap(a => a.families ?? []).find(r => r.family === 'wall')!;
    expect(check.pu).toBe(pu);
    expect(check.ok).toBe(true);
    expect(check.utilization === 0).toBe(pu === 0);
    expect(record.axialFlexure).toMatchObject({ pu, utilization: check.utilization, status: 'OK' });
    expect(record.demands.map(d => d.pu)).toEqual(shells.map(() => pu));
    const row = readingsOf(run, 'issue-2655').walls[0]!.rows.find(r => r.titleKey === 'check.wall.axialFlexure')!;
    expect(row.inputs).toContainEqual({ symbol: 'Pu', value: pu, unit: 'kN' });
    expect(row).toMatchObject({ unit: 'kN', demand: Math.abs(pu) });
    expect(row.capacity).toBeGreaterThan(0);
    expect(row.ratio).toBeCloseTo(Math.abs(pu) / row.capacity!, 3);
  });

  it('checks paired axial force, bending and shear identically for integrated and supplied actions', () => {
    const integrated = floor(-400, false, true).walls[0]!;
    const supplied = floor(-400, true, true).walls[0]!;
    const neutral = floor(0, true, true).walls[0]!;
    expect(integrated.axialFlexure).toEqual(supplied.axialFlexure);
    expect(integrated.shear).toEqual(supplied.shear);
    expect(supplied.shear.phiVn).toBeLessThan(neutral.shear.phiVn);
    const vertical = (w: typeof supplied) => w.checks.find(c => c.category === 'Out-of-plane (vertical bars)')!.utilization;
    expect(vertical(integrated)).toBe(vertical(supplied));
    expect(vertical(supplied)).toBeGreaterThan(vertical(neutral));
    const reverse = designWall({ ...supplied.input, muInPlane: -supplied.input.muInPlane, provided: supplied.reinforcement });
    expect(reverse.axialFlexure.utilization).toBeCloseTo(supplied.axialFlexure.utilization, 6);
  });

  it('uses all placed vertical bars up to the tensile limit and fails beyond it', () => {
    const wall = floor(0).walls[0]!;
    const placed = wall.reinforcement;
    const count = placed.curtains * (Math.floor(wall.input.length / placed.vertical.spacing) + 1);
    const limit = PHI_TENSION * wall.input.fy * 1000 * count * Math.PI * (placed.vertical.diameter / 2000) ** 2;
    for (const fraction of [0.999, 1.001]) {
      const check = designWall({ ...wall.input, pu: -fraction * limit, provided: placed }).axialFlexure;
      expect(check.ok).toBe(fraction < 1);
      expect(check.utilization).toBeCloseTo(fraction, 5);
    }
  });

  it('requires the bar layout for combined tension in the approximate section check', () => {
    const input = { length: 4, thickness: 0.2, fc: 25, fy: 420, rhoL: 0.0015, edition: '2025' as const, pu: -400 };
    expect(checkWallAxialFlexure({ ...input, mu: 0 }).utilization).toBeGreaterThan(0);
    expect(() => checkWallAxialFlexure({ ...input, mu: 50 })).toThrow('wall.tensionRequiresBarLayout');
  });
});
