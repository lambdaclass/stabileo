/**
 * The unit-load method beyond one displacement component: rotations (a unit
 * couple), relative displacements and rotations (pairs), any direction, and
 * the terms of springs, settlements and temperature; each against the matrix
 * solve of the same model, and the classic closed forms.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import * as wasm from '../../wasm-solver';
import { planeModel } from '../plane-model';
import { solveReference } from '../reference';
import { pickTarget, unitLoadInput } from '../unit-target';
import { methods } from '../methods/deformation';
import type { MethodContext } from '../registry';
import type { Block, CompareRow, StepDoc } from '../doc';
import { stepsEs, stepsEn, stepsPt } from '../../../i18n/locales/steps';
import es from '../../../i18n/locales/es';
import en from '../../../i18n/locales/en';
import pt from '../../../i18n/locales/pt';
import katex from 'katex';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });
beforeEach(() => { modelStore.clear(); });

function ctxOf(params: Record<string, string>): MethodContext {
  const input = modelStore.buildSolverInput(false)!;
  return { input, pm: planeModel(input), ref: solveReference(input), selection: { nodes: [], members: [] }, params };
}

function build(id: string, params: Record<string, string>): StepDoc {
  const m = methods.find((x) => x.id === id)!;
  const ctx = ctxOf(params);
  const a = m.applies(ctx);
  expect(a.ok, a.ok ? '' : JSON.stringify(a)).toBe(true);
  return m.build!(ctx);
}

function rowsOf(doc: StepDoc): CompareRow[] {
  const out: CompareRow[] = [];
  const walk = (bs: Block[]) => { for (const b of bs) { if (b.kind === 'compare') out.push(...b.rows); if (b.kind === 'sub') walk(b.blocks); } };
  for (const s of doc.steps) walk(s.blocks);
  return out;
}

const dicts = { es: { ...es, ...stepsEs }, en: { ...en, ...stepsEn }, pt: { ...pt, ...stepsPt } };
function expectWordsAndTex(doc: StepDoc) {
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      const keys = b.kind === 'p' || b.kind === 'note' ? [b.text.key] : b.kind === 'calc' && b.label ? [b.label.key] : b.kind === 'table' && b.caption ? [b.caption.key] : [];
      for (const k of keys) for (const [lang, d] of Object.entries(dicts)) expect(d[k], `${lang}: ${k}`).toBeTypeOf('string');
      const texs = b.kind === 'eq' ? [b.tex] : b.kind === 'calc' ? [b.formula, b.result, ...(b.subst ? [b.subst] : [])] : [];
      for (const tex of texs) expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'error' }), tex).not.toThrow();
      if (b.kind === 'sub') walk(b.blocks);
    }
  };
  for (const s of doc.steps) walk(s.blocks);
  if (doc.subtitle) for (const [lang, d] of Object.entries(dicts)) expect(d[doc.subtitle.key], `${lang}: ${doc.subtitle.key}`).toBeTypeOf('string');
}

/** The one compare row, agreeing with the matrix solve. */
function agrees(doc: StepDoc, unit: 'mm' | 'rad'): number {
  const rows = rowsOf(doc);
  expect(rows).toHaveLength(1);
  const r = rows[0];
  expect(r.unit).toBe(unit);
  expect(Math.abs(r.method - r.matrix), `${r.label}: ${r.method} vs ${r.matrix}`).toBeLessThan(1e-9 * Math.max(Math.abs(r.matrix), 1e-3));
  expectWordsAndTex(doc);
  return r.method;
}

describe('virtual work: what to compute', () => {
  it('rotations at every node of the portal frame, by a unit couple', async () => {
    await modelStore.loadExample('portal-frame');
    for (const id of planeModel(modelStore.buildSolverInput(false)!).nodeOrder) {
      agrees(build('virtualWork', { quantity: 'rot', node: String(id) }), 'rad');
    }
  });

  it('relative displacements and rotations between two nodes, by pairs', async () => {
    await modelStore.loadExample('portal-frame');
    agrees(build('virtualWork', { quantity: 'relDisp', node: '2', node2: '3', dir: 'auto' }), 'mm');
    agrees(build('virtualWork', { quantity: 'relDisp', node: '2', node2: '3', dir: 'x' }), 'mm');
    agrees(build('virtualWork', { quantity: 'relDisp', node: '1', node2: '3', dir: 'angle', angle: '45' }), 'mm');
    agrees(build('virtualWork', { quantity: 'relRot', node: '2', node2: '3' }), 'rad');
  });

  it('a displacement in any direction', async () => {
    await modelStore.loadExample('portal-frame');
    for (const angle of ['0', '30', '90', '135']) agrees(build('virtualWork', { quantity: 'disp', node: '3', dir: 'angle', angle }), 'mm');
  });

  it('closed forms: a cantilever tip rotates PL²/2EI, a simply supported end qL³/24EI', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0);
    modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed');
    modelStore.addNodalLoad(b, 0, -10, 0);
    const input = modelStore.buildSolverInput(false)!;
    const EI = planeModel(input).members.values().next().value!.EI;
    expect(agrees(build('virtualWork', { quantity: 'rot', node: String(b) }), 'rad')).toBeCloseTo((-10 * 16) / (2 * EI), 12);
    modelStore.clear();
    const c = modelStore.addNode(0, 0), d = modelStore.addNode(6, 0);
    const e = modelStore.addElement(c, d);
    modelStore.addSupport(c, 'pinned'); modelStore.addSupport(d, 'rollerX');
    modelStore.addDistributedLoad(e, -10, -10);
    const EI2 = planeModel(modelStore.buildSolverInput(false)!).members.get(e)!.EI;
    expect(agrees(build('virtualWork', { quantity: 'rot', node: String(c) }), 'rad')).toBeCloseTo((-10 * 216) / (24 * EI2), 12);
    expect(agrees(build('virtualWork', { quantity: 'relRot', node: String(c), node2: String(d) }), 'rad')).toBeCloseTo((2 * 10 * 216) / (24 * EI2), 12);
  });
});

