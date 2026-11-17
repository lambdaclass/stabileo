/**
 * A grade beam of a mat foundation, 20 × 60: the soil bends it the other way, sagging over its
 * middle column and hogging between, so the bottom bars it needs are at a support, which only the
 * run along the line reaches; and a 20 cm web holds two or three bars a layer, so one bar more of
 * the same no longer adds strength once the layers pile up and lower d.
 */
import { describe, it, expect } from 'vitest';
import { beamRow, type BeamDemand, type BeamEnd, type SectionEnv } from '../beam-row';
import { beamLine } from '../beam-line';
import { faceBars } from '../bars';
import { makeFmt } from '../format';

const fmt = makeFmt('.');
const column: BeamEnd = { kind: 'column', half: 0.2 };
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.03, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
type Station = [number, number, number, number];
const L = 4.5;
const span = (towardsMiddle: boolean): Station[] => Array.from({ length: 19 }, (_, i) => {
  const x = (i * L) / 18, t = towardsMiddle ? x / L : 1 - x / L;
  const m = 218 * (2.6 * t * t - 1.6 * t);
  return [x, Math.max(0, m), Math.max(0, -m), 60 + 120 * t];
});
const sec = (s: Station): SectionEnv => ({ x: s[0], pos: { value: s[1], source: { combo: 'U', x: s[0] } }, neg: { value: s[2], source: { combo: 'U', x: s[0] } }, nPos: 0, nNeg: 0 });

function line() {
  const rows = [span(true), span(false)].map((st, k) => {
    const peak = st.reduce((a, b) => (b[1] > a[1] ? b : a)), hog = st.reduce((a, b) => (b[2] > a[2] ? b : a));
    const d: BeamDemand = {
      key: `beam:7:${k}`, name: `V7-${k + 1}`, level: 'N0', length: L, b: 0.2, h: 0.6,
      start: sec(st[0]!), span: sec(peak), end: sec(st[st.length - 1]!),
      negAny: { value: hog[2] }, nNegAny: 0, vu: { value: Math.max(...st.map((s) => s[3])) }, nAtV: 0, tu: { value: 0 }, combos: [],
      env: st.map(([x, pos, neg, v]) => ({ x, pos, neg, v })),
      supportHalf: { start: 0.2, end: 0.2 }, ends: { start: column, end: column },
      line: { group: 7, index: k, spans: 2, startNode: k + 1, endNode: k + 2, lineName: 'V7' },
    };
    return beamRow(d, ctx as never, undefined, fmt);
  });
  return beamLine(rows, ctx as never, undefined, fmt);
}

describe('a grade beam sagging over its middle column', () => {
  it('carries the envelope with the run along the bottom, in bars a 20 cm web can take', () => {
    const l = line();
    expect(l.verifications.find((v) => v.label === 'rcSheets.v.lineEnvelope')?.ok).toBe(true);
    for (const sa of l.spanAdopted) for (const s of ['start', 'span', 'end'] as const) for (const f of ['top', 'bottom'] as const) {
      expect(new Set(faceBars(sa.at![s]![f], 0.2, 0.03, sa.stirrups.dia).map((b) => b.row)).size, `${s} ${f}`).toBeLessThanOrEqual(4);
    }
  });
});
