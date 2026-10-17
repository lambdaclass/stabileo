/**
 * CIRSOC 301-2018 §D.3 / §B.4.2.2 from the model's end connections, against worked examples.
 *
 * Two kinds of oracle:
 *   · clause by hand, in mm — every number below is reproduced in the comment beside it;
 *   · AISC Design Examples (v15/v16) D.1, D.2, D.3, D.6 — x̄ of the tabulated shapes and the
 *     resulting U. AISC 360-10/16 has no 0,9 cap on U, CIRSOC 301 (as AISC LRFD 1999) has; where
 *     the cap binds it is asserted as the CIRSOC value. AISC's x̄ include the root fillets; the
 *     sharp-cornered outline used here gives a slightly LARGER x̄ (smaller U), so the comparison is
 *     a 1 % band on the conservative side.
 */
import { describe, it, expect } from 'vitest';
import {
  endNetArea, memberNetArea, memberEndsFor, presetConnection, tensionGeometry,
  type EndConnection, type TensionSectionInput, type EndNetArea,
} from '../tension-connection';

const IN = 0.0254;
const ok = (r: ReturnType<typeof endNetArea>): EndNetArea => {
  if ('refused' in r) throw new Error(`refused: ${r.refused.code} ${r.refused.message}`);
  return r;
};
const code = (r: ReturnType<typeof endNetArea>) => ('refused' in r ? r.refused.code : 'ok');

// L 100x100x10 (EN 10056), Ag = 19,2 cm²
const L100: TensionSectionInput = { shape: 'L', h: 0.1, b: 0.1, t: 0.01, a: 19.2e-4 };
// IPE 200: h 200, b 100, tw 5,6, tf 8,5, Ag 28,5 cm²
const IPE200: TensionSectionInput = { shape: 'I', h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085, a: 28.5e-4 };

describe('single angle bolted on one leg — D.3(2)(a), B.4.2.2', () => {
  // 1 line of 4 × M20, standard holes, pitch 70 mm, leg h connected.
  const end: EndConnection = { kind: 'bolted', connected: 'legH', diameterMm: 20, holeKind: 'standard', boltsPerLine: 4, lines: 1, pitchMm: 70 };
  it('An with the +2 mm hole, x̄ of the angle, U = 1 − x̄/L', () => {
    const r = ok(endNetArea(L100, end));
    // hole 22 (Tabla J.3.3) + 2 = 24 mm; An = 1920 − 24·10 = 1680 mm²
    expect(r.An * 1e6).toBeCloseTo(1680, 6);
    // x̄ = t(a·t + o² − t²)/(2·t(a + o − t)) = 10(1000 + 10000 − 100)/(2·1900) = 28,684 mm
    expect(r.xBar! * 1000).toBeCloseTo(28.684, 3);
    // L = 3·70 = 210 mm; U = 1 − 28,684/210 = 0,86341
    expect(r.L! * 1000).toBeCloseTo(210, 9);
    expect(r.U).toBeCloseTo(0.86341, 5);
    // Ae = 1680·0,86341 = 1450,5 mm²
    expect(r.Ae * 1e6).toBeCloseTo(1450.5, 1);
    expect(r.clause).toBe('D.3.1');
    expect(r.steps.join('\n')).toMatch(/B\.4\.2\.2/);
    expect(r.steps.join('\n')).toMatch(/D\.3\.2/);
  });

  it('a single bolt per line: Ae = net area of the connected leg (D.3(2)(a), last sentence)', () => {
    const r = ok(endNetArea(L100, { ...end, boltsPerLine: 1, pitchMm: undefined }));
    // 100·10 − 24·10 = 760 mm²
    expect(r.Ae * 1e6).toBeCloseTo(760, 6);
    expect(r.clause).toBe('D.3(2)(a)');
  });

  it('oversize holes deduct the Holgados column + 2 mm', () => {
    const r = ok(endNetArea(L100, { ...end, holeKind: 'oversize' }));
    // M20 oversize = 24 + 2 = 26 mm: An = 1920 − 260 = 1660
    expect(r.An * 1e6).toBeCloseTo(1660, 6);
  });

  it('AISC D.2 L4x4x1/2: x̄ ≈ 1.18 in, U = 1 − x̄/9 in ≈ 0.869 (cap not binding)', () => {
    const L4: TensionSectionInput = { shape: 'L', h: 4 * IN, b: 4 * IN, t: 0.5 * IN, a: 3.75 * IN * IN };
    // A welded end on one leg with L = 9 in uses the same x̄ and U as the bolted 4 @ 3 in.
    const r = ok(endNetArea(L4, { kind: 'welded', connected: 'legH', weld: 'longitudinal', lengthMm: 9 * 25.4 }));
    expect(r.xBar! / IN).toBeGreaterThanOrEqual(1.18 * 0.999);
    expect(r.xBar! / IN).toBeLessThan(1.18 * 1.01);
    expect(r.U).toBeCloseTo(1 - r.xBar! / (9 * IN), 12);
    expect(r.U).toBeGreaterThan(0.866);
    expect(r.U).toBeLessThan(0.870);
  });

  it('the U lower bound A_connected/Ag of open sections', () => {
    // A very short connection: 2 bolts at 30 mm → U = 1 − 28,684/30 = 0,044, raised to 1000/1920.
    const r = ok(endNetArea(L100, { ...end, boltsPerLine: 2, pitchMm: 30 }));
    expect(r.U).toBeCloseTo(1000 / 1920, 9);
  });
});

