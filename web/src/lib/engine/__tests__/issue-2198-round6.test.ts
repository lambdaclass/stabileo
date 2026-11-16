import { expect, it } from 'vitest';
import { syntheticBeamContext } from '../design/__tests__/helpers';
import { buildStirrupOptions, BEAM_LIMITS } from '../design/candidate-enumerate-beam';
import { buildTieOptions, COLUMN_LIMITS } from '../design/candidate-enumerate-column';
import { verifyProvidedReinforcement } from '../station-design-forces';
import { transverseSpacingForDemand } from '../../codes/cirsoc201/transverse-spacing';
import { checkTorsion2025 } from '../../codes/cirsoc201/torsion';
import { ConcurrentDemand } from '../concurrent-demand';
import { REBAR_DB } from '../codes/argentina/cirsoc201';

const known = process.env.RUN_KNOWN_WRONG === '2198' ? it : it.skip;
const section = { b: 0.4, h: 0.4, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const bars = { count: 4, diameter: 16 };
const axes = syntheticBeamContext().axes;
const stations = (secondary: number, torque = 0) => ({ elementId: 1, length: 6, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'C1', stations: [0, 0.5, 1].map(t => ({ t, x: 6 * t, n: 0, my: 0, mz: 0, vy: secondary, vz: 0, torsion: torque })) }] });
const area = (dia: number) => REBAR_DB.find(r => r.diameter === dia)!.area * 1e-4;
const capacity = (dia: number, legs: number, spacing: number, width: number, depth: number, edition: '2005' | '2025' = '2025') => 0.75 * ((edition === '2005' ? 1 / 6 : 0.17) * Math.sqrt(section.fc) * width * depth * 1000 + Math.min(legs * area(dia) * section.fy * 1000 * depth / spacing, (edition === '2005' ? 2 / 3 : 0.66) * Math.sqrt(section.fc) * width * depth * 1000));

for (const kind of ['beam', 'wall'] as const) for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) for (const diameters of [[6, 8, 12], [12, 8, 6], [8, 8, 8]]) for (const factor of [0.999, 1.001]) {
  known(`known wrong result: #2198 actual secondary depth ${kind} ${edition} ${axis} ${diameters} ${factor}`, () => {
    const cages = diameters.map(diameter => ({ diameter, legs: 4, secondaryLegs: 4, spacing: 0.1 }));
    const minCapacity = Math.min(...diameters.map(dia => capacity(dia, 4, 0.1, section.h, section.b - section.cover - dia / 1000 - bars.diameter / 2000, edition)));
    const st = stations(minCapacity * factor);
    if (axis === 'Mz') for (const c of st.comboResults) for (const s of c.stations) { s.vz = s.vy; s.vy = 0; }
    const a = axis === 'My' ? axes : { ...axes, flexure: 'Mz' as const, shear: 'Vy' as const, secondaryFlexure: 'My' as const, secondaryShear: 'Vz' as const, sagCategory: 'Mz+' as const, hogCategory: 'Mz-' as const };
    const result = verifyProvidedReinforcement(1, kind, { regions: { bottomSpan: bars, topStart: bars, topEnd: bars, stirrupsStart: cages[0], stirrupsSpan: cages[1], stirrupsEnd: cages[2] } }, undefined, {}, section, st, undefined, { axes: a, spacingRule: { edition, maxAggregateSizeMm: 0 } });
    const rows = result.checks.filter(c => c.demandCategory === a.secondaryShear && c.limiting === 'shear');
    expect(rows).toHaveLength(3);
    for (const [i, label] of ['Support Start', 'Span', 'Support End'].entries()) {
      const c = rows.find(c => c.category.includes(label))!;
      const expected = +capacity(diameters[i]!, 4, 0.1, section.h, section.b - section.cover - diameters[i]! / 1000 - bars.diameter / 2000, edition).toFixed(2);
      expect(c.capacity).toBe(expected);
      expect(c.status === 'fail').toBe(minCapacity * factor / expected > 1);
    }
  });
}

