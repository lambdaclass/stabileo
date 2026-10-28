/** One load step, as the Rust solver reports it (`StepResult`). */
export type Step = {
  step: number;
  pseudotime: number;
  displacement: number;
  reaction: number;
  iterations: number;
  converged: boolean;
  residual: number;
  damage_max: number;
  damage_min: number;
  elastic_energy: number;
  fracture_energy: number;
};

export type WorkerIn = { type: 'run'; runId: number; config: string } | { type: 'reference-config' };

export type WorkerOut =
  | { type: 'unavailable'; message: string }
  | { type: 'reference-config'; config: string }
  | { type: 'mesh'; runId: number; nodes: Float64Array; elements: Uint32Array }
  | { type: 'step'; runId: number; step: Step; damage: Float32Array; displacement: Float32Array; syy: Float32Array }
  | { type: 'done'; runId: number; seconds: number }
  | { type: 'error'; runId: number; message: string };

/** The notched-plate configuration the solver accepts (`NotchedPlate` in examples.rs). */
export type PlateConfig = {
  material: { e: number; nu: number; gc: number; l0: number; plane: 'stress' | 'strain' };
  mesh: { nx: number; ny: number; nx_fine: number; ny_fine: number; h_fine: number };
  top_displacement: number;
  controls: { dt: number; total_time: number; max_iterations: number; tolerance: number; irreversibility: 'none' | 'history' };
};

export type Series = { name: string; color: string; points: [number, number][]; dashed?: boolean; markers?: boolean };
