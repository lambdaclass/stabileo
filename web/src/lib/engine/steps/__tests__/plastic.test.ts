/**
 * The static and kinematic methods as explained documents, on the portal-frame
 * example: their structure, and their numbers against each other, against the
 * hand values of the beam mechanism and against the step-by-step analysis.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { planeModel } from '../plane-model';
import { solveReference } from '../reference';
import { methodById } from '../methods';
import type { MethodContext } from '../registry';
import type { Block, StepDoc } from '../doc';

let ctx: MethodContext;
beforeAll(async () => {
  await modelStore.loadExample('portal-frame');
  const input = modelStore.buildSolverInput(false)!;
  ctx = { input, pm: planeModel(input), ref: solveReference(input), selection: { members: [], nodes: [] }, options: {} };
});

const blocks = (doc: StepDoc): Block[] => {
  const out: Block[] = [];
  const walk = (bs: Block[]) => bs.forEach((b) => { out.push(b); if (b.kind === 'sub') walk(b.blocks); });
  walk(doc.intro);
  doc.steps.forEach((s) => walk(s.blocks));
  return out;
};
const compare = (doc: StepDoc) => blocks(doc).flatMap((b) => (b.kind === 'compare' ? b.rows : []));

describe('plastic methods in the catalog', () => {
  it('both apply to the portal frame example and are in the plastic group', () => {
    for (const id of ['plasticKinematic', 'plasticStatic']) {
      const m = methodById(id)!;
      expect(m.group).toBe('plastic');
      expect(m.applies(ctx).ok).toBe(true);
    }
  });

  it('kinematic: GH, 5 sections, 2 independent mechanisms, beam governs at λ = 9625/135, equal to the step by step', () => {
    const doc = methodById('plasticKinematic')!.build!(ctx);
    expect(doc.steps.map((s) => s.title.key)).toEqual(['course.plastic.kin.s1', 'course.plastic.kin.s2', 'course.plastic.kin.s3', 'course.plastic.kin.s4']);
    const all = blocks(doc);
    const gh = all.find((b) => b.kind === 'calc' && b.label?.key === 'course.plastic.doc.gh');
    expect(gh && gh.kind === 'calc' && gh.result).toContain('GH = 3');
    const m = all.find((b) => b.kind === 'calc' && b.label?.key === 'course.plastic.doc.independent');
    expect(m && m.kind === 'calc' && m.subst).toBe('m = 5 - 3');
    expect(doc.steps[1].blocks.filter((b) => b.kind === 'sub')).toHaveLength(2);
    const rows = compare(doc);
    expect(rows).toHaveLength(1);
    expect(rows[0].method).toBeCloseTo(9625 / 135, 6);
    expect(Math.abs(rows[0].matrix / rows[0].method - 1)).toBeLessThan(1e-3);
    expect(all.some((b) => b.kind === 'note' && b.text.key === 'course.plastic.doc.admissible')).toBe(true);
  });

  it('static: the equations, a first lower bound below λc, trials that close on the same λc', () => {
    const doc = methodById('plasticStatic')!.build!(ctx);
    expect(doc.steps).toHaveLength(5);
    const eqs = doc.steps[1].blocks.filter((b) => b.kind === 'eq');
    expect(eqs).toHaveLength(2);
    const first = blocks(doc).find((b) => b.kind === 'calc' && b.label?.key === 'course.plastic.st.firstYield');
    const l1 = Number((first as { result: string }).result.match(/= ([\d.]+)/)![1]);
    expect(l1).toBeLessThan(9625 / 135);
    const bounds = doc.steps[4].blocks.find((b) => b.kind === 'table');
    const last = (bounds as { rows: number[][] }).rows.at(-1)!;
    expect(last[1]).toBeCloseTo(9625 / 135, 6);
    expect(last[2]).toBeCloseTo(9625 / 135, 6);
    expect(compare(doc)[0].method).toBeCloseTo(9625 / 135, 6);
  });
});
