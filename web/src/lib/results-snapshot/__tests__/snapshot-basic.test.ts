/** Results snapshot gate (#716), the `basic` cases of `corpus.ts`. See `run-group.ts`. */
import { beforeAll } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import { runGroup } from '../run-group';

beforeAll(async () => { await initSolver(); });
runGroup('basic');