describe('double angle back to back (composition doubleBack)', () => {
  // 2 × L 50x50x5, Ag = 2·4,80 = 9,6 cm²; one line of 3 × M12 at 40 mm in each angle's h leg.
  const LL: TensionSectionInput = { shape: 'L', a: 9.6e-4, h: 0.05, b: 0.105, composition: { profileName: 'L 50x50x5', arrangement: 'doubleBack', gapMm: 5 } };
  it('holes in both angles, x̄ of one angle', () => {
    const r = ok(endNetArea(LL, { kind: 'bolted', connected: 'legH', diameterMm: 12, holeKind: 'standard', boltsPerLine: 3, lines: 1, pitchMm: 40 }));
    // hole 14 + 2 = 16; An = 960 − 2·16·5 = 800 mm²
    expect(r.An * 1e6).toBeCloseTo(800, 6);
    // x̄ = 5(50·5 + 2500 − 25)/(2·5·95) = 14,342 mm; L = 80; U = 0,82072
    expect(r.xBar! * 1000).toBeCloseTo(14.342, 3);
    expect(r.U).toBeCloseTo(1 - 14.3421 / 80, 4);
    expect(r.Ae * 1e6).toBeCloseTo(800 * (1 - 14.34211 / 80), 1);
  });
  it('other built-up arrangements are refused by name', () => {
    expect(code(endNetArea({ ...LL, composition: { profileName: 'L 50x50x5', arrangement: 'doubleX' } }, presetConnection('weldedAllAround')))).toBe('builtUp');
    expect(code(endNetArea({ ...LL, composition: { profileName: 'nope', arrangement: 'doubleBack' } }, presetConnection('weldedAllAround')))).toBe('builtUpPart');
  });
});

