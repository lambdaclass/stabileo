/**
 * A line shaped like the seven-storey example's V4 on N1: two 5 m spans, a beam framing into the
 * first span's middle, the end column of that span with no hogging at all. Its bent bars, and its
 * stirrups under the seismic provisions.
 */
import { describe, it, expect } from 'vitest';
import { beamRow, type BeamDemand, type BeamEnd, type SectionEnv } from '../beam-row';
import { beamLine } from '../beam-line';
import { stirrupPositions } from '../line-geometry';
import { scheduleElements } from '../schedule/pieces';
import { beamSeismic } from '../seismic';
import { makeFmt } from '../format';

const fmt = makeFmt('.');
const column: BeamEnd = { kind: 'column', half: 0.2 };
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };

type Station = [number, number, number, number];
const V4: Station[][] = [
  [[0,0,0,0.7],[0.16,0,0,0.4],[0.31,0,10.6,7.1],[0.47,0,11.8,8.1],[0.63,0,9.9,14.9],[0.78,0,7.6,13.9],[0.94,0,5.6,12.8],[1.09,0,4.3,6],[1.25,0,3.5,4.9],[1.41,0,2.9,3.9],[1.56,3.3,0,85],[1.72,16.5,0,83.9],[1.88,29.5,0,82.8],[2.03,48.1,0,245],[2.19,85.5,0,244.1],[2.34,123.5,0,243.2],[2.5,161.5,0,242.2],[2.66,155,0,106.9],[2.81,138.3,0,107.8],[2.97,121.3,0,108.7],[3.13,102.5,0,122],[3.28,83.4,0,122.9],[3.44,64.1,0,123.8],[3.59,44.4,0,127.9],[3.75,24.6,0,128.8],[3.91,5,0,129.7],[4.06,0,17.1,136.3],[4.22,0,38.5,137.2],[4.38,0,60,138.1],[4.53,0,82.8,119.2],[4.69,0,101.5,120.1],[4.84,0,120.4,121],[5,0,139.3,122]],
  [[0,0,33.1,27.8],[0.16,0,28.8,26.9],[0.31,0,24.7,26],[0.47,0,20.7,25.1],[0.63,0,14.5,34],[0.78,0,9.6,33.1],[0.94,0,4.8,32.2],[1.09,1.7,0.6,26.2],[1.25,5.6,0,25.2],[1.41,9.4,0,24.3],[1.56,13.4,0,15.6],[1.72,15.8,0,14.7],[1.88,18,0,13.8],[2.03,20.1,0,3.6],[2.19,20.6,0,2.7],[2.34,20.9,0,1.8],[2.5,21.1,0,0.9],[2.66,19.5,0,10.2],[2.81,17.8,0,11.2],[2.97,16,0,12.1],[3.13,12.3,0,22.9],[3.28,8.7,0,23.8],[3.44,4.9,0,24.7],[3.59,0,3.5,34.1],[3.75,0,8.4,35],[3.91,0,13.5,35.9],[4.06,0,20.1,43.8],[4.22,0,26.4,44.7],[4.38,0,33,45.6],[4.53,0,41.6,31.1],[4.69,0,46.5,32.1],[4.84,0,51.6,33],[5,0,56.8,33.9]],
];

const sec = (s: Station): SectionEnv => ({ x: s[0], pos: { value: s[1], source: { combo: 'U', x: s[0] } }, neg: { value: s[2], source: { combo: 'U', x: s[0] } }, nPos: 0, nNeg: 0 });

function rowsOf(stations: Station[][], c: object) {
  return stations.map((st, k) => {
    const L = st[st.length - 1]![0];
    const peak = st.reduce((a, b) => (b[1] > a[1] ? b : a));
    const d: BeamDemand = {
      key: `beam:4:${k}`, name: `V4-${k + 1}`, level: 'N1', length: L, b: 0.3, h: 0.65,
      start: sec(st[0]!), span: sec(peak), end: sec(st[st.length - 1]!),
      negAny: { value: Math.max(...st.map((s) => s[2])) }, nNegAny: 0, vu: { value: Math.max(...st.map((s) => s[3])) }, nAtV: 0, tu: { value: 0 }, combos: [],
      env: st.map(([x, pos, neg, v]) => ({ x, pos, neg, v })),
      supportHalf: { start: 0.2, end: 0.2 }, ends: { start: column, end: column },
      line: { group: 4, index: k, spans: stations.length, startNode: k + 1, endNode: k + 2, lineName: 'V4' },
    };
    return beamRow(d, c as never, undefined, fmt);
  });
}

const lineOf = (stations: Station[][], extra: object = {}) => {
  const c = { ...ctx, ...extra };
  return beamLine(rowsOf(stations, c), c, undefined, fmt);
};

