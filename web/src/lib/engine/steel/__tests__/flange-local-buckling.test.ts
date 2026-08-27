/**
 * §F.6.2 — the half that is computable, and the half that is an image.
 *
 * ── Domain and exclusion, which is what the brief asked for ────────
 *
 * Three states, and keeping them apart is the point:
 *
 *   · **out of scope** — F.6 covers I sections and channels in minor-axis bending. A tube is not
 *     missing data; the clause does not reach it.
 *   · **geometry unavailable** — no flange width or thickness, so not even `λf` exists.
 *   · **classification unavailable** — `λf`, `Sy` and `Fcr` all computed, and the BRANCH cannot be
 *     selected because `λpf` and `λrf` are Table B.4.1b case 14, an image in the source PDF.
 *
 * Collapsing the last two into one «unavailable» would throw away the half a reader holding the
 * printed table could act on immediately.
 *
 * The one arithmetic trap the clause plants is `bf`: «mitad de la longitud del ala completa» for an
 * I, «longitud del ala completa» for a channel. In a squared term that is a factor of four, so it
 * gets its own test.
 */

import { describe, it, expect } from 'vitest';
import {
  f62Report, flangeWidthForSlenderness, f62BranchKey,
} from '../flange-local-buckling';
import es from '../../../i18n/locales/steel/es';
import en from '../../../i18n/locales/steel/en';
import pt from '../../../i18n/locales/steel/pt';

/** An IPE 200's flange and minor-axis inertia, in SI. */
const IPE200 = { b: 0.1, tf: 0.0085, iMinor: 142e-8 };

describe('exclusion — the clause does not reach every section', () => {
  it('excludes shapes F.6 does not cover, with no gaps reported', () => {
    for (const shape of ['RHS', 'CHS', 'T', 'L', 'invL', 'Z', 'rect', 'generic', undefined]) {
      const r = f62Report({ shape, ...IPE200 });
      expect(r.state, String(shape)).toBe('outOfScope');
      expect(r.missingKeys, String(shape)).toEqual([]);
      // And nothing is computed for a section the clause does not reach.
      expect(r.flangeSlenderness, String(shape)).toBeNull();
    }
  });

  it('includes I sections and channels', () => {
    for (const shape of ['I', 'H', 'U', 'C']) {
      expect(f62Report({ shape, ...IPE200 }).state, shape).toBe('classificationUnavailable');
    }
  });
});

describe('domain — the geometry the clause needs', () => {
  it('reports geometry unavailable when the flange is not described', () => {
    for (const over of [{ b: undefined }, { tf: undefined }, { tf: 0 }, { b: 0 }]) {
      const r = f62Report({ shape: 'I', ...IPE200, ...over });
      expect(r.state, JSON.stringify(over)).toBe('geometryUnavailable');
      expect(r.missingKeys).toContain('steel.f62.missing.flangeGeometry');
      expect(r.flangeSlenderness).toBeNull();
    }
  });

  it('takes HALF the flange for an I and the WHOLE flange for a channel', () => {
    /*
     * «bf para alas de sección doble Te = mitad de la longitud del ala completa; para alas de
     * secciones canal = longitud del ala completa.» An I's flange is symmetric about the web so the
     * outstanding leg is half; a channel's projects one way and the whole width outstands.
     *
     * `λf` is squared in F.6.3, so getting this wrong is a factor of FOUR in Fcr.
     */
    expect(flangeWidthForSlenderness('I', 0.1)).toBeCloseTo(0.05, 12);
    expect(flangeWidthForSlenderness('H', 0.1)).toBeCloseTo(0.05, 12);
    expect(flangeWidthForSlenderness('C', 0.1)).toBeCloseTo(0.1, 12);
    expect(flangeWidthForSlenderness('U', 0.1)).toBeCloseTo(0.1, 12);
    // And null rather than a guess for a shape the convention does not name.
    expect(flangeWidthForSlenderness('T', 0.1)).toBeNull();
    expect(flangeWidthForSlenderness('I', undefined)).toBeNull();
  });

  it('so the same flange gives a channel four times the Fcr penalty of an I', () => {
    // The consequence of the convention, measured. Twice the bf means four times the λf² and a
    // quarter of the Fcr.
    const i = f62Report({ shape: 'I', ...IPE200 });
    const c = f62Report({ shape: 'C', ...IPE200 });
    expect(c.flangeSlenderness! / i.flangeSlenderness!).toBeCloseTo(2, 12);
    expect(i.fcrMPa! / c.fcrMPa!).toBeCloseTo(4, 9);
  });
});

