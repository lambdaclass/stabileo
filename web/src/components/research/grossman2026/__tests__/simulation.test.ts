import { expect, it, vi } from 'vitest';
import { Simulation, type Inputs } from '../simulation.svelte';

const input: Inputs = {
  network: { lattice: { kind: 'triangular', phi: 2, psi: 0.5 }, eta: 0, keep: 1, seed: 0, spring_law: 'hookean', k: 1, prestress: 0 },
  label: { family: 'ordered', eta: 0, keep: 1, seed: 0, strain: 0.01 },
  theta: 0, cells: 8, phi: 2, psi: 0.5,
};

it.each([1, 2, 3, 4])('clears every result when solve stage %i fails after success, then recovers', (stage) => {
  let calls = 0;
  let fail = 0;
  const solve = vi.fn(() => {
    if (++calls === fail) throw new Error('solve failed');
    return JSON.stringify({ marker: calls });
  });
  const glue = { default: async () => {}, springs_strip: solve, springs_periodic: solve };
  const sim = new Simulation();
  sim.run(glue, input);
  expect(sim.result?.strip).toEqual({ marker: 1 });
  expect(sim.result?.ordered?.eq).toEqual({ marker: 4 });
  const next = structuredClone(input);
  next.label.strain = 0.02;
  calls = 0;
  fail = stage;
  sim.run(glue, next);
  expect(sim.result).toBeNull();
  expect(sim.error).toBe('solve failed');
  calls = 0;
  fail = 0;
  sim.run(glue, next);
  expect(sim.error).toBeNull();
  expect(sim.result?.input.label.strain).toBe(0.02);
  next.label.strain = 0.03;
  expect(sim.result?.input.label.strain).toBe(0.02);
});
