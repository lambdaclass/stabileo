import { describe, it, expect } from 'vitest';
import * as engine from '../tension-connection';
import * as legacy from './legacy-tension-connection';
import { ALL_PROFILES, profileToSectionFull } from '../../../data/steel-profiles';

type Sec = engine.TensionSectionInput;
type End = engine.EndConnection;

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

const sections: Sec[] = [];
for (const p of ALL_PROFILES) {
  const f = profileToSectionFull(p);
  sections.push({ name: p.name, ...f });
  if (f.shape === 'L' || f.shape === 'U') {
    sections.push({ name: `2${p.name}`, shape: f.shape, a: 2 * f.a, h: f.h, b: 2 * f.b + 0.01, composition: { profileName: p.name, arrangement: 'doubleBack', gapMm: 10 } });
  }
}
sections.push(
  { shape: 'T', h: 0.15, b: 0.2, tw: 0.008, tf: 0.012, a: 0.0035 },
  { shape: 'T', h: 0.3, b: 0.25, tw: 0.012, tf: 0.02, a: 0.0085 },
  { shape: 'T', h: 0.1, b: 0.1, tw: 0.006, tf: 0.1, a: 0.002 },
  { shape: 'rect', b: 0.01, h: 0.2, a: 0.002 },
  { shape: 'rect', b: 0.3, h: 0.012, a: 0.0036 },
  { shape: 'rect', b: 0.1, h: 0.1, a: 0.01 },
  { shape: 'rect', b: 0.05, a: 0.0005 },
  { shape: 'L', h: 0.05, b: 0.05, tw: 0.005, tf: 0.005, a: 4.8e-4 },
  { shape: 'L', h: 0.05, b: 0.05, tw: 0.005, tf: 0.006, a: 4.8e-4 },
  { shape: 'L', h: 0.05, b: 0.05, t: 0.05, a: 4.8e-4 },
  { shape: 'I', h: 0.2, b: 0.1, tw: 0.0056, tf: 0.1, a: 28.5e-4 },
  { shape: 'I', h: 0.2, b: 0.1, tw: 0.0056, a: 28.5e-4 },
  { shape: 'I', h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085 },
  { shape: 'I', h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085, a: 0 },
  { shape: 'I', h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085, a: 28.5e-4, polygon: [[0, 0]] },
  { shape: 'I', h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085, a: 28.5e-4, drawn: { x: 1 } },
  { shape: 'RHS', h: 0.1, b: 0.1, t: 0.005, a: 0.0019 },
  { shape: 'CHS', h: 0.1, t: 0.005, a: 0.0015 },
  { shape: 'C', h: 0.1, b: 0.05, tw: 0.002, tf: 0.002, a: 0.0004 },
  { shape: 'Z', h: 0.1, b: 0.05, tw: 0.002, tf: 0.002, a: 0.0004 },
  { shape: 'generic', a: 0.001 },
  { a: 0.001 },
  { shape: 'invL', a: 0.001 },
  { shape: 'L', a: 9.6e-4, h: 0.05, b: 0.105, composition: { profileName: 'nope', arrangement: 'doubleBack' } },
  { shape: 'L', a: 9.6e-4, h: 0.05, b: 0.105, composition: { profileName: 'L 50x50x5', arrangement: 'doubleX' } },
  { shape: 'I', a: 57e-4, h: 0.2, b: 0.2, composition: { profileName: 'IPE 200', arrangement: 'doubleBack' } },
  { shape: 'L', a: 4.8e-4, h: 0.05, b: 0.05, t: 0.005, composition: { profileName: 'L 50x50x5', arrangement: 'single' } },
);