describe('I-section bolted through the flanges only', () => {
  // 2 lines per flange of 3 × M16 at 50 mm.
  const end: EndConnection = { kind: 'bolted', connected: 'flanges', diameterMm: 16, holeKind: 'standard', boltsPerLine: 3, lines: 2, pitchMm: 50 };
  it('IPE 200 by hand', () => {
    const r = ok(endNetArea(IPE200, end));
    // hole 18 + 2 = 20; An = 2850 − 4·20·8,5 = 2170 mm²
    expect(r.An * 1e6).toBeCloseTo(2170, 6);
    // half-section tee: flange 100×8,5 = 850 at 4,25; stem 91,5×5,6 = 512,4 at 54,25 → x̄ = 23,055 mm
    expect(r.xBar! * 1000).toBeCloseTo(23.055, 2);
    // L = 100; U = 0,76945; Ae = 1669,7 mm²
    expect(r.U).toBeCloseTo(0.76945, 4);
    expect(r.Ae * 1e6).toBeCloseTo(1669.7, 0);
  });
  it('AISC D.1 W8x21: x̄ of the WT4x10.5 ≈ 0.831 in; U = 0.908 capped at 0,9; An = 4.56 in²-equivalent', () => {
    const W8: TensionSectionInput = { shape: 'I', h: 8.28 * IN, b: 5.27 * IN, tw: 0.25 * IN, tf: 0.4 * IN, a: 6.16 * IN * IN };
    const r = ok(endNetArea(W8, { kind: 'welded', connected: 'flanges', weld: 'longitudinal', lengthMm: 9 * 25.4 }));
    expect(r.xBar! / IN).toBeGreaterThanOrEqual(0.831 * 0.999);
    expect(r.xBar! / IN).toBeLessThan(0.831 * 1.01);
    // 1 − 0.836/9 = 0.907 > 0,9: CIRSOC caps (AISC 360-16 would keep 0.908).
    expect(r.U).toBe(0.9);
  });
  it('I by its web: halves from the web mid-plane, lower bound A_web/Ag', () => {
    const r = ok(endNetArea(IPE200, { kind: 'bolted', connected: 'web', diameterMm: 16, holeKind: 'standard', boltsPerLine: 3, lines: 2, pitchMm: 50 }));
    // half = 2·(50·8,5) + 183·2,8 = 850 + 512,4 = 1362,4; x̄ = (2·425·25 + 512,4·1,4)/1362,4 = 16,124 mm
    expect(r.xBar! * 1000).toBeCloseTo(16.124, 2);
    // An = 2850 − 2·20·5,6 = 2626; U = 1 − 16,124/100 = 0,83876
    expect(r.An * 1e6).toBeCloseTo(2626, 6);
    expect(r.U).toBeCloseTo(0.83876, 4);
  });
  it('every element connected (flanges and web): Ae = An, D.3(1)', () => {
    const r = ok(endNetArea(IPE200, { ...end, connected: 'all', webLines: 2 }));
    // 2850 − 4·20·8,5 − 2·20·5,6 = 1946
    expect(r.Ae * 1e6).toBeCloseTo(1946, 6);
    expect(r.U).toBe(1);
    expect(r.clause).toBe('D.3(1)');
  });
});

describe('tee (WT)', () => {
  it('AISC D.3 WT6x20 welded through the flange, L = 16 in: x̄ ≈ 1.09 in, U = 0.932 capped at 0,9', () => {
    const WT: TensionSectionInput = { shape: 'T', h: 5.97 * IN, b: 8.01 * IN, tw: 0.295 * IN, tf: 0.515 * IN, a: 5.84 * IN * IN };
    const r = ok(endNetArea(WT, { kind: 'welded', connected: 'flange', weld: 'longitudinalAndTransverse', lengthMm: 16 * 25.4 }));
    expect(r.xBar! / IN).toBeGreaterThanOrEqual(1.09 * 0.999);
    expect(r.xBar! / IN).toBeLessThan(1.09 * 1.01);
    expect(r.U).toBe(0.9);
    // Ae = Ag·U (D.3.3): 5.84·0.9 = 5.256 in²
    expect(r.Ae / (IN * IN)).toBeCloseTo(5.256, 6);
    expect(r.clause).toBe('D.3.3');
  });
  it('transverse welds only: Ae = A of the connected flange (D.3(2)(c))', () => {
    const WT: TensionSectionInput = { shape: 'T', h: 0.15, b: 0.2, tw: 0.008, tf: 0.012, a: 0.0035 };
    const r = ok(endNetArea(WT, { kind: 'welded', connected: 'flange', weld: 'transverse' }));
    expect(r.Ae).toBeCloseTo(0.2 * 0.012, 12);
    expect(r.clause).toBe('D.3.4');
  });
});

describe('welded flat plate — D.3(2)(d)', () => {
  const bar: TensionSectionInput = { shape: 'rect', b: 0.01, h: 0.2, a: 0.002 };
  const weld = (L: number): EndConnection => ({ kind: 'welded', connected: 'all', weld: 'longitudinal', lengthMm: L });
  it('the L/w table', () => {
    expect(ok(endNetArea(bar, weld(400))).U).toBe(1);      // L ≥ 2w
    expect(ok(endNetArea(bar, weld(300))).U).toBe(0.87);   // 2w > L ≥ 1,5w
    expect(ok(endNetArea(bar, weld(250))).U).toBe(0.75);   // 1,5w > L ≥ w
    expect(ok(endNetArea(bar, weld(250))).Ae * 1e6).toBeCloseTo(1500, 6);
    expect(ok(endNetArea(bar, weld(250))).clause).toBe('D.3.5');
  });
  it('L < w is refused, and a missing L too', () => {
    expect(code(endNetArea(bar, weld(150)))).toBe('plateWeldShort');
    expect(code(endNetArea(bar, { kind: 'welded', connected: 'all', weld: 'longitudinal' }))).toBe('weldLength');
  });
  it('with a transverse weld too, the whole plate is connected: Ae = Ag (D.3(1))', () => {
    const r = ok(endNetArea(bar, { kind: 'welded', connected: 'all', weld: 'longitudinalAndTransverse', lengthMm: 100 }));
    expect(r.Ae).toBeCloseTo(0.002, 12);
    expect(r.clause).toBe('D.3(1)');
  });
});

