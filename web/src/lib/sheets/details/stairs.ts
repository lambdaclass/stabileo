/**
 * Stair and ramp details: the flight with its bars crossed at the knees, the foot on its
 * support, the head at the landing, a ramp with its change of slope, and the steps cast over
 * the waist.
 */
import { detail, type DetailDef } from './def';
import { mm, Sketch } from './sketch';
import { barLengths, mainBar, type DetailValues } from './values';

type P = { x: number; y: number };

/** The flight's soffit and steps from (0, 0) rising `n` risers, the waist `t` thick. */
function flight(v: DetailValues, n: number) {
  const r = v.size.riser, g = v.size.tread, t = v.size.stair, a = Math.atan2(r, g), k = t / Math.cos(a);
  const steps: P[] = [{ x: 0, y: k }];
  for (let i = 0; i < n; i++) steps.push({ x: i * g, y: k + (i + 1) * r }, { x: (i + 1) * g, y: k + (i + 1) * r });
  return { r, g, t, a, k, steps, run: n * g, rise: n * r };
}

/** A point at `s` along the soffit (slope a from the origin) and `off` above it, perpendicular. */
const along = (a: number, s: number, off: number): P => ({ x: s * Math.cos(a) - off * Math.sin(a), y: s * Math.sin(a) + off * Math.cos(a) });

