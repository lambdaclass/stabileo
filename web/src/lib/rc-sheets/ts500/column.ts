import { roundDown } from '../bars';
import { columnLabel, tieLabel, type ColumnContext, type ColumnDemand, type ColumnRow, type StackPlace } from '../column-row';
import type { Fmt } from '../format';
import { check, ratioOf, type CheckLine, type ColumnAdopted, type ComboTable, type Step, type StepGroup } from '../types';
import { lapOf, lbOf, toConfirm as U, ts500Mat, type Ts500Mat } from './basis';
import {
  anyTension, areaOf, axis, clearOk, crosstiesOf, evenLayout, governing, sectionOf, shearRatios, tieDiaFor, tieMaxOf, tuplesOf, utilOf,
  type AxisResult, type CaseResult, type Tuple,
} from './column-design';
import { materialSteps } from './steps';

const RHO_MIN = 0.01, RHO_MAX = 0.04, MIN_DIA = 14;

const grow = (d: ColumnDemand, a: ColumnAdopted): ColumnAdopted =>
  d.h >= d.b ? (a.ny <= a.nx ? { ...a, ny: a.ny + 1 } : { ...a, nx: a.nx + 1 }) : (a.nx <= a.ny ? { ...a, nx: a.nx + 1 } : { ...a, ny: a.ny + 1 });

function withTies(a: ColumnAdopted, dia: number): ColumnAdopted {
  return { ...a, tieDia: tieDiaFor(dia), tieSpacing: roundDown(tieMaxOf(dia)) };
}

function shearFix(d: ColumnDemand, c: ColumnContext, t: Ts500Mat, a0: ColumnAdopted): { a: ColumnAdopted; it: number } {
  let a = a0, it = 0;
  for (let guard = 0; guard < 40; guard++) {
    const sh = shearRatios(d, c, t, a, crosstiesOf(d, a, c));
    if (sh.every((x) => x.x <= 1 + 1e-6 && x.y <= 1 + 1e-6)) break;
    it++;
    if (a.tieSpacing > 0.075 + 1e-9) a = { ...a, tieSpacing: roundDown(a.tieSpacing - 0.025) };
    else if (a.tieDia < 12) a = { ...a, tieDia: a.tieDia + 2, tieSpacing: Math.min(0.15, roundDown(tieMaxOf(Math.min(a.corner, a.dx, a.dy)))) };
    else break;
  }
  return { a, it };
}

function propose(d: ColumnDemand, c: ColumnContext, t: Ts500Mat, ast: number, dias: readonly number[], demands: Tuple[], pattern?: StackPlace['pattern']): { layout: ColumnAdopted; iterations: number } {
  const fits = (a: ColumnAdopted) => areaOf(a) >= ast - 1e-6 && clearOk(d, c, a) && crosstiesOf(d, a, c).ok && (!demands.length || utilOf(sectionOf(d, a, c), t, demands) <= 1 + 1e-6);
  if (pattern) {
    for (const dia of [...dias].filter((x) => x <= pattern.maxDia).sort((p, q) => p - q)) {
      const a = withTies({ corner: dia, nx: pattern.nx, dx: dia, ny: pattern.ny, dy: dia, tieDia: 0, tieSpacing: 0 }, dia);
      if (!fits(a)) continue;
      const s = shearFix(d, c, t, a);
      if (shearRatios(d, c, t, s.a, crosstiesOf(d, s.a, c)).every((x) => x.x <= 1 + 1e-6 && x.y <= 1 + 1e-6)) return { layout: s.a, iterations: s.it };
    }
  }
  const ok: Array<{ a: ColumnAdopted; it: number }> = [];
  for (const dia of dias) {
    let a = withTies(evenLayout(d, c, dia, tieDiaFor(dia), 0.3), dia);
    let it = 0;
    for (let guard = 0; guard < 20 && areaOf(a) < ast - 1e-6; guard++) a = grow(d, a);
    if (!clearOk(d, c, a)) continue;
    while (demands.length && utilOf(sectionOf(d, a, c), t, demands) > 1 + 1e-6 && it < 8) {
      const g = grow(d, a);
      if (!clearOk(d, c, g)) break;
      a = g; it++;
    }
    if (!fits(a)) continue;
    const s = shearFix(d, c, t, a);
    ok.push({ a: s.a, it: it + s.it });
  }
  if (ok.length) {
    const least = Math.min(...ok.map((x) => areaOf(x.a)));
    const pick = ok.filter((x) => areaOf(x.a) <= 1.1 * least + 1e-6).sort((p, q) => p.a.nx + p.a.ny - (q.a.nx + q.a.ny) || areaOf(p.a) - areaOf(q.a))[0]!;
    return { layout: pick.a, iterations: pick.it };
  }
  const dia = dias[dias.length - 1] ?? 25;
  return { layout: withTies(evenLayout(d, c, dia, tieDiaFor(dia), 0.15), dia), iterations: 0 };
}

