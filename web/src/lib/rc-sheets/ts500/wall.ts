import { wallVerticalBars } from '../../engine/detailing/wall-member';
import { barArea, roundDown } from '../bars';
import type { Fmt } from '../format';
import { wallLabel, type WallContext, type WallDemand, type WallRow } from '../wall-row';
import { check, ratioOf, type CheckLine, type ComboTable, type Step, type StepGroup, type WallAdopted } from '../types';
import { toConfirm as U, ts500Mat, vcrOf, vmaxOf, type Ts500Mat } from './basis';
import { axialLimits, capacityAt, type RectSection } from './biaxial';
import { stripCapacity } from './section';
import { materialSteps } from './steps';

const RHO_MIN = 0.0025, S_MAX = 0.3, T_MIN = 0.15;

const rhoOf = (m: { diameter: number; spacing: number }, curtains: number, t: number) => (m.spacing > 0 ? curtains * barArea(m.diameter) * 1e-4 / (m.spacing * t) : 0);

const ok1 = (v: number) => v <= 1 + 1e-6;

function atAxial(sec: RectSection, t: Ts500Mat, theta: number, n: number, m: number): number {
  const lim = axialLimits(sec, t);
  if (n > lim.max) return n / Math.max(lim.max, 1e-9);
  if (n < lim.min) return n / Math.min(lim.min, -1e-9);
  if (m < 1e-6) return n >= 0 ? n / Math.max(lim.max, 1e-9) : n / Math.min(lim.min, -1e-9);
  const p = capacityAt(sec, t, theta, n);
  const cap = p ? Math.abs(theta === 0 ? p.my : p.mx) : 0;
  return cap > 1e-9 ? m / cap : Number.POSITIVE_INFINITY;
}

interface Eval { pm: number[]; out: number[]; shear: number[]; vr: number[]; rhoL: number; rhoT: number; rhoTShear: number }

function evaluate(d: WallDemand, c: WallContext, t: Ts500Mat, a: WallAdopted): Eval {
  const dv = 0.8 * d.length;
  const rhoL = rhoOf(a.vertical, a.curtains, d.thickness), rhoT = rhoOf(a.horizontal, a.curtains, d.thickness);
  const r = { vertical: a.vertical, horizontal: a.horizontal, curtains: a.curtains, ...(a.boundary && a.boundary.count > 0 ? { boundary: a.boundary } : {}) };
  const inPlane: RectSection = { b: d.length, h: d.thickness, bars: wallVerticalBars(d.length, d.thickness, c.cover, r) };
  const hd = a.horizontal.diameter / 1000, vd = a.vertical.diameter / 1000;
  const yv = d.thickness / 2 - c.cover - hd - vd / 2;
  const strip: RectSection = { b: 1, h: d.thickness, bars: (a.curtains === 2 ? [-yv, yv] : [0]).map((y) => ({ x: 0, y, area: barArea(a.vertical.diameter) * 1e-4 / a.vertical.spacing })) };
  const dh = a.curtains === 2 ? d.thickness - c.cover - hd / 2 : d.thickness / 2;
  const mrH = stripCapacity({ b: 1, h: d.thickness, layers: [{ depth: dh, area: barArea(a.horizontal.diameter) * 1e-4 / a.horizontal.spacing }] }, t, 0);
  const pm = d.combos.map((k) => atAxial(inPlane, t, 0, k.pu, Math.abs(k.mu)));
  const out = d.combos.map((k) => Math.max(atAxial(strip, t, Math.PI / 2, k.pu / Math.max(d.length, 1e-6), Math.abs(k.muV)), Math.abs(k.muH) > 1e-6 ? ratioOf(k.muH, mrH) : 0));
  const sw = a.horizontal.spacing > 0 ? a.curtains * barArea(a.horizontal.diameter) * 1e-4 / a.horizontal.spacing : 0;
  const vr = d.combos.map((k) => Math.min(0.8 * vcrOf(t, d.thickness, dv, k.pu, d.length * d.thickness) + sw * t.fyd * 1000 * dv, vmaxOf(t, d.thickness, dv)));
  const shear = d.combos.map((k, i) => ratioOf(k.vu, vr[i]!));
  const rhoTShear = Math.max(0, ...d.combos.map((k) => Math.max(0, k.vu - 0.8 * vcrOf(t, d.thickness, dv, k.pu, d.length * d.thickness)) / (t.fyd * 1000 * d.thickness * dv)));
  return { pm, out, shear, vr, rhoL, rhoT, rhoTShear };
}

