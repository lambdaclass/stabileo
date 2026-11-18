/**
 * The same for a larger frame and a ribbed mat on soil springs: the frame's proposals verify in
 * every code, its beams under chapter 18 too (its columns there are another round's); under the pedestals two ribs of 20 × 60 carry more than any reinforcement of that
 * section and concrete can, and say so with the section or concrete that would. Under TS 500 two
 * more ribs, whose soil bends them the other way, are laid out by their line with more steel than
 * the code's 2 % allows: they too say so, and are what is left to the lines over interior supports.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { CODES, failingUnder, solveExample } from './rc-proposals-verify';

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('the proposals of a frame and a mat verify, or declare their alternatives', () => {
  it('rc-design-frame', async () => {
    await solveExample('rc-design-frame');
    for (const code of CODES) expect(failingUnder(code), code).toEqual([]);
    for (const code of CODES) expect(failingUnder(code, true).filter((r) => !r.startsWith('column')), `${code} seismic`).toEqual([]);
  }, 300000);

  it('mat-foundation', async () => {
    await solveExample('mat-foundation');
    for (const code of CODES.filter((c) => c !== 'ts500-2000')) expect(failingUnder(code), code).toEqual(['line V4', 'line V13']);
    expect(failingUnder('ts500-2000')).toEqual(['line V3', 'line V4', 'line V6', 'line V13']);
  }, 600000);
});
