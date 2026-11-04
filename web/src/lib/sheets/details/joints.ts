/**
 * Beam-column joints, without and with earthquake: interior, exterior and corner joints in
 * elevation, and the crossing of the beam bars inside the column bars in plan. The seismic
 * variants carry the column's hoops through the joint at the confinement spacing, keep the laps
 * out of it, and hook the beam bars in an exterior joint with the length of §18.8.5.1.
 */
import { standardHook } from '../../codes/cirsoc201/bar-geometry';
import { detail, type DetailDef } from './def';
import { mm, Sketch } from './sketch';
import { barLengths, columnConfinement, mainBar, tieHook, type DetailValues } from './values';

interface Frame { bc: number; hb: number; c: number; t: number; d: number; dc: number; yT: number; yB: number }

/** A column through a floor with beams on the sides asked for, the joint from y = 0 to hb. */
function frame(sk: Sketch, v: DetailValues, sides: { left: boolean; right: boolean; above: boolean }): Frame {
  const bc = v.size.column.b, hb = v.size.beam.h, W = 1300, Hc = 1100;
  const top = sides.above ? hb + Hc : hb;
  sk.poly([{ x: 0, y: -Hc }, { x: 0, y: sides.left ? 0 : top }]).poly([{ x: bc, y: -Hc }, { x: bc, y: sides.right ? 0 : top }]);
  if (sides.left) { sk.poly([{ x: -W, y: 0 }, { x: 0, y: 0 }]).poly([{ x: -W, y: hb }, { x: 0, y: hb }, ...(sides.above ? [{ x: 0, y: top }] : [])]); sk.breakLine({ x: -W, y: -sk.p(2) }, { x: -W, y: hb + sk.p(2) }); }
  if (sides.right) { sk.poly([{ x: bc, y: 0 }, { x: bc + W, y: 0 }]).poly([{ x: bc + W, y: hb }, { x: bc, y: hb }, ...(sides.above ? [{ x: bc, y: top }] : [])]); sk.breakLine({ x: bc + W, y: -sk.p(2) }, { x: bc + W, y: hb + sk.p(2) }); }
  if (!sides.above) sk.line({ x: 0, y: hb }, { x: bc, y: hb });
  sk.breakLine({ x: 0, y: -Hc }, { x: bc, y: -Hc });
  if (sides.above) sk.breakLine({ x: 0, y: top }, { x: bc, y: top });
  const c = v.cover.beam, t = v.ties.beam, d = mainBar(v, 'beam'), dc = mainBar(v, 'column');
  return { bc, hb, c, t, d, dc, yT: hb - c - t - d / 2, yB: c + t + d / 2 };
}

/** The column's bars and its ties: below, through the joint at `sJoint` and above. */
function columnBars(sk: Sketch, v: DetailValues, f: Frame, above: boolean, sJoint: number, sOut: number) {
  const cc = v.cover.column, tc = v.ties.column, xo = cc + tc + f.dc / 2;
  for (const x of [xo, f.bc - xo]) sk.bar([{ x, y: -1100 }, { x, y: above ? f.hb + 1100 : f.hb - cc - tc - f.dc / 2 }], f.dc);
  const tie = (y: number) => sk.tie([{ x: cc, y }, { x: f.bc - cc, y }], tc);
  for (let y = -60; y > -1100; y -= sOut) tie(y);
  for (let y = sJoint / 2 + 20; y < f.hb - 20; y += sJoint) tie(y);
  if (above) for (let y = f.hb + 60; y < f.hb + 1100; y += sOut) tie(y);
}