const CONNECTED: engine.ConnectedElements[] = ['all', 'flanges', 'web', 'flange', 'legH', 'legB'];
const DIAMETERS = [undefined, 10, 12, 16, 18, 20, 22, 24, 27, 30, 36, 42, 0, -5];
const NB = [undefined, 1, 2, 3, 4, 6, 2.5, 0];
const NL = [undefined, 1, 2, 3, 4, 6, 0, 1.5];
const NW = [undefined, 0, 1, 2, 3, -1];
const PITCH = [undefined, 25, 30, 50, 64, 75, 100, 0];
const STAGGER = [undefined, undefined, { sMm: 40, gMm: 70 }, { sMm: 100, gMm: 50 }, { sMm: 30 }, { gMm: 60 }, { sMm: 55.5, gMm: 33.3 }];
const LENGTH = [undefined, 30, 50, 100, 150, 199.99, 200, 250, 300, 400, 1000, 0];

function randomEnd(): End {
  if (rnd() < 0.35) {
    return { kind: 'welded', connected: pick(CONNECTED), weld: pick(['longitudinal', 'transverse', 'longitudinalAndTransverse'] as const), lengthMm: pick(LENGTH) };
  }
  return {
    kind: 'bolted', connected: pick(CONNECTED), diameterMm: pick(DIAMETERS), holeKind: pick(['standard', 'oversize'] as const),
    boltsPerLine: pick(NB), lines: pick(NL), webLines: pick(NW), pitchMm: pick(PITCH), stagger: pick(STAGGER),
  };
}

const PER_SECTION = 400;

const canon = (v: unknown, key = ''): string => {
  if ((key === 'governing' || key === 'at') && v && typeof v === 'object') { const m = v as engine.MemberEnd; return `"${m.elementId}${m.end}"`; }
  if (Array.isArray(v)) return `[${v.map((x) => canon(x)).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${k}:${canon((v as Record<string, unknown>)[k], k)}`).join(',')}}`;
  return Object.is(v, -0) ? '-0' : JSON.stringify(v);
};

describe('effective net area: the engine against the TypeScript it replaces', () => {
  it('every catalogue shape, built-up pair and refusal, end by end', () => {
    let resolved = 0, refused = 0;
    const codes = new Map<string, number>();
    for (const s of sections) {
      for (let k = 0; k < PER_SECTION; k++) {
        const e = randomEnd();
        const a = legacy.endNetArea(s, e);
        const b = engine.endNetArea(s, e);
        expect(canon(b), `${s.name ?? s.shape} ${JSON.stringify(e)}`).toBe(canon(a));
        if ('refused' in a) { refused++; codes.set(a.refused.code, (codes.get(a.refused.code) ?? 0) + 1); } else { resolved++; codes.set(a.clause, (codes.get(a.clause) ?? 0) + 1); }
      }
    }
    console.log(`parity: ${sections.length} sections, ${resolved} resolved, ${refused} refused`, Object.fromEntries(codes));
    expect(resolved).toBeGreaterThan(5000);
  });

  it('members of one to three ends, with missing and refused ends', () => {
    let n = 0;
    for (const s of sections) {
      for (let k = 0; k < 60; k++) {
        const count = 1 + Math.floor(rnd() * 3);
        const ends: engine.MemberEnd[] = Array.from({ length: count }, (_, i) => ({
          elementId: 1 + i, end: i % 2 ? 'j' : 'i', connection: rnd() < 0.1 ? undefined : randomEnd(),
        }));
        const a = legacy.memberNetArea(s, ends);
        const b = engine.memberNetArea(s, ends);
        expect(canon(b), `${s.name ?? s.shape} ${JSON.stringify(ends)}`).toBe(canon(a));
        n++;
      }
    }
    expect(memberEmpty()).toBe(true);
    expect(n).toBeGreaterThan(1000);
  });

  it('geometry kinds agree', () => {
    for (const s of sections) {
      const a = legacy.tensionGeometry(s);
      const b = engine.tensionGeometry(s);
      if ('refused' in a) expect(b).toEqual(a);
      else expect(b).toEqual({ kind: a.kind, options: legacy.connectedOptions(a.kind) });
    }
  });
});

function memberEmpty() {
  return canon(engine.memberNetArea(sections[0]!, [])) === canon(legacy.memberNetArea(sections[0]!, []));
}