describe('staggered holes — B.4.2.2 s²/4g', () => {
  it('a 300 × 12 plate, 4 lines of M20, s = 40, g = 70: the zig-zag governs', () => {
    const plate: TensionSectionInput = { shape: 'rect', b: 0.3, h: 0.012, a: 0.0036 };
    const r = ok(endNetArea(plate, { kind: 'bolted', connected: 'all', diameterMm: 20, holeKind: 'standard', boltsPerLine: 3, lines: 4, pitchMm: 80, stagger: { sMm: 40, gMm: 70 } }));
    // straight: 2·24·12 = 576; zig-zag: 4·24·12 − 3·40²·12/(4·70) = 1152 − 205,71 = 946,29 → governs
    expect(r.An * 1e6).toBeCloseTo(3600 - 946.2857, 3);
    expect(r.Ae).toBe(r.An);
  });
  it('a wide stagger lets the straight chain govern', () => {
    const plate: TensionSectionInput = { shape: 'rect', b: 0.3, h: 0.012, a: 0.0036 };
    const r = ok(endNetArea(plate, { kind: 'bolted', connected: 'all', diameterMm: 20, holeKind: 'standard', boltsPerLine: 3, lines: 2, pitchMm: 200, stagger: { sMm: 100, gMm: 50 } }));
    // straight 1·24·12 = 288; zig-zag 2·288 − 100²·12/200 = 576 − 600 < 288 → straight
    expect(r.An * 1e6).toBeCloseTo(3600 - 288, 6);
  });
});

describe('channel', () => {
  // UPN-like: h 200, b 75, tw 8,5, tf 11,5, Ag 32,2 cm²
  const U200: TensionSectionInput = { shape: 'U', h: 0.2, b: 0.075, tw: 0.0085, tf: 0.0115, a: 32.2e-4 };
  it('by its web: x̄ from the back of the web', () => {
    const r = ok(endNetArea(U200, { kind: 'welded', connected: 'web', weld: 'longitudinal', lengthMm: 200 }));
    // A = 2·75·11,5 + 177·8,5 = 1725 + 1504,5 = 3229,5; x̄ = (1725·37,5 + 1504,5·4,25)/3229,5 = 22,010 mm
    expect(r.xBar! * 1000).toBeCloseTo(22.010, 2);
    expect(r.U).toBeCloseTo(1 - 0.022010 / 0.2, 4);
  });
});

describe('refusals, by name', () => {
  const bolt: EndConnection = { kind: 'bolted', connected: 'all', diameterMm: 16, holeKind: 'standard', boltsPerLine: 2, lines: 1, pitchMm: 50 };
  it('tubes go to CIRSOC 302, cold-formed to 303, unknown shapes are not guessed', () => {
    expect(code(endNetArea({ shape: 'RHS', h: 0.1, b: 0.1, t: 0.005, a: 0.0019 }, bolt))).toBe('tube');
    expect(code(endNetArea({ shape: 'CHS', h: 0.1, t: 0.005, a: 0.0015 }, bolt))).toBe('tube');
    expect(code(endNetArea({ shape: 'C', h: 0.1, b: 0.05, tw: 0.002, tf: 0.002, a: 0.0004 }, bolt))).toBe('coldFormed');
    expect(code(endNetArea({ h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085, a: 28.5e-4 }, bolt))).toBe('noShape');
    expect(code(endNetArea({ shape: 'invL', h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085, a: 28.5e-4 }, bolt))).toBe('shape');
    expect(code(endNetArea({ ...IPE200, polygon: [[0, 0]] }, bolt))).toBe('drawn');
  });
  it('a missing or non-tabulated datum is refused, never defaulted', () => {
    expect(code(endNetArea(IPE200, { ...bolt, connected: 'flanges', pitchMm: undefined }))).toBe('pitch');
    expect(code(endNetArea(IPE200, { ...bolt, connected: 'flanges', diameterMm: 18 }))).toBe('holeNotTabulated');
    expect(code(endNetArea(IPE200, { ...bolt, connected: 'flanges', diameterMm: undefined }))).toBe('diameter');
    expect(code(endNetArea(IPE200, { ...bolt, connected: 'flanges', boltsPerLine: undefined }))).toBe('boltsPerLine');
    expect(code(endNetArea(IPE200, { ...bolt, connected: 'all' }))).toBe('webLines');
    expect(code(endNetArea(IPE200, { ...bolt, connected: 'legH' }))).toBe('connectedForShape');
    expect(code(endNetArea(IPE200, { ...bolt, connected: 'flanges', lines: 5 }))).toBe('holesDoNotFit');
    expect(code(endNetArea(L100, { kind: 'welded', connected: 'legH', weld: 'longitudinal' }))).toBe('weldLength');
    expect(code(endNetArea({ ...IPE200, a: undefined }, bolt))).toBe('area');
  });
  it('the geometry of a catalogue angle with only `t` is read', () => {
    expect(tensionGeometry({ shape: 'L', h: 0.05, b: 0.05, t: 0.005 })).toMatchObject({ kind: 'L', t: 0.005 });
  });
});