for (const diameters of [[6, 8, 12], [12, 8, 6], [8, 8, 8]]) {
  known(`known wrong result: #2198 torsion uses each cage secondary depth ${diameters}`, () => {
    const cages = diameters.map(diameter => ({ diameter, legs: 4, secondaryLegs: 2, spacing: 0.1 }));
    const st = stations(260, 10);
    const result = verifyProvidedReinforcement(1, 'beam', { regions: { bottomSpan: bars, topStart: bars, topEnd: bars, stirrupsStart: cages[0], stirrupsSpan: cages[1], stirrupsEnd: cages[2] } }, undefined, {}, section, st, undefined, { axes, spacingRule: { edition: '2025', maxAggregateSizeMm: 0 } });
    const demand = ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'C1', forces: st.comboResults[0]!.stations[0]! }])[0]!.section('My');
    for (const [i, label] of ['Support Start', 'Span', 'Support End'].entries()) {
      const cage = cages[i]!;
      const expected = checkTorsion2025({ ...section, d: section.h - section.cover - section.stirrupDia / 1000 - bars.diameter / 2000, dSecondary: section.b - section.cover - cage.diameter / 1000 - bars.diameter / 2000, stirrupDiaMm: cage.diameter, fyt: section.fy, demand, stirrup: cage });
      expect(result.checks.find(c => c.category === `Torsion ${label} (Vz)`)?.ratio).toBe(+expected.ratio.toFixed(3));
    }
  });
}

for (const kind of ['beam', 'column'] as const) for (const axis of ['My', 'Mz'] as const) for (const needed of [2, 3, 4, 5]) {
  known(`known wrong result: #2198 enumerate secondary strength ${kind} ${axis} needs ${needed} legs`, () => {
    const ctx = syntheticBeamContext({ elementType: kind, codeEdition: '2025' });
    ctx.section = { ...ctx.section, b: 0.45, h: 0.45 };
    ctx.axes = { ...ctx.axes, bFlex: 0.45, hFlex: 0.45, ...(axis === 'Mz' ? { flexure: 'Mz', shear: 'Vy', secondaryFlexure: 'My', secondaryShear: 'Vz', sagCategory: 'Mz+', hogCategory: 'Mz-' } : {}) };
    ctx.material = { ...ctx.material, fc: 25, stirrupDiametersMm: [6] };
    const depth = 0.45 - ctx.material.cover - 0.006 - 0.008;
    const demand = capacity(6, needed - 0.1, 0.05, 0.45, depth);
    ctx.stations = stations(demand);
    if (axis === 'Mz') for (const c of ctx.stations.comboResults) for (const s of c.stations) { s.vz = s.vy; s.vy = 0; }
    const options = kind === 'beam' ? buildStirrupOptions(ctx, 0) : buildTieOptions(ctx, 16);
    const supported = kind === 'beam' ? BEAM_LIMITS : COLUMN_LIMITS;
    const adequate = options.filter(c => capacity(c.diameter, c.secondaryLegs ?? 2, c.spacing, 0.45, depth) >= demand);
    if (needed > supported.maxLegs) expect(adequate).toHaveLength(0);
    else {
      expect(adequate.length).toBeGreaterThan(0);
      expect(adequate.some(c => (c.secondaryLegs ?? 2) === needed)).toBe(true);
      const cage = adequate.find(c => (c.secondaryLegs ?? 2) === needed)!;
      if (needed === 3) expect(transverseSpacingForDemand('2025', { Vu: demand, bw: 0.45, d: depth, fc: 25, cover: ctx.material.cover, stirrupDiaMm: 6 }).requiredLegs).toBe(2);
      const reinforcement = kind === 'beam' ? { bottom: bars, top: bars, stirrups: cage } : { longitudinal: { count: 12, diameter: 16 }, stirrups: cage };
      const verified = verifyProvidedReinforcement(1, kind, reinforcement, undefined, {}, { ...ctx.section, ...ctx.material }, ctx.stations, undefined,
        { axes: ctx.axes, spacingRule: { edition: '2025', maxAggregateSizeMm: 0 } });
      const shear = verified.checks.filter(c => c.demandCategory === ctx.axes.secondaryShear && c.limiting === 'shear');
      expect(shear.length).toBeGreaterThan(0);
      for (const c of shear) expect(c.status).not.toBe('fail');
    }
    expect(options.length).toBeLessThanOrEqual(kind === 'beam' ? BEAM_LIMITS.maxStirrupOptions : COLUMN_LIMITS.maxTieOptions);
    for (const c of options) expect(c.secondaryLegs ?? 2).toBeLessThanOrEqual(supported.maxLegs);
  });
}

