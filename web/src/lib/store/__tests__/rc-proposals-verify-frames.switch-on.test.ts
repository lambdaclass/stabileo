/**
 * Every proposal of the reinforcement sheets verifies, or says that with its section and concrete
 * it has no reinforcement and offers what it would verify with: small framed examples of the
 * gallery, in the five codes, with and without chapter 18.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { CODES, failingUnder, solveExample } from './rc-proposals-verify';

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('the proposals of framed examples verify in every code', () => {
  for (const id of ['rc-qa-diagnostic', '3d-building', 'pro-rc-house', 'pro-concrete-wall-storehouse']) {
    it(id, async () => {
      await solveExample(id);
      for (const code of CODES) expect(failingUnder(code), code).toEqual([]);
      if (id !== 'pro-concrete-wall-storehouse') for (const code of CODES) expect(failingUnder(code, true), `${code} seismic`).toEqual([]);
    }, 300000);
  }
});