describe('the member: every end must be described', () => {
  const end: EndConnection = { kind: 'bolted', connected: 'legH', diameterMm: 20, holeKind: 'standard', boltsPerLine: 4, lines: 1, pitchMm: 70 };
  it('the weaker end governs; a missing end is named', () => {
    const r = memberNetArea(L100, [
      { elementId: 1, end: 'i', connection: end },
      { elementId: 1, end: 'j', connection: { ...end, boltsPerLine: 2 } },
    ]);
    expect('Ae' in r && r.governing.end).toBe('j');
    const m = memberNetArea(L100, [{ elementId: 1, end: 'i', connection: end }, { elementId: 1, end: 'j' }]);
    expect('missing' in m && m.missing.map((e) => e.end)).toEqual(['j']);
  });

  it('a chain needs only its outer ends, unless a joint or a described splice sits inside', () => {
    const NR = { my: false, mz: false, t: false };
    const elements = new Map([
      [1, { id: 1, nodeI: 10, nodeJ: 11, releaseI: NR, releaseJ: NR, tensionConnection: { i: end } }],
      [2, { id: 2, nodeI: 11, nodeJ: 12, releaseI: NR, releaseJ: NR, tensionConnection: { j: end } }],
    ]);
    const ends = memberEndsFor(1, { elements }, [1, 2]);
    expect(ends.map((e) => `${e.elementId}${e.end}`)).toEqual(['1i', '2j']);
    expect(ends.every((e) => e.connection)).toBe(true);
    // A hinge at the interior node is a joint there: its two ends must be described.
    elements.set(2, { ...elements.get(2)!, releaseI: { ...NR, mz: true } });
    const hinged = memberEndsFor(1, { elements }, [1, 2]);
    expect(hinged.map((e) => `${e.elementId}${e.end}`)).toEqual(['1i', '1j', '2i', '2j']);
    expect(memberNetArea(L100, hinged)).toHaveProperty('missing');
    // Without a chain, the element's own two ends.
    expect(memberEndsFor(1, { elements }).map((e) => e.end)).toEqual(['i', 'j']);
  });
});

describe('presets fill topology, never a dimension', () => {
  it('no pitch, count or weld length is invented', () => {
    for (const p of ['singleAngle1Line', 'doubleAngleBackToBack', 'iFlangesBolted', 'weldedAllAround', 'gussetWeldedBothSides'] as const) {
      const c = presetConnection(p, 'L') as unknown as Record<string, unknown>;
      expect(c.pitchMm).toBeUndefined();
      expect(c.boltsPerLine).toBeUndefined();
      expect(c.lengthMm).toBeUndefined();
    }
    expect(presetConnection('gussetWeldedBothSides', 'rect')).toMatchObject({ connected: 'all', weld: 'longitudinal' });
    expect(presetConnection('gussetWeldedBothSides', 'I')).toMatchObject({ connected: 'flanges' });
    expect(presetConnection('singleAngle1Line')).toMatchObject({ diameterMm: 16, lines: 1, connected: 'legH' });
  });
});