import { afterEach } from 'vitest';
import { solve, solvePDelta, solve3D, solvePDelta3D } from '../wasm-solver';
import { computeStationDemands, setCompactStationTransfer } from '../verification-service';

afterEach(() => setCompactStationTransfer(true));
for (const spatial of [false, true]) for (const nonlinear of [false, true]) for (const compact of [false, true]) {
  known(`known wrong result: #2198 solved actual-cage depth ${spatial} ${nonlinear} ${compact}`, () => {
    const nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0.04, y: 0, z: 0 }]]);
    const elements = new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, hingeStart: false, hingeEnd: false, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]);
    const sections = new Map([[1, { id: 1, name: 'RC', ...section, a: section.b * section.h, iy: section.b * section.h ** 3 / 12, iz: section.h * section.b ** 3 / 12, j: 0.001 }]]);
    const materials = new Map([[1, { id: 1, name: 'H25', fc: section.fc, fy: section.fy, e: 25000, nu: 0.2 }]]);
    const model = { nodes, elements, sections, materials, supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]) };
    const spatialElements = new Map([...elements].map(([id, { hingeStart, hingeEnd, ...e }]) => [id, e]));
    const solver3D = { nodes, elements: spatialElements, sections, materials, supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]), loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fy: 1, fz: 0, mx: 0, my: 0, mz: 0 } }] };
    const planarNodes = new Map([...nodes].map(([id, { x, z }]) => [id, { id, x, z }]));
    const planarElements = new Map([...elements].map(([id, e]) => [id, { id, type: e.type, nodeI: e.nodeI, nodeJ: e.nodeJ, sectionId: e.sectionId, materialId: e.materialId, hingeStart: false, hingeEnd: false }]));
    const solver2D = { ...model, nodes: planarNodes, elements: planarElements, loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fz: 1, my: 0 } }] };
    const st = spatial ? (() => {
      const raw = nonlinear ? solvePDelta3D(solver3D).results : solve3D(solver3D);
      setCompactStationTransfer(compact);
      return computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], model).stations.get(1)!;
    })() : (() => {
      const raw = nonlinear ? solvePDelta(solver2D).results : solve(solver2D);
      const f = raw.elementForces[0]!;
      return { ...stations(0), comboResults: [{ comboId: 1, comboName: 'C1', stations: [0, 0.5, 1].map(t => ({ t, x: f.length * t, n: 0, my: 0, mz: 0, vy: 0, vz: t ? f.vEnd : f.vStart, torsion: 0 })) }] };
    })();
    const cage = { diameter: 12, legs: 4, secondaryLegs: 4, spacing: 0.1 };
    const result = verifyProvidedReinforcement(1, 'beam', { bottom: bars, top: bars, stirrups: cage }, undefined, {}, section, st, undefined, { axes, spacingRule: { edition: '2025', maxAggregateSizeMm: 0 } });
    const rows = result.checks.filter(c => c.demandCategory === (spatial ? 'Vy' : 'Vz') && c.limiting === 'shear');
    expect(rows.length).toBeGreaterThan(0);
    const depth = 0.4 - section.cover - (spatial ? cage.diameter : section.stirrupDia) / 1000 - bars.diameter / 2000;
    for (const r of rows) { expect(r.capacity).toBe(+capacity(12, 4, 0.1, 0.4, depth).toFixed(2)); expect(r.status).toBe('ok'); }
  });
}
