import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import katex from 'katex';
import { modelStore } from '../../../store/model.svelte';
import * as wasm from '../../wasm-solver';
import { planeModel } from '../plane-model';
import { solveReference } from '../reference';
import { methods } from '../methods/core';
import { allMethods } from '../methods';
import type { MethodContext } from '../registry';
import type { Block, CompareRow, StepDoc } from '../doc';

const method = methods.find((m) => m.id === 'galerkin')!;

beforeAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(wasm.isSolverReady()).toBe(true);
});

beforeEach(() => modelStore.clear());

function context(): MethodContext {
  const input = modelStore.buildSolverInput(false)!;
  return { input, pm: planeModel(input), ref: solveReference(input), selection: { members: [], nodes: [] } };
}

function blocks(doc: StepDoc): Block[] {
  return [...doc.intro, ...doc.steps.flatMap((s) => s.blocks)];
}

function comparisons(doc: StepDoc): CompareRow[] {
  return blocks(doc).flatMap((b) => b.kind === 'compare' ? b.rows : []);
}

function renderEquations(doc: StepDoc): void {
  const visit = (bs: Block[]) => {
    for (const b of bs) {
      if (b.kind === 'eq') katex.renderToString(b.tex, { throwOnError: true, displayMode: true });
      if (b.kind === 'calc') for (const tex of [b.formula, b.subst, b.result, b.check]) if (tex) katex.renderToString(tex, { throwOnError: true, displayMode: true });
      if (b.kind === 'sub') visit(b.blocks);
    }
  };
  visit(blocks(doc));
}

describe('the Galerkin finite-element worked example', () => {
  it('loads two full-length axial loads and solves the same nodal results as the engine', async () => {
    await modelStore.loadExample('galerkin-bar');
    const ctx = context();
    expect(ctx.input.loads.map((l) => l.type)).toEqual(['axialDistributed', 'axialDistributed']);
    expect(method.applies(ctx)).toEqual({ ok: true });
    const doc = method.build!(ctx);
    expect(doc.method).toBe('galerkin');
    expect(doc.steps).toHaveLength(10);
    const rows = comparisons(doc);
    expect(rows.map((r) => r.label)).toEqual(['u_{x,B}', 'R_{x,A}', 'R_{x,C}']);
    expect(rows[0].method).toBeCloseTo(0.01, 12);
    expect(rows[0].matrix).toBeCloseTo(0.01, 12);
    expect(rows[1].method).toBeCloseTo(-20, 12);
    expect(rows[1].matrix).toBeCloseTo(-20, 12);
    expect(rows[2].method).toBeCloseTo(-20, 12);
    expect(rows[2].matrix).toBeCloseTo(-20, 12);
    for (const row of rows) expect(Math.abs(row.method - row.matrix)).toBeLessThan(1e-9);
    renderEquations(doc);
  });

  it('shows the exact parabola, the piecewise-linear field and axial force, and quadratic displacement convergence', async () => {
    await modelStore.loadExample('galerkin-bar');
    const doc = method.build!(context());
    const plots = blocks(doc).filter((b) => b.kind === 'plot');
    expect(plots).toHaveLength(2);
    const displacement = plots[0].kind === 'plot' ? plots[0].plot : null;
    const force = plots[1].kind === 'plot' ? plots[1].plot : null;
    expect(displacement?.series[1].points[0]).toEqual([0, 0]);
    expect(displacement?.series[1].points[1][0]).toBe(2);
    expect(displacement?.series[1].points[1][1]).toBeCloseTo(0.01, 14);
    expect(displacement?.series[1].points[2]).toEqual([4, 0]);
    expect(displacement?.series[0].points[10][0]).toBe(1);
    expect(displacement?.series[0].points[10][1]).toBeCloseTo(0.0075, 14);
    expect(force?.series[1].points).toEqual([[0, 10], [2, 10], [2, -10], [4, -10]]);
    expect(force?.series[0].points[10]).toEqual([1, 10]);
    expect(force?.series[0].points[30]).toEqual([3, -10]);
    const refinement = doc.steps[9].blocks.find((b) => b.kind === 'table');
    expect(refinement?.kind).toBe('table');
    if (refinement?.kind !== 'table') return;
    expect(refinement.rows.map((r) => r[0])).toEqual([2, 4, 8, 16]);
    expect(refinement.rows.map((r) => r[3])).toEqual(['—', { tex: '4' }, { tex: '4' }, { tex: '4' }]);
    expect(refinement.rows[0][2]).toEqual({ tex: '0.0025' });
    expect(refinement.rows[1][2]).toEqual({ tex: '6.25 \\cdot 10^{-4}' });
  });

  it('explains when another model is outside this deliberately small example', async () => {
    await modelStore.loadExample('simply-supported');
    const verdict = method.applies(context());
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason.key).toBe('steps.m.galerkin.req.geometry');
  });

  it('keeps methods that need a constant or pointwise axial force out of the distributed-load example', async () => {
    await modelStore.loadExample('galerkin-bar');
    const ctx = context();
    for (const id of ['compatibility', 'cuts']) {
      const other = allMethods().find((m) => m.id === id)!;
      expect(other.applies(ctx)).toEqual({ ok: false, reason: { key: 'steps.req.axialDistributed' } });
    }
  });
});
