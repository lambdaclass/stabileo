/**
 * Beam details: the closed stirrup, the bars at an end support, stirrup zones with and without
 * earthquake, where the bars are lapped, skin bars of a deep beam, a beam carried by another,
 * an opening in the web, the cantilever and a change of depth at a support.
 */
import { standardHook } from '../../codes/cirsoc201/bar-geometry';
import { detail, type DetailDef } from './def';
import { mm, Sketch } from './sketch';
import { barLengths, beamHoopSpacing, mainBar, tieHook, type DetailValues } from './values';

/** A beam in elevation from x0 to x1 between two column stubs of width bc, its bars and stirrups at the spacing given per zone. */
function elevation(sk: Sketch, v: DetailValues, span: number, zones: Array<{ from: number; to: number; s: number }>) {
  const { h } = v.size.beam, bc = v.size.column.b, c = v.cover.beam, t = v.ties.beam, d = mainBar(v, 'beam');
  for (const x0 of [-bc, span]) { sk.poly([{ x: x0, y: -500 }, { x: x0, y: h + 500 }]).poly([{ x: x0 + bc, y: -500 }, { x: x0 + bc, y: 0 }]).poly([{ x: x0 + bc, y: h }, { x: x0 + bc, y: h + 500 }]); }
  sk.poly([{ x: -bc, y: -500 }, { x: -bc, y: h + 500 }]);
  sk.line({ x: 0, y: 0 }, { x: span, y: 0 }).line({ x: 0, y: h }, { x: span, y: h });
  const yT = h - c - t - d / 2, yB = c + t + d / 2;
  sk.bar([{ x: -bc + c + 30, y: yT }, { x: span + bc - c - 30, y: yT }], d).bar([{ x: -bc + c + 30, y: yB }, { x: span + bc - c - 30, y: yB }], d);
  for (const z of zones) for (let x = z.from; x <= z.to + 1e-6; x += z.s) sk.tie([{ x, y: c + t / 2 }, { x, y: h - c - t / 2 }], t);
  return { yT, yB, d, h, c, t };
}

