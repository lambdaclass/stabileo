/**
 * AISI S100 on lipped channels: the effective section of Appendix 1 and the member check through
 * the engine, against the code's own expressions (1.1, 1.3, F2.1).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../../../../store/model.svelte';
import { uiStore } from '../../../../store/ui.svelte';
import '../../../../store/index';
import { initSolver, checkCfsMembers } from '../../../wasm-solver';
import { coldFormedGeometry } from '../../../../profiles/cold-formed';
import { coldFormedSectionFields, coldFormedSource } from '../../../../profiles/cold-formed-catalogue';
import { cfsEffective, effectiveWidth, edgeStiffenedFlange, lippedChannelCw } from '../cfs-effective';
import { memberContexts, runOtherCode } from '../run';
import { AISI_S100 } from '../cfs-code';

const E = 200_000e6, FY = 235e6;
const mm = (v: number) => v / 1000;

describe('effective section of a lipped channel', () => {
  it('is the full section when every element is compact, and matches the catalogue geometry', () => {
    const g = { H: mm(100), B: mm(50), C: mm(15), t: mm(4) };
    const eff = cfsEffective(g, FY, E)!;
    const geo = coldFormedGeometry({ shape: 'C', hMm: 100, bMm: 50, cMm: 15, tMm: 4 })!;
    expect(eff.ag * 1e6).toBeCloseTo(geo.areaMm2, 6);
    expect(eff.ix * 1e12).toBeCloseTo(geo.iyMm4, 0);
    expect(eff.ae).toBeCloseTo(eff.ag, 12);
    expect(eff.seX).toBeCloseTo(eff.sfX, 12);
  });

  it('loses area and modulus on a slender web, and the neutral axis moves toward the tension flange', () => {
    const g = { H: mm(200), B: mm(50), C: mm(15), t: mm(1) };
    const eff = cfsEffective(g, FY, E)!;
    expect(eff.ae).toBeLessThan(eff.ag * 0.8);
    expect(eff.seX).toBeLessThan(eff.sfX);
    // 1.1 on the uniformly compressed web: λ = 1,052/√4 · (w/t) · √(f/E), ρ = (1 − 0,22/λ)/λ.
    const w = mm(198), lam = (1.052 / 2) * (w / mm(1)) * Math.sqrt(FY / E);
    expect(effectiveWidth(w, mm(1), 4, FY, E)).toBeCloseTo(((1 - 0.22 / lam) / lam) * w, 12);
  });

  it('1.3: a lip at least as stiff as Ia gives k = 4 for a short lip, and a deep lip is refused', () => {
    const t = mm(1.5), w = mm(80), d = mm(19);
    const r = edgeStiffenedFlange(w, d, mm(20), t, FY, E)!;
    const S = 1.28 * Math.sqrt(E / FY);
    const Ia = Math.min(399 * t ** 4 * ((w / t) / S - 0.328) ** 3, t ** 4 * (115 * (w / t) / S + 5));
    expect((d ** 3 * t) / 12).toBeGreaterThan(Ia);
    expect(r.b).toBeCloseTo(effectiveWidth(w, t, 4, FY, E), 12);
    expect(edgeStiffenedFlange(mm(40), mm(35), mm(36), t, FY, E)).toBeNull();
  });

  it('Cw reduces to the plain channel with no lips', () => {
    const t = mm(2), H = mm(150), B = mm(60);
    const a = H - t, b = B - t;
    const plain = ((t * a * a * b ** 3) / 12) * ((2 * a + 3 * b) / (a + 6 * b));
    expect(lippedChannelCw({ H, B, C: t / 2, t })).toBeCloseTo(plain, 18);
  });
});

describe('AISI S100 member check', () => {
  beforeAll(async () => { await initSolver(); });
  beforeEach(() => { uiStore.analysisMode = 'pro'; });
  afterEach(() => { uiStore.analysisMode = '3d'; });

  function beam(L: number, q: number) {
    modelStore.clear();
    const mat = modelStore.addMaterial({ name: 'F-24', e: 200_000, nu: 0.3, rho: 78.5, fy: 235 } as never);
    const entry = coldFormedSource.byId('C 150x60x20x2')!;
    const sec = modelStore.addSection(coldFormedSectionFields(entry) as never);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    const el = modelStore.addElement(a, b, 'frame');
    modelStore.updateElementMaterial(el, mat);
    modelStore.updateElementSection(el, sec);
    modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } });
    modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } });
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
    const dead = modelStore.addLoadCase('D', 'D');
    modelStore.addDistributedLoad3D(el, 0, 0, -q, -q, undefined, undefined, dead);
    modelStore.addCombination('1.0D', [{ caseId: dead, factor: 1 }]);
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    return memberContexts(modelStore.model as never, r.perCombo, modelStore.combinations);
  }

  it('reads Mu/φb·Se·Fn with Fn from lateral-torsional buckling, and never passes without distortional', () => {
    const L = 3, q = 1;
    const ctx = beam(L, q)[0]!;
    const m = AISI_S100.member(ctx);
    if ('skip' in m) throw new Error(m.skip);
    const run = runOtherCode(AISI_S100, [ctx]);
    const row = run.rows[0]!;
    expect(row.status).toBe('checked');
    if (row.status !== 'checked') return;
    expect(row.reading.pass).toBe(false);
    expect(row.reading.unevaluated).toContain('otherCodes.check.cfsDistortional');
    // F2.1 about the axis of symmetry, with the section's own J and Cw.
    const d = m.data as Record<string, number>;
    const eff = cfsEffective({ H: 0.15, B: 0.06, C: 0.02, t: 0.002 }, FY, E)!;
    const J = ctx.section.j!, Cw = eff.cw, G = E / 2.6;
    const Me = (Math.PI / d.lb) * Math.sqrt(E * ctx.section.iz * G * J) * Math.sqrt(1 + (Math.PI ** 2 * E * Cw) / (G * J * d.lb ** 2));
    const Fe = Me / d.sfX;
    const Fn = Fe >= 2.78 * FY ? FY : Fe >= 0.56 * FY ? (10 / 9) * FY * (1 - (10 * FY) / (36 * Fe)) : Fe;
    const Mu = ((q * L * L) / 8) * 1e3;
    expect(row.reading.governing).toBe('otherCodes.gov.flexureStrong');
    expect(row.reading.ratio / (Mu / (0.9 * d.seX * Fn))).toBeCloseTo(1, 3);
  });

  it('the checker still reads 1 + √X in F2.1: when it is corrected, `ltbInputs` has to go', () => {
    // Sent the section's own J and Cw, the checker's ratio is the (1 + √X) one, not the code's.
    const L = 3, q = 1;
    const ctx = beam(L, q)[0]!;
    const m = AISI_S100.member(ctx);
    if ('skip' in m) throw new Error(m.skip);
    const eff = cfsEffective({ H: 0.15, B: 0.06, C: 0.02, t: 0.002 }, FY, E)!;
    const raw = { ...m.data, j: ctx.section.j!, cw: eff.cw };
    const fr = AISI_S100.forces(ctx, ctx.demands.find((x) => x.category === 'My+')!, raw);
    const res = checkCfsMembers({ members: [raw], forces: [fr] })![0] as Record<string, number>;
    const d = raw as Record<string, number>;
    const G = E / 2.6, X = (Math.PI ** 2 * E * eff.cw) / (G * d.j * d.lb ** 2);
    const MeChecker = (Math.PI / d.lb) * Math.sqrt(E * d.iy * G * d.j) * (1 + Math.sqrt(X));
    const Fe = MeChecker / d.sfX;
    const Fn = Fe >= 2.78 * FY ? FY : Fe >= 0.56 * FY ? (10 / 9) * FY * (1 - (10 * FY) / (36 * Fe)) : Fe;
    expect(res.mnX / (d.seX * Fn)).toBeCloseTo(1, 6);
  });

  it('refuses a zed, whose principal axes the model cannot state', () => {
    const ctx = beam(3, 1)[0]!;
    const zed = { ...ctx, section: { ...ctx.section, shape: 'Z' as const } };
    expect(AISI_S100.member(zed)).toEqual({ skip: 'otherCodes.skip.zedPrincipal' });
  });
});
