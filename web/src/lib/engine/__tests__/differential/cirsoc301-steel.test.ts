/**
 * Differential test: the CIRSOC 301 steel checker in the engine against an independent TypeScript
 * statement of the same clauses.
 *
 * `cirsoc301-oracle.ts` is the TypeScript checker the app ran until the engine took over — written
 * from the CIRSOC 301-2018 text and corrected clause by clause in #293, #295 and #303. It stays
 * here, outside the app, as the second statement of the clauses. The engine
 * (`engine/src/postprocess/cirsoc301_check.rs`) is the first; the app reaches it through
 * `codes/argentina/cirsoc301.ts`, now an adapter.
 *
 * Every disagreement found when the two were first run against each other was resolved against the
 * clause (docs/verification/TS_ENGINE_LOGIC.md, "CIRSOC 301"). The ones where the oracle is wrong
 * are pinned below as such; on everything else the two must agree to 1e-9.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import * as oracle from './cirsoc301-oracle';
import { engineCheckMembers, engineCertifyMembers, type EngineCheck } from '../../codes/argentina/cirsoc301-kernel';

type P = oracle.SteelDesignParams;

// ─── Generators: physically valid members of every family the oracle knows ─────────────

const shapes = ['I', 'I', 'I', 'U', 'U', 'T', 'box', 'RHS', 'CHS', 'solid'] as const;

/** Uniform on [a, b]; fast-check's own doubles crowd the bounds. */
const u = (a: number, b: number) => fc.integer({ min: 0, max: 1_000_000 }).map((i) => a + ((b - a) * i) / 1_000_000);

const member = fc.record({
  shape: fc.constantFrom(...shapes),
  h: u(0.08, 1.0),
  bRatio: u(0.25, 1.0),
  tfRel: u(0.008, 0.1),
  twRel: u(0.003, 0.05),
  Fy: fc.constantFrom(235, 250, 275, 345, 355),
  L: u(0.5, 12),
  lbRel: u(0, 1),
  Kx: fc.constantFrom(undefined, 0.7, 1, 2),
  Ky: fc.constantFrom(undefined, 0.5, 1),
  Kz: fc.constantFrom(undefined, 1, 2),
  Cb: fc.constantFrom(undefined, 1, 1.14, 1.75, 2.27),
  builtUp: fc.boolean(),
  loadPosition: fc.constantFrom(undefined, 'web', 'topFlange'),
  withJ: u(0, 1),
  withCw: fc.boolean(),
  conn: fc.constantFrom('none', 'U', 'all', 'plate', 'xbar', 'holes', 'refused'),
});

const forces = fc.record({
  Nu: fc.oneof(fc.constant(0), u(-1500, 1500)),
  Muz: fc.oneof(fc.constant(0), u(-400, 400)),
  Muy: fc.oneof(fc.constant(0), u(-60, 60)),
  Vu: u(0, 600),
});

type M = typeof member extends fc.Arbitrary<infer T> ? T : never;

function params(g: M): P {
  const h = g.h;
  const b = Math.min(h, h * g.bRatio);
  const tf = Math.max(0.002, h * g.tfRel);
  const tw = Math.max(0.002, Math.min(h * g.twRel, b / 3));
  let A: number, Iz: number, Iy: number, J: number, Cw: number | undefined;
  switch (g.shape) {
    case 'I': case 'U': case 'T': {
      const hw = g.shape === 'T' ? h - tf : h - 2 * tf;
      const nf = g.shape === 'T' ? 1 : 2;
      A = nf * b * tf + hw * tw;
      // Plate approximations; the oracle and the engine read the same numbers.
      Iz = (b * h ** 3 - (b - tw) * hw ** 3) / 12 * (g.shape === 'T' ? 0.5 : 1);
      Iy = g.shape === 'U' ? (nf * tf * b ** 3) / 3 * 0.4 + hw * tw ** 3 / 12 : (nf * tf * b ** 3 + hw * tw ** 3) / 12;
      J = (nf * b * tf ** 3 + hw * tw ** 3) / 3;
      Cw = g.shape === 'I' ? (Iy * (h - tf) ** 2) / 4 : g.shape === 'U' ? (Iy * (h - tf) ** 2) / 8 : undefined;
      break;
    }
    case 'box': case 'RHS': {
      const t = tw;
      A = 2 * (b + h) * t - 4 * t * t;
      Iz = (b * h ** 3 - (b - 2 * t) * (h - 2 * t) ** 3) / 12;
      Iy = (h * b ** 3 - (h - 2 * t) * (b - 2 * t) ** 3) / 12;
      J = 2 * t * ((b - t) * (h - t)) ** 2 / (b + h - 2 * t);
      break;
    }
    case 'CHS': {
      const t = tw, D = h;
      A = Math.PI * (D * D - (D - 2 * t) ** 2) / 4;
      Iz = Iy = Math.PI * (D ** 4 - (D - 2 * t) ** 4) / 64;
      J = 2 * Iz;
      break;
    }
    default: {
      A = b * h; Iz = b * h ** 3 / 12; Iy = h * b ** 3 / 12; J = Iy;
    }
  }
  const p: P = {
    Fy: g.Fy, Fu: g.Fy * 1.5, E: 200_000, A, Iz, Iy, h, b, tw, tf,
    L: g.L, Lb: g.L * g.lbRel, shape: g.shape, builtUp: g.builtUp,
  };
  if (g.Kx !== undefined) p.Kx = g.Kx;
  if (g.Ky !== undefined) p.Ky = g.Ky;
  if (g.Kz !== undefined) p.Kz = g.Kz;
  if (g.Cb !== undefined) p.Cb = g.Cb;
  if (g.loadPosition !== undefined) p.loadPosition = g.loadPosition as 'web' | 'topFlange';
  if (g.withJ > 0.15) p.J = J;
  if (g.withCw && Cw !== undefined) p.Cw = Cw;
  switch (g.conn) {
    case 'U': p.tensionConnection = { An: A * 0.85, U: 0.8 }; break;
    case 'all': p.tensionConnection = { allElementsConnected: true }; break;
    case 'plate': p.tensionConnection = { plateWeld: { L: 0.2, w: 0.12 } }; break;
    case 'xbar': p.tensionConnection = { xBar: 0.02, length: 0.15, connectedArea: A * 0.4, welded: g.builtUp }; break;
    case 'holes': p.tensionConnection = { holes: { count: 2, d: 0.018, t: tf }, U: 0.9 }; break;
    case 'refused': p.tensionConnection = { refused: 'falta la union extrema' }; break;
  }
  return p;
}