export const BEAMS: DetailDef[] = [
  detail('tie', 'V-01', 'beams', 'beams', (v, tr) => {
    const t = v.ties.beam, h = tieHook(t), d = mainBar(v, 'beam'), c = v.cover.beam, b = v.size.beam.b, H = v.size.beam.h, sk = new Sketch(5);
    sk.rect(0, 0, b, H);
    const o = c + t / 2;
    sk.hoop(o, o, b - o, H - o, t, h.ext).hoopBars(o, o, b - o, H - o, t, d, 2, 2);
    sk.label({ x: o + h.ext * 0.5, y: H - o - h.ext * 0.5 }, { x: b + sk.p(10), y: H - sk.p(4) }, tr('plan.det.w.hook135', { ext: h.ext, d: t }));
    sk.dim({ x: 0, y: H }, { x: c, y: H }, 6, mm(c)).dim({ x: 0, y: 0 }, { x: b, y: 0 }, -8, mm(b)).dim({ x: b, y: 0 }, { x: b, y: H }, -8, mm(H));
    return { sk, params: { t, ext: h.ext, D: h.mandrel } };
  }),

  detail('beam-end', 'V-02', 'beams', 'beams', (v, tr) => {
    const { h } = v.size.beam, bs = 250, c = v.cover.beam, t = v.ties.beam, d = mainBar(v, 'beam'), L = barLengths(v, d), sk = new Sketch(10), W = 1400;
    sk.rect(-bs, -400, 0, 0).poly([{ x: -bs, y: 0 }, { x: -bs, y: h }, { x: W, y: h }]).poly([{ x: 0, y: 0 }, { x: W, y: 0 }]).breakLine({ x: W, y: -sk.p(2) }, { x: W, y: h + sk.p(2) });
    const yT = h - c - t - d / 2, yB = c + t + d / 2, hk = standardHook(d, 90, 'longitudinal'), r = hk.centrelineRadius * 1000;
    sk.hooked({ x: W, y: yT }, Math.PI, W + bs - c - r - d / 2, r, 90, Math.min(hk.extension * 1000, h - 2 * c), 1, d);
    sk.bar([{ x: -bs + c + d / 2, y: yB }, { x: W, y: yB }], d);
    for (let x = 50; x < W; x += 150) sk.tie([{ x, y: c + t / 2 }, { x, y: h - c - t / 2 }], t);
    sk.dim({ x: -bs + c, y: yB }, { x: 0, y: yB }, -6, '≥ 150').dim({ x: 0, y: 0 }, { x: 50, y: 0 }, -12, '50');
    sk.label({ x: W * 0.6, y: yB }, { x: W * 0.6, y: -sk.p(12) }, tr('plan.det.w.bottomThird'));
    return { sk, params: { d, ldh: L.ldh, ext: mm(hk.extension * 1000) } };
  }),

  detail('beam-stirrups', 'V-03', 'beams', 'beams', (v, tr) => {
    const h = v.size.beam.h, sk = new Sketch(25), span = 4200, s1 = 100, s2 = 200, z = Math.round(span / 4 / 50) * 50;
    elevation(sk, v, span, [{ from: 50, to: z, s: s1 }, { from: z + s2, to: span - z - s2, s: s2 }, { from: span - z, to: span - 50, s: s1 }]);
    sk.dim({ x: 0, y: 0 }, { x: z, y: 0 }, -8, tr('plan.det.w.zoneS', { s: 's1' })).dim({ x: z, y: 0 }, { x: span - z, y: 0 }, -8, tr('plan.det.w.zoneS', { s: 's2' })).dim({ x: span - z, y: 0 }, { x: span, y: 0 }, -8, tr('plan.det.w.zoneS', { s: 's1' }));
    sk.dim({ x: 0, y: h }, { x: 50, y: h }, 6, '50');
    return { sk, params: { t: v.ties.beam } };
  }),

  detail('beam-seismic', 'V-04', 'beams', 'beams', (v, tr) => {
    const h = v.size.beam.h, sk = new Sketch(25), span = 4800, s = beamHoopSpacing(v), z = 2 * h, dEff = h - v.cover.beam - v.ties.beam - mainBar(v, 'beam') / 2, sc = Math.floor(dEff / 2 / 10) * 10;
    elevation(sk, v, span, [{ from: 50, to: z, s }, { from: z + sc, to: span - z - sc, s: sc }, { from: span - z, to: span - 50, s }]);
    sk.dim({ x: 0, y: 0 }, { x: z, y: 0 }, -8, `2h = ${mm(z)}`).dim({ x: span - z, y: 0 }, { x: span, y: 0 }, -8, `2h = ${mm(z)}`).dim({ x: z, y: 0 }, { x: span - z, y: 0 }, -8, `s ≤ d/2 = ${mm(sc)}`);
    sk.dim({ x: 0, y: h }, { x: 50, y: h }, 6, '50').dim({ x: 50, y: h }, { x: 50 + s, y: h }, 12, `s = ${mm(s)}`);
    sk.text(z + 100, h + sk.p(14), tr('plan.det.w.noLapZone'), 2.2);
    return { sk, params: { s: mm(s), z: mm(z), sc: mm(sc), ext: tieHook(v.ties.beam).ext } };
  }, true),

  detail('beam-laps', 'V-05', 'beams', 'beams', (v, tr) => {
    const sk = new Sketch(25), span = 5400, d = mainBar(v, 'beam'), L = barLengths(v, d);
    const { yT, yB, h } = elevation(sk, v, span, []);
    // Where each layer may be lapped: the top in the middle third, the bottom near the supports.
    const m0 = span / 3, m1 = (2 * span) / 3;
    sk.rect(m0, yT - 30, m1, yT + 30, 'RC-COVER').rect(-0, yB - 30, span / 4, yB + 30, 'RC-COVER').rect(span * 0.75, yB - 30, span, yB + 30, 'RC-COVER');
    sk.dim({ x: m0, y: h }, { x: m1, y: h }, 8, tr('plan.det.w.lapTop', { lap: L.lapTop })).dim({ x: 0, y: 0 }, { x: span / 4, y: 0 }, -8, tr('plan.det.w.lapBottom', { lap: L.lap }));
    return { sk, params: { lap: L.lap, lapTop: L.lapTop } };
  }),

  detail('beam-skin', 'V-06', 'beams', 'beams', (v, tr) => {
    const b = Math.max(v.size.beam.b, 250), H = Math.max(v.size.beam.h, 1000), c = v.cover.beam, t = v.ties.beam, d = mainBar(v, 'beam'), ds = Math.max(10, v.bars.beam.at(-1) ?? 10), sk = new Sketch(10);
    sk.rect(0, 0, b, H);
    const o = c + t / 2;
    sk.hoop(o, o, b - o, H - o, t, tieHook(t).ext).hoopBars(o, o, b - o, H - o, t, d, 3, 2);
    const s = Math.min(300, Math.round((H / 2) / 4 / 10) * 10);
    for (let y = H / 2; y > c + 2 * d; y -= s) for (const x of [o + t / 2 + ds / 2, b - o - t / 2 - ds / 2]) sk.dot(x, y, ds);
    sk.dim({ x: b, y: 0 }, { x: b, y: H / 2 }, -8, 'h/2').dim({ x: b, y: H }, { x: b, y: 0 }, 16, mm(H));
    sk.label({ x: o + t / 2 + ds / 2, y: H / 2 - s }, { x: -sk.p(10), y: H / 2 - s }, tr('plan.det.w.skin', { d: ds, s }));
    return { sk, params: { s, d: ds } };
  }),

  detail('beam-hanger', 'V-07', 'beams', 'beams', (v, tr) => {
    const H = v.size.beam.h, b2 = v.size.beam.b, h2 = Math.round(H * 0.75), c = v.cover.beam, t = v.ties.beam, sk = new Sketch(20), W = 1600;
    sk.rect(-W / 2, 0, W / 2, H).breakLine({ x: -W / 2, y: -sk.p(2) }, { x: -W / 2, y: H + sk.p(2) }).breakLine({ x: W / 2, y: -sk.p(2) }, { x: W / 2, y: H + sk.p(2) });
    sk.hidden([{ x: -b2 / 2, y: H - h2 }, { x: b2 / 2, y: H - h2 }, { x: b2 / 2, y: H }, { x: -b2 / 2, y: H }], true);
    const zone = b2 / 2 + Math.round(h2 / 2);
    for (let x = -zone; x <= zone + 1; x += 50) if (Math.abs(x) > b2 / 2) sk.tie([{ x, y: c + t / 2 }, { x, y: H - c - t / 2 }], t);
    for (const x of [-W / 2 + 60, W / 2 - 60]) sk.tie([{ x, y: c + t / 2 }, { x, y: H - c - t / 2 }], t);
    sk.dim({ x: -zone, y: 0 }, { x: -b2 / 2, y: 0 }, -8, `h2/2 = ${mm(h2 / 2)}`).dim({ x: b2 / 2, y: 0 }, { x: zone, y: 0 }, -8, `h2/2`);
    sk.label({ x: zone - 20, y: H / 2 }, { x: W / 2 + sk.p(6), y: H + sk.p(6) }, tr('plan.det.w.hangers'));
    sk.text(0, H - h2 / 2, tr('plan.det.w.secondary'), 2, 'center');
    return { sk, params: { zone: mm(h2 / 2) } };
  }),

  detail('beam-opening', 'V-08', 'beams', 'beams', (v, tr) => {
    const H = Math.max(v.size.beam.h, 500), c = v.cover.beam, t = v.ties.beam, L = barLengths(v, Math.max(10, v.bars.beam.at(-1) ?? 12)), sk = new Sketch(20);
    const D = Math.round(H / 3 / 10) * 10, W = 2 * L.ld + D + 800;
    sk.line({ x: -W / 2, y: 0 }, { x: W / 2, y: 0 }).line({ x: -W / 2, y: H }, { x: W / 2, y: H }).breakLine({ x: -W / 2, y: -sk.p(2) }, { x: -W / 2, y: H + sk.p(2) }).breakLine({ x: W / 2, y: -sk.p(2) }, { x: W / 2, y: H + sk.p(2) });
    sk.ps.push({ kind: 'circle', layer: 'RC-OUTLINE', c: { x: 0, y: H / 2 }, r: D / 2 });
    const dd = Math.max(10, v.bars.beam.at(-1) ?? 12);
    for (const y of [H / 2 + D / 2 + 40, H / 2 - D / 2 - 40]) sk.bar([{ x: -D / 2 - L.ld, y }, { x: D / 2 + L.ld, y }], dd);
    for (const sgn of [-1, 1]) for (let i = 0; i < 3; i++) { const x = sgn * (D / 2 + 50 + i * 80); sk.tie([{ x, y: c + t / 2 }, { x, y: H - c - t / 2 }], t); }
    sk.dim({ x: D / 2, y: H / 2 + D / 2 + 40 }, { x: D / 2 + L.ld, y: H / 2 + D / 2 + 40 }, 6, `ld = ${mm(L.ld)}`).dim({ x: -D / 2, y: H / 2 }, { x: D / 2, y: H / 2 }, 0, `Ø ${mm(D)}`);
    sk.label({ x: D / 2 + 130, y: c + 40 }, { x: D / 2 + 400, y: -sk.p(8) }, tr('plan.det.w.openingTies'));
    return { sk, params: { D: mm(D), d: mainBar(v, 'beam'), ld: L.ld, dd } };
  }),

  detail('beam-cantilever', 'V-09', 'beams', 'beams', (v, tr) => {
    const H = v.size.beam.h, bc = v.size.column.b, c = v.cover.beam, t = v.ties.beam, d = mainBar(v, 'beam'), L = barLengths(v, d), sk = new Sketch(25), lv = 1800, back = Math.max(lv, L.ldTop) + 200;
    sk.poly([{ x: -back - 400, y: H }, { x: bc + lv, y: H }, { x: bc + lv, y: H * 0.5 }, { x: bc, y: 0 }]).poly([{ x: -back - 400, y: 0 }, { x: 0, y: 0 }]);
    sk.poly([{ x: 0, y: 0 }, { x: 0, y: -600 }]).poly([{ x: bc, y: 0 }, { x: bc, y: -600 }]).poly([{ x: 0, y: H }, { x: 0, y: H + 600 }]).poly([{ x: bc, y: H }, { x: bc, y: H + 600 }]);
    sk.breakLine({ x: -back - 400, y: -sk.p(2) }, { x: -back - 400, y: H + sk.p(2) });
    const yT = H - c - t - d / 2, hk = standardHook(d, 90, 'longitudinal'), r = hk.centrelineRadius * 1000;
    sk.hooked({ x: -back, y: yT }, 0, back + bc + lv - c - r - d / 2, r, 90, Math.min(hk.extension * 1000, H * 0.5 - 2 * c), -1, d);
    sk.bar([{ x: -back - 400, y: c + t + d / 2 }, { x: bc + 300, y: c + t + d / 2 }], d);
    sk.dim({ x: -back, y: H }, { x: 0, y: H }, 8, `≥ ${mm(back - 200)}`).dim({ x: bc, y: H }, { x: bc + lv, y: H }, 8, 'Lv');
    sk.label({ x: (bc + lv) / 2, y: yT }, { x: (bc + lv) / 2, y: H + sk.p(14) }, tr('plan.det.w.topBars', { d }));
    return { sk, params: { back: mm(back - 200), d } };
  }),

  detail('beam-depth', 'V-10', 'beams', 'beams', (v, tr) => {
    const H1 = v.size.beam.h, H2 = Math.round(H1 * 0.7), bc = v.size.column.b, c = v.cover.beam, t = v.ties.beam, d = mainBar(v, 'beam'), L = barLengths(v, d), sk = new Sketch(20), W = L.ld + 500;
    sk.poly([{ x: -W, y: H1 }, { x: bc + W, y: H1 }]).poly([{ x: -W, y: 0 }, { x: 0, y: 0 }, { x: 0, y: -500 }]).poly([{ x: bc, y: -500 }, { x: bc, y: H1 - H2 }, { x: bc + W, y: H1 - H2 }]);
    sk.breakLine({ x: -W, y: -sk.p(2) }, { x: -W, y: H1 + sk.p(2) }).breakLine({ x: bc + W, y: H1 - H2 - sk.p(2) }, { x: bc + W, y: H1 + sk.p(2) });
    const yB1 = c + t + d / 2, yB2 = H1 - H2 + c + t + d / 2;
    // The deeper beam's bottom bars end hooked up in the column; the shallower one's run ld into the deeper beam.
    const hk = standardHook(d, 90, 'longitudinal'), r = hk.centrelineRadius * 1000;
    sk.hooked({ x: -W, y: yB1 }, 0, W + bc - c - r - d / 2, r, 90, hk.extension * 1000, 1, d);
    sk.bar([{ x: -L.ld + bc, y: yB2 }, { x: bc + W, y: yB2 }], d);
    sk.bar([{ x: -W, y: H1 - c - t - d / 2 }, { x: bc + W, y: H1 - c - t - d / 2 }], d);
    sk.dim({ x: 0, y: yB1 }, { x: bc - c, y: yB1 }, -6, `ldh = ${mm(L.ldh)}`).dim({ x: -L.ld + bc, y: yB2 }, { x: bc, y: yB2 }, 6, `ld = ${mm(L.ld)}`);
    sk.label({ x: bc / 2, y: H1 * 0.6 }, { x: bc + W * 0.5, y: H1 + sk.p(8) }, tr('plan.det.w.depthChange'));
    return { sk, params: { ld: L.ld, ldh: L.ldh, d } };
  }),
];
