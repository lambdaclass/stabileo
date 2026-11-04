import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import * as wasm from '../../wasm-solver';
import { modelStore } from '../../../store/model.svelte';
import { planeModel } from '../../steps/plane-model';
import { solveReference } from '../../steps/reference';
import { methodById } from '../../steps/methods';
import type { MethodContext } from '../../steps/registry';
import type { Block, StepDoc } from '../../steps/doc';
import type { SolverInput } from '../../types';
import { teachingBuckling } from '../buckling';
import { teachingPDelta } from '../pdelta';
import { column, EI } from './fixtures';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });
beforeEach(() => { modelStore.clear(); });

const ctxOf = (input: SolverInput, options: Record<string, boolean> = {}): MethodContext =>
  ({ input, pm: planeModel(input), ref: solveReference(input), selection: { members: [], nodes: [] }, options });

async function example(): Promise<SolverInput> {
  await modelStore.loadExample('portal-second-order');
  return modelStore.buildSolverInput(false)!;
}

const blocks = (doc: StepDoc): Block[] => doc.steps.flatMap((s) => s.blocks.flatMap((b) => (b.kind === 'sub' ? [b, ...b.blocks] : [b])));
const compare = (doc: StepDoc) => blocks(doc).find((b) => b.kind === 'compare') as Extract<Block, { kind: 'compare' }> | undefined;
const keys = (doc: StepDoc) => doc.steps.map((s) => s.title.key);

describe('second-order explained methods on the example portal', () => {
  it('apply to it, with 6 unknowns, or 3 with rigid members', async () => {
    const input = await example();
    for (const id of ['so-pdelta-phi', 'so-pdelta-kg', 'so-buckling-phi', 'so-buckling-kg']) expect(methodById(id)!.applies(ctxOf(input)).ok).toBe(true);
    const doc = methodById('so-pdelta-kg')!.build!(ctxOf(input, { axialRigid: true }));
    const eq = doc.steps[0].blocks.find((b) => b.kind === 'eq') as Extract<Block, { kind: 'eq' }>;
    expect(eq.note?.params?.n).toBe(3);
  });

  it('P-Δ with the consistent matrix: unknowns, first order, members, assembly, iterations, results, and the engine agreeing to round-off', async () => {
    const input = await example();
    const doc = methodById('so-pdelta-kg')!.build!(ctxOf(input));
    expect(keys(doc)).toEqual([
      'course.second-order.doc.unknowns.title', 'course.second-order.doc.first.title', 'course.second-order.doc.members.title',
      'course.second-order.doc.assembly.title', 'course.second-order.doc.iter.title', 'course.second-order.doc.results.title', 'steps.common.compare',
    ]);
    const rows = compare(doc)!.rows;
    expect(rows.length).toBeGreaterThan(4);
    for (const r of rows) expect(Math.abs(r.method - r.matrix)).toBeLessThan(1e-6 * Math.max(1, Math.abs(r.matrix)) + 1e-9);
    const run = teachingPDelta(input, { method: 'consistent', axialRigid: false });
    if (!run.ok) throw new Error(run.reason.key);
    const iter = doc.steps[4].blocks.find((b) => b.kind === 'table') as Extract<Block, { kind: 'table' }>;
    expect(iter.rows.length).toBe(run.run.iterations);
  });

  it('P-Δ with φ shows s, c and φ₁…φ₄ for each compressed member and agrees with the engine cut in 8 within 0.1 %', async () => {
    const input = await example();
    const doc = methodById('so-pdelta-phi')!.build!(ctxOf(input));
    const calcs = blocks(doc).filter((b) => b.kind === 'calc' && b.result.includes('\\varphi_4'));
    expect(calcs.length).toBe(3);
    const rows = compare(doc)!.rows;
    const scale = Math.max(...rows.filter((r) => r.unit === 'kN·m').map((r) => Math.abs(r.matrix)));
    for (const r of rows.filter((x) => x.unit === 'kN·m')) expect(Math.abs(r.method - r.matrix)).toBeLessThan(1e-3 * scale);
  });

  it('buckling with φ: the root of det K(λ) is the teaching solver\'s λ₁, and the determinant changes sign there', async () => {
    const input = await example();
    const doc = methodById('so-buckling-phi')!.build!(ctxOf(input));
    const b = teachingBuckling(input, { method: 'phi', axialRigid: false }, 1);
    if (!b.ok) throw new Error(b.reason.key);
    const root = blocks(doc).find((x) => x.kind === 'calc' && x.label?.key === 'course.second-order.doc.bk.det.root') as Extract<Block, { kind: 'calc' }>;
    expect(root.result).toContain(b.run.modes[0].lambda.toPrecision(6).slice(0, 5));
    const table = doc.steps[3].blocks.find((x) => x.kind === 'table') as Extract<Block, { kind: 'table' }>;
    const signs = table.rows.map((r) => (r[1] as { tex: string }).tex);
    expect(signs[0]).toBe('+');
    expect(signs).toContain('-');
  });

  it('buckling by eigenvalues: λ equal to the engine at one element per member', async () => {
    const input = await example();
    const rows = compare(methodById('so-buckling-kg')!.build!(ctxOf(input)))!.rows;
    for (const r of rows) expect(r.method / r.matrix).toBeCloseTo(1, 8);
  });
});

describe('the Euler check of a textbook column', () => {
  it('a fixed-free column reads K = 2 and P_cr = π²EI/(2L)²', () => {
    const input = column('fixed', null, 5, 100, 1);
    const doc = methodById('so-buckling-phi')!.build!(ctxOf(input));
    const euler = blocks(doc).find((b) => b.kind === 'calc' && b.label?.key === 'course.second-order.doc.bk.euler') as Extract<Block, { kind: 'calc' }>;
    expect(euler.label!.params!.K).toBe('2');
    const pcr = (Math.PI ** 2 * EI) / (10 * 10);
    expect(euler.result).toContain(pcr.toPrecision(4));
  });
});