export const STAIRS: DetailDef[] = [
  detail('stair-flight', 'E-01', 'stairs', 'stairs', (v, tr) => {
    const n = 8, f = flight(v, n), c = v.cover.stair, d = mainBar(v, 'stair'), L = barLengths(v, d), sk = new Sketch(25), Lb = 1000, Lt = 1000;
    const slope = Math.hypot(f.run, f.rise);
    // Landing at the foot (y ≤ 0 side, top at f.k) and at the head.
    sk.poly([{ x: -Lb, y: f.k }, { x: 0, y: f.k }, ...f.steps.slice(1), { x: f.run + Lt, y: f.k + f.rise }]);
    sk.poly([{ x: -Lb, y: f.k - f.t }, { x: 0, y: f.k - f.t }, { x: f.run, y: f.k - f.t + f.rise }, { x: f.run + Lt, y: f.k - f.t + f.rise }]);
    sk.breakLine({ x: -Lb, y: f.k - f.t - sk.p(1.5) }, { x: -Lb, y: f.k + sk.p(1.5) }).breakLine({ x: f.run + Lt, y: f.k - f.t + f.rise - sk.p(1.5) }, { x: f.run + Lt, y: f.k + f.rise + sk.p(1.5) });
    const y0 = f.k - f.t, ob = c + d / 2;
    const B = (s: number, off: number) => { const p = along(f.a, s, off); return { x: p.x, y: p.y + y0 }; };
    // Bottom bars: the flight's runs past the lower knee into the landing's top face and the landing's runs past the knee into the flight.
    // The lower knee is convex underneath: the bar turns with it. The upper one is re-entrant: the
    // flight's bar runs on to the landing's top layer and the landing's bar runs back ld into the flight.
    const e = (f.t - 2 * ob - d) / Math.sin(f.a), top = B(slope + e, ob);
    sk.bar([{ x: -Lb, y: y0 + ob }, { x: ob * Math.tan(f.a / 2), y: y0 + ob }, top, { x: top.x + L.ld / 2, y: top.y }], d);
    sk.bar([{ x: f.run + Lt, y: y0 + f.rise + ob + 1.2 * d }, { x: f.run - L.ld, y: y0 + f.rise + ob + 1.2 * d }], d);
    // Top bars at the ends, ld into the flight.
    sk.bar([{ x: -Lb, y: f.k - ob }, { x: -ob * Math.tan(f.a / 2), y: f.k - ob }, B(L.ld, f.t - ob)], d);
    sk.bar([B(slope - L.ld, f.t - ob), { x: f.run, y: f.k + f.rise - ob }, { x: f.run + Lt, y: f.k + f.rise - ob }], d);
    sk.dim(B(0, f.t), B(L.ld, f.t), 6, `ld = ${mm(L.ld)}`);
    sk.dim({ x: f.run + Lt, y: y0 + f.rise }, { x: f.run + Lt, y: f.k + f.rise }, -6, mm(f.t));
    sk.label(B(slope * 0.5, ob), { x: f.run * 0.75, y: y0 - sk.p(10) }, tr('plan.det.w.stairMain', { d, dd: v.ties.stair }));
    return { sk, params: { ld: L.ld, d, t: f.t } };
  }),

  detail('stair-foot', 'E-02', 'stairs', 'stairs', (v, tr) => {
    const n = 3, f = flight(v, n), c = v.cover.stair, d = mainBar(v, 'stair'), L = barLengths(v, d), sk = new Sketch(10), hb = v.size.beam.h, bw = v.size.beam.b;
    sk.poly([{ x: -bw, y: f.k }, { x: 0, y: f.k }, ...f.steps.slice(1)]);
    sk.poly([{ x: f.run, y: f.k - f.t + f.rise }, { x: 0, y: f.k - f.t }, { x: 0, y: f.k - hb }, { x: -bw, y: f.k - hb }, { x: -bw, y: f.k }]);
    sk.breakLine({ x: f.run, y: f.k - f.t + f.rise - sk.p(1.5) }, { x: f.run, y: f.k + f.rise + sk.p(1.5) });
    const y0 = f.k - f.t, ob = c + d / 2, cb = v.cover.beam + v.ties.beam;
    const B = (s: number, off: number) => { const p = along(f.a, s, off); return { x: p.x, y: p.y + y0 }; };
    const slope = Math.hypot(f.run, f.rise);
    sk.bar([B(slope, ob), B(0, ob), { x: -bw + cb + d, y: y0 + ob - 0 }, { x: -bw + cb + d, y: y0 + ob + Math.min(200, f.t) }], d);
    sk.bar([B(L.ld, f.t - ob), { x: -bw + cb + d, y: f.k - ob }, { x: -bw + cb + d, y: f.k - ob - Math.min(300, hb - 2 * cb) }], d);
    const t = v.ties.beam;
    sk.tie([{ x: -bw + v.cover.beam, y: f.k - v.cover.beam }, { x: -v.cover.beam, y: f.k - v.cover.beam }, { x: -v.cover.beam, y: f.k - hb + v.cover.beam }, { x: -bw + v.cover.beam, y: f.k - hb + v.cover.beam }], t, true);
    sk.dim(B(0, f.t), B(L.ld, f.t), 6, `ld = ${mm(L.ld)}`);
    sk.label({ x: -bw / 2, y: f.k - hb / 2 }, { x: -bw - sk.p(10), y: f.k - hb - sk.p(4) }, tr('plan.det.w.stairSupport'));
    return { sk, params: { ld: L.ld, d } };
  }),

  detail('stair-landing', 'E-03', 'stairs', 'stairs', (v, tr) => {
    const n = 3, f = flight(v, n), c = v.cover.stair, d = mainBar(v, 'stair'), L = barLengths(v, d), sk = new Sketch(10), Lt = Math.max(1000, L.ld + 300);
    sk.poly([...f.steps, { x: f.run + Lt, y: f.k + f.rise }]);
    sk.poly([{ x: 0, y: f.k - f.t }, { x: f.run, y: f.k - f.t + f.rise }, { x: f.run + Lt, y: f.k - f.t + f.rise }]);
    sk.breakLine({ x: 0, y: f.k - f.t - sk.p(1.5) }, { x: 0, y: f.k + sk.p(1.5) }).breakLine({ x: f.run + Lt, y: f.k - f.t + f.rise - sk.p(1.5) }, { x: f.run + Lt, y: f.k + f.rise + sk.p(1.5) });
    const y0 = f.k - f.t, ob = c + d / 2, slope = Math.hypot(f.run, f.rise);
    const B = (s: number, off: number) => { const p = along(f.a, s, off); return { x: p.x, y: p.y + y0 }; };
    // At the re-entrant knee the bottom bars cross: neither follows the inside corner.
    const e = (f.t - 2 * ob - d) / Math.sin(f.a), top = B(slope + e, ob);
    sk.bar([B(0, ob), top, { x: top.x + L.ld / 2, y: top.y }], d);
    sk.bar([{ x: f.run + Lt, y: y0 + f.rise + ob + 1.2 * d }, { x: f.run - L.ld, y: y0 + f.rise + ob + 1.2 * d }], d);
    sk.bar([B(slope - L.ld, f.t - ob), { x: f.run, y: f.k + f.rise - ob }, { x: f.run + Lt, y: f.k + f.rise - ob }], d);
    sk.dim({ x: f.run, y: y0 + f.rise }, { x: f.run + L.ld, y: y0 + f.rise }, -8, `ld = ${mm(L.ld)}`);
    sk.label({ x: f.run, y: y0 + f.rise + ob }, { x: f.run + Lt * 0.6, y: y0 + f.rise - sk.p(12) }, tr('plan.det.w.crossed'));
    return { sk, params: { ld: L.ld, d } };
  }),

  detail('ramp', 'E-04', 'stairs', 'stairs', (v, tr) => {
    const t = v.size.slab, c = v.cover.slab, d = mainBar(v, 'slab'), L = barLengths(v, d), sk = new Sketch(50), p1 = 0.12, run = 4000, flat = 2000;
    const A: P = { x: 0, y: 0 }, K: P = { x: run, y: run * p1 }, E: P = { x: run + flat, y: run * p1 };
    sk.poly([{ x: -flat, y: t }, { x: A.x, y: A.y + t }, { x: K.x, y: K.y + t }, { x: E.x, y: E.y + t }]).poly([{ x: -flat, y: 0 }, A, K, E]);
    sk.breakLine({ x: -flat, y: -sk.p(1.5) }, { x: -flat, y: t + sk.p(1.5) }).breakLine({ x: E.x, y: E.y - sk.p(1.5) }, { x: E.x, y: E.y + t + sk.p(1.5) });
    sk.bar([{ x: -flat, y: c }, { x: 0, y: c }, { x: K.x, y: K.y + c }, { x: E.x, y: E.y + c }], d);
    sk.bar([{ x: -flat, y: t - c }, { x: 0, y: t - c }, { x: K.x, y: K.y + t - c }, { x: E.x, y: E.y + t - c }], d);
    sk.bar([{ x: K.x - L.ld, y: K.y - L.ld * p1 + c + 1.2 * d }, { x: K.x + L.ld, y: K.y + c + 1.2 * d }], d);
    sk.text(run / 2, run * p1 / 2 + t + sk.p(5), `${Math.round(p1 * 100)} %`, 2.5, 'center');
    sk.dim({ x: K.x, y: K.y }, { x: K.x + L.ld, y: K.y }, -6, `ld = ${mm(L.ld)}`);
    sk.label({ x: K.x, y: K.y + c }, { x: K.x - 600, y: K.y - sk.p(12) }, tr('plan.det.w.slopeChange'));
    return { sk, params: { ld: L.ld, d } };
  }),

  detail('stair-steps', 'E-05', 'stairs', 'stairs', (v, tr) => {
    const n = 3, f = flight(v, n), c = v.cover.stair, d = mainBar(v, 'stair'), dd = v.ties.stair, sk = new Sketch(10);
    sk.poly(f.steps).poly([{ x: 0, y: f.k - f.t }, { x: f.run, y: f.k - f.t + f.rise }]);
    sk.breakLine({ x: 0, y: f.k - f.t - sk.p(1.5) }, { x: 0, y: f.k + sk.p(1.5) }).breakLine({ x: f.run, y: f.k - f.t + f.rise - sk.p(1.5) }, { x: f.run, y: f.k + f.rise + sk.p(1.5) });
    sk.hidden([{ x: 0, y: f.k }, { x: f.run, y: f.k + f.rise }]);
    const y0 = f.k - f.t, slope = Math.hypot(f.run, f.rise);
    const B = (s: number, off: number) => { const p = along(f.a, s, off); return { x: p.x, y: p.y + y0 }; };
    sk.bar([B(0, c + d / 2), B(slope, c + d / 2)], d);
    for (let s = 100; s < slope; s += 200) { const p = B(s, c + d + dd / 2); sk.dot(p.x, p.y, dd); }
    // A bar in each step's nose, tied to a bent bar into the waist.
    for (let i = 0; i < n; i++) {
      const nose = { x: (i + 1) * f.g - c - dd / 2, y: f.k + (i + 1) * f.r - c - dd / 2 };
      sk.dot(nose.x, nose.y, dd);
      const foot = B(((i + 1) * f.g - f.g / 2) / Math.cos(f.a), f.t - c);
      sk.tie([foot, { x: nose.x - f.g * 0.5, y: nose.y }, nose, { x: nose.x, y: foot.y + 20 }], dd);
    }
    sk.label({ x: f.g - c, y: f.k + f.r - c }, { x: f.run + sk.p(8), y: f.k + f.rise + sk.p(6) }, tr('plan.det.w.nose', { d: dd }));
    return { sk, params: { r: mm(f.r), g: mm(f.g), dd } };
  }),
];
