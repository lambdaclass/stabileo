/**
 * Angles reach the CIRSOC 301 check (`steel/angle-section.ts`): a catalogue angle has one
 * thickness and used to be left out for want of a web and a flange thickness.
 */
import { describe, it, expect } from 'vitest';
import { profileByName, profileToSectionFull } from '../../../data/steel-profiles';
import { checkSteelMember, missingSteelInputs, steelGoverningRatio } from '../../verification-service';
import { angleSection } from '../angle-section';
import { lightestPassing } from '../profile-optimise';

const mat = { fy: 235, fu: 370, e: 200_000 };
const L80 = () => profileToSectionFull(profileByName('L 80x80x8')!);
const pull = (Nt: number) => ({ Nc: 0, Nt, MuStrong: 0, MuWeak: 0, Vu: 0, diagram: [] });
const push = (Nc: number) => ({ Nc, Nt: 0, MuStrong: 0, MuWeak: 0, Vu: 0, diagram: [] });

describe('single angles', () => {
  it('a catalogue angle is no longer missing a thickness', () => {
    expect(missingSteelInputs(L80(), mat)).toEqual([]);
    const a = angleSection(L80());
    expect(a.kind).toBe('angle');
  });

  it('in compression without an end condition: NOT EVALUATED by name (E.5), never a pass', () => {
    const v = checkSteelMember(1, push(20), L80(), mat, { L: 2, Lb: 2 })!;
    expect(v.compression!.notEvaluatedMessage!.key).toBe('c301.refuse.e5Condition');
    // held, not failed: a refused check is never a pass and proves no failure (`cirsoc301-verdict.ts`).
    expect(v.overallStatus).toBe('held');
  });

  it('with E.5(a) through the long leg: (kL/r)m of E.5.1 and a confirmed result', () => {
    const v = checkSteelMember(1, push(20), L80(), mat, { L: 2, Lb: 2, angle: { endCondition: 'e5aLong' } })!;
    const c = v.compression!;
    expect(c.notEvaluated).toBeUndefined();
    // rx from the catalogue-scaled geometric inertia over the larger area (conservative).
    expect(c.KLr).toBeGreaterThan(72);
    expect(c.messages.some((m) => m.key === 'c301.e.e5Effective')).toBe(true);
    expect(c.phiPn).toBeGreaterThan(20);
    expect(v.overallStatus).toBe('ok');
    expect(v.engineRecheck.certifiedOk).toBe(true);
  });

  it('in tension: yield, and rupture once the end connection is described', () => {
    const v = checkSteelMember(1, pull(50), L80(), mat, { L: 2, Lb: 2, tensionConnection: { An: 10e-4, U: 0.8 } })!;
    expect(v.tension!.notEvaluated).toBeUndefined();
    expect(v.tension!.phiPn).toBeCloseTo(Math.min(0.9 * 235 * 12.3e-4 * 1000, 0.75 * 370 * 10e-4 * 0.8 * 1000), 6);
  });

  it('in flexure: refused by name (F.10 is not implemented)', () => {
    const v = checkSteelMember(1, { ...push(0), MuStrong: 1 }, L80(), mat, { L: 2, Lb: 2 })!;
    expect(v.flexureZ.notEvaluatedMessage!.key).toBe('c301.refuse.f10');
    // held, not failed: a refused check is never a pass and proves no failure (`cirsoc301-verdict.ts`).
    expect(v.overallStatus).toBe('held');
  });
});

describe('double angles', () => {
  const twoL = (arrangement = 'doubleBack') => ({
    name: '2L 80x80x8', a: 2 * 12.3e-4, iy: 2 * 72.2e-8, iz: 3e-6, h: 0.08, b: 0.17,
    composition: { profileName: 'L 80x80x8', arrangement, gapMm: 10 },
  });

  it('back to back, with the connectors stated: E.6 modified slenderness, E.4(a)', () => {
    const v = checkSteelMember(1, push(100), twoL(), mat, { L: 3, Lb: 3, angle: { connectorSpacing: 0.6, connector: 'welded' } })!;
    const c = v.compression!;
    expect(c.notEvaluated).toBeUndefined();
    expect(c.messages.some((m) => m.key === 'c301.e.doubleAngle')).toBe(true);
    expect(v.overallStatus === 'ok').toBe(v.engineRecheck.certifiedOk);
  });

  it('without the connector spacing: refused by name (E.6.2.1)', () => {
    const v = checkSteelMember(1, push(100), twoL(), mat, { L: 3, Lb: 3 })!;
    expect(v.compression!.notEvaluatedMessage!.key).toBe('c301.refuse.e6Spacing');
  });

  it('another arrangement of angles: refused by name', () => {
    const v = checkSteelMember(1, push(100), twoL('doubleX'), mat, { L: 3, Lb: 3 })!;
    expect(v.compression!.notEvaluatedMessage!.key).toBe('c301.refuse.unknownShape');
    expect(JSON.stringify(v.compression!.notEvaluatedMessage)).toContain('doubleX');
  });
});

describe('the profile search over angles', () => {
  it('stops at a refusal no profile can lift, and says which', () => {
    const r = lightestPassing('L', [{ elementId: 1, demand: push(20), lengths: { L: 2, Lb: 2 } }], mat);
    expect(r.chosen).toBeNull();
    expect(r.tried).toBe(1);
    expect(r.best?.memberRefusal).toBe('c301.refuse.e5Condition');
  });

  it('with the end condition stated, picks the lightest angle the gated engine confirms', () => {
    const r = lightestPassing('L', [{ elementId: 1, demand: push(60), lengths: { L: 2, Lb: 2, angle: { endCondition: 'e5aLong' } } }], mat);
    expect(r.chosen).not.toBeNull();
    const v = checkSteelMember(1, push(60), profileToSectionFull(r.chosen!.profile), mat, { L: 2, Lb: 2, angle: { endCondition: 'e5aLong' } })!;
    // A pass: the lightest passing angle sits near the limit, so above 0,95 it reads `warn`, the
    // near-limit band every design surface uses (still a pass, never a failure).
    expect(v.overallStatus).toBe(steelGoverningRatio(v) > 0.95 ? 'warn' : 'ok');
    expect(v.engineRecheck.certifiedOk).toBe(true);
  });
});