describe('bent bars on the seven-storey V4', () => {
  it('are proposed in both spans, the end span bending up over its end column though that column asks no hogging', () => {
    const line = lineOf(V4, { bentBars: true });
    expect(line.adopted.bent?.map((g) => g.count > 0)).toEqual([true, true]);
    const bent = line.bars.filter((b) => b.kind === 'bent');
    expect(bent).toHaveLength(2);
    const [first, second] = bent.sort((p, q) => p.from - q.from);
    expect(first!.runs[0]!.face).toBe('top');
    expect(first!.runs[1]!.face).toBe('bottom');
    expect(first!.runs[1]!.from).toBeGreaterThan(0);
    expect(first!.runs[1]!.to).toBeLessThan(5);
    expect(first!.to).toBeGreaterThan(5);
    expect(second!.from).toBeLessThan(5);
    expect(second!.runs[1]!.from).toBeGreaterThan(5);
    expect(line.bentNotes).toEqual([]);
    expect(line.status).toBe('ok');
  });

  it('carries the hogging over the middle support with the bent bars before any straight support bar', () => {
    const plain = lineOf(V4);
    const bent = lineOf(V4, { bentBars: true });
    expect(bent.adopted.supportTop[1]!.count).toBeLessThan(plain.adopted.supportTop[1]!.count);
    expect(bent.utilization).toBeLessThanOrEqual(1 + 1e-6);
  });

  it('says why a span is left without them: no sagging, nothing to carry over its supports, or the seismic provisions', () => {
    const hogOnly: Station[] = V4[0]!.map(([x, , neg, v]) => [x, 0, Math.max(neg, 20), v]);
    const noSag = lineOf([V4[0]!, hogOnly, V4[0]!.map(([x, p, n, v]) => [5 - x, p, n, v] as Station).reverse()], { bentBars: true });
    expect(noSag.bentNotes).toContainEqual({ span: 1, reason: 'noSagging' });
    const sagOnly: Station[] = V4[1]!.map(([x, pos, , v]) => [x, pos, 0, v]);
    const free = lineOf([sagOnly], { bentBars: true });
    expect(free.bentNotes).toEqual([{ span: 0, reason: 'noHogging' }]);
    expect(free.bars.some((b) => b.kind === 'bent')).toBe(false);
    const seismic = lineOf(V4, { bentBars: true, seismic: { overstrength: 1.25 } });
    expect(seismic.bentNotes).toEqual([{ reason: 'seismic', clause: '§18.6.3' }]);
    expect(lineOf(V4).bentNotes).toEqual([]);
  });

  it('an adopted line without them says so rather than show none', () => {
    const plain = lineOf(V4);
    const c = { ...ctx, bentBars: true };
    const adopted = beamLine(rowsOf(V4, c), c, plain.adopted, fmt);
    expect(adopted.bentNotes).toEqual([{ reason: 'adopted' }]);
  });
});

describe('seismic end zones on the seven-storey V4', () => {
  const seismic = { overstrength: 1.25 };
  const c = { ...ctx, seismic };
  const rows = rowsOf(V4, c);
  const line = beamLine(rows, c, undefined, fmt);

  it('run 2h from each face at the spacing the rows ask, the first hoop 50 mm from the face, the middle wider', () => {
    line.spans.forEach((s, k) => {
      const zs = line.zones.filter((z) => z.span === k);
      expect(zs).toHaveLength(3);
      const [left, mid, right] = zs as [typeof zs[0], typeof zs[0], typeof zs[0]];
      expect(left.to - left.from).toBeCloseTo(2 * s.h, 9);
      expect(right.to - right.from).toBeCloseTo(2 * s.h, 9);
      expect(left.from).toBeCloseTo(s.x0 + 0.2, 9);
      expect(right.to).toBeCloseTo(s.x1 - 0.2, 9);
      expect(mid.stirrups.spacing).toBeGreaterThan(left.stirrups.spacing);
      expect(mid.stirrups.spacing).toBeLessThanOrEqual((0.65 - 0.025 - 0.008 - 0.01) / 2);
      const xs = stirrupPositions(line).filter((p) => p.span === k).map((p) => p.x).sort((p, q) => p - q);
      expect(xs[0]! - left.from).toBeCloseTo(0.05, 9);
      expect(right.to - xs[xs.length - 1]!).toBeCloseTo(0.05, 9);
      const sa = line.spanAdopted[k]!;
      expect(sa.stirrups).toEqual(left.stirrups);
      expect(line.adopted.stirrups?.[k]).toEqual(left.stirrups);
      const seis = beamSeismic(rows[k]!.demand, { ...c, overstrength: 1.25 }, sa, (sec) => sa.at![sec]!, fmt);
      expect(seis.checks.find((v) => v.label === 'rcSheets.v.seisBeamHoops')!.ok).toBe(true);
      expect(left.stirrups.spacing).toBeLessThanOrEqual(seis.sZone + 1e-9);
    });
  });

  it('are what the span rows check and what the schedule counts', () => {
    rows.forEach((r, k) => {
      const checked = beamRow(r.demand, c as never, line.spanAdopted[k]!, fmt);
      expect(checked.adopted.stirrups).toEqual(line.zones.find((z) => z.span === k)!.stirrups);
      expect(checked.verifications.find((v) => v.label === 'rcSheets.v.seisBeamHoops')!.ok).toBe(true);
    });
    const el = scheduleElements({ line: [line], column: [], slab: [], wall: [] }, { code: 'cirsoc201-2025', slabCover: 0.02 }).find((e) => e.key === line.key)!;
    const hoops = el.pieces.filter((p) => p.kind === 'stirrup').reduce((n, p) => n + p.count, 0);
    expect(hoops).toBe(stirrupPositions(line).length);
  });
});
