import { expect, it } from 'vitest';
import { syntheticBeamContext } from '../design/__tests__/helpers';
import { buildTieOptions, createColumnCandidateGenerator, maxTieSpacing } from '../design/candidate-enumerate-column';
import { candidateShearDepth } from '../design/directional-cage-options';
import { computeDirectionalShearCapacity } from '../station-design-forces';
import { stirrupLegs } from '../../design-contract/directional-stirrups';
import { grossAreaOf, shapedShearWebs } from '../design/shaped-column';
import { DESIGN_TARGET_UTILIZATION } from '../design/outcome';
import { SPACING_GRID } from '../design/objective';
import { transverseSpacingForDemand } from '../../codes/cirsoc201/transverse-spacing';

const shapes = [undefined, { kind: 'circle', D: 0.4 }, { kind: 'tee', bf: 0.4, bw: 0.3, h: 0.4, hf: 0.3 }, { kind: 'L', b: 0.4, h: 0.4, tw: 0.3, tf: 0.3 }] as const;
for (const shape of shapes) for (const flexure of ['My', 'Mz'] as const)
  for (const direction of ['primary', 'secondary'] as const) for (const diameter of [6, 8, 12])
    for (const n of [-100, 0, 100]) for (const factor of [0, 0.999, 1, 1.001]) {
      it(`known wrong result: #2198 column candidate shear threshold ${shape?.kind ?? 'rectangle'} ${flexure} ${direction} ${diameter} ${n} ${factor}`, () => {
        const ctx = syntheticBeamContext({ elementType: 'column', codeEdition: '2025', shape });
        ctx.section = { ...ctx.section, b: 0.4, h: 0.4 };
        ctx.material = { ...ctx.material, fc: 25, stirrupDiametersMm: [diameter], longDiametersMm: [16] };
        ctx.axes = { ...ctx.axes, flexure, shear: flexure === 'My' ? 'Vz' : 'Vy', secondaryShear: flexure === 'My' ? 'Vy' : 'Vz', bFlex: 0.4, hFlex: 0.4 };
        const axis = direction === 'primary' ? ctx.axes.shear : ctx.axes.secondaryShear;
        const web = shape ? shapedShearWebs(shape).find(w => w.axis === axis)! : { bw: 0.4, d: candidateShearDepth(0.4, ctx.material.cover, diameter) };
        const least = shape ? Math.min(...shapedShearWebs(shape).map(w => w.bw)) : 0.4;
        const widest = Math.floor((maxTieSpacing(16, diameter, least, least, '2025') * DESIGN_TARGET_UTILIZATION + 1e-9) / SPACING_GRID) * SPACING_GRID;
        const cap = computeDirectionalShearCapacity(direction, diameter, stirrupLegs({ legs: 2, secondaryLegs: 2 }, direction), widest, web.bw, web.d, ctx.material.fc, ctx.material.fy, -n, { edition: '2025', Ag: shape ? grossAreaOf(shape) : ctx.section.b * ctx.section.h });
        expect(cap.evaluated).toBe(true);
        const threshold = 0.5 * cap.phiVcUnrounded;
        const stations = (Vu: number) => ({ elementId: 1, length: 6, stationTs: [0, 1], comboResults: [{ comboId: 1, comboName: 'C1', stations: [0, 1].map(t => ({ t, x: 6 * t, n, my: 0, mz: 0, vy: axis === 'Vy' ? Vu : 0, vz: axis === 'Vz' ? Vu : 0, torsion: 0 })) }] });
        const baseline = buildTieOptions({ ...ctx, stations: stations(0) }, 16);
        const Vu = threshold > 0 ? threshold * factor : factor > 1 ? 1 : 0;
        ctx.stations = stations(Vu);
        const options = buildTieOptions(ctx, 16);
        expect(options.length).toBeGreaterThan(0);
        if (factor <= 1) {
          expect(options.filter(c => c.legs === 2 && (c.secondaryLegs ?? 2) === 2)).toEqual(baseline.filter(c => c.legs === 2 && (c.secondaryLegs ?? 2) === 2));
          if (!shape || shape.kind === 'circle') {
            const candidate = createColumnCandidateGenerator(ctx).next(null);
            expect(candidate).not.toBeNull();
            expect(candidate!.reinforcement.stirrups).toEqual(baseline[0]);
          }
        } else {
          const limit = transverseSpacingForDemand('2025', { Vu, bw: web.bw, d: web.d, fc: ctx.material.fc, cover: ctx.material.cover, stirrupDiaMm: diameter });
          expect(options.every(c => c.spacing <= limit.alongMax)).toBe(true);
          expect(options.every(c => (direction === 'primary' ? c.legs : c.secondaryLegs ?? 2) >= limit.requiredLegs)).toBe(true);
        }
      });
    }

const section = { b: 0.4, h: 0.4, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const stations = (_: number) => ({ elementId: 1, length: 0.04, stationTs: [0, 0.5, 1], comboResults: [] });
import { afterEach } from 'vitest';
import { solve, solvePDelta, solve3D, solvePDelta3D } from '../wasm-solver';
import { computeStationDemands, setCompactStationTransfer } from '../verification-service';

afterEach(() => setCompactStationTransfer(true));
for (const edition of ['2005', '2025'] as const) for (const spatial of [false, true]) for (const primary of spatial ? [false, true] : [true]) for (const nonlinear of [false, true]) for (const compact of [false, true]) {
  it(`known wrong result: #2198 solved column candidate threshold ${edition} ${spatial} ${primary} ${nonlinear} ${compact}`, () => {
    const nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0.04, y: 0, z: 0 }]]);
    const elements = new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, hingeStart: false, hingeEnd: false, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]);
    const sections = new Map([[1, { id: 1, name: 'RC', ...section, a: section.b * section.h, iy: section.b * section.h ** 3 / 12, iz: section.h * section.b ** 3 / 12, j: 0.001 }]]);
    const materials = new Map([[1, { id: 1, name: 'H25', fc: section.fc, fy: section.fy, e: 25000, nu: 0.2 }]]);
    const model = { nodes, elements, sections, materials, supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]) };
    const spatialElements = new Map([...elements].map(([id, { hingeStart, hingeEnd, ...e }]) => [id, e]));
    const solver3D = { nodes, elements: spatialElements, sections, materials, supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]), loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fy: primary ? 0 : 1, fz: primary ? 1 : 0, mx: 0, my: 0, mz: 0 } }] };
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
    const ctx = syntheticBeamContext({ elementType: 'column', codeEdition: edition });
    ctx.section = { ...ctx.section, ...section };
    ctx.axes = { ...ctx.axes, bFlex: section.b, hFlex: section.h };
    ctx.material = { ...ctx.material, ...section, stirrupDiametersMm: [8], longDiametersMm: [16] };
    const baseline = buildTieOptions(ctx, 16);
    ctx.stations = st;
    expect(st.comboResults[0]!.stations.some(s => Math.abs(s.vy) + Math.abs(s.vz) > 0)).toBe(true);
    expect(buildTieOptions(ctx, 16).filter(c => c.legs === 2 && (c.secondaryLegs ?? 2) === 2)).toEqual(baseline.filter(c => c.legs === 2 && (c.secondaryLegs ?? 2) === 2));
    expect(createColumnCandidateGenerator(ctx).next(null)!.reinforcement.stirrups).toEqual(baseline[0]);
  });
}