export function columnRow(d: ColumnDemand, c: ColumnContext, adopted: ColumnAdopted | undefined, fmt: Fmt, stack: StackPlace = {}): ColumnRow {
  const t = ts500Mat(c.mat);
  const Ag = d.b * d.h;
  const results: CaseResult[] = d.cases.map((cs) => {
    const x = axis(d, t, cs, 'x'), y = axis(d, t, cs, 'y');
    return { c: cs, x, y, tuples: tuplesOf(cs, x, y), ratio: 0 };
  });
  const all = results.flatMap((r) => r.tuples);
  const demands = governing(all);
  const puMax = Math.max(0, ...d.cases.map((cs) => cs.pu));
  const nLimit = 0.9 * t.fcd * Ag * 1000;
  const lambdaMax = Math.max(0, ...results.flatMap((r) => [r.x.lambda, r.y.lambda]));
  const tension = anyTension(d, all);

  const pool = c.diameters.filter((x) => x >= MIN_DIA && x <= 32);
  const dias = pool.length ? pool : c.diameters.filter((x) => x >= 12 && x <= 32);
  const refDia = dias.includes(16) ? 16 : dias[0] ?? 16;
  const ref = evenLayout(d, c, refDia, tieDiaFor(refDia), 0.2);
  const refArea = areaOf(ref);
  const ratioAt = (ast: number) => {
    const sec = sectionOf(d, ref, c);
    return utilOf({ ...sec, bars: sec.bars.map((b) => ({ ...b, area: b.area * ast / refArea })) }, t, demands);
  };
  const lo0 = RHO_MIN * Ag * 1e4, hi0 = RHO_MAX * Ag * 1e4;
  let ast = lo0, impossible = false;
  if (demands.length && ratioAt(lo0) > 1) {
    if (ratioAt(hi0) > 1) { impossible = true; ast = hi0; }
    else {
      let lo = lo0, hi = hi0;
      for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (ratioAt(mid) <= 1) hi = mid; else lo = mid; }
      ast = hi;
    }
  }
  const first = propose(d, c, t, ast, dias, demands, stack.pattern);
  const proposed = first.layout;
  const a = adopted ?? proposed;
  const sec = sectionOf(d, a, c);
  results.forEach((r) => { r.ratio = utilOf(sec, t, r.tuples); });
  const ratio = Math.max(0, ...results.map((r) => r.ratio));
  const gov = results.reduce<CaseResult | undefined>((w, r) => (!w || r.ratio > w.ratio ? r : w), undefined);
  const area = areaOf(a);
  const rhoOk = area >= lo0 - 1e-6 && area <= hi0 + 1e-6;
  const spacingOk = clearOk(d, c, a);
  const longest = Math.max(a.corner, a.dx, a.dy), thinnest = Math.min(a.corner, a.nx > 0 ? a.dx : 99, a.ny > 0 ? a.dy : 99);
  const tieMax = tieMaxOf(thinnest);
  const tieDiaOk = a.tieDia >= tieDiaFor(longest);
  const tieOk = a.tieSpacing <= tieMax + 1e-6 && tieDiaOk;
  const ct = crosstiesOf(d, a, c);
  const sh = shearRatios(d, c, t, a, ct);
  const shearX = Math.max(0, ...sh.map((x) => x.x)), shearY = Math.max(0, ...sh.map((x) => x.y));
  const vxMax = Math.max(0, ...d.cases.map((cs) => cs.vx ?? 0)), vyMax = Math.max(0, ...d.cases.map((cs) => cs.vy ?? 0));
  const generous = area > 1.2 * ast + 1e-6 && ast > lo0 + 1e-6;
  const splice = tension ? lapOf(t, longest, false, 1) : lbOf(t, longest, false);
  const minDim = Math.min(d.b, d.h);

  const verifications: CheckLine[] = [
    check('rcSheets.v.biaxial', ratio <= 1 + 1e-6 && !impossible, { clause: '7.1', demand: gov?.c.combo ?? '', capacity: '', ratio }),
    check('rcSheets.ts500.v.axialLimit', puMax <= nLimit + 1e-6, { clause: '7.4.1', demand: `${fmt(puMax)} kN`, capacity: `${fmt(nLimit)} kN`, ratio: ratioOf(puMax, nLimit) }),
    check('rcSheets.ts500.v.colSize', minDim >= 0.25 - 1e-6 && Ag >= 0.075 - 1e-9, { clause: '7.4.1', demand: `${fmt(minDim * 100, 0)} cm · ${fmt(Ag * 1e4, 0)} cm²`, capacity: '≥ 25 cm · ≥ 750 cm²' }),
    check('rcSheets.v.rhoMin', area >= Math.max(ast, lo0) - 1e-6, { clause: '7.4.1', demand: `${fmt(Math.max(ast, lo0))} cm²`, capacity: `${fmt(area)} cm²`, ratio: ratioOf(Math.max(ast, lo0), area) }),
    check('rcSheets.v.rhoMax', area <= hi0 + 1e-6, { clause: '7.4.1', demand: `${fmt(area / (Ag * 1e4) * 100)} %`, capacity: '≤ 4 %' }),
    check(U('rcSheets.v.barDia'), thinnest >= MIN_DIA, { clause: '7.4', demand: `Ø${thinnest}`, capacity: `≥ Ø${MIN_DIA}` }),
    check(U('rcSheets.v.colSpacing'), spacingOk, { clause: '7.4', capacity: '≥ max(1.5·Ø; 40 mm)' }),
    check('rcSheets.v.slenderMax', lambdaMax <= 100 + 1e-9, { clause: '7.6', demand: `ℓk/i = ${fmt(lambdaMax, 1)}`, capacity: '≤ 100' }),
    check('rcSheets.v.shearX', shearX <= 1 + 1e-6, { clause: '8.1', demand: `${fmt(vxMax)} kN`, capacity: `${fmt(Math.min(...sh.map((x) => x.px)))} kN`, ratio: shearX }),
    check('rcSheets.v.shearY', shearY <= 1 + 1e-6, { clause: '8.1', demand: `${fmt(vyMax)} kN`, capacity: `${fmt(Math.min(...sh.map((x) => x.py)))} kN`, ratio: shearY }),
    check('rcSheets.v.tieDia', tieDiaOk, { clause: '7.4.1', demand: `Ø${a.tieDia}`, capacity: `≥ Ø${longest}/3 → Ø${tieDiaFor(longest)}` }),
    check('rcSheets.v.tieSpacing', a.tieSpacing <= tieMax + 1e-6, { clause: '7.4.1', demand: `${fmt(a.tieSpacing * 100, 1)} cm`, capacity: `≤ ${fmt(tieMax * 100, 1)} cm` }),
    check('rcSheets.v.crossties', ct.ok, { clause: '7.4.1', demand: '≤ 30 cm', capacity: `${ct.x} (b) · ${ct.y} (h)` }),
    ...(stack.fromBelow ? [check(U(tension ? 'rcSheets.v.colSpliceT' : 'rcSheets.v.colSpliceC'), true, { clause: '9.3', capacity: `${fmt(splice * 100, 0)} cm (Ø${longest})` })] : []),
  ];
  const ok = verifications.every((v) => v.ok) && !impossible;

  const combos: ComboTable = {
    headers: ['Nd', 'Mx', 'My', 'Vx', 'Vy'],
    rows: results.map((r, i) => {
      const tu = r.tuples.reduce((w, q) => (q.mx + q.my > w.mx + w.my ? q : w));
      const rr = Math.max(r.ratio, sh[i]?.x ?? 0, sh[i]?.y ?? 0);
      return { combo: r.c.combo, values: [fmt(r.c.pu, 1), fmt(tu.mx, 1), fmt(tu.my, 1), fmt(r.c.vx ?? 0, 1), fmt(r.c.vy ?? 0, 1)], ratio: rr, ok: rr <= 1 + 1e-6 };
    }),
  };

  const steps: StepGroup[] = [
    {
      title: 'rcSheets.g.data',
      steps: [
        { label: 'rcSheets.s.section', formula: 'b × h', value: `${fmt(d.b * 100, 0)} × ${fmt(d.h * 100, 0)} cm` },
        ...materialSteps(t, fmt),
        { label: 'rcSheets.s.height', formula: 'L · ℓn', value: `${fmt(d.length)} · ${fmt(d.lu)} m` },
        { label: 'rcSheets.s.psi', formula: 'α1 · α2', value: `${fmt(d.psiTop)} · ${fmt(d.psiBot)}` },
        { label: 'rcSheets.ts500.v.axialLimit', formula: 'Nd ≤ 0.9·fcd·Ac (7.4.1)', value: `${fmt(puMax, 1)} ≤ ${fmt(nLimit, 1)} kN`, ok: puMax <= nLimit + 1e-6 },
        { label: 'rcSheets.s.nonSway', value: '' },
      ],
    },
    ...(gov ? [slenderSteps(gov, fmt)] : []),
    {
      title: 'rcSheets.g.interaction',
      steps: [
        { label: 'rcSheets.ts500.s.method', formula: 'εcu = 3 ‰; 0.85·fcd over k1·c; σs = Es·εs ≤ fyd (7.1)', value: '' },
        { label: 'rcSheets.s.tuples', formula: (gov?.x.slender || gov?.y.slender) ? '(Nd, β·Mx, β·My), M ≥ Nd·emin' : '(Nd, Mx, My) i · j, M ≥ Nd·emin', value: String(all.length) },
        { label: 'rcSheets.ts500.s.emin', formula: 'emin = 15 mm + 0.03·h', value: `${fmt((gov?.x.emin ?? 0) * 1000, 0)} · ${fmt((gov?.y.emin ?? 0) * 1000, 0)} mm` },
        { label: 'rcSheets.s.rhoReq', formula: 'ρ = Ast/Ac (Nd, Mx, My)', value: `${fmt(ast / (Ag * 1e4) * 100, 2)} % → ${fmt(ast)} cm²`, ok: !impossible },
        { label: 'rcSheets.s.rhoLimits', formula: '0.01 ≤ ρ ≤ 0.04', value: `${fmt(area / (Ag * 1e4) * 100, 2)} %`, ok: rhoOk },
        { label: 'rcSheets.s.adopted', formula: columnLabel(a), value: `${fmt(area)} cm²`, ok: area >= ast - 1e-6 },
        { label: 'rcSheets.s.colSpacing', formula: 'max(1.5·Ø; 40 mm)', value: '', ok: spacingOk },
        { label: 'rcSheets.s.biaxial', formula: gov ? `${gov.c.combo}: Nd = ${fmt(gov.c.pu, 1)} kN` : '—', value: `${fmt(ratio, 3)}`, ok: ratio <= 1 + 1e-6 },
      ],
    },
    {
      title: 'rcSheets.g.ties',
      steps: [
        { label: 'rcSheets.s.tieDia', formula: 'Øt ≥ Øl,max/3 (7.4.1)', value: `Ø${a.tieDia}`, ok: tieDiaOk },
        { label: 'rcSheets.s.tieSpacing', formula: 's ≤ min(12·Øl,min; 200 mm) (7.4.1)', value: `${tieLabel(a)} ≤ ${fmt(tieMax * 100, 0)} cm`, ok: a.tieSpacing <= tieMax + 1e-6 },
        { label: 'rcSheets.s.crossties', formula: 's(held bars) ≤ 300 mm (7.4.1)', value: `${ct.x} (b) · ${ct.y} (h)`, ok: ct.ok },
        { label: 'rcSheets.s.colShear', formula: 'Vr = 0.8·Vcr(Nd) + Asw·fywd·d/s ≤ 0.22·fcd·bw·d', value: `${fmt(Math.max(shearX, shearY), 3)}`, ok: shearX <= 1 + 1e-6 && shearY <= 1 + 1e-6 },
        { label: U(tension ? 'rcSheets.v.colSpliceT' : 'rcSheets.v.colSpliceC'), formula: tension ? 'ℓo = 1.8·lb' : 'ℓo = lb', value: `${fmt(splice * 100, 0)} cm` },
      ],
    },
    {
      title: 'rcSheets.g.proposal',
      steps: [adopted ? { label: 'rcSheets.s.adoptedByUser', value: '' } : { label: 'rcSheets.s.iterations', formula: 'ρ → bars → (Nd, Mx, My) ≤ 1; Vd ≤ Vr', value: String(first.iterations) }],
    },
  ];

  return {
    family: 'column', key: d.key, name: d.name, level: d.level, b: d.b, h: d.h, length: d.length, cover: c.cover, demand: d,
    req: { rho: ast / (Ag * 1e4), ast, impossible, governing: gov?.c.combo ?? '', compressionDominated: !tension },
    proposed, adopted: a, isAdopted: !!adopted, iterations: adopted ? 0 : first.iterations,
    checks: { ratio, ok, area, spacingOk, tieOk, tieMax, crossties: { x: ct.x, y: ct.y }, rhoOk, shearX, shearY },
    verifications, combos,
    status: ok ? (generous ? 'warn' : 'ok') : 'fail', generous, steps,
  };
}