describe('what IS computed, and it is most of it', () => {
  const r = f62Report({ shape: 'I', ...IPE200 });

  it('computes the flange slenderness from the clause’s own convention', () => {
    // bf = 50 mm, tf = 8,5 mm → λf ≈ 5,88.
    expect(r.bfM).toBeCloseTo(0.05, 12);
    expect(r.flangeSlenderness).toBeCloseTo(0.05 / 0.0085, 9);
    expect(r.flangeSlenderness).toBeCloseTo(5.882, 3);
  });

  it('computes Fcr per F.6.3, which needs no table', () => {
    // `Fcr = 138000/(bf/tf)²`. A closed expression with a literal constant.
    expect(r.fcrMPa).toBeCloseTo(138000 / (0.05 / 0.0085) ** 2, 6);
    // 138000 / 5,88235² = 3988,2. Written out because the first draft of this line said 3990,5 —
    // hand arithmetic, and the module was right.
    expect(r.fcrMPa).toBeCloseTo(3988.2, 1);
  });

  it('computes Sy', () => {
    expect(r.syM3).toBeCloseTo(142e-8 / (0.1 / 2), 15);
  });

  it('and reports Fcr as conditional, not as a capacity', () => {
    /*
     * `Fcr` is branch (c)'s ingredient. Reporting it is useful — a reader with the printed table can
     * finish the calculation — but it is NOT a capacity, and the label says so rather than the
     * number sitting bare.
     */
    expect(es['steel.f62.fcrLabel']).toMatch(/si el ala resultara esbelta/);
    expect(en['steel.f62.fcrLabel']).toMatch(/if the flange turns out slender/);
  });
});

describe('the branch is never selected, and the reason is named', () => {
  it('leaves the branch undetermined even with full geometry', () => {
    /*
     * The assertion that keeps this honest. λpf and λrf are «Tabla B.4.1b, caso 14», and that
     * table's cells are images. No amount of geometry selects a branch without them.
     */
    for (const shape of ['I', 'H', 'U', 'C']) {
      const r = f62Report({ shape, ...IPE200 });
      expect(r.branch, shape).toBe('undetermined');
      expect(r.missingKeys, shape).toContain('steel.f62.missing.slendernessLimits');
    }
  });

  it('does not guess λpf or λrf from anywhere', () => {
    /*
     * A negative test, and worth having: an IPE 200's flange at λf ≈ 5,9 is compact by any real
     * table, so the tempting shortcut is to return `notApplicableCompact`. That would be asserting
     * a limit value the repository does not have.
     */
    const r = f62Report({ shape: 'I', ...IPE200 });
    expect(r.branch).not.toBe('notApplicableCompact');
    expect(r.branch).not.toBe('nonCompact');
    expect(r.branch).not.toBe('slender');
  });

  it('and separates «no geometry» from «no classification»', () => {
    // Two different states with two different remedies: one is a section datum the user can supply,
    // the other is a table nobody in this repository has.
    expect(f62Report({ shape: 'I', tf: 0.0085 }).state).toBe('geometryUnavailable');
    expect(f62Report({ shape: 'I', ...IPE200 }).state).toBe('classificationUnavailable');
  });
});

describe('every key resolves in the three offered languages', () => {
  const dicts = { es, en, pt } as Record<string, Record<string, string>>;

  it('resolves each state reason as a sentence', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      for (const k of ['outOfScope', 'geometryUnavailable', 'classificationUnavailable']) {
        const v = dict[`steel.f62.${k}`];
        expect(v, `${name}: ${k}`).toBeTruthy();
        expect(v.length, `${name}: ${k}`).toBeGreaterThan(40);
      }
    }
  });

  it('resolves each branch label', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      for (const b of ['notApplicableCompact', 'nonCompact', 'slender', 'undetermined'] as const) {
        expect(dict[f62BranchKey(b)], `${name}: ${b}`).toBeTruthy();
      }
    }
  });

  it('and names the table and the case in every language', () => {
    // «Tabla B.4.1b, caso 14» is the citation a reader needs to finish the calculation themselves.
    for (const [name, dict] of Object.entries(dicts)) {
      const v = dict['steel.f62.missing.slendernessLimits'];
      expect(v, name).toMatch(/B\.4\.1b/);
      expect(v, name).toMatch(/14/);
    }
  });
});
