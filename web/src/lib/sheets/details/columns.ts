/**
 * Column details: the ties of a rectangular section with its crossties, a circular column, the
 * offset bend at a change of section, the lap above a floor, the bars at the top of the last
 * storey and the confinement of a column of a seismic frame.
 */
import { standardHook } from '../../codes/cirsoc201/bar-geometry';
import { detail, type DetailDef } from './def';
import { mm, Sketch, TIE } from './sketch';
import { barLengths, columnConfinement, mainBar, tieHook, type DetailValues } from './values';

/** Bars per face of the project's column: about one every 150–200 mm of side. */
const perFace = (side: number, c: number) => Math.max(2, Math.min(6, Math.round((side - 2 * c) / 180) + 1));

/** A column storey in elevation from y = 0 (floor) to `hc`, with the beam above from hc to hc + hb. */
function storey(sk: Sketch, v: DetailValues, hc: number) {
  const b = v.size.column.b, hb = v.size.beam.h, W = 900;
  sk.poly([{ x: 0, y: -hb - 200 }, { x: 0, y: hc + hb + 300 }]).poly([{ x: b, y: -hb - 200 }, { x: b, y: -hb }, { x: b + W, y: -hb }]).poly([{ x: b + W, y: 0 }, { x: b, y: 0 }, { x: b, y: hc }, { x: b + W, y: hc }]).poly([{ x: b + W, y: hc + hb }, { x: b, y: hc + hb }, { x: b, y: hc + hb + 300 }]);
  sk.poly([{ x: -W, y: -hb }, { x: 0, y: -hb }]).poly([{ x: -W, y: 0 }, { x: 0, y: 0 }]).poly([{ x: -W, y: hc }, { x: 0, y: hc }]).poly([{ x: -W, y: hc + hb }, { x: 0, y: hc + hb }]);
  for (const x of [-W, b + W]) { sk.breakLine({ x, y: -hb - sk.p(1.5) }, { x, y: sk.p(1.5) }); sk.breakLine({ x, y: hc - sk.p(1.5) }, { x, y: hc + hb + sk.p(1.5) }); }
  return { b, hb };
}