// ─── Comparison ──────────────────────────────────────────────────────────────

interface Pair { name: string; o?: { ratio: number; status: string; notEvaluated?: string }; oc?: number; e?: EngineCheck }

function close(a: number, b: number, rel = 1e-9): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b || (Number.isNaN(a) && Number.isNaN(b));
  return Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
}

function pairs(v: oracle.SteelVerification, e: NonNullable<ReturnType<typeof engineCheckMembers>>[number]): Pair[] {
  return [
    { name: 'tension', o: v.tension, oc: v.tension?.phiPn, e: e.tension },
    { name: 'compression', o: v.compression, oc: v.compression?.phiPn, e: e.compression },
    { name: 'flexureStrong', o: v.flexureZ, oc: v.flexureZ.phiMn, e: e.flexureStrong },
    { name: 'flexureWeak', o: v.flexureY, oc: v.flexureY?.phiMn, e: e.flexureWeak },
    { name: 'shear', o: v.shear, oc: v.shear.phiVn, e: e.shear },
    { name: 'interaction', o: v.interaction, oc: undefined, e: e.interaction },
  ];
}

/** The disagreement class of one check, or null when the two agree. */
function classify(p: Pair, f: { Nu: number; Muz: number; Muy: number }): string | null {
  if (!p.o && !p.e) return null;
  if (!p.o && p.e) {
    // H.1.1, last paragraph: biaxial flexure without axial force uses H.1.1b. The oracle skips it.
    if (p.name === 'interaction' && Math.abs(f.Nu) <= 1e-6) return 'oracle: no H.1.1b for biaxial bending without axial force';
    return `${p.name}: only the engine runs it`;
  }
  if (p.o && !p.e) return `${p.name}: only the oracle runs it`;
  const o = p.o!, e = p.e!;
  if (!!o.notEvaluated !== !!e.notEvaluated) return `${p.name}: refusal differs`;
  if ((o.status === 'ok') !== e.pass) return `${p.name}: verdict differs`;
  if (p.oc !== undefined && !o.notEvaluated && !close(p.oc, e.capacity)) return `${p.name}: capacity differs`;
  if (!close(o.ratio, e.ratio)) return `${p.name}: ratio differs`;
  return null;
}

const RUNS = 4000;