describe('virtual work: springs, settlements, temperature', () => {
  const extras = (doc: StepDoc) => doc.steps.find((s) => s.title.key === 'course.statics.vw.extrasTitle');

  it('a beam on a spring: Σ r·R/k joins the bar integrals', async () => {
    await modelStore.loadExample('spring-support');
    const doc = build('virtualWork', { quantity: 'disp', node: '2', dir: 'z' });
    agrees(doc, 'mm');
    expect(extras(doc)).toBeDefined();
    agrees(build('virtualWork', { quantity: 'rot', node: '1' }), 'rad');
  });

  it('a cantilever on a vertical and a rotational spring: each spring works in its own component', () => {
    const P = 10, L = 4, ky = 3000, kz = 800;
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(L, 0);
    modelStore.addElement(a, b);
    modelStore.addSupport(a, 'spring', { kx: 1e6, ky, kz });
    modelStore.addNodalLoad(b, 0, -P, 0);
    const EI = planeModel(modelStore.buildSolverInput(false)!).members.values().next().value!.EI;
    const doc = build('virtualWork', { quantity: 'disp', node: String(b), dir: 'z' });
    expect(agrees(doc, 'mm') / 1000).toBeCloseTo(P * (L ** 3 / (3 * EI) + L ** 2 / kz + 1 / ky), 12);
    expect(agrees(build('virtualWork', { quantity: 'rot', node: String(b) }), 'rad')).toBeCloseTo(-P * (L ** 2 / (2 * EI) + L / kz), 12);
  });

  for (const angle of [30, -50]) {
    it(`a spring turned ${angle}°: its work is taken in its own axes and agrees with the matrix solve`, () => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(4, 3);
      modelStore.addElement(a, b); modelStore.addElement(b, c);
      modelStore.addSupport(a, 'pinned');
      const sp = modelStore.addSupport(c, 'spring', { kx: 2000, ky: 500, kz: 0 });
      modelStore.updateSupport(sp, { angle });
      modelStore.addNodalLoad(b, 6, -10, 0);
      const input = modelStore.buildSolverInput(false)!;
      expect(Math.abs(Math.abs([...input.supports.values()].find((s) => s.type === 'spring')!.angle ?? 0) - Math.abs(angle * Math.PI) / 180)).toBeLessThan(1e-12);
      for (const dir of ['x', 'z']) {
        const doc = build('virtualWork', { quantity: 'disp', node: String(c), dir });
        expect(extras(doc)).toBeDefined();
        agrees(doc, 'mm');
      }
    });
  }

  it('a settled support: − Σ r·c', async () => {
    await modelStore.loadExample('settlement');
    for (const id of planeModel(modelStore.buildSolverInput(false)!).nodeOrder) {
      agrees(build('virtualWork', { quantity: 'disp', node: String(id), dir: 'z' }), 'mm');
      agrees(build('virtualWork', { quantity: 'rot', node: String(id) }), 'rad');
    }
  });

  it('the virtual state carries the unit load alone, never the settlement', async () => {
    await modelStore.loadExample('settlement');
    const input = modelStore.buildSolverInput(false)!;
    const virt = solveReference(unitLoadInput(input, { loads: [{ node: 3, fx: 0, fz: 1, my: 0 }] } as Parameters<typeof unitLoadInput>[1]))!;
    expect(Math.abs(virt.displacements.get(2)!.uz)).toBeLessThan(1e-15);
    const still = solveReference({ ...input, loads: [] })!;
    expect(Math.abs(still.displacements.get(2)!.uz + 0.01)).toBeLessThan(1e-12);
  });

  it('temperature: the free elongation and curvature', async () => {
    await modelStore.loadExample('thermal');
    const doc = build('virtualWork', { quantity: 'disp', node: '3', dir: 'x' });
    agrees(doc, 'mm');
    expect(extras(doc)).toBeDefined();
    agrees(build('virtualWork', { quantity: 'rot', node: '2' }), 'rad');
    modelStore.clear();
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(5, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addThermalLoad(e, 15, 20);
    agrees(build('virtualWork', { quantity: 'rot', node: String(a) }), 'rad');
    agrees(build('virtualWork', { quantity: 'disp', node: String(b), dir: 'x' }), 'mm');
  });
});

