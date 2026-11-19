import { describe, it, expect } from 'vitest';
import { beamRow, type BeamDemand, type SectionEnv } from '../beam-row';
import { beamLine, type LineLayout } from '../beam-line';
import { lineSupports, setOut } from '../line-geometry';
import { zeroMoments } from '../elevation-layout';
import { makeFmt } from '../format';
import { overlapping, planOverlapping, screenLayout, zoneCounts } from './elevation-checks';

const env = (x: number, pos: number, neg: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: 0, nNeg: 0 });
const base = { mat: { fc: 25, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };

function denseLine(extra: object = {}, lengths = [1.2, 5.5, 1.0, 4.0, 2.2, 6.0]): LineLayout {
  const c = { ...base, ...extra };
  const n = lengths.length;
  const rows = lengths.map((L, k) => {
    const w = 45, st = Array.from({ length: 25 }, (_, i) => {
      const x = (i / 24) * L, m = (w * x * (L - x)) / 2 - (w * L * L) / (k === 0 || k === n - 1 ? 16 : 11);
      return { x, pos: Math.max(0, m), neg: Math.max(0, -m), v: Math.abs(w * (L / 2 - x)) + 20 };
    });
    const peak = st.reduce((a, b) => (b.pos > a.pos ? b : a));
    const d: BeamDemand = {
      key: `beam:7:${k}`, name: `V7-${k + 1}`, level: 'N1', length: L, b: 0.25, h: 0.6,
      start: env(0, st[0]!.pos, st[0]!.neg), span: env(peak.x, peak.pos, 0), end: env(L, st[24]!.pos, st[24]!.neg),
      negAny: { value: Math.max(...st.map((s) => s.neg)) }, nNegAny: 0, vu: { value: Math.max(...st.map((s) => s.v)) }, nAtV: 0, tu: { value: 0 }, combos: [], env: st,
      supportHalf: { start: 0.15, end: 0.15 }, ends: { start: { kind: 'column', half: 0.15 }, end: { kind: 'column', half: 0.15 } },
      posts: { start: { name: `C${k + 1}`, b: 0.3, h: 0.3 }, end: { name: `C${k + 2}`, b: 0.3, h: 0.3 } },
      line: { group: 7, index: k, spans: n, startNode: k + 1, endNode: k + 2, lineName: 'V7' },
    };
    return beamRow(d, c as never, undefined, makeFmt('.'));
  });
  return beamLine(rows, c as never, undefined, makeFmt('.'));
}

describe('the elevation\'s annotations', () => {
  const lines = { plain: denseLine(), seismic: denseLine({ seismic: { overstrength: 1.25 } }), bent: denseLine({ bentBars: true }) };

  it('keep every text and mark of a dense line clear of every other, on screen and on paper at 1:20 and 1:50', () => {
    for (const [name, line] of Object.entries(lines)) {
      expect(line.splices.length + line.zones.length, name).toBeGreaterThan(6);
      expect(overlapping(screenLayout(line)), name).toEqual([]);
      for (const scale of [20, 50]) {
        const plan = planOverlapping(line, scale);
        expect(plan.count, `${name} 1:${scale}`).toBeGreaterThan(line.bars.length);
        expect(plan.pairs, `${name} 1:${scale}`).toEqual([]);
      }
    }
  });

  it('labels each bar once on its own track at its real extent, as count, diameter and length in centimetres', () => {
    const line = lines.plain, l = screenLayout(line);
    expect(l.tracks.map((t) => t.bar.mark).sort()).toEqual(line.bars.map((b) => b.mark).sort());
    for (const t of l.tracks) {
      expect(t.label.text).toBe(`${t.bar.bars.count} Ø${t.bar.bars.dia} (${Math.round(t.bar.length * 100)})`);
      expect(t.bubble?.mark).toBe(t.bar.mark);
      expect(t.x1 - t.x0).toBeGreaterThan(0);
      if (t.bar.face === 'top' && t.bar.kind !== 'bent') expect(t.y).toBeLessThan(0);
      else expect(t.y).toBeGreaterThan(l.hMax);
    }
    const sameTrack = new Map<number, typeof l.tracks>();
    for (const t of l.tracks) sameTrack.set(t.y, [...(sameTrack.get(t.y) ?? []), t]);
    for (const row of sameTrack.values()) for (const a of row) for (const b of row) if (a !== b) expect(a.x1 <= b.x0 || b.x1 <= a.x0).toBe(true);
  });

  it('dimensions each support and span bar from its support axis to its cut-off ends, as the cut-off logic placed them', () => {
    const line = lines.plain, l = screenLayout(line);
    const extras = l.tracks.filter((t) => t.bar.kind === 'support' || t.bar.kind === 'span');
    expect(extras.length).toBeGreaterThan(2);
    for (const t of extras) {
      const so = setOut(line, t.bar)!;
      const want = so.d.filter((d) => Math.abs(d) >= 0.005).map((d) => String(Math.round(Math.abs(d) * 100))).sort();
      expect(t.dims.map((d) => d.text.text).sort()).toEqual(want);
    }
    expect(lineSupports(line)).toHaveLength(7);
  });

  it('labels each stirrup zone with as many stirrups as the bending schedule counts', () => {
    for (const line of Object.values(lines)) {
      const { labels, schedule } = zoneCounts(line);
      expect(labels).toEqual(schedule);
    }
  });

  it('merges splices that meet into one label', () => {
    const line = lines.plain, l = screenLayout(line);
    expect(l.splices.length).toBeLessThanOrEqual(line.splices.length);
    expect(l.splices.some((s) => s.text.startsWith('rcSheets.line.splices'))).toBe(line.splices.length > l.splices.length);
  });

  it('draws each support\'s column with its name and size', () => {
    const l = screenLayout(lines.plain);
    expect(l.posts.map((p) => p.name?.text)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);
    expect(l.posts.every((p) => p.size?.text === '30×30' && p.rect)).toBe(true);
  });

  it('finds where the hogging envelope ends, measured from the nearer axis', () => {
    const line = lines.plain;
    const z = zeroMoments(line).filter((x) => x.sign === 'neg');
    expect(z.length).toBeGreaterThanOrEqual(2 * (line.spans.length - 1));
    const L = 5.5, w = 45, x0 = line.spans[1]!.x0;
    const m = (x: number) => (w * x * (L - x)) / 2 - (w * L * L) / 11;
    const root = (L - Math.sqrt(L * L - (8 * L * L) / 11)) / 2;
    expect(Math.abs(m(root))).toBeLessThan(1e-6);
    const near = z.filter((x) => Math.abs(x.axis - x0) < 1e-9 && x.x > x0).map((x) => x.x - x0);
    expect(near.some((x) => Math.abs(x - root) < 0.06)).toBe(true);
  });
});
