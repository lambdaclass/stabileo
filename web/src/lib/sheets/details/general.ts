/**
 * General details, read before any other: standard hooks, the lap splice, bending mandrels,
 * covers with their spacers, and the clear spacing between bars.
 */
import { standardHook } from '../../codes/cirsoc201/bar-geometry';
import { detail, type DetailDef } from './def';
import { COVER, mm, Sketch, TXT } from './sketch';
import { barLengths, mainBar, tieHook } from './values';

export const GENERAL: DetailDef[] = [
  detail('hooks', 'G-01', 'general', 'details', (v, tr) => {
    const d = mainBar(v, 'beam'), sk = new Sketch(10);
    let x = 0;
    for (const angle of [90, 180] as const) {
      const h = standardHook(d, angle, 'longitudinal'), r = h.centrelineRadius * 1000, ext = h.extension * 1000, run = 12 * d + 60;
      sk.hooked({ x, y: 0 }, 0, run, r, angle, ext, 1, d);
      const tail = angle === 90 ? [{ x: x + run + r, y: r }, { x: x + run + r, y: r + ext }] : [{ x: x + run, y: 2 * r }, { x: x + run - ext, y: 2 * r }];
      sk.dim(tail[0]!, tail[1]!, angle === 90 ? -6 : 6, mm(ext));
      sk.text(x, -sk.p(7), tr('plan.detail.hookAt', { angle, d, D: mm(h.mandrelDiameter * 1000) }));
      x += run + 2 * r + ext + sk.p(18);
    }
    const t = tieHook(v.ties.beam);
    return { sk, params: { d, t: v.ties.beam, ext: t.ext } };
  }),

  detail('lap', 'G-02', 'general', 'details', (v, tr) => {
    const d = mainBar(v, 'beam'), L = barLengths(v, d), sk = new Sketch(20), y2 = Math.max(d * 1.2, sk.p(1.4));
    sk.bar([{ x: 0, y: 0 }, { x: L.lap + 600, y: 0 }], d).bar([{ x: 600, y: y2 }, { x: L.lap + 1200, y: y2 }], d);
    sk.dim({ x: 600, y: 0 }, { x: L.lap + 600, y: 0 }, -6, `lst = ${mm(L.lap)}`);
    sk.dim({ x: 600, y: y2 }, { x: L.lap + 600, y: y2 }, 6, `lst,sup = ${mm(L.lapTop)}`);
    sk.text(0, sk.p(9), tr('plan.det.w.barDia', { d }), 2.2);
    return { sk, params: { d, lap: L.lap, lapTop: L.lapTop, ld: L.ld } };
  }),

  detail('mandrels', 'G-03', 'general', 'details', (v, tr) => {
    const ds = [...new Set([...v.bars.beam, ...v.bars.column, ...v.bars.slab])].sort((a, b) => a - b).slice(0, 5);
    const sk = new Sketch(10);
    let x = 0;
    for (const d of ds) {
      const h = standardHook(d, 90, 'longitudinal'), r = h.centrelineRadius * 1000, D = h.mandrelDiameter * 1000;
      sk.hooked({ x, y: 0 }, 0, 6 * d + 40, r, 90, 6 * d + 40, 1, d);
      sk.ps.push({ kind: 'circle', layer: COVER, c: { x: x + 6 * d + 40, y: r }, r: D / 2 });
      sk.text(x, -sk.p(6), `Ø${d}`, 2.5).text(x, -sk.p(10), tr('plan.det.w.mandrel', { D: mm(D) }), 2);
      x += 12 * d + 80 + 2 * r + sk.p(16);
    }
    const tie = tieHook(v.ties.column);
    return { sk, params: { t: v.ties.column, D: tie.mandrel } };
  }),

  detail('covers', 'G-04', 'general', 'details', (v, tr) => {
    const { b, h } = v.size.beam, c = v.cover.beam, t = v.ties.beam, d = mainBar(v, 'beam'), sk = new Sketch(5);
    sk.rect(0, 0, b, h);
    sk.hoop(c + t / 2, c + t / 2, b - c - t / 2, h - c - t / 2, t, tieHook(t).ext);
    sk.hoopBars(c + t / 2, c + t / 2, b - c - t / 2, h - c - t / 2, t, d, 3, 2);
    // Spacers under the bottom tie and on the sides.
    for (const x of [b * 0.25, b * 0.75]) sk.poly([{ x: x - 15, y: 0 }, { x: x + 15, y: 0 }, { x: x + 10, y: c }, { x: x - 10, y: c }], TXT, true);
    sk.poly([{ x: b, y: h * 0.5 - 15 }, { x: b, y: h * 0.5 + 15 }, { x: b - c, y: h * 0.5 + 10 }, { x: b - c, y: h * 0.5 - 10 }], TXT, true);
    sk.dim({ x: 0, y: h }, { x: c, y: h }, 6, mm(c)).dim({ x: 0, y: 0 }, { x: 0, y: c }, 6, mm(c));
    sk.dim({ x: 0, y: 0 }, { x: b, y: 0 }, -10, mm(b)).dim({ x: b, y: 0 }, { x: b, y: h }, -8, mm(h));
    sk.label({ x: b * 0.25, y: c / 2 }, { x: b + sk.p(14), y: -sk.p(4) }, tr('plan.det.w.spacer'));
    const rows = (['slab', 'beam', 'column', 'wall', 'footing', 'stair'] as const).map((k) => `${tr(`plan.det.kind.${k}`)} ${v.cover[k]} mm`);
    rows.forEach((r, i) => sk.text(b + sk.p(14), h - sk.p(4 + i * 4.2), r, 2.2));
    return { sk, params: { c } };
  }),

  detail('spacing', 'G-05', 'general', 'details', (v, tr) => {
    const d = mainBar(v, 'beam'), s = Math.max(25, d), sk = new Sketch(2), y = 0;
    for (let i = 0; i < 3; i++) sk.dot(i * (s + d), y, d);
    sk.dim({ x: d / 2, y: y + d / 2 }, { x: s + d / 2, y: y + d / 2 }, 6, `s ≥ ${mm(s)}`);
    sk.dim({ x: -d / 2, y: -d / 2 }, { x: d / 2, y: -d / 2 }, -5, `Ø${d}`);
    // Two layers: the clear distance between them.
    const y2 = -(d + 25);
    for (let i = 0; i < 3; i++) sk.dot(i * (s + d), y2 - d, d);
    sk.dim({ x: 2 * (s + d) + d / 2, y: y2 - d / 2 }, { x: 2 * (s + d) + d / 2, y: -d / 2 }, -6, '≥ 25');
    sk.text(-d / 2, y - d / 2 - sk.p(30), tr('plan.det.w.aggregate'), 2);
    return { sk, params: { d, s } };
  }),
];