describe('Castigliano: a rotation by a fictitious couple, a relative quantity by a pair', () => {
  it('on a determinate frame', async () => {
    await modelStore.loadExample('simply-supported');
    const ids = planeModel(modelStore.buildSolverInput(false)!).nodeOrder;
    agrees(build('castigliano', { quantity: 'rot', node: String(ids[0]) }), 'rad');
    agrees(build('castigliano', { quantity: 'relRot', node: String(ids[0]), node2: String(ids[ids.length - 1]) }), 'rad');
  });
});

describe('Castigliano\'s second theorem on the force method\'s chosen primary structure', () => {
  it('a continuous beam released at a hinge over the middle support agrees with the matrix solve', async () => {
    await modelStore.loadExample('continuous-beam');
    const m = methods.find((x) => x.id === 'castigliano')!;
    const input = modelStore.buildSolverInput(false)!;
    const ctx: MethodContext = { input, pm: planeModel(input), ref: solveReference(input), selection: { nodes: [], members: [] }, fundamental: ['h:1:J', 'h:2:J'] };
    expect(m.applies(ctx).ok).toBe(true);
    const doc = m.build!(ctx);
    expect(doc.noParams).toBe(true);
    const notes = doc.steps.flatMap((s) => s.blocks).filter((b) => b.kind === 'note').map((b) => (b as { text: { key: string } }).text.key);
    expect(notes).toContain('course.statics.castiglianoChosen');
    const rows = rowsOf(doc);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(Math.abs(r.method - r.matrix), r.label).toBeLessThan(1e-6 * Math.max(1, Math.abs(r.matrix)));
  });
});

describe('a relative quantity between the nodes the reader chose', () => {
  it('the same node twice is kept: its relative displacement is zero, not that of another node', async () => {
    await modelStore.loadExample('portal-frame');
    const params = { quantity: 'relDisp', node: '2', node2: '2', dir: 'x' };
    const tg = pickTarget(ctxOf(params));
    expect([tg.node, tg.node2]).toEqual([2, 2]);
    const rows = rowsOf(build('virtualWork', params));
    expect(rows).toHaveLength(1);
    expect(Math.abs(rows[0].method)).toBeLessThan(1e-12);
    expect(Math.abs(rows[0].matrix)).toBeLessThan(1e-12);
  });

  it('two distinct nodes at one point have no line between them: refused until a direction is chosen', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0);
    const c = modelStore.addNode(8, 0), d = modelStore.addNode(4, 0);
    expect(d).not.toBe(b);
    modelStore.addElement(a, b); modelStore.addElement(c, d);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(c, 'fixed');
    modelStore.addNodalLoad(b, 0, -10, 0);
    for (const id of ['virtualWork', 'castigliano']) {
      const m = methods.find((x) => x.id === id)!;
      const refused = m.applies(ctxOf({ quantity: 'relDisp', node: String(b), node2: String(d), dir: 'auto' }));
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.reason.key).toBe('course.statics.vw.err.coincident');
      const rows = rowsOf(m.build!(ctxOf({ quantity: 'relDisp', node: String(b), node2: String(d), dir: 'z' })));
      expect(Math.abs(rows[0].method - rows[0].matrix)).toBeLessThan(1e-9 * Math.max(Math.abs(rows[0].matrix), 1e-3));
      expect(Math.abs(rows[0].matrix)).toBeGreaterThan(1e-6);
    }
  });

  it('a hyperstatic structure: Castigliano solves its redundants and ignores the target, so a target it cannot use does not refuse it', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0);
    const c = modelStore.addNode(8, 0), d = modelStore.addNode(4, 0);
    modelStore.addElement(a, b); modelStore.addElement(c, d);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(c, 'fixed'); modelStore.addSupport(b, 'pinned');
    modelStore.addNodalLoad(d, 0, -10, 0);
    const m = methods.find((x) => x.id === 'castigliano')!;
    const ctx = ctxOf({ quantity: 'relDisp', node: String(b), node2: String(d), dir: 'auto' });
    expect(m.applies(ctx).ok).toBe(true);
    expect(m.build!(ctx).noParams).toBe(true);
  });

  it('a direction angle that is not a finite number is refused', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(4, 3);
    modelStore.addElement(a, b); modelStore.addElement(b, c);
    modelStore.addSupport(a, 'fixed');
    modelStore.addNodalLoad(c, 5, -10, 0);
    for (const id of ['virtualWork', 'castigliano']) {
      const m = methods.find((x) => x.id === id)!;
      for (const angle of ['abc', 'Infinity', '-Infinity', '']) {
        const v = m.applies(ctxOf({ quantity: 'disp', node: '3', dir: 'angle', angle }));
        if (angle === '') { expect(v.ok).toBe(true); continue; }
        expect(v.ok, `${id} ${angle}`).toBe(false);
        if (!v.ok) expect(v.reason.key).toBe('course.statics.vw.err.angle');
      }
      expect(m.applies(ctxOf({ quantity: 'disp', node: '3', dir: 'angle', angle: '45' })).ok).toBe(true);
    }
  });
});
