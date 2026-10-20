/**
 * Foundation details: column starters in a footing, the isolated footing, an edge footing tied
 * back by a strap beam, the tie beam, a pile cap, a raft's mats and the strip footing of a wall.
 */
import { standardHook } from '../../codes/cirsoc201/bar-geometry';
import { detail, type DetailDef } from './def';
import { mm, Sketch, TXT } from './sketch';
import { barLengths, mainBar, tieHook } from './values';

const LEAN = 50;

export const FOUNDATIONS: DetailDef[] = [
  detail('starters', 'F-01', 'foundations', 'foundations', (v, tr) => {
    const B = 1600, Hf = Math.max(v.size.footing, 400), b = v.size.column.b, c = v.cover.footing, d = mainBar(v, 'column'), df = mainBar(v, 'footing'), L = barLengths(v, d), sk = new Sketch(20);
    const top = Hf + Math.max(L.lapC, L.lap) + 400;
    sk.poly([{ x: 0, y: 0 }, { x: B, y: 0 }, { x: B, y: Hf }, { x: B / 2 + b / 2, y: Hf }, { x: B / 2 + b / 2, y: top }]).poly([{ x: 0, y: 0 }, { x: 0, y: Hf }, { x: B / 2 - b / 2, y: Hf }, { x: B / 2 - b / 2, y: top }]);
    sk.rect(-100, -LEAN, B + 100, 0, TXT).ground(-200, B + 200, -LEAN);
    const ym = c + df / 2;
    sk.bar([{ x: c, y: ym }, { x: B - c, y: ym }], df);
    for (let x = c + 100; x < B - c; x += 150) sk.dot(x, ym + df, df);
    const h = standardHook(d, 90, 'longitudinal'), r = h.centrelineRadius * 1000, ext = h.extension * 1000, ct = v.cover.column, t = v.ties.column;
    for (const side of [-1, 1] as const) {
      const x0 = B / 2 + side * (b / 2 - ct - t - d / 2), seat = ym + 2 * df + d / 2;
      sk.hooked({ x: x0, y: top }, -Math.PI / 2, top - seat - r, r, 90, ext, side === 1 ? 1 : -1, d);
    }
    for (const y of [Hf - 100, Hf - 300]) sk.tie([{ x: B / 2 - b / 2 + ct, y }, { x: B / 2 + b / 2 - ct, y }], t);
    const lap = Math.max(L.lapC, L.lap);
    sk.dim({ x: B / 2 + b / 2, y: Hf }, { x: B / 2 + b / 2, y: Hf + lap }, -8, `lst = ${mm(lap)}`).dim({ x: B, y: 0 }, { x: B, y: Hf }, -8, mm(Hf));
    sk.label({ x: B / 2, y: Hf - 200 }, { x: B + sk.p(10), y: Hf - 100 }, tr('plan.det.w.twoTies'));
    sk.label({ x: B / 2 + b / 2 - ct - t, y: ym + 2 * df }, { x: B + sk.p(10), y: c }, tr('plan.det.w.seatOnMat', { ext: mm(ext) }));
    return { sk, params: { ext: mm(ext), lap: mm(lap), ldc: L.ldc } };
  }),

  detail('footing', 'F-02', 'foundations', 'foundations', (v, tr) => {
    const B = 2000, Hf = Math.max(v.size.footing, 400), b = v.size.column.b, c = v.cover.footing, df = mainBar(v, 'footing'), L = barLengths(v, df), sk = new Sketch(25);
    sk.poly([{ x: 0, y: Hf }, { x: 0, y: 0 }, { x: B, y: 0 }, { x: B, y: Hf }, { x: B / 2 + b / 2 + 50, y: Hf }]).poly([{ x: 0, y: Hf }, { x: B / 2 - b / 2 - 50, y: Hf }]);
    sk.poly([{ x: B / 2 - b / 2, y: Hf + 600 }, { x: B / 2 - b / 2, y: Hf }]).poly([{ x: B / 2 + b / 2, y: Hf + 600 }, { x: B / 2 + b / 2, y: Hf }]);
    sk.rect(-100, -LEAN, B + 100, 0, TXT).ground(-200, B + 200, -LEAN);
    const ym = c + df / 2, avail = B / 2 - b / 2 - c;
    const hk = standardHook(df, 90, 'longitudinal'), r = hk.centrelineRadius * 1000, ext = hk.extension * 1000, hooked = avail < L.ld;
    if (hooked) {
      sk.bar([...[...hookPathR(B - c - df / 2, ym, r, ext)].reverse(), ...hookPathL(c + df / 2, ym, r, ext)], df);
    } else sk.bar([{ x: c, y: ym }, { x: B - c, y: ym }], df);
    for (let x = c + 100; x < B - c; x += 200) sk.dot(x, ym + df, df);
    sk.dim({ x: 0, y: 0 }, { x: B, y: 0 }, -8, 'B').dim({ x: B, y: 0 }, { x: B, y: Hf }, -8, mm(Hf)).dim({ x: 0, y: Hf }, { x: c, y: Hf }, 8, mm(c));
    sk.label({ x: B * 0.7, y: ym }, { x: B + sk.p(10), y: ym + sk.p(4) }, tr(hooked ? 'plan.det.w.matHooked' : 'plan.det.w.matStraight', { d: df }));
    sk.text(0, -LEAN - sk.p(6), tr('plan.det.w.lean', { t: LEAN }), 2);
    return { sk, params: { c, ld: L.ld, avail: mm(avail) } };
  }),

  detail('footing-strap', 'F-03', 'foundations', 'foundations', (v, tr) => {
    const Hf = Math.max(v.size.footing, 500), hs = Math.max(v.size.beam.h, 600), b = v.size.column.b, c = v.cover.footing, d = mainBar(v, 'beam'), t = v.ties.beam, L = barLengths(v, d), sk = new Sketch(50);
    const B1 = 1400, gap = 2600, B2 = 1800, x2 = B1 + gap;
    sk.rect(0, 0, B1, Hf).rect(x2, 0, x2 + B2, Hf);
    sk.rect(0, Hf, b, Hf + 500).rect(x2 + B2 / 2 - b / 2, Hf, x2 + B2 / 2 + b / 2, Hf + 500);
    sk.line({ x: B1, y: Hf }, { x: x2, y: Hf }).line({ x: B1, y: Hf - hs }, { x: x2, y: Hf - hs });
    sk.ground(-200, x2 + B2 + 200, 0);
    const yT = Hf - c - t - d / 2, yB = Hf - hs + c + t + d / 2;
    sk.bar([{ x: c, y: yT - 200 }, { x: c, y: yT }, { x: x2 + B2 / 2 + L.ldTop / 2, y: yT }], d);
    sk.bar([{ x: c + 100, y: Math.max(yB, c + 50) }, { x: x2 + B2 / 2, y: Math.max(yB, c + 50) }], d);
    for (let x = B1 + 50; x < x2; x += 200) sk.tie([{ x, y: Hf - hs + c + t / 2 }, { x, y: Hf - c - t / 2 }], t);
    sk.label({ x: (B1 + x2) / 2, y: yT }, { x: (B1 + x2) / 2 + sk.p(10), y: -sk.p(10) }, tr('plan.det.w.strapTop', { d }));
    sk.text(0, Hf + 500 + sk.p(4), tr('plan.det.w.edgeFooting'), 2.2).text(x2, Hf + 500 + sk.p(4), tr('plan.det.w.innerFooting'), 2.2);
    return { sk, params: { d, ld: L.ldTop } };
  }),

  detail('tie-beam', 'F-04', 'foundations', 'foundations', (v, tr) => {
    const b = Math.max(200, v.size.beam.b), h = Math.max(400, Math.round(v.size.beam.h * 0.8 / 10) * 10), c = Math.max(v.cover.footing, 40), t = v.ties.beam, d = Math.max(12, mainBar(v, 'beam') - 4), sk = new Sketch(5);
    sk.rect(0, 0, b, h).rect(-60, -LEAN, b + 60, 0, TXT).ground(-120, b + 120, -LEAN);
    const o = c + t / 2;
    sk.hoop(o, o, b - o, h - o, t, tieHook(t).ext).hoopBars(o, o, b - o, h - o, t, d, 2, 2);
    sk.dim({ x: 0, y: 0 }, { x: b, y: 0 }, -10, mm(b)).dim({ x: b, y: 0 }, { x: b, y: h }, -8, mm(h)).dim({ x: 0, y: 0 }, { x: 0, y: c }, 6, mm(c));
    sk.label({ x: b - o, y: h - o }, { x: b + sk.p(10), y: h }, tr('plan.det.w.tieBeam', { d, t }));
    return { sk, params: { d, ld: barLengths(v, d).ld, c } };
  }),

  detail('pile-cap', 'F-05', 'foundations', 'foundations', (v, tr) => {
    const Dp = 500, s = 3 * Dp, Hc = Math.max(v.size.footing, 700), c = Math.max(v.cover.footing, 50), df = mainBar(v, 'footing'), L = barLengths(v, df), b = v.size.column.b, sk = new Sketch(25), ed = Dp;
    const W = s + 2 * ed, emb = 100;
    sk.rect(0, 0, W, Hc).rect(W / 2 - b / 2, Hc, W / 2 + b / 2, Hc + 600);
    for (const x of [ed, ed + s]) { sk.poly([{ x: x - Dp / 2, y: emb }, { x: x - Dp / 2, y: -1500 }]).poly([{ x: x + Dp / 2, y: emb }, { x: x + Dp / 2, y: -1500 }]); sk.breakLine({ x: x - Dp / 2, y: -1500 }, { x: x + Dp / 2, y: -1500 }); sk.hidden([{ x: x - Dp / 2, y: emb }, { x: x + Dp / 2, y: emb }]); }
    for (const x of [ed, ed + s]) for (const dx of [-Dp / 2 + 70, Dp / 2 - 70]) sk.bar([{ x: x + dx, y: -1400 }, { x: x + dx, y: Math.min(Hc - c - 2 * df, emb + L.ld) }], 16);
    const ym = emb + c / 2 + df;
    const hk = standardHook(df, 90, 'longitudinal'), r = hk.centrelineRadius * 1000;
    sk.bar([...hookPathR(W - c - df / 2, ym, r, Math.min(hk.extension * 1000 + 200, Hc - 2 * c)).reverse(), ...hookPathL(c + df / 2, ym, r, Math.min(hk.extension * 1000 + 200, Hc - 2 * c))], df);
    sk.bar([{ x: c, y: Hc - c - df / 2 }, { x: W - c, y: Hc - c - df / 2 }], Math.max(10, df - 4));
    sk.dim({ x: ed - Dp / 2 - 80, y: 0 }, { x: ed - Dp / 2 - 80, y: emb }, 6, mm(emb)).dim({ x: ed, y: -1500 }, { x: ed + s, y: -1500 }, -10, `${mm(s)} = 3 Ø`);
    sk.label({ x: W * 0.4, y: ym }, { x: W + sk.p(8), y: ym }, tr('plan.det.w.capTie', { d: df }));
    sk.label({ x: ed + Dp / 2 - 70, y: emb + 200 }, { x: W + sk.p(8), y: Hc * 0.6 }, tr('plan.det.w.pileBars', { ld: mm(L.ld) }));
    return { sk, params: { emb: mm(emb), d: df } };
  }),

  detail('raft', 'F-06', 'foundations', 'foundations', (v, tr) => {
    const H = Math.max(v.size.footing, 400), c = v.cover.footing, df = mainBar(v, 'footing'), u = Math.max(12, v.ties.footing), sk = new Sketch(10), W = 1400;
    sk.rect(0, 0, W, H).breakLine({ x: W, y: -sk.p(2) }, { x: W, y: H + sk.p(2) }).rect(-80, -LEAN, W, 0, TXT).ground(-160, W, -LEAN);
    const yB = c + df / 2, yT = H - c - df / 2;
    sk.bar([{ x: c + u + df / 2, y: yB }, { x: W, y: yB }], df).bar([{ x: c + u + df / 2, y: yT }, { x: W, y: yT }], df);
    for (let x = c + 150; x < W; x += 200) sk.dot(x, yB + df, df).dot(x, yT - df, df);
    const xu = c + u / 2, leg = Math.max(2 * H / 3, 400);
    sk.tie([{ x: xu + leg, y: yT + df / 2 + u / 2 - 0 }, { x: xu, y: yT + df / 2 + u / 2 }, { x: xu, y: yB - df / 2 - u / 2 }, { x: xu + leg, y: yB - df / 2 - u / 2 }], u);
    const ch = Math.max(12, v.ties.footing);
    sk.tie([{ x: 700, y: yB + df }, { x: 760, y: yT - df - ch / 2 }, { x: 900, y: yT - df - ch / 2 }, { x: 960, y: yB + df }], ch);
    sk.dim({ x: W, y: 0 }, { x: W, y: H }, -8, mm(H)).dim({ x: xu, y: H }, { x: xu + leg, y: H }, 8, mm(leg));
    sk.label({ x: xu, y: H / 2 }, { x: -sk.p(14), y: H + sk.p(4) }, tr('plan.det.w.uBar', { d: u }));
    sk.label({ x: 830, y: yT - df - ch }, { x: W + sk.p(8), y: H * 0.5 }, tr('plan.det.w.chair', { d: ch }));
    return { sk, params: { c, u, leg: mm(leg) } };
  }),

  detail('strip-footing', 'F-07', 'foundations', 'foundations', (v, tr) => {
    const tw = v.size.wall, B = Math.max(800, 3 * tw), Hf = Math.max(300, Math.round(v.size.footing * 0.7 / 10) * 10), c = v.cover.footing, df = mainBar(v, 'footing'), dw = mainBar(v, 'wall'), L = barLengths(v, dw), sk = new Sketch(10);
    sk.poly([{ x: B / 2 - tw / 2, y: Hf + 900 }, { x: B / 2 - tw / 2, y: Hf }, { x: 0, y: Hf }, { x: 0, y: 0 }, { x: B, y: 0 }, { x: B, y: Hf }, { x: B / 2 + tw / 2, y: Hf }, { x: B / 2 + tw / 2, y: Hf + 900 }]);
    sk.rect(-80, -LEAN, B + 80, 0, TXT).ground(-160, B + 160, -LEAN);
    const ym = c + df / 2;
    sk.bar([{ x: c, y: ym }, { x: B - c, y: ym }], df);
    for (let x = c + 80; x < B - c; x += 200) sk.dot(x, ym + df, df);
    const h = standardHook(dw, 90, 'longitudinal'), r = h.centrelineRadius * 1000, ext = h.extension * 1000, cw = v.cover.wall;
    for (const side of [-1, 1] as const) sk.hooked({ x: B / 2 + side * (tw / 2 - cw - dw / 2), y: Hf + Math.max(L.lap, 600) }, -Math.PI / 2, Hf + Math.max(L.lap, 600) - ym - 2 * df - r, r, 90, ext, side === 1 ? 1 : -1, dw);
    sk.dim({ x: B / 2 + tw / 2, y: Hf }, { x: B / 2 + tw / 2, y: Hf + Math.max(L.lap, 600) }, -8, `lst = ${mm(Math.max(L.lap, 600))}`);
    sk.label({ x: B / 2 - tw / 2 + cw, y: Hf + 300 }, { x: -sk.p(10), y: Hf + 600 }, tr('plan.det.w.wallDowels', { d: dw }));
    return { sk, params: { lap: mm(Math.max(L.lap, 600)), d: dw } };
  }),
];

/** A bar end hooked up at the right end of a mat (from the hook's tail to the run) and at the left. */
function hookPathR(x: number, y: number, r: number, ext: number) {
  const pts = [{ x: x - r, y }];
  for (let i = 1; i <= 6; i++) { const a = -Math.PI / 2 + (Math.PI / 2) * (i / 6); pts.push({ x: x - r + r * Math.cos(a), y: y + r + r * Math.sin(a) }); }
  pts.push({ x, y: y + r + ext });
  return pts;
}
function hookPathL(x: number, y: number, r: number, ext: number) {
  const pts = [{ x: x + r, y }];
  for (let i = 1; i <= 6; i++) { const a = -Math.PI / 2 - (Math.PI / 2) * (i / 6); pts.push({ x: x + r + r * Math.cos(a), y: y + r + r * Math.sin(a) }); }
  pts.push({ x, y: y + r + ext });
  return pts;
}
