import { expect, it } from 'vitest';
import { validatePrefix, type RawResult } from '../worker-validation';
const full: RawResult = { steps: [1,2].map(step => ({step, loadFactor: step / 10, iterations: 2, converged: true, controlDisplacement: step / 100})), converged: true, finalLoadFactor: .2, totalIterations: 4, results: { displacements: [{nodeId:1, ux:0,uz:-.02,ry:0}] } };
it('accepts complete matching prefixes', () => {
  expect(validatePrefix(full, structuredClone(full), 2, [1]).get(1)!.uz).toBe(-.02);
});
it.each(['loadFactor', 'iterations', 'converged', 'controlDisplacement', 'step'])('rejects an earlier %s mismatch even with an identical last step', key => {
  const p = structuredClone(full);
  Object.assign(p.steps[0], { [key]: key === 'converged' ? false : 42 });
  expect(() => validatePrefix(full,p,2,[1])).toThrow();
});
it.each([NaN, Infinity, undefined])('rejects missing and nonfinite displacement components: %s', value => {
  for (const key of ['ux','uz','ry']) {
    const p = structuredClone(full);
    Object.assign(p.results.displacements[0], {[key]:value});
    expect(() => validatePrefix(full,p,2,[1])).toThrow();
  }
});
it('rejects absent nodes, extra steps and nonfinite load factors', () => {
  expect(() => validatePrefix(full,full,2,[1,2])).toThrow();
  expect(() => validatePrefix(full,full,1,[1])).toThrow();
  const p = structuredClone(full); p.steps[0].loadFactor = NaN;
  expect(() => validatePrefix(full,p,2,[1])).toThrow();
});
it.each([['finalLoadFactor', .3], ['totalIterations', 5], ['converged', false]] as const)('rejects a %s summary that disagrees with the steps, in the prefix or the full run', (key, value) => {
  const p = structuredClone(full);
  Object.assign(p, { [key]: value });
  expect(() => validatePrefix(full, p, 2, [1])).toThrow('Invalid prefix result');
  expect(() => validatePrefix(p, structuredClone(full), 2, [1])).toThrow('Invalid full result');
});
