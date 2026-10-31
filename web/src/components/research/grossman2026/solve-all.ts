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

export function solveAll(glue: Awaited<ReturnType<typeof loadSprings>>, input: Inputs) {
  const { network, label, theta, cells } = input;
  const strip = solveStrip(glue, { network, width: 13, height: 52, theta, clamp_band: 0.5, strain: label.strain });
  const cell = solvePeriodic(glue, { network, n1: cells, n2: cells, strain: [0, 0, 0] });
  const ordered = label.family === 'ordered' && network.keep === 1 && network.prestress === 0 ? {
    hook: solvePeriodic(glue, { network: { ...network, spring_law: 'hookean' }, n1: 4, n2: 4, strain: [0, 0, 0] }),
    eq: solvePeriodic(glue, { network: { ...network, spring_law: 'equal_weight' }, n1: 4, n2: 4, strain: [0, 0, 0] }),
  } : null;
  return { input, strip, cell, ordered };
}

