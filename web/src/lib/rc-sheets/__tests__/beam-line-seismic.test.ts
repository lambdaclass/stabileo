/**
 * A continuous beam under the seismic provisions carries, top and bottom, a run of at least two
 * bars that holds at every section a quarter of the strongest face at either end (§18.6.3.1,
 * §18.6.3.2), and at each face the bottom half the top: by design, so its spans verify. And a span
 * read inside its line compares its steel with the bars the line places at each section.
 */
import { describe, it, expect } from 'vitest';
import { beamRow, type BeamDemand, type BeamEnd, type SectionEnv } from '../beam-row';
import { beamLine } from '../beam-line';
import { groupsArea } from '../bars';
import { makeFmt } from '../format';

const fmt = makeFmt('.');
const column: BeamEnd = { kind: 'column', half: 0.2 };
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.03, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const, coverTable: { control: true } };
const seismic = { overstrength: 1.25 };

/** A span of L m whose ends hog `neg` kN·m, sagging `pos` in its middle, as a parabola between. */
function span(k: number, spans: number, L: number, neg: number, pos: number): BeamDemand {
  const n = 24;
  const env = Array.from({ length: n + 1 }, (_, i) => {
    const x = (L * i) / n, m = -neg + (pos + neg) * 4 * (x / L) * (1 - x / L);
    return { x, pos: Math.max(0, m), neg: Math.max(0, -m), v: 4 * (pos + neg) / L * Math.abs(1 - 2 * x / L) };
  });
  const at = (i: number): SectionEnv => ({ x: env[i]!.x, pos: { value: env[i]!.pos }, neg: { value: env[i]!.neg }, nPos: 0, nNeg: 0 });
  return {
    key: `beam:7:${k}`, name: `V7-${k + 1}`, level: 'N1', length: L, b: 0.25, h: 0.5,
    start: at(0), span: at(n / 2), end: at(n), negAny: { value: neg }, nNegAny: 0,
    vu: { value: 4 * (pos + neg) / L }, nAtV: 0, tu: { value: 0 }, combos: [], env,
    supportHalf: { start: 0.2, end: 0.2 }, ends: { start: column, end: column },
    line: { group: 7, index: k, spans, startNode: k + 1, endNode: k + 2, lineName: 'V7' },
  };
}

const c = { ...ctx, seismic };
const demands = [span(0, 3, 5, 180, 90), span(1, 3, 5, 180, 90), span(2, 3, 5, 180, 90)];
const rows = demands.map((d) => beamRow(d, c as never, undefined, fmt));
const line = beamLine(rows, c as never, undefined, fmt);
const inLine = rows.map((r, k) => beamRow(r.demand, c as never, line.spanAdopted[k]!, fmt));
const okOf = (r: (typeof inLine)[number], label: string) => r.verifications.find((v) => v.label === label)?.ok;

describe('a seismic line with heavy steel at its faces', () => {
  it('runs at least two bars top and bottom, each a quarter of the strongest face', () => {
    expect(line.adopted.top.count).toBeGreaterThanOrEqual(2);
    expect(line.adopted.bottom.count).toBeGreaterThanOrEqual(2);
    const face = Math.max(...line.spanAdopted.flatMap((sa) => [sa.at!.start!, sa.at!.end!].flatMap((x) => [groupsArea(x.top), groupsArea(x.bottom)])));
    expect(face).toBeGreaterThan(8);
    expect(groupsArea([line.adopted.top])).toBeGreaterThanOrEqual(0.25 * face - 1e-6);
    expect(groupsArea([line.adopted.bottom])).toBeGreaterThanOrEqual(0.25 * face - 1e-6);
  });

  it('so every span verifies §18.6.3.2 with the bars the line places', () => {
    for (const r of inLine) {
      expect(okOf(r, 'rcSheets.v.seisBeamQuarter')).toBe(true);
      expect(okOf(r, 'rcSheets.v.seisBeamHalf')).toBe(true);
    }
    expect(line.status).not.toBe('fail');
  });
});

describe('a span read inside its line', () => {
  it('compares the top steel a section asks with the bars there, support bars and all, never a ratio over one with a tick', () => {
    for (const r of inLine) {
      const top = r.verifications.find((v) => v.label === 'rcSheets.v.minTop')!;
      expect(top.ok).toBe(true);
      expect(top.ratio!).toBeLessThanOrEqual(1 + 1e-6);
      expect(Number(top.capacity!.replace(/[^\d.]/g, ''))).toBeGreaterThan(groupsArea([line.adopted.top]));
      for (const v of r.verifications) if (v.ok && v.ratio !== undefined) expect(v.ratio, v.label).toBeLessThanOrEqual(1 + 1e-6);
    }
  });
});