export const JOINTS: DetailDef[] = [
  detail('joint', 'N-01', 'joints', 'details', (v, tr) => {
    const sk = new Sketch(20), f = frame(sk, v, { left: true, right: true, above: true });
    sk.bar([{ x: -1300, y: f.yT }, { x: f.bc + 1300, y: f.yT }], f.d).bar([{ x: -1300, y: f.yB }, { x: f.bc + 1300, y: f.yB }], f.d);
    columnBars(sk, v, f, true, 150, 150);
    sk.label({ x: f.bc / 2, y: f.hb / 2 }, { x: f.bc + 1500, y: f.hb + sk.p(10) }, tr('plan.det.w.tiesThrough'));
    return { sk, params: {} };
  }),

  detail('joint-exterior', 'N-02', 'joints', 'details', (v, tr) => {
    const sk = new Sketch(20), f = frame(sk, v, { left: false, right: true, above: true }), L = barLengths(v, f.d), hk = standardHook(f.d, 90, 'longitudinal'), r = hk.centrelineRadius * 1000, ext = hk.extension * 1000;
    const xh = v.cover.column + v.ties.column + f.dc + f.d / 2 + 10;
    // Top bars hooked down, bottom bars hooked up: both tails toward the joint's middle.
    sk.hooked({ x: f.bc + 1300, y: f.yT }, Math.PI, f.bc + 1300 - xh - r, r, 90, ext, 1, f.d);
    sk.hooked({ x: f.bc + 1300, y: f.yB }, Math.PI, f.bc + 1300 - xh - r, r, 90, ext, -1, f.d);
    columnBars(sk, v, f, true, 150, 150);
    sk.dim({ x: xh - f.d / 2, y: f.hb + 80 }, { x: f.bc, y: f.hb + 80 }, 8, `≥ ldh = ${mm(L.ldh)}`);
    sk.label({ x: xh, y: f.yT - r - ext / 2 }, { x: -sk.p(16), y: f.hb / 2 }, tr('plan.det.w.hookToJoint'));
    return { sk, params: { ldh: L.ldh, ext: mm(ext), d: f.d } };
  }),

  detail('joint-corner', 'N-03', 'joints', 'details', (v, tr) => {
    const sk = new Sketch(20), f = frame(sk, v, { left: false, right: true, above: false }), L = barLengths(v, f.d), xo = v.cover.column + v.ties.column + f.dc / 2, R = 4 * f.d;
    // The beam's top bars and the column's outer bars lapped around the corner.
    const yt = f.yT;
    sk.bar([{ x: f.bc + 1300, y: yt }, { x: xo + R, y: yt }, { x: xo, y: yt - R }, { x: xo, y: yt - Math.max(L.lapTop, 600) }], f.d);
    sk.bar([{ x: xo + 1.2 * f.d, y: -1100 }, { x: xo + 1.2 * f.d, y: yt - 1.2 * f.d - R }, { x: xo + 1.2 * f.d + R, y: yt - 1.2 * f.d }, { x: xo + Math.max(L.lapTop, 600), y: yt - 1.2 * f.d }], f.dc);
    const hk = standardHook(f.d, 90, 'longitudinal'), r = hk.centrelineRadius * 1000;
    sk.hooked({ x: f.bc + 1300, y: f.yB }, Math.PI, f.bc + 1300 - (f.bc - xo) - r, r, 90, hk.extension * 1000, -1, f.d);
    sk.bar([{ x: f.bc - xo, y: -1100 }, { x: f.bc - xo, y: f.yT - 1.2 * f.d - 40 }], f.dc);
    for (let y = -60; y > -1100; y -= 150) sk.tie([{ x: v.cover.column, y }, { x: f.bc - v.cover.column, y }], v.ties.column);
    for (let y = 80; y < f.hb - 60; y += 100) sk.tie([{ x: v.cover.column, y }, { x: f.bc - v.cover.column, y }], v.ties.column);
    sk.dim({ x: xo, y: yt }, { x: xo, y: yt - Math.max(L.lapTop, 600) }, 10, `lst = ${mm(Math.max(L.lapTop, 600))}`);
    sk.label({ x: xo + R / 2, y: yt - R / 2 }, { x: f.bc + 1500, y: f.hb + sk.p(10) }, tr('plan.det.w.cornerLap'));
    return { sk, params: { lap: mm(Math.max(L.lapTop, 600)) } };
  }),

  detail('joint-interior-seismic', 'N-04', 'joints', 'details', (v, tr) => {
    const sk = new Sketch(20), f = frame(sk, v, { left: true, right: true, above: true }), cf = columnConfinement(v);
    sk.bar([{ x: -1300, y: f.yT }, { x: f.bc + 1300, y: f.yT }], f.d).bar([{ x: -1300, y: f.yB }, { x: f.bc + 1300, y: f.yB }], f.d);
    columnBars(sk, v, f, true, cf.so, cf.so);
    const need = 20 * Math.max(...v.bars.beam);
    sk.dim({ x: 0, y: -1100 }, { x: f.bc, y: -1100 }, -8, `${mm(f.bc)} ≥ 20 db = ${mm(need)}`);
    sk.dim({ x: f.bc, y: f.hb }, { x: f.bc + 2 * f.hb, y: f.hb }, 8, `2h: ${tr('plan.det.w.noLap')}`).dim({ x: -2 * f.hb, y: f.hb }, { x: 0, y: f.hb }, 8, '2h');
    sk.label({ x: f.bc / 2, y: f.hb / 2 }, { x: f.bc + 1500, y: f.hb + sk.p(18) }, tr('plan.det.w.hoopsAt', { s: mm(cf.so) }));
    return { sk, params: { so: mm(cf.so), need: mm(need), bc: mm(f.bc), ext: tieHook(v.ties.column).ext } };
  }, true),

  detail('joint-exterior-seismic', 'N-05', 'joints', 'details', (v, tr) => {
    const sk = new Sketch(20), f = frame(sk, v, { left: false, right: true, above: true }), L = barLengths(v, f.d), cf = columnConfinement(v);
    const hk = standardHook(f.d, 90, 'longitudinal'), r = hk.centrelineRadius * 1000, ext = hk.extension * 1000;
    const xh = v.cover.column + v.ties.column + f.dc + f.d / 2 + 10;
    sk.hooked({ x: f.bc + 1300, y: f.yT }, Math.PI, f.bc + 1300 - xh - r, r, 90, ext, 1, f.d);
    sk.hooked({ x: f.bc + 1300, y: f.yB }, Math.PI, f.bc + 1300 - xh - r, r, 90, ext, -1, f.d);
    columnBars(sk, v, f, true, cf.so, cf.so);
    sk.dim({ x: xh - f.d / 2, y: f.hb + 80 }, { x: f.bc, y: f.hb + 80 }, 8, `≥ ldh = ${mm(L.ldhSeismic)}`);
    sk.label({ x: f.bc / 2, y: f.hb / 2 }, { x: -sk.p(16), y: f.hb / 2 }, tr('plan.det.w.hoopsAt', { s: mm(cf.so) }));
    return { sk, params: { ldh: L.ldhSeismic, so: mm(cf.so), d: f.d } };
  }, true),

  detail('joint-corner-seismic', 'N-06', 'joints', 'details', (v, tr) => {
    const sk = new Sketch(20), f = frame(sk, v, { left: false, right: true, above: false }), L = barLengths(v, f.d), cf = columnConfinement(v);
    const hk = standardHook(f.d, 90, 'longitudinal'), r = hk.centrelineRadius * 1000, ext = hk.extension * 1000;
    const xh = v.cover.column + v.ties.column + f.dc + f.d / 2 + 10, xo = v.cover.column + v.ties.column + f.dc / 2;
    sk.hooked({ x: f.bc + 1300, y: f.yT }, Math.PI, f.bc + 1300 - xh - r, r, 90, Math.max(ext, L.ldhSeismic * 0.6), 1, f.d);
    sk.hooked({ x: f.bc + 1300, y: f.yB }, Math.PI, f.bc + 1300 - xh - r, r, 90, ext, -1, f.d);
    const hc = standardHook(f.dc, 90, 'longitudinal'), rc = hc.centrelineRadius * 1000;
    for (const [x, side] of [[xo, -1], [f.bc - xo, 1]] as const) sk.hooked({ x, y: -1100 }, Math.PI / 2, 1100 + f.yT - 1.2 * f.d - rc, rc, 90, hc.extension * 1000, side, f.dc);
    for (let y = -60; y > -1100; y -= cf.so) sk.tie([{ x: v.cover.column, y }, { x: f.bc - v.cover.column, y }], v.ties.column);
    for (let y = cf.so / 2 + 20; y < f.hb - 40; y += cf.so) sk.tie([{ x: v.cover.column, y }, { x: f.bc - v.cover.column, y }], v.ties.column);
    sk.dim({ x: xh - f.d / 2, y: f.hb + 80 }, { x: f.bc, y: f.hb + 80 }, 8, `≥ ldh = ${mm(L.ldhSeismic)}`);
    sk.label({ x: f.bc / 2, y: f.hb / 2 }, { x: f.bc + 1500, y: f.hb + sk.p(10) }, tr('plan.det.w.hoopsAt', { s: mm(cf.so) }));
    return { sk, params: { ldh: L.ldhSeismic, so: mm(cf.so) } };
  }, true),

  detail('joint-plan', 'N-07', 'joints', 'details', (v, tr) => {
    const { b, h } = v.size.column, bw = v.size.beam.b, c = v.cover.column, t = v.ties.column, d = mainBar(v, 'column'), db = mainBar(v, 'beam'), sk = new Sketch(10), W = 900;
    sk.rect(0, 0, b, h);
    for (const [x0, x1] of [[-W, 0], [b, b + W]] as const) sk.line({ x: x0, y: (h - bw) / 2 }, { x: x1, y: (h - bw) / 2 }).line({ x: x0, y: (h + bw) / 2 }, { x: x1, y: (h + bw) / 2 });
    for (const [y0, y1] of [[-W, 0], [h, h + W]] as const) sk.line({ x: (b - bw) / 2, y: y0 }, { x: (b - bw) / 2, y: y1 }).line({ x: (b + bw) / 2, y: y0 }, { x: (b + bw) / 2, y: y1 });
    const o = c + t / 2;
    sk.hoop(o, o, b - o, h - o, t, tieHook(t).ext).hoopBars(o, o, b - o, h - o, t, d, 3, 3);
    // Beam bars in x pass inside the column's corner bars; those in y above or below them.
    const yi = o + t / 2 + d + db / 2, xi = o + t / 2 + d + db / 2;
    for (const y of [Math.max(yi, (h - bw) / 2 + 40), Math.min(h - yi, (h + bw) / 2 - 40)]) sk.bar([{ x: -W, y }, { x: b + W, y }], db);
    for (const x of [Math.max(xi, (b - bw) / 2 + 40) + db * 1.2, Math.min(b - xi, (b + bw) / 2 - 40) - db * 1.2]) sk.ps.push({ kind: 'line', layer: 'RC-PROJECTED', a: { x, y: -W }, b: { x, y: h + W }, dia: db });
    sk.label({ x: b + W * 0.5, y: (h + bw) / 2 - 40 }, { x: b + W * 0.6, y: h + W * 0.6 }, tr('plan.det.w.crossX'));
    sk.label({ x: (b + bw) / 2 - 40, y: -W * 0.5 }, { x: b + W * 0.4, y: -W * 0.7 }, tr('plan.det.w.crossY'));
    return { sk, params: {} };
  }),
];