function slenderSteps(g: CaseResult, f: Fmt): StepGroup {
  const ax = (name: string, r: AxisResult): Step[] => [
    { label: 'rcSheets.s.slenderness', formula: `${name}: k = ${f(r.k, 2)}; ℓk/i = ℓk/(0.3·h)`, value: `${f(r.lambda, 1)} ≤ ${f(r.lim, 1)}?`, ok: !r.slender },
    { label: 'rcSheets.ts500.s.limit', formula: 'λ ≤ 34 − 12·M1/M2 (M1/M2 > 0 in single curvature)', value: `M1 = ${f(r.m1)} · M2 = ${f(r.m2)} kN·m` },
    ...(r.slender ? [{ label: 'rcSheets.s.magnifier', formula: 'β = Cm/(1 − 1.3·Nd/Nk) ≥ 1; Nk = π²·0.4·Ec·Ic/((1 + Rm)·ℓk²)', value: `Cm = ${f(r.cm, 2)} · Nk = ${f(r.nk, 0)} kN · β = ${f(r.beta, 3)}` }] : []),
  ];
  return { title: 'rcSheets.g.slenderness', steps: [{ label: 'rcSheets.s.governs', formula: '', value: g.c.combo }, ...ax('x', g.x), ...ax('y', g.y)] };
}
