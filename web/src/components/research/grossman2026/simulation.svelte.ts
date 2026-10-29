import { solvePeriodic, solveStrip, type loadSprings, type NetworkSpec } from './springs';
import type { StripLabel } from './open-in-stabileo';

export type Inputs = {
  network: NetworkSpec;
  label: StripLabel;
  theta: number;
  cells: number;
  phi: number;
  psi: number;
};

function solveAll(glue: Awaited<ReturnType<typeof loadSprings>>, input: Inputs) {
  const { network, label, theta, cells } = input;
  const strip = solveStrip(glue, { network, width: 13, height: 52, theta, clamp_band: 0.5, strain: label.strain });
  const cell = solvePeriodic(glue, { network, n1: cells, n2: cells, strain: [0, 0, 0] });
  const ordered = label.family === 'ordered' && network.keep === 1 && network.prestress === 0 ? {
    hook: solvePeriodic(glue, { network: { ...network, spring_law: 'hookean' }, n1: 4, n2: 4, strain: [0, 0, 0] }),
    eq: solvePeriodic(glue, { network: { ...network, spring_law: 'equal_weight' }, n1: 4, n2: 4, strain: [0, 0, 0] }),
  } : null;
  return { input, strip, cell, ordered };
}

export class Simulation {
  result = $state.raw<ReturnType<typeof solveAll> | null>(null);
  error = $state<string | null>(null);
  ms = $state(0);

  run(glue: Awaited<ReturnType<typeof loadSprings>>, input: Inputs) {
    const start = performance.now();
    try {
      this.result = solveAll(glue, structuredClone(input));
      this.error = null;
    } catch (e) {
      this.result = null;
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.ms = performance.now() - start;
  }
}
