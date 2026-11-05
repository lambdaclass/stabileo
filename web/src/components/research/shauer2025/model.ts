import refCsv from '../../../../../research/fracture/shauer-2025/reference-results/ex2_steps.csv?raw';
import type { PlateConfig } from './protocol';

export type ReferenceStep = { step: number; pseudotime: number; reaction: number; iterations: number; damageMax: number };

export const reference: ReferenceStep[] = refCsv
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const c = line.split(',');
    return { step: Number(c[0]), pseudotime: Number(c[1]), iterations: Number(c[2]), damageMax: Number(c[4]), reaction: Number(c[6]) };
  });
export const REF_TOP_DISPLACEMENT = 0.01;
export const refPeak = reference.reduce((a, r) => (r.reaction > a.reaction ? r : a), reference[0]);

export const MESHES = {
  coarse: { label: 'coarseMesh', mesh: { nx: 40, ny: 40, nx_fine: 16, ny_fine: 8, h_fine: 0.0025 } },
  medium: { label: 'mediumMesh', mesh: { nx: 50, ny: 60, nx_fine: 24, ny_fine: 12, h_fine: 1 / 600 } },
  reference: { label: 'referenceMesh', mesh: { nx: 70, ny: 80, nx_fine: 32, ny_fine: 16, h_fine: 0.00125 } },
} as const;
export type MeshKey = keyof typeof MESHES;

export const DEFAULTS = { e: 210, nu: 0.3, gc: 0.0027, l0: 0.0075, u: 0.01, dt: 0.01, mesh: 'reference' as MeshKey, history: false };
export const LIMITS = { e: [10, 400], nu: [0, 0.45], gc: [1e-4, 1e-2], l0: [0.003, 0.03], u: [0.004, 0.02] } as const;
export type Limited = keyof typeof LIMITS;
export const inRange = (v: number, [lo, hi]: readonly [number, number]) => Number.isFinite(v) && v >= lo && v <= hi;

export type Params = { e: number; nu: number; gc: number; l0: number; u: number; dt: number; meshKey: MeshKey; history: boolean };
export const DEFAULT_PARAMS: Params = { e: DEFAULTS.e, nu: DEFAULTS.nu, gc: DEFAULTS.gc, l0: DEFAULTS.l0, u: DEFAULTS.u, dt: DEFAULTS.dt, meshKey: DEFAULTS.mesh, history: DEFAULTS.history };

export function configOf(p: Params): PlateConfig {
  return {
    material: { e: p.e, nu: p.nu, gc: p.gc, l0: p.l0, plane: 'strain' },
    mesh: { ...MESHES[p.meshKey].mesh },
    top_displacement: p.u,
    controls: { dt: p.dt, total_time: 0.8, max_iterations: 1000, tolerance: 1e-5, irreversibility: p.history ? 'history' : 'none' },
  };
}
export const REFERENCE_KEY = JSON.stringify({
  material: { e: 210, nu: 0.3, gc: 0.0027, l0: 0.0075, plane: 'strain' },
  mesh: { ...MESHES.reference.mesh },
  top_displacement: 0.01,
  controls: { dt: 0.01, total_time: 0.8, max_iterations: 1000, tolerance: 1e-5, irreversibility: 'none' },
});

export const VIEWS: Record<'plate' | 'band' | 'tip', [number, number, number, number]> = {
  plate: [-0.55, -0.6, 0.55, 0.6],
  band: [-0.5, -0.12, 0.5, 0.12],
  tip: [-0.03, -0.0225, 0.03, 0.0225],
};
