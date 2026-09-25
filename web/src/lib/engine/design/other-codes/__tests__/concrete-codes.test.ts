/**
 * ACI 318 and EN 1992-1-1 through the engine's checkers, on the bars the engineer stated, against
 * the codes' closed forms for a singly reinforced rectangle (ACI 22.2 with Whitney's block,
 * EN 1992 3.1.7 with λ = 0,8).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../../../../store/model.svelte';
import { uiStore } from '../../../../store/ui.svelte';
import '../../../../store/index';
import { initSolver } from '../../../wasm-solver';
import { memberContexts, runOtherCode } from '../run';
import { ACI318, EC2 } from '../concrete-codes';
import type { ProvidedReinforcement } from '../../../../store/model.svelte';

const B = 0.3, H = 0.5, FC = 25, FY = 420, L = 6, Q = 30;
const AS = 4 * Math.PI * 0.016 ** 2 / 4;   // 4 Ø16, m²
const D = H - (0.025 + 0.008 + 0.008);      // cover + stirrup + half bar

/** Bottom 4 Ø16 in the span, 2 Ø12 over each support that stop there, Ø8 c/15 cm. */
const BARS: ProvidedReinforcement = {
  regions: {
    bottomSpan: { count: 4, diameter: 16 },
    topStart: { count: 2, diameter: 12 }, topEnd: { count: 2, diameter: 12 },
    continuity: { topStartIntoSpan: false, topEndIntoSpan: false },
  },
  stirrups: { diameter: 8, legs: 2, spacing: 0.15 },
};

function frame(opts: { cantilever?: boolean; bars?: ProvidedReinforcement; column?: boolean } = {}) {
  modelStore.clear();
  const mat = modelStore.addMaterial({ name: 'H-25', e: 25_000, nu: 0.2, rho: 25, fy: FC } as never);
  const sec = modelStore.addSection({ name: '30x50', shape: 'rect', b: B, h: H, a: B * H, iy: B * H ** 3 / 12, iz: H * B ** 3 / 12 } as never);
  const a = modelStore.addNode(0, 0, 0);
  const b = opts.column ? modelStore.addNode(0, 0, 3) : modelStore.addNode(L, 0, 0);
  const el = modelStore.addElement(a, b, 'frame');
  modelStore.updateElementMaterial(el, mat);
  modelStore.updateElementSection(el, sec);
  if (opts.cantilever || opts.column) {
    modelStore.addSupport(a, 'fixed3d' as never);
  } else {
    modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } });
    modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } });
  }
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
  const dead = modelStore.addLoadCase('D', 'D');
  if (opts.column) modelStore.addNodalLoad3D(b, 20, 0, -400, 0, 0, 0, dead);
  else modelStore.addDistributedLoad3D(el, 0, 0, -Q, -Q, undefined, undefined, dead);
  modelStore.addCombination('1.0D', [{ caseId: dead, factor: 1 }]);
  modelStore.reinforcementTransaction((tx) => tx.setReinforcement(el, opts.bars ?? BARS));
  const r = modelStore.solveCombinations3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return memberContexts(modelStore.model as never, r.perCombo, modelStore.combinations);
}

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; });
afterEach(() => { uiStore.analysisMode = '3d'; });

describe('reinforced concrete under other codes', () => {
  it('ACI 318: the span reads Mu/φMn with the bottom bars, singly reinforced', () => {
    const run = runOtherCode(ACI318, frame());
    expect(run.errorKey).toBeUndefined();
    const row = run.rows[0]!;
    expect(row.status).toBe('checked');
    const a = (AS * FY) / (0.85 * FC * B);
    const phiMn = 0.9 * AS * FY * 1e3 * (D - a / 2); // kN·m; ε_t well past 0,005 here
    const Mu = (Q * L * L) / 8;
    if (row.status === 'checked') {
      expect(row.reading.ratio / (Mu / phiMn)).toBeCloseTo(1, 2);
      expect(row.reading.unevaluated).toEqual([]);
    }
  });

  it('EN 1992-1-1: the same span reads MEd/MRd with fcd = fck/1,5 and fyd = fyk/1,15', () => {
    const run = runOtherCode(EC2, frame());
    const row = run.rows[0]!;
    expect(row.status).toBe('checked');
    const fcd = FC / 1.5, fyd = FY / 1.15;
    const x = (AS * fyd) / (0.8 * fcd * B);
    const MRd = AS * fyd * 1e3 * (D - 0.4 * x);
    if (row.status === 'checked') expect(row.reading.ratio / (((Q * L * L) / 8) / MRd)).toBeCloseTo(1, 2);
  });

  it('a hogging moment over a face with no bars fails, and says so', () => {
    const run = runOtherCode(ACI318, frame({
      cantilever: true,
      bars: { regions: { bottomSpan: { count: 4, diameter: 16 } }, stirrups: { diameter: 8, legs: 2, spacing: 0.15 } },
    }));
    const row = run.rows[0]!;
    expect(row.status).toBe('checked');
    if (row.status === 'checked') {
      expect(row.reading.pass).toBe(false);
      expect(row.reading.governing).toBe('otherCodes.gov.noTensionSteel');
    }
  });

  it('a column reads its faces under ACI 318 and is left out of EN 1992 flexure', () => {
    const bars: ProvidedReinforcement = {
      column: { cornerDia: 16, faceDia: 12, nBottom: 1, nTop: 1, nLeft: 1, nRight: 1 },
      stirrups: { diameter: 8, legs: 2, spacing: 0.15 },
    };
    const ctxs = frame({ column: true, bars });
    expect(ctxs[0]!.kind).toBe('column');
    expect(runOtherCode(EC2, ctxs).rows[0]).toMatchObject({ status: 'skipped', reasonKey: 'otherCodes.skip.ec2Axial' });
    const row = runOtherCode(ACI318, ctxs).rows[0]!;
    expect(row.status).toBe('checked');
    if (row.status === 'checked') expect(row.reading.ratio).toBeGreaterThan(0);
  });

  it('a member without bars is left out, with the reason', () => {
    const ctxs = frame();
    const ctx = { ...ctxs[0]!, element: { ...ctxs[0]!.element, reinforcement: undefined } };
    expect(runOtherCode(ACI318, [ctx]).rows[0]).toEqual({ elementId: ctx.elementId, status: 'skipped', reasonKey: 'otherCodes.skip.noReinforcement' });
  });
});
