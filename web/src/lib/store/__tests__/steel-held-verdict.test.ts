/**
 * A CIRSOC 301 member that cannot be given a verdict reaches the member verdict held, never as a
 * pass and never as a failure: a limit state not evaluated, or a verdict that depends on whether
 * the section is rolled or welded when the section does not say. Through the real solver and the
 * real stores, as the design desk reads them.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '../index';
import { verificationStore } from '../verification.svelte';
import { runSteelCheck } from '../steel-check';
import { holdText } from '../member-verdict';
import es from '../../i18n/locales/es';
import steelEs from '../../i18n/locales/steel/es';
import * as wasmSolver from '../../engine/wasm-solver';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

/**
 * A 4 m cantilever under a uniform load q, its section given; returns the element id. A cantilever
 * because F.1.1 sets Cb = 1 on it: with the larger Cb of a propped span both readings reach Mp and
 * the fabrication would not matter.
 */
function beam(section: Record<string, unknown>, q: number): number {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  const mat = modelStore.addMaterial({ name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235, fu: 360 } as never);
  const sec = modelStore.addSection(section as never);
  const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(4, 0, 3);
  modelStore.addSupport(a, 'fixed3d' as never);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.updateElementMaterial(e, mat); modelStore.updateElementSection(e, sec);
  modelStore.addDistributedLoad3D(e, 0, 0, -q, -q, undefined, undefined, 1);
  // The load height declared (on the web), so that the fabrication is the one datum read both ways.
  modelStore.updateElement(e, { steelLoadHeight: 'web' });
  solveAndCheck();
  return e;
}

function solveAndCheck(): void {
  const r = modelStore.solve3D(false, false, true);
  if (typeof r === 'string' || !r) throw new Error(String(r));
  resultsStore.setResults3D(r as never);
  expect(runSteelCheck()).toEqual({ checked: 1 });
}

const IPE300 = { name: 'IPE 300', a: 53.8e-4, iy: 8356e-8, iz: 604e-8, h: 0.3, b: 0.15, tw: 0.0071, tf: 0.0107, j: 20.1e-8, shape: 'I', profileFamily: 'IPE' };
const echo = (k: string, p?: Record<string, string | number>) => `${k}${p ? JSON.stringify(p) : ''}`;

describe('a steel member held by its CIRSOC 301 check', () => {
  it('rolled or welded undeclared, with different verdicts: held on the datum until it is declared', () => {
    // Probe at q = 1 for the two readings' ratios, then load it to land between them.
    let e = beam(IPE300, 1);
    const probe = verificationStore.steelMap.get(e)!;
    expect(probe.fabrication?.basis).toBe('undeclared');
    if (probe.fabrication?.basis !== 'undeclared') throw new Error('undeclared');
    const { rolled, welded } = probe.fabrication;
    expect(probe.flexureZ.steps.join('\n')).toContain('Cb = 1,000');
    expect(welded.ratio, 'the two readings must differ for this beam').toBeGreaterThan(rolled.ratio * 1.005);
    const q = 2 / (rolled.ratio + welded.ratio);

    e = beam(IPE300, q);
    const v = verificationStore.memberVerdict(e);
    expect(v.local).toBe('unavailable');
    expect(v.status).toBe('unavailable');
    expect(v.holds).toEqual([{ kind: 'refused', key: 'verdict.hold.steelFabrication', params: expect.objectContaining({ rolled: expect.any(String), welded: expect.any(String) }) }]);
    expect(verificationStore.getDisplayStatus(e)).toBe('unavailable');
    expect(verificationStore.getDisplayRatio(e)).toBeNull();
    expect(es['verdict.hold.steelFabrication']).toContain('depende de si el perfil es laminado o soldado');

    // Declared on the section, the member has one verdict again.
    const sectionId = modelStore.elements.get(e)!.sectionId;
    modelStore.updateSection(sectionId, { fabrication: 'rolled' });
    solveAndCheck();
    const asRolled = verificationStore.memberVerdict(e);
    expect(['ok', 'warn']).toContain(asRolled.status);
    expect(asRolled.holds).toEqual([]);
    modelStore.updateSection(sectionId, { fabrication: 'welded' });
    solveAndCheck();
    expect(verificationStore.memberVerdict(e).status).toBe('fail');
  });

  it('a limit state not evaluated (a tube in flexure): held, the clause named in the reason', () => {
    const e = beam({ name: 'RHS 200x100x6', a: 34e-4, iy: 1.7e-5, iz: 5.7e-6, h: 0.2, b: 0.1, tw: 0.006, tf: 0.006, j: 1.4e-5, shape: 'RHS' }, 2);
    const v = verificationStore.memberVerdict(e);
    expect(v.status).toBe('unavailable');
    // The engine's refusal (`c301.refuse.fShape`, «§F.7–F.11 no implementados»), once for the member.
    expect(v.holds).toEqual([{ kind: 'refused', key: 'verdict.hold.steelNotEvaluated', params: { clause: 'F', what: 'c301.refuse.fShape', shape: 'RHS' } }]);
    // The reason names the clause and, in words, what was left out.
    const text = holdText(v.holds.find((h) => h.key === 'verdict.hold.steelNotEvaluated')!, echo);
    expect(text).toContain('"clause":"F"');
    expect(text).toContain('c301.refuse.fShape');
    expect(steelEs['c301.refuse.fShape']).toBeTruthy();
    expect(verificationStore.getDisplayRatio(e)).toBeNull();
  });
});
