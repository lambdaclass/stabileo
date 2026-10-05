/**
 * A spectral load case against the engine's own spectral analysis: the same modes, spectrum and
 * rule give the same displacement magnitudes; the sign is the dominant mode's; a user spectrum read
 * linearly and on log axes; Sd turned into Sa.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store';
import { initSolver, solveModal3D, solveSpectral3D } from '../wasm-solver';
import { validateAndSolve3D } from '../solver-service';
import { massDensities, spectralModesFrom } from '../dynamics/requests';
import { combineModes, modeCoefficients, modeShapeField, modalCombine, userSa, G, type SpectralCaseDef } from '../spectral-case';
import { imposed } from '../../store/spectral-cases';
import type { ModalResult3D } from '../result-types';
import type { AnalysisResults3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

/** A two-storey frame, 5 m × 4 m bays, 3 m storeys. */
function frame() {
  const at = (x: number, y: number, z: number) => modelStore.addNode(x, y, z);
  const grid: number[][] = [];
  for (const z of [0, 3, 6]) grid.push([at(0, 0, z), at(5, 0, z), at(5, 4, z), at(0, 4, z)]);
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < 4; i++) modelStore.addElement(grid[s]![i]!, grid[s + 1]![i]!);
    for (let i = 0; i < 4; i++) modelStore.addElement(grid[s + 1]![i]!, grid[s + 1]![(i + 1) % 4]!);
  }
  for (const n of grid[0]!) modelStore.addSupport(n, 'fixed3d' as never);
  return grid;
}

describe('a spectral case', () => {
  it('gives the engine’s spectral displacements, CQC and SRSS, with a sign', () => {
    const grid = frame();
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    const densities = massDensities(modelStore.materials);
    const modal = solveModal3D(input, densities, 6) as unknown as ModalResult3D;
    expect(modal.modes.length).toBeGreaterThan(2);
    const unit = modal.modes.map((m) => validateAndSolve3D(imposed(modeShapeField(m)) as never, false, false) as AnalysisResults3D);
    for (const rule of ['CQC', 'SRSS'] as const) {
      const engine = solveSpectral3D({
        solver: input, modes: spectralModesFrom(modal), densities,
        spectrum: { name: 'flat', points: [{ period: 0.01, sa: 0.4 }, { period: 20, sa: 0.4 }], inG: true },
        direction: 'X', rule, xi: 0.05, importanceFactor: 1, reductionFactor: 1,
      }) as unknown as { displacements: Array<{ nodeId: number; ux: number }> };
      const def: SpectralCaseDef = { source: { kind: 'code' }, factors: { x: 1, y: 0, z: 0 }, rule: rule === 'CQC' ? 'cqc' : 'srss', xi: 0.05, scale: 1 };
      const ours = combineModes(def.rule, def.xi, modeCoefficients(modal, def, () => 0.4 * G), unit);
      for (const n of grid[2]!) {
        const e = engine.displacements.find((d) => d.nodeId === n)!.ux;
        const o = ours.displacements.find((d) => d.nodeId === n)!.ux;
        expect(Math.abs(o)).toBeCloseTo(Math.abs(e), 9);
        expect(Math.abs(o)).toBeGreaterThan(0);
      }
    }
  });

  it('a mode imposed alone is reproduced: the solve returns the displacements it was given', () => {
    frame();
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    const modal = solveModal3D(input, massDensities(modelStore.materials), 2) as unknown as ModalResult3D;
    const field = modeShapeField(modal.modes[0]!);
    const r = validateAndSolve3D(imposed(field) as never, false, false) as AnalysisResults3D;
    for (const d of r.displacements) expect(d.ux).toBeCloseTo(field.get(d.nodeId)![0], 12);
  });

  it('the combination rules and the dominant sign', () => {
    const rho = [[1, 0.5], [0.5, 1]];
    expect(modalCombine('srss', [3, -4], rho, 1)).toBeCloseTo(-5, 12);
    expect(modalCombine('abs', [3, -4], rho, 0)).toBeCloseTo(7, 12);
    expect(modalCombine('cqc', [3, 4], rho, 0)).toBeCloseTo(Math.sqrt(9 + 16 + 2 * 0.5 * 12), 12);
  });

  it('a user spectrum, linear or on log axes, and as Sd', () => {
    const base = { id: 1, name: 's', ordinate: 'Sa' as const, unit: 'g' as const, points: [[0.1, 1], [1, 0.1]] as Array<[number, number]> };
    expect(userSa({ ...base, interpolation: 'linear' }, 0.55)).toBeCloseTo(0.55 * G, 12);
    // On log axes the line through (0.1, 1) and (1, 0.1) is Sa = 0.1/T.
    expect(userSa({ ...base, interpolation: 'log' }, 0.5)).toBeCloseTo(0.2 * G, 12);
    // Beyond the table, held flat.
    expect(userSa({ ...base, interpolation: 'linear' }, 3)).toBeCloseTo(0.1 * G, 12);
    const sd = { ...base, ordinate: 'Sd' as const, unit: 'm' as const, points: [[0.5, 0.02], [2, 0.02]] as Array<[number, number]>, interpolation: 'linear' as const };
    expect(userSa(sd, 1)).toBeCloseTo(0.02 * (2 * Math.PI) ** 2, 12);
  });
});
