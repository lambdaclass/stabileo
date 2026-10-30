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

  it('a settled support: − Σ r·c', async () => {
    await modelStore.loadExample('settlement');
    for (const id of planeModel(modelStore.buildSolverInput(false)!).nodeOrder) {
      agrees(build('virtualWork', { quantity: 'disp', node: String(id), dir: 'z' }), 'mm');
      agrees(build('virtualWork', { quantity: 'rot', node: String(id) }), 'rad');
    }
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
