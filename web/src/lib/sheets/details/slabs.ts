/**
 * Slab details: the edge on a beam, continuity over an interior support, the cantilever, the
 * free edge, openings, a change of level, the chairs of the top mat and the punching ties at a
 * column of a flat slab. Section views at 1:10 or 1:20, plan views at 1:50.
 */
import { standardHook } from '../../codes/cirsoc201/bar-geometry';
import { detail, type DetailDef } from './def';
import { mm, Sketch, TXT } from './sketch';
import { barLengths, mainBar } from './values';

export const SLABS: DetailDef[] = [
  detail('slab-edge', 'L-01', 'slabs', 'slabs', (v, tr) => {
    const hb = v.size.beam.h, bw = v.size.beam.b, t = v.size.slab, c = v.cover.slab, d = mainBar(v, 'slab'), sk = new Sketch(10);
    sk.poly([{ x: 1400, y: 0 }, { x: bw, y: 0 }, { x: bw, y: -(hb - t) }, { x: 0, y: -(hb - t) }, { x: 0, y: t }, { x: 1400, y: t }]);
    sk.breakLine({ x: 1400, y: -sk.p(2) }, { x: 1400, y: t + sk.p(2) });
    const h = standardHook(d, 90, 'longitudinal'), r = h.centrelineRadius * 1000, ext = h.extension * 1000;
    const cb = v.cover.beam + v.ties.beam, yTop = t - c - d / 2;
    sk.hooked({ x: 1350, y: yTop }, Math.PI, 1350 - cb - d / 2 - r, r, 90, ext, 1, d);
    sk.bar([{ x: bw / 2, y: c + d / 2 }, { x: 1350, y: c + d / 2 }], d);
    const tw = v.ties.beam, ct = v.cover.beam + tw / 2;
    sk.tie([{ x: ct, y: t - ct }, { x: bw - ct, y: t - ct }, { x: bw - ct, y: ct - (hb - t) }, { x: ct, y: ct - (hb - t) }], tw, true);
    const db = mainBar(v, 'beam');
    for (const x of [ct + tw / 2 + db / 2, bw - ct - tw / 2 - db / 2]) sk.dot(x, ct + tw / 2 + db / 2 - (hb - t), db).dot(x, t - ct - tw / 2 - db / 2, db);
    sk.dim({ x: cb + d / 2, y: yTop - r }, { x: cb + d / 2, y: yTop - r - ext }, -6, mm(ext));
    sk.label({ x: 900, y: yTop }, { x: 900 + sk.p(6), y: t + sk.p(8) }, tr('plan.det.w.topBars', { d }));
    return { sk, params: { d, ext: mm(ext), ldh: barLengths(v, d).ldh } };
  }),

  detail('slab-continuity', 'L-02', 'slabs', 'slabs', (v, tr) => {
    const t = v.size.slab, c = v.cover.slab, d = mainBar(v, 'slab'), L = barLengths(v, d), bw = v.size.beam.b, hb = v.size.beam.h, sk = new Sketch(20);
    const a = Math.max(L.ldTop, 900), W = a + bw / 2 + 900;
    sk.poly([{ x: -W, y: t }, { x: W, y: t }]).poly([{ x: -W, y: 0 }, { x: -bw / 2, y: 0 }, { x: -bw / 2, y: -(hb - t) }, { x: bw / 2, y: -(hb - t) }, { x: bw / 2, y: 0 }, { x: W, y: 0 }]);
    sk.breakLine({ x: -W, y: -sk.p(2) }, { x: -W, y: t + sk.p(2) }).breakLine({ x: W, y: -sk.p(2) }, { x: W, y: t + sk.p(2) });
    const yT = t - c - d / 2, yB = c + d / 2;
    sk.bar([{ x: -bw / 2 - a, y: yT }, { x: bw / 2 + a, y: yT }], d);
    sk.bar([{ x: -W, y: yB }, { x: 60, y: yB }], d).bar([{ x: -60, y: yB + d * 1.2 }, { x: W, y: yB + d * 1.2 }], d);
    sk.dim({ x: bw / 2, y: yT }, { x: bw / 2 + a, y: yT }, 6, `≥ ${mm(a)}`).dim({ x: -bw / 2 - a, y: yT }, { x: -bw / 2, y: yT }, 6, `≥ ${mm(a)}`);
    sk.label({ x: 0, y: yB }, { x: sk.p(8), y: -(hb - t) - sk.p(6) }, tr('plan.det.w.bottomIntoSupport'));
    return { sk, params: { d, a: mm(a), ld: L.ldTop } };
  }),

  detail('slab-cantilever', 'L-03', 'slabs', 'slabs', (v, tr) => {
    const t = v.size.slab, c = v.cover.slab, d = mainBar(v, 'slab'), L = barLengths(v, d), bw = v.size.beam.b, hb = v.size.beam.h, sk = new Sketch(20);
    const lv = 1200, back = Math.max(lv, L.ldTop), W = back + bw + 300;
    sk.poly([{ x: -W, y: t }, { x: bw + lv, y: t }, { x: bw + lv, y: t - Math.max(100, t - 40) }, { x: bw, y: 0 }, { x: bw, y: -(hb - t) }, { x: 0, y: -(hb - t) }, { x: 0, y: 0 }, { x: -W, y: 0 }]);
    sk.breakLine({ x: -W, y: -sk.p(2) }, { x: -W, y: t + sk.p(2) });
    const yT = t - c - d / 2, h = standardHook(d, 90, 'longitudinal'), r = h.centrelineRadius * 1000;
    sk.hooked({ x: -back, y: yT }, 0, back + bw + lv - c - r - d / 2, r, 90, Math.min(h.extension * 1000, t - 2 * c), -1, d);
    sk.bar([{ x: -W, y: c + d / 2 }, { x: bw - 40, y: c + d / 2 }], d);
    sk.dim({ x: bw, y: t }, { x: bw + lv, y: t }, 6, 'Lv').dim({ x: -back, y: t }, { x: 0, y: t }, 6, `≥ ${mm(back)}`);
    sk.label({ x: -back / 2, y: yT }, { x: -back / 2, y: t + sk.p(14) }, tr('plan.det.w.topBars', { d }));
    return { sk, params: { d, back: mm(back), ld: L.ldTop } };
  }),

  detail('slab-free-edge', 'L-04', 'slabs', 'slabs', (v, tr) => {
    const t = v.size.slab, c = v.cover.slab, d = mainBar(v, 'slab'), u = v.ties.slab, sk = new Sketch(10);
    const W = 900;
    sk.rect(0, 0, W, t).breakLine({ x: 0, y: -sk.p(2) }, { x: 0, y: t + sk.p(2) });
    const yT = t - c - d / 2, yB = c + d / 2;
    sk.bar([{ x: 0, y: yT }, { x: W - c - d, y: yT }], d).bar([{ x: 0, y: yB }, { x: W - c - d, y: yB }], d);
    // The U bar closing the edge, its legs 2t long.
    const xu = W - c - u / 2, leg = 2 * t;
    sk.tie([{ x: xu - leg, y: yT + d / 2 + u / 2 }, { x: xu, y: yT + d / 2 + u / 2 }, { x: xu, y: yB - d / 2 - u / 2 }, { x: xu - leg, y: yB - d / 2 - u / 2 }], u);
    sk.dim({ x: xu - leg, y: t }, { x: xu, y: t }, 6, `2h = ${mm(leg)}`).dim({ x: W - c, y: 0 }, { x: W, y: 0 }, -5, mm(c));
    for (const yy of [yT - d * 1.1, yB + d * 1.1]) sk.dot(xu - u / 2 - d / 2, yy, d);
    sk.label({ x: xu, y: t / 2 }, { x: W + sk.p(8), y: t / 2 }, tr('plan.det.w.uBar', { d: u }));
    return { sk, params: { u, leg: mm(leg) } };
  }),

  detail('slab-opening', 'L-05', 'slabs', 'slabs', (v, tr) => {
    const d = mainBar(v, 'slab'), L = barLengths(v, d), sk = new Sketch(50), A = 1200, B = 900, s = 200;
    sk.rect(0, 0, A, B, TXT).line({ x: 0, y: 0 }, { x: A, y: B }, TXT).line({ x: A, y: 0 }, { x: 0, y: B }, TXT);
    // The bars the opening cuts, put back beside it, and the diagonals at its corners.
    for (const k of [1, 2]) {
      sk.bar([{ x: -L.ld, y: -k * s / 2 }, { x: A + L.ld, y: -k * s / 2 }], d).bar([{ x: -L.ld, y: B + k * s / 2 }, { x: A + L.ld, y: B + k * s / 2 }], d);
      sk.bar([{ x: -k * s / 2, y: -L.ld }, { x: -k * s / 2, y: B + L.ld }], d).bar([{ x: A + k * s / 2, y: -L.ld }, { x: A + k * s / 2, y: B + L.ld }], d);
    }
    const dg = L.ld, k = Math.SQRT1_2 * dg;
    for (const [x, y, sx, sy] of [[0, 0, -1, 1], [A, 0, 1, 1], [A, B, 1, -1], [0, B, -1, -1]] as const) sk.bar([{ x: x + (sx * k) / 2 - sx * 150, y: y - (sy * k) / 2 + sy * 150 }, { x: x - (sx * k) / 2 - sx * 150, y: y + (sy * k) / 2 + sy * 150 }], d);
    sk.dim({ x: A + s, y: B + s }, { x: A + L.ld, y: B + s }, 6, `ld = ${mm(L.ld)}`);
    sk.text(A / 2, B / 2 + sk.p(2), tr('plan.det.w.opening'), 2.5, 'center');
    return { sk, params: { d, ld: L.ld } };
  }),

  detail('slab-step', 'L-06', 'slabs', 'slabs', (v, tr) => {
    const t = v.size.slab, c = v.cover.slab, d = mainBar(v, 'slab'), L = barLengths(v, d), sk = new Sketch(10), dz = Math.max(150, Math.round(t * 0.8));
    const W = L.ld + 400;
    sk.poly([{ x: -W, y: t }, { x: 0, y: t }, { x: 0, y: t + dz }, { x: W, y: t + dz }]).poly([{ x: -W, y: 0 }, { x: t, y: 0 }, { x: t, y: dz }, { x: W, y: dz }]);
    sk.breakLine({ x: -W, y: -sk.p(2) }, { x: -W, y: t + sk.p(2) }).breakLine({ x: W, y: dz - sk.p(2) }, { x: W, y: t + dz + sk.p(2) });
    // Bars crossing at the step: the top of the lower slab runs on as the top of the upper one,
    // each bottom layer turns into the other slab and is anchored ld past the turn.
    const xr = t - c - d / 2, xl = c + d / 2, yT1 = t - c - d / 2, yB1 = c + d / 2, yT2 = t + dz - c - d / 2, yB2 = dz + c + d / 2;
    sk.bar([{ x: -W, y: yT1 }, { x: xr, y: yT1 }, { x: xr, y: yT2 }, { x: W, y: yT2 }], d);
    sk.bar([{ x: -W, y: yB1 }, { x: xr - 1.2 * d, y: yB1 }, { x: xr - 1.2 * d, y: Math.min(yT2 - d, yB1 + L.ld) }], d);
    sk.bar([{ x: W, y: yB2 }, { x: xl, y: yB2 }, { x: xl, y: Math.max(yB1 + d, yB2 - L.ld) }], d);
    sk.dim({ x: xr - 1.2 * d, y: yB1 }, { x: xr - 1.2 * d, y: Math.min(yT2 - d, yB1 + L.ld) }, -6, `ld = ${mm(L.ld)}`).dim({ x: W, y: t }, { x: W, y: t + dz }, -8, mm(dz));
    sk.label({ x: c, y: t + dz / 2 }, { x: -sk.p(16), y: t + dz + sk.p(6) }, tr('plan.det.w.crossed'));
    return { sk, params: { d, ld: L.ld } };
  }),

  detail('slab-chairs', 'L-07', 'slabs', 'slabs', (v, tr) => {
    const t = v.size.slab, c = v.cover.slab, d = mainBar(v, 'slab'), sk = new Sketch(5), W = 700;
    sk.rect(0, 0, W, t).breakLine({ x: 0, y: -sk.p(2) }, { x: 0, y: t + sk.p(2) }).breakLine({ x: W, y: -sk.p(2) }, { x: W, y: t + sk.p(2) });
    const yB = c + d / 2, yT = t - c - d / 2, hc = yT - yB - d;
    sk.bar([{ x: 0, y: yB }, { x: W, y: yB }], d).bar([{ x: 0, y: yT }, { x: W, y: yT }], d);
    for (const x of [120, 320, 520]) sk.dot(x, yB + d, d).dot(x, yT - d, d);
    // The chair: two feet on the bottom mat, the bridge under the top one.
    const x0 = 230, ch = v.ties.slab;
    sk.tie([{ x: x0 - 60, y: yB + d / 2 }, { x: x0 - 30, y: yT - d / 2 - ch / 2 }, { x: x0 + 90, y: yT - d / 2 - ch / 2 }, { x: x0 + 120, y: yB + d / 2 }], ch);
    sk.dim({ x: x0 + 150, y: yB + d / 2 }, { x: x0 + 150, y: yT - d / 2 }, -6, `${mm(hc)}`);
    sk.label({ x: x0 + 30, y: yT - d }, { x: W + sk.p(8), y: t + sk.p(4) }, tr('plan.det.w.chair', { d: ch }));
    return { sk, params: { hc: mm(hc), c } };
  }),

  detail('slab-punching', 'L-08', 'slabs', 'slabs', (v, tr) => {
    const t = Math.max(v.size.slab, 200), c = v.cover.slab, d = mainBar(v, 'slab'), b = v.size.column.b, sk = new Sketch(20);
    const dd = t - c - d, s = Math.floor(dd / 2 / 10) * 10, s0 = Math.floor(dd / 2 / 10) * 10, n = 4, ext = s0 + (n - 1) * s + 300;
    sk.poly([{ x: -ext, y: t }, { x: ext + b, y: t }]).poly([{ x: -ext, y: 0 }, { x: 0, y: 0 }, { x: 0, y: -600 }]).poly([{ x: b, y: -600 }, { x: b, y: 0 }, { x: ext + b, y: 0 }]);
    sk.poly([{ x: 0, y: t }, { x: 0, y: t + 600 }]).poly([{ x: b, y: t }, { x: b, y: t + 600 }]);
    const yT = t - c - d / 2, yB = c + d / 2;
    sk.bar([{ x: -ext, y: yT }, { x: ext + b, y: yT }], d).bar([{ x: -ext, y: yB }, { x: ext + b, y: yB }], d);
    const u = v.ties.slab;
    for (const side of [-1, 1] as const) for (let i = 0; i < n; i++) {
      const x = side < 0 ? -(s0 + i * s) : b + s0 + i * s;
      sk.tie([{ x: x - 25, y: yT + d / 2 + u / 2 }, { x: x + 25, y: yT + d / 2 + u / 2 }, { x: x + 25, y: yB - d / 2 - u / 2 }, { x: x - 25, y: yB - d / 2 - u / 2 }], u, true);
    }
    sk.dim({ x: b, y: 0 }, { x: b + s0, y: 0 }, -6, `≤ d/2 = ${mm(s0)}`).dim({ x: b + s0, y: 0 }, { x: b + s0 + s, y: 0 }, -12, `≤ d/2`);
    sk.label({ x: b + s0, y: t / 2 }, { x: b + ext * 0.6, y: t + sk.p(10) }, tr('plan.det.w.punchTies', { d: u }));
    return { sk, params: { s: mm(s0), d: mm(dd) } };
  }),
];