describe('CIRSOC 301: engine against the independent TypeScript statement', () => {
  it(`agrees on ${RUNS} random members except where the oracle is wrong`, () => {
    const tally = new Map<string, number>();
    const coverage = new Map<string, number>();
    const cover = (k: string) => coverage.set(k, (coverage.get(k) ?? 0) + 1);
    const examples = new Map<string, unknown>();
    let n = 0;
    fc.assert(fc.property(member, forces, (g, f) => {
      const p = params(g);
      const v = oracle.verifySteelElement({ elementId: 1, Nu: f.Nu, Muz: f.Muz, Muy: f.Muy, Vu: f.Vu, params: p });
      const out = engineCheckMembers([{ ...p, elementId: 1 }], [{ elementId: 1, ...f }]);
      expect(out, 'engine loaded').not.toBeNull();
      const e = out![0]!;
      n++;
      for (const c of [e.tension, e.compression, e.flexureStrong, e.flexureWeak, e.shear, e.interaction]) {
        if (!c) continue;
        cover(c.notEvaluated ? `refused ${c.notEvaluated.key}` : `${c.clause} ${c.pass ? 'pass' : 'fail'}`);
      }
      for (const pr of pairs(v, e)) {
        const c = classify(pr, f);
        if (c) {
          tally.set(c, (tally.get(c) ?? 0) + 1);
          if (!examples.has(c)) examples.set(c, { p, f, oracle: pr.o, oc: pr.oc, engine: { ...pr.e, steps: undefined } });
        }
      }
    }), { numRuns: RUNS, seed: 301 });
    expect(n).toBe(RUNS);
    // Every clause path is exercised, both verdicts where the clause has a threshold.
    for (const k of ['D.2(a) pass', 'D.2(b) fail', 'E.3 pass', 'E.3 fail', 'E.4 pass', 'E.4 fail', 'E.7 pass', 'E.7 fail',
      'F.2 pass', 'F.2 fail', 'F.3 pass', 'F.4 pass', 'F.4 fail', 'F.5 pass', 'F.5 fail', 'F.6 pass', 'F.6 fail',
      'G.2 pass', 'G.2 fail', 'H.1.1a pass', 'H.1.1a fail', 'H.1.1b pass', 'H.1.1b fail', 'refused c301.refuse.noConnection',
      'refused c301.refuse.fShape', 'refused c301.refuse.ltbNoJ']) {
      expect(coverage.get(k) ?? 0, `coverage of ${k}`).toBeGreaterThan(5);
    }
    // The one class of disagreement, H.1.1b for biaxial bending, is the oracle's: pinned below.
    expect([...tally.keys()].filter((k) => !k.startsWith('oracle:')), JSON.stringify([...examples])).toEqual([]);
    expect(tally.get('oracle: no H.1.1b for biaxial bending without axial force') ?? 0).toBeGreaterThan(0);
  });

  /*
   * CIRSOC 301-2018 H.1.1, last paragraph: «Para miembros sometidos a flexión biaxial se aplicará
   * la expresión (H.1.1b) anulando el término que contiene a la fuerza axil». The TypeScript
   * checker ran H.1 only with an axial force, so a member bent about both axes passed with each
   * ratio below 1 and their sum above it — unconservative. The engine runs it.
   */
  it('pinned: biaxial bending without axial force is checked by H.1.1b (the oracle missed it)', () => {
    const p: P = {
      Fy: 235, Fu: 370, E: 200_000, A: 27.9e-4, Iz: 1450e-8, Iy: 81.3e-8, h: 0.18, b: 0.082, tw: 0.0069,
      tf: 0.0104, Zx: 187e-6, Sx: 161e-6, J: 7.89e-8, L: 5, Lb: 0, shape: 'I',
    };
    const f = { Nu: 0, Muz: 25, Muy: 4, Vu: 0 };
    const v = oracle.verifySteelElement({ elementId: 1, ...f, params: p });
    expect(v.interaction).toBeUndefined();
    expect(v.overallStatus).toBe('ok');
    const e = engineCheckMembers([{ ...p, elementId: 1 }], [{ elementId: 1, ...f }])![0]!;
    const sum = 25 / e.flexureStrong.capacity + 4 / e.flexureWeak!.capacity;
    expect(e.flexureStrong.ratio).toBeLessThan(1);
    expect(e.flexureWeak!.ratio).toBeLessThan(1);
    expect(e.interaction!.clause).toBe('H.1.1b');
    expect(e.interaction!.ratio).toBeCloseTo(sum, 12);
    expect(sum).toBeGreaterThan(1);
    expect(e.pass).toBe(false);
  });

  it('the certified enclosure contains every engine ratio', () => {
    fc.assert(fc.property(member, forces, (g, f) => {
      const p = { ...params(g), elementId: 1 };
      const e = engineCheckMembers([p], [{ elementId: 1, ...f }])![0]!;
      const c = engineCertifyMembers([p], [{ forces: { elementId: 1, ...f } }])![0]!;
      if (!c.certified) {
        expect(e.unevaluated.length, `uncertified (${c.reason}) though the check evaluated everything`).toBeGreaterThan(0);
        return;
      }
      const tol = 1e-12 * Math.max(1, e.unityRatio);
      expect(c.utilizationLower - tol).toBeLessThanOrEqual(e.unityRatio);
      expect(e.unityRatio).toBeLessThanOrEqual(c.utilizationUpper + tol);
      expect(c.certifiedOk && !e.pass).toBe(false);
    }), { numRuns: 1500, seed: 3011 });
  });
});
