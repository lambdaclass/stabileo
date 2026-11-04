/**
 * Wall details: the two curtains tied together, the corner and the T in plan, an opening, the
 * confined boundary of a seismic wall, the dowels from the foundation and the top of the wall.
 */
import { standardHook } from '../../codes/cirsoc201/bar-geometry';
import { detail, type DetailDef } from './def';
import { mm, Sketch } from './sketch';
import { barLengths, mainBar, tieHook } from './values';

export const WALLS: DetailDef[] = [
  detail('wall-section', 'M-01', 'walls', 'walls', (v, tr) => {
    const tw = v.size.wall, c = v.cover.wall, d = mainBar(v, 'wall'), dh = v.bars.wall[1] ?? d, u = v.ties.wall, sk = new Sketch(5), W = 900, s = 200;
    sk.rect(0, 0, W, tw).breakLine({ x: 0, y: -sk.p(2) }, { x: 0, y: tw + sk.p(2) }).breakLine({ x: W, y: -sk.p(2) }, { x: W, y: tw + sk.p(2) });
    const yH0 = c + dh / 2, yH1 = tw - c - dh / 2;
    sk.bar([{ x: 0, y: yH0 }, { x: W, y: yH0 }], dh).bar([{ x: 0, y: yH1 }, { x: W, y: yH1 }], dh);
    for (let x = 100; x < W; x += s) sk.dot(x, yH0 + dh / 2 + d / 2, d).dot(x, yH1 - dh / 2 - d / 2, d);
    // An S tie every other vertical bar, its hooks around the outer bars.
    const ext = tieHook(u).ext;
    for (let x = 100; x < W; x += 2 * s) sk.tie([{ x: x - ext * 0.5, y: yH0 - dh / 2 - u / 2 + ext * 0.5 }, { x, y: yH0 - dh / 2 - u / 2 }, { x, y: yH1 + dh / 2 + u / 2 }, { x: x + ext * 0.5, y: yH1 + dh / 2 + u / 2 - ext * 0.5 }], u);
    sk.dim({ x: W, y: 0 }, { x: W, y: tw }, -8, mm(tw)).dim({ x: 100, y: tw }, { x: 100 + s, y: tw }, 8, `s`);
    sk.label({ x: 300, y: tw / 2 }, { x: W + sk.p(10), y: tw + sk.p(6) }, tr('plan.det.w.sTie', { d: u }));
    return { sk, params: { d, dh, u } };
  }),

  detail('wall-corner', 'M-02', 'walls', 'walls', (v, tr) => {
    const tw = v.size.wall, c = v.cover.wall, dh = v.bars.wall[1] ?? mainBar(v, 'wall'), d = mainBar(v, 'wall'), L = barLengths(v, dh), sk = new Sketch(10), A = L.lap + 600;
    sk.poly([{ x: A, y: 0 }, { x: 0, y: 0 }, { x: 0, y: A }]).poly([{ x: A, y: tw }, { x: tw, y: tw }, { x: tw, y: A }]);
    sk.breakLine({ x: A, y: -sk.p(2) }, { x: A, y: tw + sk.p(2) }).breakLine({ x: -sk.p(2), y: A }, { x: tw + sk.p(2), y: A });
    const o = c + dh / 2, i = tw - c - dh / 2;
    // Each face's bars turn the corner; the outer ones are lapped with U bars.
    sk.bar([{ x: A, y: i }, { x: i, y: i }, { x: i, y: A }], dh);
    sk.bar([{ x: A, y: o }, { x: o + 4 * dh, y: o }, { x: o, y: o + 4 * dh }, { x: o, y: o + L.lap }], dh);
    sk.bar([{ x: o + 1.2 * dh, y: A }, { x: o + 1.2 * dh, y: o + 1.2 * dh + 4 * dh }, { x: o + 1.2 * dh + 4 * dh, y: o + 1.2 * dh }, { x: o + L.lap, y: o + 1.2 * dh }], dh);
    for (const [x, y] of [[o + dh, o + dh], [i - dh, i - dh], [o + dh, i - dh], [i - dh, o + dh]] as const) sk.dot(x, y, d);
    sk.dim({ x: o, y: 0 }, { x: o + L.lap, y: 0 }, -8, `lst = ${mm(L.lap)}`);
    sk.label({ x: o, y: o + L.lap * 0.5 }, { x: -sk.p(12), y: L.lap * 0.6 }, tr('plan.det.w.cornerBars'));
    return { sk, params: { lap: L.lap, d: dh } };
  }),

  detail('wall-tee', 'M-03', 'walls', 'walls', (v, tr) => {
    const tw = v.size.wall, c = v.cover.wall, dh = v.bars.wall[1] ?? mainBar(v, 'wall'), L = barLengths(v, dh), sk = new Sketch(10), A = L.ld + 700;
    sk.poly([{ x: -A, y: tw }, { x: -tw / 2, y: tw }, { x: -tw / 2, y: tw + A }]).poly([{ x: A, y: tw }, { x: tw / 2, y: tw }, { x: tw / 2, y: tw + A }]).line({ x: -A, y: 0 }, { x: A, y: 0 });
    for (const x of [-A, A]) sk.breakLine({ x, y: -sk.p(2) }, { x, y: tw + sk.p(2) });
    sk.breakLine({ x: -tw / 2 - sk.p(2), y: tw + A }, { x: tw / 2 + sk.p(2), y: tw + A });
    const o = c + dh / 2;
    sk.bar([{ x: -A, y: o }, { x: A, y: o }], dh).bar([{ x: -A, y: tw - o }, { x: A, y: tw - o }], dh);
    const hk = standardHook(dh, 90, 'longitudinal'), r = hk.centrelineRadius * 1000, ext = hk.extension * 1000;
    for (const side of [-1, 1] as const) sk.hooked({ x: side * (tw / 2 - o), y: tw + A }, -Math.PI / 2, A + tw - (o + 1.2 * dh) - r, r, 90, Math.max(ext, L.ld - tw), side === 1 ? 1 : -1, dh);
    sk.dim({ x: tw / 2, y: o + 1.2 * dh }, { x: Math.max(ext, L.ld - tw) + tw / 2 - o + r, y: o + 1.2 * dh }, -6, `ld = ${mm(L.ld)}`);
    sk.label({ x: 0, y: tw + A / 2 }, { x: A * 0.5, y: tw + A * 0.7 }, tr('plan.det.w.teeBars'));
    return { sk, params: { ld: L.ld, d: dh } };
  }),

  detail('wall-opening', 'M-04', 'walls', 'walls', (v, tr) => {
    const d = Math.max(12, mainBar(v, 'wall')), L = barLengths(v, d), sk = new Sketch(50), A = 1000, B = 2100;
    sk.rect(0, 0, A, B);
    for (const k of [1, 2]) {
      sk.bar([{ x: -k * 60, y: -L.ld }, { x: -k * 60, y: B + L.ld }], d).bar([{ x: A + k * 60, y: -L.ld }, { x: A + k * 60, y: B + L.ld }], d);
      sk.bar([{ x: -L.ld, y: B + k * 60 }, { x: A + L.ld, y: B + k * 60 }], d).bar([{ x: -L.ld, y: -k * 60 }, { x: A + L.ld, y: -k * 60 }], d);
    }
    const g = (L.ld * 2) * Math.SQRT1_2 / 2;
    for (const [x, y, sx, sy] of [[0, 0, -1, -1], [A, 0, 1, -1], [A, B, 1, 1], [0, B, -1, 1]] as const) sk.bar([{ x: x + sx * 200 - g, y: y + sy * 200 + sx * sy * g }, { x: x + sx * 200 + g, y: y + sy * 200 - sx * sy * g }], d);
    sk.dim({ x: A + 120, y: B }, { x: A + 120, y: B + L.ld }, -6, `ld = ${mm(L.ld)}`);
    sk.text(A / 2, B / 2, tr('plan.det.w.opening'), 2.5, 'center');
    return { sk, params: { d, ld: L.ld } };
  }),

  detail('wall-boundary', 'M-05', 'walls', 'walls', (v, tr) => {
    const tw = Math.max(v.size.wall, 200), c = v.cover.wall, d = Math.max(16, mainBar(v, 'column')), dh = v.bars.wall[1] ?? mainBar(v, 'wall'), t = v.ties.column, sk = new Sketch(10), lb = Math.max(450, 2 * tw), W = lb + 900;
    sk.poly([{ x: W, y: 0 }, { x: 0, y: 0 }, { x: 0, y: tw }, { x: W, y: tw }]).breakLine({ x: W, y: -sk.p(2) }, { x: W, y: tw + sk.p(2) });
    const o = c + t / 2;
    sk.hoop(o, o, lb - o, tw - o, t, tieHook(t).ext).hoopBars(o, o, lb - o, tw - o, t, d, 4, 2);
    for (let x = lb / 3; x < lb - o; x += lb / 3) sk.tie([{ x, y: o }, { x, y: tw - o }], t);
    const yh = [o + t / 2 + dh / 2 + d, tw - o - t / 2 - dh / 2 - d];
    for (const y of yh) sk.bar([{ x: o + t + dh / 2, y }, { x: W, y }], dh);
    sk.tie([{ x: o + t + dh / 2 + 4 * dh, y: yh[0]! }, { x: o + t + dh / 2, y: yh[0]! }, { x: o + t + dh / 2, y: yh[1]! }, { x: o + t + dh / 2 + 4 * dh, y: yh[1]! }], dh);
    for (let x = lb + 100; x < W; x += 200) sk.dot(x, c + dh + d / 2, mainBar(v, 'wall')).dot(x, tw - c - dh - d / 2, mainBar(v, 'wall'));
    sk.dim({ x: 0, y: 0 }, { x: lb, y: 0 }, -8, `lb = ${mm(lb)}`);
    sk.label({ x: lb / 2, y: tw - o }, { x: lb / 2, y: tw + sk.p(12) }, tr('plan.det.w.boundary', { d, t }));
    sk.label({ x: o + t, y: tw / 2 }, { x: -sk.p(10), y: tw + sk.p(6) }, tr('plan.det.w.hAnchored'));
    return { sk, params: { lb: mm(lb), d, t, ext: tieHook(t).ext } };
  }, true),

  detail('wall-starter', 'M-06', 'walls', 'walls', (v, tr) => {
    const tw = v.size.wall, c = v.cover.wall, d = mainBar(v, 'wall'), L = barLengths(v, d), sk = new Sketch(20), Hf = Math.max(400, v.size.footing), lap = Math.max(L.lap, 600);
    sk.poly([{ x: -600, y: Hf }, { x: 0, y: Hf }, { x: 0, y: Hf + lap + 1200 }]).poly([{ x: tw + 600, y: Hf }, { x: tw, y: Hf }, { x: tw, y: Hf + lap + 1200 }]).line({ x: -600, y: 0 }, { x: tw + 600, y: 0 });
    for (const x of [-600, tw + 600]) sk.breakLine({ x, y: -sk.p(2) }, { x, y: Hf + sk.p(2) });
    const cf = v.cover.footing, hk = standardHook(d, 90, 'longitudinal'), r = hk.centrelineRadius * 1000, ext = hk.extension * 1000;
    for (const side of [-1, 1] as const) {
      const x = side < 0 ? c + d / 2 : tw - c - d / 2;
      sk.hooked({ x, y: Hf + lap }, -Math.PI / 2, Hf + lap - cf - 2 * d - r, r, 90, ext, side === 1 ? 1 : -1, d);
      sk.bar([{ x: x + (side < 0 ? 1.2 : -1.2) * d, y: Hf + 40 }, { x: x + (side < 0 ? 1.2 : -1.2) * d, y: Hf + lap + 1200 }], d);
    }
    sk.dim({ x: tw, y: Hf }, { x: tw, y: Hf + lap }, -8, `lst = ${mm(lap)}`);
    sk.label({ x: c, y: Hf + lap / 2 }, { x: -sk.p(12), y: Hf + lap }, tr('plan.det.w.wallDowels', { d }));
    return { sk, params: { lap: mm(lap), d } };
  }),

  detail('wall-top', 'M-07', 'walls', 'walls', (v, tr) => {
    const tw = v.size.wall, c = v.cover.wall, d = mainBar(v, 'wall'), dh = v.bars.wall[1] ?? d, u = v.ties.wall, sk = new Sketch(5), H = 700;
    sk.poly([{ x: 0, y: 0 }, { x: 0, y: H }, { x: tw, y: H }, { x: tw, y: 0 }]).breakLine({ x: -sk.p(2), y: 0 }, { x: tw + sk.p(2), y: 0 });
    const x0 = c + dh + d / 2, x1 = tw - c - dh - d / 2;
    sk.bar([{ x: x0, y: 0 }, { x: x0, y: H - c - u - 10 }], d).bar([{ x: x1, y: 0 }, { x: x1, y: H - c - u - 10 }], d);
    for (let y = 80; y < H - c; y += 150) sk.dot(c + dh / 2, y, dh).dot(tw - c - dh / 2, y, dh);
    const leg = Math.max(2 * tw, 300);
    sk.tie([{ x: x0 - d / 2 - u / 2, y: H - c - leg }, { x: x0 - d / 2 - u / 2, y: H - c - u / 2 }, { x: x1 + d / 2 + u / 2, y: H - c - u / 2 }, { x: x1 + d / 2 + u / 2, y: H - c - leg }], u);
    sk.dim({ x: tw, y: H - c - leg }, { x: tw, y: H - c }, -8, mm(leg));
    sk.label({ x: tw / 2, y: H - c }, { x: tw + sk.p(10), y: H + sk.p(4) }, tr('plan.det.w.uBar', { d: u }));
    return { sk, params: { leg: mm(leg), u } };
  }),
];