export const COLUMNS: DetailDef[] = [
  detail('column-ties', 'C-01', 'columns', 'columns', (v, tr) => {
    const { b, h } = v.size.column, c = v.cover.column, t = v.ties.column, d = mainBar(v, 'column'), sk = new Sketch(5), th = tieHook(t);
    const nx = perFace(b, c), ny = perFace(h, c), o = c + t / 2;
    sk.rect(0, 0, b, h).hoop(o, o, b - o, h - o, t, th.ext).hoopBars(o, o, b - o, h - o, t, d, nx, ny);
    // A crosstie on every other intermediate bar: 135° at one end, 90° at the other, alternated.
    const X0 = o + t / 2 + d / 2, X1 = b - o - t / 2 - d / 2, Y0 = o + t / 2 + d / 2, Y1 = h - o - t / 2 - d / 2;
    for (let i = 1; i < nx - 1; i += 2 - (nx > 4 ? 0 : 1)) { const x = X0 + ((X1 - X0) * i) / (nx - 1); sk.tie([{ x: x + d / 2 + t / 2, y: Y0 - d / 2 - t / 2 + 40 }, { x: x + d / 2 + t / 2, y: Y1 + d / 2 + t / 2 - 40 }], t); }
    for (let j = 1; j < ny - 1; j += 2 - (ny > 4 ? 0 : 1)) { const y = Y0 + ((Y1 - Y0) * j) / (ny - 1); sk.tie([{ x: X0 - d / 2 - t / 2 + 40, y: y + d / 2 + t / 2 }, { x: X1 + d / 2 + t / 2 - 40, y: y + d / 2 + t / 2 }], t); }
    sk.dim({ x: 0, y: 0 }, { x: b, y: 0 }, -8, mm(b)).dim({ x: b, y: 0 }, { x: b, y: h }, -8, mm(h)).dim({ x: 0, y: h }, { x: c, y: h }, 6, mm(c));
    if (nx > 2 || ny > 2) sk.label({ x: b / 2, y: o }, { x: b + sk.p(14), y: sk.p(4) }, tr('plan.det.w.crosstie', { d: t }));
    sk.label({ x: X1, y: Y1 }, { x: b + sk.p(14), y: h - sk.p(2) }, tr('plan.det.w.bars', { n: 2 * nx + 2 * (ny - 2), d }));
    return { sk, params: { t, ext: th.ext, n: 2 * nx + 2 * (ny - 2), d } };
  }),

  detail('column-circular', 'C-02', 'columns', 'columns', (v, tr) => {
    const D = Math.max(v.size.column.b, 300), c = v.cover.column, t = v.ties.column, d = mainBar(v, 'column'), sk = new Sketch(5), n = Math.max(6, Math.round((Math.PI * (D - 2 * c)) / 150));
    const R = D / 2, rt = R - c - t / 2, rb = rt - t / 2 - d / 2;
    sk.ps.push({ kind: 'circle', layer: 'RC-OUTLINE', c: { x: R, y: R }, r: R }, { kind: 'circle', layer: TIE, c: { x: R, y: R }, r: rt, dia: t });
    for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n; sk.dot(R + rb * Math.cos(a), R + rb * Math.sin(a), d); }
    const lapT = Math.max(48 * t, 300);
    sk.label({ x: R + rt, y: R }, { x: D + sk.p(10), y: R + sk.p(6) }, tr('plan.det.w.spiral', { d: t, lap: lapT }));
    sk.dim({ x: 0, y: 0 }, { x: D, y: 0 }, -8, `Ø ${mm(D)}`);
    return { sk, params: { n, d, t, lap: lapT } };
  }),

  detail('column-offset', 'C-03', 'columns', 'columns', (v, tr) => {
    const b = v.size.column.b, hb = v.size.beam.h, c = v.cover.column, t = v.ties.column, d = mainBar(v, 'column'), L = barLengths(v, d), sk = new Sketch(20);
    const e = 50, W = 700;
    // The lower column, the floor, and the smaller column above it.
    sk.poly([{ x: 0, y: -1400 }, { x: 0, y: 0 }]).poly([{ x: b, y: -1400 }, { x: b, y: 0 }]).poly([{ x: -W, y: 0 }, { x: 0, y: 0 }]).poly([{ x: b, y: 0 }, { x: b + W, y: 0 }]);
    sk.poly([{ x: -W, y: hb }, { x: e, y: hb }, { x: e, y: hb + 1400 }]).poly([{ x: b + W, y: hb }, { x: b - e, y: hb }, { x: b - e, y: hb + 1400 }]);
    const xo = c + t + d / 2, xi = e + c + t + d / 2, run = 6 * (xi - xo);
    for (const side of [1, -1] as const) {
      const X = (x: number) => (side === 1 ? x : b - x);
      sk.bar([{ x: X(xo), y: -1400 }, { x: X(xo), y: hb - run - 80 }, { x: X(xi), y: hb - 80 }, { x: X(xi), y: hb + L.lapC + 200 }], d);
    }
    for (const y of [-1300, -1100, -900, hb - run - 80 - 40, hb - run - 80 - 140]) sk.tie([{ x: c, y }, { x: b - c, y }], t);
    sk.dim({ x: b + 80, y: hb - run - 80 }, { x: b + 80, y: hb - 80 }, -8, '6 e').dim({ x: b - e, y: hb + 1400 }, { x: b, y: hb + 1400 }, 6, `e = ${e}`);
    sk.label({ x: b - c, y: hb - run - 120 }, { x: b + W * 0.6, y: -sk.p(10) }, tr('plan.det.w.offsetTies'));
    return { sk, params: { e, lap: L.lapC } };
  }),

  detail('column-lap', 'C-04', 'columns', 'columns', (v, tr) => {
    const hc = 2800, c = v.cover.column, t = v.ties.column, d = mainBar(v, 'column'), L = barLengths(v, d), sk = new Sketch(25);
    const { b } = storey(sk, v, hc), xo = c + t + d / 2, lap = Math.max(L.lapC, L.lap);
    for (const x of [xo, b - xo]) { sk.bar([{ x, y: -v.size.beam.h - 200 }, { x, y: lap }], d); sk.bar([{ x: x + (x < b / 2 ? 1.2 : -1.2) * d, y: 0 }, { x: x + (x < b / 2 ? 1.2 : -1.2) * d, y: hc + v.size.beam.h + 300 }], d); }
    for (let y = 75; y < hc; y += y < lap ? 100 : 150) sk.tie([{ x: c, y }, { x: b - c, y }], t);
    sk.dim({ x: 0, y: 0 }, { x: 0, y: lap }, 8, `lst = ${mm(lap)}`);
    sk.label({ x: b / 2, y: lap / 2 }, { x: b + 1000, y: lap / 2 }, tr('plan.det.w.lapTies'));
    return { sk, params: { lap: mm(lap), lapC: L.lapC, lapT: L.lap } };
  }),

  detail('column-top', 'C-05', 'columns', 'columns', (v, tr) => {
    const b = v.size.column.b, hb = v.size.beam.h, c = v.cover.column, t = v.ties.column, d = mainBar(v, 'column'), L = barLengths(v, d), sk = new Sketch(20), W = 1000;
    sk.poly([{ x: 0, y: -1200 }, { x: 0, y: hb }, { x: b + W, y: hb }]).poly([{ x: b, y: -1200 }, { x: b, y: 0 }, { x: b + W, y: 0 }]).poly([{ x: -W, y: hb }, { x: 0, y: hb }]).poly([{ x: -W, y: 0 }, { x: 0, y: 0 }]);
    sk.breakLine({ x: b + W, y: -sk.p(2) }, { x: b + W, y: hb + sk.p(2) }).breakLine({ x: -W, y: -sk.p(2) }, { x: -W, y: hb + sk.p(2) });
    const hk = standardHook(d, 90, 'longitudinal'), r = hk.centrelineRadius * 1000, ext = hk.extension * 1000, yTop = hb - v.cover.beam - v.ties.beam - mainBar(v, 'beam') - d / 2;
    const xo = c + t + d / 2;
    sk.hooked({ x: xo, y: -1200 }, Math.PI / 2, 1200 + yTop - r, r, 90, ext, -1, d);
    sk.hooked({ x: b - xo, y: -1200 }, Math.PI / 2, 1200 + yTop - r, r, 90, ext, 1, d);
    for (const y of [-1100, -950, -800, 100, 250, 400]) if (y < hb - 100) sk.tie([{ x: c, y }, { x: b - c, y }], t);
    sk.dim({ x: b + 60, y: 0 }, { x: b + 60, y: yTop }, -8, `≥ ldh = ${mm(L.ldh)}`);
    sk.label({ x: b - xo - ext / 2, y: yTop + r }, { x: b + W * 0.5, y: hb + sk.p(10) }, tr('plan.det.w.hookInward', { ext: mm(ext) }));
    return { sk, params: { ldh: L.ldh, ext: mm(ext), d } };
  }),

  detail('column-seismic', 'C-06', 'columns', 'columns', (v, tr) => {
    const hc = 2800, c = v.cover.column, t = v.ties.column, d = mainBar(v, 'column'), L = barLengths(v, d), sk = new Sketch(25), cf = columnConfinement(v, hc);
    const { b, hb } = storey(sk, v, hc), xo = c + t + d / 2, sm = Math.floor(Math.min(6 * d, 150) / 5) * 5;
    for (const x of [xo, b - xo]) sk.bar([{ x, y: -hb - 200 }, { x, y: hc + hb + 300 }], d);
    const at = (from: number, to: number, s: number) => { for (let y = from; y <= to + 1e-6; y += s) sk.tie([{ x: c, y }, { x: b - c, y }], t); };
    at(50, cf.lo, cf.so); at(cf.lo + sm, hc - cf.lo - sm, sm); at(hc - cf.lo, hc - 50, cf.so); at(hc + cf.so / 2, hc + hb - 20, cf.so); at(-hb + cf.so / 2, -20, cf.so);
    sk.dim({ x: 0, y: 0 }, { x: 0, y: cf.lo }, 8, `lo = ${mm(cf.lo)}`).dim({ x: 0, y: hc - cf.lo }, { x: 0, y: hc }, 8, `lo`).dim({ x: 0, y: cf.lo }, { x: 0, y: hc - cf.lo }, 8, `s ≤ ${mm(sm)}`);
    sk.label({ x: b / 2, y: cf.lo / 2 }, { x: b + 1100, y: cf.lo / 2 }, tr('plan.det.w.confined', { s: mm(cf.so) }));
    sk.label({ x: b / 2, y: hc + hb / 2 }, { x: b + 1100, y: hc + hb / 2 + 200 }, tr('plan.det.w.hoopsJoint'));
    sk.text(b + 1100, hc / 2, tr('plan.det.w.lapMiddle', { lap: L.lap }), 2.2);
    return { sk, params: { lo: mm(cf.lo), so: mm(cf.so), s: mm(sm), lap: L.lap, ext: tieHook(t).ext } };
  }, true),
];
