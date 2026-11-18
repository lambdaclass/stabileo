import { confinedTies, type ColumnRow } from './column-row';
import { columnLayout } from './column-layout';
import { columnTieLayout, type ColumnTieLayout } from './column-ties';
import { tiePaths, type TiePath } from './column-tie-path';
import { hoop, tieAcross, type PieceOptions } from './schedule/pieces';
import { columnBarPieces, columnDowel, columnStorey, storeyBars, storeyRun } from './column-run';
import { inwardOf, lapOffset } from './column-stack';
import { barOf, laid, type Frame, type Rebar3d } from './rebar-3d-geometry';
import type { BendRules } from './shape';

const inward = (x: number, y: number): [number, number] => {
  const l = Math.hypot(x, y);
  return l > 1e-9 ? [-x / l, -y / l] : [1, 0];
};

const lapFrom = (l: ColumnTieLayout) => l.lap?.from ?? 0;

export function columnBars3d(rows: readonly ColumnRow[], r: ColumnRow, f: Frame, o: PieceOptions, R: BendRules): Rebar3d[] {
  const out: Rebar3d[] = [];
  const base = { element: r.key, rows: [r.key], family: 'column' as const, ...(r.level !== undefined ? { level: r.level } : {}) };
  const a = r.adopted, s = columnStorey(rows, r), run = storeyRun(r, s, o.code);
  const layout = columnTieLayout(r, o.code, { endZones: o.endZones });
  const floor = (r.demand.joints?.bottom ?? 0) / 2;
  for (const { bar, e, toward } of storeyBars(r, s)) {
    const pieces = columnBarPieces(run, bar.dia, e, R).flatMap((pc) => Array.from({ length: pc.count }, () => pc));
    let z = run.from;
    for (const pc of pieces) {
      const [dx, dy] = pc.kind === 'cranked' ? toward : inward(bar.x, bar.y);
      const z0 = z;
      out.push(barOf(pc.shape, laid(pc.shape, f, (u, v) => [bar.x + v * dx, bar.y + v * dy, z0 + u]), { ...base, kind: pc.kind, tone: 'column' }));
      z += pc.shape.pts.reduce((m, p) => Math.max(m, p[0]), 0) - run.own;
    }
  }
  if (s.dowels) {
    const lap = r.lap?.length ?? 0, mid = floor + lapFrom(layout);
    for (const bar of columnLayout(r, a, r.cover, r.aggregate).bars) {
      const shape = columnDowel(r, bar.dia, R), n = inwardOf(bar, r), c = lapOffset(bar.dia, bar.dia);
      out.push(barOf(shape, laid(shape, f, (u) => [bar.x + c * n[0], bar.y + c * n[1], mid - lap + u]), { ...base, kind: 'dowel', tone: 'dowel' }));
    }
  }
  const t = a.tieDia, d = t / 1000;
  const w = r.b - 2 * r.cover - d, h = r.h - 2 * r.cover - d;
  const rules = (held: { b: number[]; h: number[] }) => ({ held, extension: (angle: 90 | 135) => R.extension(t, angle, 'transverse'), hooks: R.crossTieHooks });
  const plainA = { ...a, confined: undefined };
  const plain = tiePaths(r, a, r.cover, rules(confinedTies(r, plainA, { cover: r.cover }).along), r.aggregate);
  const confined = tiePaths(r, a, r.cover, rules(confinedTies(r, a, { cover: r.cover }).along), r.aggregate);
  const hoopShape = hoop(w, h, t, R);
  const c = plain.hoop.pts.slice(0, 3).reduce((p, q) => [p[0] + q[0], p[1] + q[1]], [0, 0]);
  const sx = c[0] > 0 ? -1 : 1, sy = c[1] < 0 ? -1 : 1;
  const crosstie = (tp: TiePath, z: number) => {
    const shape = tieAcross(tp.length, t, R);
    const [p, q] = tp.leg, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const place = tp.across === 'h'
      ? (u: number, v: number): [number, number, number] => [mx + v, my - tp.length / 2 + u, z]
      : (u: number, v: number): [number, number, number] => [mx - tp.length / 2 + u, my + v, z];
    out.push(barOf(shape, laid(shape, f, place), { ...base, kind: 'crossTie', tone: 'tie' }));
  };
  for (const y of layout.ties) {
    const z = floor + y;
    out.push(barOf(hoopShape, laid(hoopShape, f, (u, v) => [sx * (u - w / 2), sy * (v - h / 2), z]), { ...base, kind: 'hoop', tone: 'tie' }));
    const inConfined = layout.zones.some((zn) => zn.confined && y >= zn.from - 1e-6 && y <= zn.to + 1e-6);
    for (const tp of (inConfined ? confined : plain).crossties) crosstie(tp, z);
  }
  return out;
}
