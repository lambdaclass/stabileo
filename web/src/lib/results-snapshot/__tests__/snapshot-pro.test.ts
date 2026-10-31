/** Results snapshot gate (#716), the `pro` cases of `corpus.ts`. See `run-group.ts`. */
import { beforeAll } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import { runGroup } from '../run-group';

beforeAll(async () => { await initSolver(); });
// These shells retain their numerical results with the mandatory #810 warning.
runGroup('pro', {
  'pro-deep-beam-shell': ['warning:SH-MITC4-CONVERGENCE'],
  'pro-rc-qa-diagnostic-shells': ['warning:SH-MITC4-CONVERGENCE'],
  'pro-mat-foundation': ['warning:SH-MITC4-CONVERGENCE'],
});