export function wallRow(d: WallDemand, c: WallContext, adopted: WallAdopted | undefined, fmt: Fmt): WallRow {
  const t = ts500Mat(c.mat);
  const curtains: 1 | 2 = 2;
  const meshFor = (dia: number, rho: number) => ({ diameter: dia, spacing: roundDown(Math.max(0.075, Math.min(S_MAX, curtains * barArea(dia) * 1e-4 / Math.max(rho * d.thickness, 1e-9)))) });
  const probe = evaluate(d, c, t, { vertical: { diameter: c.barDia, spacing: 0.2 }, horizontal: { diameter: c.barDia, spacing: 0.2 }, curtains });
  let a: WallAdopted = { vertical: meshFor(c.barDia, RHO_MIN), horizontal: meshFor(c.barDia, Math.max(RHO_MIN, probe.rhoTShear)), curtains };
  let iterations = 0;
  let e = evaluate(d, c, t, a);
  const boundaries = [12, 16, 20, 25].flatMap((diameter) => [2, 4, 6, 8, 10, 12].map((count) => ({ count, diameter })))
    .sort((p, q) => p.count * barArea(p.diameter) - q.count * barArea(q.diameter));
  while (iterations < 12) {
    if (e.pm.every(ok1) && e.out.every(ok1) && e.shear.every(ok1) && e.rhoL >= RHO_MIN - 1e-9 && e.rhoT >= RHO_MIN - 1e-9) break;
    iterations++;
    if (!e.pm.every(ok1)) {
      const cur = a.boundary ? a.boundary.count * barArea(a.boundary.diameter) : 0;
      const next = boundaries.find((b) => b.count * barArea(b.diameter) > cur + 1e-9);
      a = next ? { ...a, boundary: next } : { ...a, vertical: { ...a.vertical, spacing: roundDown(Math.max(0.075, a.vertical.spacing - 0.025)) } };
    }
    if (!e.out.every(ok1) || e.rhoL < RHO_MIN - 1e-9) a = { ...a, vertical: a.vertical.spacing > 0.1 + 1e-9 ? { ...a.vertical, spacing: roundDown(a.vertical.spacing - 0.025) } : { diameter: nextDia(a.vertical.diameter), spacing: a.vertical.spacing } };
    if (!e.shear.every(ok1) || e.rhoT < RHO_MIN - 1e-9) a = { ...a, horizontal: a.horizontal.spacing > 0.1 + 1e-9 ? { ...a.horizontal, spacing: roundDown(a.horizontal.spacing - 0.025) } : { diameter: nextDia(a.horizontal.diameter), spacing: a.horizontal.spacing } };
    e = evaluate(d, c, t, a);
  }
  const proposed = a;
  const ad = adopted ?? proposed;
  const ev = adopted ? evaluate(d, c, t, ad) : e;
  const worst = (xs: number[]) => xs.reduce((w, x, i) => (x > xs[w]! ? i : w), 0);
  const ipm = worst(ev.pm), iout = worst(ev.out), ish = worst(ev.shear);
  const vuMax = Math.max(0, ...d.combos.map((k) => k.vu));
  const vrMin = Math.min(Infinity, ...ev.vr);

  const verifications: CheckLine[] = [
    ...((d.baseElements ?? 2) < 2 ? [check('rcSheets.v.wallMesh', false, { clause: '', demand: String(d.baseElements ?? 0), capacity: '≥ 2' })] : []),
    ...(d.base && d.base.held < d.base.nodes ? [check('rcSheets.v.wallBase', false, { clause: '', demand: `${d.base.held} / ${d.base.nodes}`, capacity: `${d.base.nodes} / ${d.base.nodes}` })] : []),
    check('rcSheets.v.wallPM', ev.pm.every(ok1), { clause: '7.1', demand: d.combos[ipm]?.combo ?? '', ratio: Math.max(0, ...ev.pm) }),
    check(U('rcSheets.v.wallShear'), ev.shear.every(ok1), { clause: '8.1', demand: `${fmt(vuMax)} kN`, capacity: `${fmt(Number.isFinite(vrMin) ? vrMin : 0)} kN`, ratio: Math.max(0, ...ev.shear) }),
    check('rcSheets.v.wallOut', ev.out.every(ok1), { clause: '7.1', demand: d.combos[iout]?.combo ?? '', ratio: Math.max(0, ...ev.out) }),
    check(U('rcSheets.v.wallRhoL'), ev.rhoL >= RHO_MIN - 1e-9, { clause: 'TS 500', demand: `${fmt(RHO_MIN * 100, 3)} %`, capacity: `${fmt(ev.rhoL * 100, 3)} %`, ratio: ratioOf(RHO_MIN, ev.rhoL) }),
    check(U('rcSheets.v.wallRhoT'), ev.rhoT >= Math.max(RHO_MIN, ev.rhoTShear) - 1e-9, { clause: '8.1', demand: `${fmt(Math.max(RHO_MIN, ev.rhoTShear) * 100, 3)} %`, capacity: `${fmt(ev.rhoT * 100, 3)} %`, ratio: ratioOf(Math.max(RHO_MIN, ev.rhoTShear), ev.rhoT) }),
    check(U('rcSheets.v.wallSpacing'), ad.vertical.spacing <= S_MAX + 1e-6 && ad.horizontal.spacing <= S_MAX + 1e-6, { clause: 'TS 500', capacity: `V, H ≤ ${fmt(S_MAX * 100, 0)} cm` }),
    check(U('rcSheets.v.wallThickness'), d.thickness >= T_MIN - 1e-6, { clause: 'TS 500', demand: `${fmt(d.thickness * 100, 0)} cm`, capacity: `≥ ${fmt(T_MIN * 100, 0)} cm` }),
  ];
  const allOk = verifications.every((v) => v.ok);
  const generous = ev.rhoL > 1.2 * RHO_MIN + 1e-6 && ev.rhoT > 1.2 * Math.max(RHO_MIN, ev.rhoTShear) + 1e-6 && Math.max(0, ...ev.pm, ...ev.shear, ...ev.out) < 0.5;

  const combos: ComboTable = {
    headers: ['Nd', 'Md', 'Vd', 'Mv', 'Mh'],
    rows: d.combos.map((k, i) => {
      const ratio = Math.max(ev.pm[i] ?? 0, ev.shear[i] ?? 0, ev.out[i] ?? 0);
      return { combo: k.combo, values: [fmt(k.pu, 1), fmt(k.mu, 1), fmt(k.vu, 1), fmt(k.muV, 1), fmt(k.muH, 1)], ratio, ok: ratio <= 1 + 1e-6 };
    }),
  };
  const boundaryLabel = ad.boundary && ad.boundary.count > 0 ? `${ad.boundary.count} Ø${ad.boundary.diameter}` : '—';
  const steps: StepGroup[] = [
    {
      title: 'rcSheets.g.data',
      steps: [
        { label: 'rcSheets.s.wallGeometry', formula: 'ℓw × hw × t', value: `${fmt(d.length)} × ${fmt(d.height)} m × ${fmt(d.thickness * 100, 0)} cm` },
        ...materialSteps(t, fmt),
        { label: 'rcSheets.s.wallBase', formula: 'N = −Σσvv·t·w; M = Σ(N·e); V = Στ·t·w', value: '' },
        { label: 'rcSheets.s.vu', formula: 'Vd', value: `${fmt(vuMax)} kN (${d.combos[ish]?.combo ?? ''})` },
        { label: 'rcSheets.ts500.s.wallScope', value: '' },
      ],
    },
    {
      title: 'rcSheets.g.wallShear',
      steps: [
        { label: 'rcSheets.ts500.s.vcr', formula: 'Vcr = 0.65·fctd·t·d·(1 + 0.07·Nd/Ac); d = 0.8·ℓw', value: '' },
        { label: 'rcSheets.s.wallRhoTReq', formula: 'ρh ≥ (Vd − 0.8·Vcr)/(fywd·t·d)', value: `${fmt(ev.rhoTShear * 100, 3)} %` },
        { label: 'rcSheets.s.wallMin', formula: 'ρv,min · ρh,min', value: `${fmt(RHO_MIN * 100, 3)} · ${fmt(RHO_MIN * 100, 3)} %` },
        { label: 'rcSheets.s.wallVn', formula: 'Vr = min(0.8·Vcr + ρh·fywd·t·d; 0.22·fcd·t·d)', value: `${fmt(Number.isFinite(vrMin) ? vrMin : 0)} kN`, ok: ev.shear.every(ok1) },
      ],
    },
    {
      title: 'rcSheets.g.wallFlexure',
      steps: [
        { label: 'rcSheets.ts500.s.method', formula: 'εcu = 3 ‰; 0.85·fcd over k1·c; σs = Es·εs ≤ fyd (7.1)', value: '' },
        { label: 'rcSheets.s.wallBoundary', formula: 'As (Nd, Md)', value: boundaryLabel },
        { label: 'rcSheets.s.wallPM', formula: 'Mr(Nd) ≥ Md', value: `${fmt(Math.max(0, ...ev.pm), 3)} (${d.combos[ipm]?.combo ?? ''})`, ok: ev.pm.every(ok1) },
        { label: 'rcSheets.s.wallOut', formula: 'Mv, Mh ≤ Mr (b = 1 m)', value: `${fmt(Math.max(0, ...ev.out), 3)}`, ok: ev.out.every(ok1) },
      ],
    },
    {
      title: 'rcSheets.g.proposal',
      steps: [
        { label: 'rcSheets.s.adopted', formula: wallLabel(ad), value: '' } as Step,
        adopted ? { label: 'rcSheets.s.adoptedByUser', value: '' } : { label: 'rcSheets.s.iterations', formula: 'ρmin → As,ends → (Nd, Md), Vd, (Mv, Mh)', value: String(iterations) },
      ],
    },
  ];

  return {
    family: 'wall', key: d.key, name: d.name, level: d.level, length: d.length, height: d.height, thickness: d.thickness, demand: d,
    req: { rhoL: RHO_MIN, rhoT: Math.max(RHO_MIN, ev.rhoTShear), sMaxV: S_MAX, sMaxH: S_MAX, curtains, boundary: proposed.boundary ? `${proposed.boundary.count} Ø${proposed.boundary.diameter}` : '—' },
    proposed, adopted: ad, isAdopted: !!adopted, iterations: adopted ? 0 : iterations, verifications, combos,
    utilization: Math.max(0, ...ev.pm, ...ev.shear, ...ev.out),
    status: allOk ? (generous ? 'warn' : 'ok') : 'fail', generous, steps,
  };
}

const nextDia = (d: number) => [8, 10, 12, 16, 20, 25].find((x) => x > d) ?? d;
