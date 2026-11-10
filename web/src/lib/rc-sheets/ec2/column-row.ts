import { ec2ColumnSolve, type Ec2ColumnDemand, type Ec2ColumnInput, type Ec2DemandReading } from '../../engine/design/eurocode/ec2-column';
import { ec2CreepCoefficient } from '../../engine/design/eurocode/ec2-params';
import { barArea, roundDown } from '../bars';
import { columnArea, columnLabel, tieLabel, type ColumnContext, type ColumnDemand, type ColumnRow, type StackPlace } from '../column-row';
import type { Fmt } from '../format';
import { check, ratioOf, type CheckLine, type ColumnAdopted, type ComboTable, type Step, type StepGroup } from '../types';
import { lapLength, matOf, minClear, shearCapacity, type Ec2Set, type Mat } from './basis';

const KPA = 1000;
const RESTRAINED = 0.15;

const coverToBar = (c: ColumnContext, tie: number, dia: number) => c.cover + tie / 1000 + dia / 2000;

export function effectiveLength(lu: number, psiTop: number, psiBot: number): { l0: number; k1: number; k2: number } {
  const k1 = Math.max(0.1, psiTop / 2), k2 = Math.max(0.1, psiBot / 2);
  return { l0: 0.5 * lu * Math.sqrt((1 + k1 / (0.45 + k1)) * (1 + k2 / (0.45 + k2))), k1, k2 };
}

export const tieDiaMin = (longDia: number) => Math.max(6, longDia / 4);
const stockTie = (dia: number) => [6, 8, 10, 12].find((x) => x >= tieDiaMin(dia) - 1e-9) ?? 12;

export const tieSpacingMax = (thinnest: number, b: number, h: number) => Math.min((20 * thinnest) / 1000, Math.min(b, h), 0.4);
export const TIE_REDUCTION = 0.6;

export function heldBars(side: number, n: number, cornerDia: number, c: ColumnContext, tie: number): number[] {
  if (n <= 0) return [];
  const pitch = (side - 2 * coverToBar(c, tie, cornerDia)) / (n + 1);
  const out: number[] = [];
  let last = 0;
  for (let i = 1; i <= n; i++) if ((i - last) * pitch > RESTRAINED + 1e-9 && (n + 1 - i) * pitch > RESTRAINED + 1e-9) { out.push(i); last = i; }
  return out;
}

const crossties = (d: ColumnDemand, a: ColumnAdopted, c: ColumnContext) => ({ x: heldBars(d.b, a.nx, a.corner, c, a.tieDia).length, y: heldBars(d.h, a.ny, a.corner, c, a.tieDia).length });

function clearOk(d: ColumnDemand, c: ColumnContext, a: ColumnAdopted): boolean {
  const gap = (side: number, n: number, dia: number) => (side - 2 * coverToBar(c, a.tieDia, a.corner) - (n + 1) * dia / 1000) / (n + 1);
  const dx = Math.max(a.corner, a.dx), dy = Math.max(a.corner, a.dy);
  return gap(d.b, a.nx, dx) >= minClear(dx) - 1e-4 && gap(d.h, a.ny, dy) >= minClear(dy) - 1e-4;
}

function evenLayout(d: ColumnDemand, c: ColumnContext, dia: number, pitch: number): ColumnAdopted {
  const tie = stockTie(dia);
  const n = (side: number) => Math.max(0, Math.ceil((side - 2 * coverToBar(c, tie, dia)) / pitch) - 1);
  return { corner: dia, nx: n(d.b), dx: dia, ny: n(d.h), dy: dia, tieDia: tie, tieSpacing: roundDown(TIE_REDUCTION * tieSpacingMax(dia, d.b, d.h)) };
}

export interface ColumnModel { input: Ec2ColumnInput; l0: ReturnType<typeof effectiveLength>; phiInf: number; ratio: number }

export function columnModel(set: Ec2Set, d: ColumnDemand, c: ColumnContext): ColumnModel {
  const l0 = effectiveLength(d.lu, d.psiTop, d.psiBot);
  const h0 = (2 * d.b * d.h) / (2 * (d.b + d.h)) * 1000;
  const phiInf = ec2CreepCoefficient(c.mat.fc, h0);
  const known = d.cases.length > 0 && d.cases.every((k) => k.puD !== undefined && k.pu > 1e-9);
  const ratio = known ? Math.min(1, Math.max(...d.cases.map((k) => k.puD! / k.pu))) : 1;
  const big = (a: number, b: number) => (Math.abs(a) >= Math.abs(b) ? a : b);
  const demands: Ec2ColumnDemand[] = d.cases.flatMap((k) => {
    const planes = [{ M: big(k.mxTop, k.mxBot), ends: [k.mxTop, k.mxBot] as [number, number] }, { M: big(k.myTop, k.myBot), ends: [k.myTop, k.myBot] as [number, number] }];
    const ns = k.puMin !== undefined && Math.abs(k.puMin - k.pu) > 1e-6 ? [k.pu, k.puMin] : [k.pu];
    return ns.map((N) => ({ N, planes, combination: k.combo }));
  });
  const input: Ec2ColumnInput = {
    planes: [{ b: d.b, h: d.h, l0: l0.l0, phiEf: phiInf * ratio }, { b: d.h, h: d.b, l0: l0.l0, phiEf: phiInf * ratio }],
    cover: c.cover, linkDia: c.tieDia, barDia: 16, fck: c.mat.fc, fyk: c.mat.fy, params: set.p, braced: true, demands,
  };
  return { input, l0, phiInf, ratio };
}

const planeSteel = (a: ColumnAdopted) => [2 * (2 * barArea(a.corner) + a.nx * barArea(a.dx)) * 1e-4, 2 * (2 * barArea(a.corner) + a.ny * barArea(a.dy)) * 1e-4];

function read(model: ColumnModel, a: ColumnAdopted, c: ColumnContext, demands = model.input.demands) {
  const [px, py] = planeSteel(a);
  const input: Ec2ColumnInput = { ...model.input, demands, planes: [{ ...model.input.planes[0]!, as: px }, { ...model.input.planes[1]!, as: py }], provided: { asTotal: columnArea(a) * 1e-4, d2: coverToBar(c, a.tieDia, a.corner) } };
  return demands.length ? ec2ColumnSolve(input) : null;
}

function shearOf(set: Ec2Set, d: ColumnDemand, c: ColumnContext, a: ColumnAdopted, m: Mat) {
  const ct = crossties(d, a, c), ab = barArea(a.tieDia) * 1e-4, d2 = coverToBar(c, a.tieDia, a.corner);
  return d.cases.map((k) => {
    const sigma = Math.max(0, k.puMin ?? k.pu) / (d.b * d.h * KPA);
    const x = shearCapacity(d.b, d.h - d2, (2 * barArea(a.corner) + a.nx * barArea(a.dx)) * 1e-4, a.tieSpacing > 0 ? ((2 + ct.x) * ab) / a.tieSpacing : 0, m, set.p, sigma);
    const y = shearCapacity(d.h, d.b - d2, (2 * barArea(a.corner) + a.ny * barArea(a.dy)) * 1e-4, a.tieSpacing > 0 ? ((2 + ct.y) * ab) / a.tieSpacing : 0, m, set.p, sigma);
    return { x: ratioOf(k.vx ?? 0, x.vrd), y: ratioOf(k.vy ?? 0, y.vrd), px: x.vrd, py: y.vrd };
  });
}

function propose(set: Ec2Set, d: ColumnDemand, c: ColumnContext, model: ColumnModel, ast: number, m: Mat, pattern?: StackPlace['pattern']): { layout: ColumnAdopted; iterations: number } {
  const dias = c.diameters.filter((x) => x >= set.colBarMin && x <= 32);
  const fine = (a: ColumnAdopted) => clearOk(d, c, a) && columnArea(a) >= ast - 1e-6 && (read(model, a, c)?.governing.u ?? 0) <= 1 + 1e-6;
  const shearFix = (a0: ColumnAdopted) => {
    let a = a0, it = 0;
    for (let guard = 0; guard < 30 && !shearOf(set, d, c, a, m).every((s) => s.x <= 1 + 1e-6 && s.y <= 1 + 1e-6); guard++) {
      it++;
      if (a.tieSpacing > 0.075 + 1e-9) a = { ...a, tieSpacing: roundDown(a.tieSpacing - 0.025) };
      else if (a.tieDia < 12) a = { ...a, tieDia: a.tieDia + 2 };
      else break;
    }
    return { a, it };
  };
  if (pattern) {
    for (const dia of [...dias].filter((x) => x <= pattern.maxDia).sort((p, q) => p - q)) {
      const a = { ...evenLayout(d, c, dia, 0.3), nx: pattern.nx, ny: pattern.ny };
      if (fine(a)) { const s = shearFix(a); return { layout: s.a, iterations: s.it }; }
    }
  }
  const ok: Array<{ a: ColumnAdopted; it: number }> = [];
  for (const dia of dias.length ? dias : [16]) {
    let a = evenLayout(d, c, dia, 0.3), it = 0;
    const grow = (x: ColumnAdopted) => (d.h >= d.b ? (x.ny <= x.nx ? { ...x, ny: x.ny + 1 } : { ...x, nx: x.nx + 1 }) : (x.nx <= x.ny ? { ...x, nx: x.nx + 1 } : { ...x, ny: x.ny + 1 }));
    while (!fine(a) && it < 20) {
      const g = grow(a);
      if (!clearOk(d, c, g)) break;
      a = g; it++;
    }
    if (!fine(a)) continue;
    const s = shearFix(a);
    ok.push({ a: s.a, it: it + s.it });
  }
  if (ok.length) {
    const least = Math.min(...ok.map((x) => columnArea(x.a)));
    const pick = ok.filter((x) => columnArea(x.a) <= 1.1 * least + 1e-6).sort((p, q) => p.a.nx + p.a.ny - (q.a.nx + q.a.ny) || columnArea(p.a) - columnArea(q.a))[0]!;
    return { layout: pick.a, iterations: pick.it };
  }
  return { layout: evenLayout(d, c, dias[dias.length - 1] ?? 25, 0.15), iterations: 0 };
}

export function makeColumnRow(set: Ec2Set) {
  return function columnRow(d: ColumnDemand, c: ColumnContext, adopted: ColumnAdopted | undefined, fmt: Fmt, stack: StackPlace = {}): ColumnRow {
    const m = matOf(c.mat.fc, c.mat.fy, set.p);
    const Ac = d.b * d.h;
    const model = columnModel(set, d, c);
    const design = model.input.demands.length ? ec2ColumnSolve(model.input) : null;
    const asMin = (design?.asMin ?? set.p.colMinAbs * Ac) * 1e4, asMax = (design?.asMax ?? set.p.colMaxRatio * Ac) * 1e4;
    const impossible = !!design && design.as === null;
    const ast = design ? (design.as ?? design.asMax) * 1e4 : asMin;
    const first = propose(set, d, c, model, Math.max(ast, asMin), m, stack.pattern);
    const proposed = first.layout;
    const a = adopted ?? proposed;
    const area = columnArea(a);
    const res = read(model, a, c);
    const ratio = res ? res.governing.u : 0;
    const perCase = d.cases.map((k) => read(model, a, c, model.input.demands.filter((x) => x.combination === k.combo))?.governing ?? null);
    const sh = shearOf(set, d, c, a, m);
    const shearX = Math.max(0, ...sh.map((x) => x.x)), shearY = Math.max(0, ...sh.map((x) => x.y));
    const ct = crossties(d, a, c);
    const longest = Math.max(a.corner, a.dx, a.dy), thinnest = Math.min(a.corner, a.nx > 0 ? a.dx : 99, a.ny > 0 ? a.dy : 99);
    const sclMax = tieSpacingMax(thinnest, d.b, d.h), tieMax = TIE_REDUCTION * sclMax;
    const tieDiaOk = a.tieDia >= tieDiaMin(longest) - 1e-9;
    const tieOk = tieDiaOk && a.tieSpacing <= tieMax + 1e-6;
    const spacingOk = clearOk(d, c, a);
    const rhoOk = area >= asMin - 1e-6 && area <= asMax + 1e-6;
    const barMinOk = thinnest >= set.colBarMin;
    const puMax = Math.max(0, ...d.cases.map((k) => k.pu));
    const compressionDominated = puMax > 0.1 * c.mat.fc * KPA * Ac;
    const generous = area > 1.2 * Math.max(ast, asMin) + 1e-6 && ast > asMin + 1e-6;
    const lap = lapLength(m, longest, true);
    const gov = res?.governing;

    const verifications: CheckLine[] = [
      check('rcSheets.v.biaxial', ratio <= 1 + 1e-6, { clause: gov?.biaxial ? '6.1, 5.8.8, 5.8.9(4)' : '6.1, 5.8.8, 5.8.9(3)', demand: gov?.demand.combination ?? '', capacity: '', ratio }),
      check('rcSheets.v.rhoMin', area >= Math.max(ast, asMin) - 1e-6, { clause: '9.5.2(2)', demand: `${fmt(Math.max(ast, asMin))} cm²`, capacity: `${fmt(area)} cm²`, ratio: ratioOf(Math.max(ast, asMin), area) }),
      check('rcSheets.v.rhoMax', area <= asMax + 1e-6, { clause: '9.5.2(3)', demand: `${fmt((area / (Ac * 1e4)) * 100)} %`, capacity: `≤ ${fmt(set.p.colMaxRatio * 100, 0)} %` }),
      check('rcSheets.ec2.v.colBarMin', barMinOk, { clause: '9.5.2(1)', demand: `Ø${thinnest}`, capacity: `≥ Ø${set.colBarMin}` }),
      check('rcSheets.v.colSpacing', spacingOk, { clause: '8.2(2)' }),
      check('rcSheets.v.shearX', shearX <= 1 + 1e-6, { clause: '6.2.2(1), 6.2.3(3)', demand: `${fmt(Math.max(0, ...d.cases.map((k) => k.vx ?? 0)))} kN`, capacity: `${fmt(Math.min(...sh.map((x) => x.px)))} kN`, ratio: shearX }),
      check('rcSheets.v.shearY', shearY <= 1 + 1e-6, { clause: '6.2.2(1), 6.2.3(3)', demand: `${fmt(Math.max(0, ...d.cases.map((k) => k.vy ?? 0)))} kN`, capacity: `${fmt(Math.min(...sh.map((x) => x.py)))} kN`, ratio: shearY }),
      check('rcSheets.v.tieDia', tieDiaOk, { clause: '9.5.3(1)', demand: `Ø${a.tieDia}`, capacity: `≥ ${fmt(tieDiaMin(longest), 1)} mm` }),
      check('rcSheets.v.tieSpacing', a.tieSpacing <= tieMax + 1e-6, { clause: '9.5.3(3), 9.5.3(4)', demand: `${fmt(a.tieSpacing * 100, 1)} cm`, capacity: `≤ 0.6 × ${fmt(sclMax * 100, 1)} = ${fmt(tieMax * 100, 1)} cm` }),
      check('rcSheets.v.crossties', true, { clause: '9.5.3(6)', capacity: `${ct.x} (b) · ${ct.y} (h)` }),
      ...(stack.fromBelow ? [check('rcSheets.ec2.v.colLap', true, { clause: '8.7.3, 9.5.3(4)', capacity: `${fmt(lap * 100, 0)} cm (Ø${longest})` })] : []),
    ];
    const ok = verifications.every((v) => v.ok) && !impossible;

    const combos: ComboTable = {
      headers: ['Pu', 'Mx', 'My', 'Vx', 'Vy'],
      rows: d.cases.map((k, i) => {
        const g = perCase[i];
        const rr = Math.max(g?.u ?? 0, sh[i]?.x ?? 0, sh[i]?.y ?? 0);
        return { combo: k.combo, values: [fmt(k.pu, 1), fmt(g?.planes[0]?.MEd ?? 0, 1), fmt(g?.planes[1]?.MEd ?? 0, 1), fmt(k.vx ?? 0, 1), fmt(k.vy ?? 0, 1)], ratio: rr, ok: rr <= 1 + 1e-6 };
      }),
    };

    const steps: StepGroup[] = [
      {
        title: 'rcSheets.g.data',
        steps: [
          { label: 'rcSheets.s.section', formula: 'b × h', value: `${fmt(d.b * 100, 0)} × ${fmt(d.h * 100, 0)} cm` },
          { label: 'rcSheets.s.materials', formula: 'fck · fyk → fcd · fyd', value: `${fmt(m.fck, 0)} · ${fmt(m.fyk, 0)} → ${fmt(m.fcd)} · ${fmt(m.fyd)} MPa` },
          { label: 'rcSheets.s.height', formula: 'L · l', value: `${fmt(d.length)} · ${fmt(d.lu)} m` },
          { label: 'rcSheets.ec2.s.l0', formula: `k = Ψ/2 ≥ 0.1: k1 = ${fmt(model.l0.k1, 2)}, k2 = ${fmt(model.l0.k2, 2)}; l0 = 0.5·l·√((1 + k1/(0.45 + k1))(1 + k2/(0.45 + k2))) (5.8.3.2(3))`, value: `${fmt(model.l0.l0)} m` },
          { label: 'rcSheets.ec2.s.creep', formula: `φ(∞,t0), RH 50 %, t0 = 28 d (Annex B); φef = φ(∞,t0)·M0Eqp/M0Ed, M0Eqp/M0Ed ≈ ${model.ratio < 1 ? 'NEd,G/NEd' : '1'} (5.8.4(2))`, value: `${fmt(model.phiInf, 2)} → ${fmt(model.phiInf * model.ratio, 2)}` },
          { label: 'rcSheets.s.nonSway', value: '' },
        ],
      },
      ...(gov ? [slenderSteps(gov, fmt)] : []),
      {
        title: 'rcSheets.g.interaction',
        steps: [
          { label: 'rcSheets.s.tuples', formula: '(NEd, MEd,x, MEd,y) i · j', value: String(model.input.demands.length) },
          { label: 'rcSheets.ec2.s.asColumn', formula: 'As,min = max(0.10·NEd/fyd; 0.002·Ac) (9.5.2(2)) ≤ As ≤ 0.04·Ac (9.5.2(3))', value: `${fmt(asMin)} ≤ ${fmt(ast)} ≤ ${fmt(asMax)} cm²`, ok: !impossible },
          { label: 'rcSheets.s.adopted', formula: columnLabel(a), value: `${fmt(area)} cm²`, ok: area >= Math.max(ast, asMin) - 1e-6 },
          { label: 'rcSheets.ec2.s.planeSteel', formula: 'As per plane: the two faces parallel to the axis of bending; side bars left out', value: planeSteel(a).map((x) => fmt(x * 1e4)).join(' · ') + ' cm²' },
          { label: 'rcSheets.s.colSpacing', formula: 'max(Ø; dg + 5 mm; 20 mm), dg = 20 mm (8.2(2))', value: '', ok: spacingOk },
          { label: 'rcSheets.s.biaxial', formula: gov ? (gov.biaxial ? `(MEd,x/MRd,x)^a + (MEd,y/MRd,y)^a, a = ${fmt(gov.a ?? 1, 2)} (5.39)` : 'MEd ≤ MRd in each plane (5.8.9(3))') : '—', value: fmt(ratio, 3), ok: ratio <= 1 + 1e-6 },
        ],
      },
      {
        title: 'rcSheets.g.ties',
        steps: [
          { label: 'rcSheets.s.tieDia', formula: 'Øt ≥ max(6 mm; Ømax/4) (9.5.3(1))', value: `Ø${a.tieDia}`, ok: tieDiaOk },
          { label: 'rcSheets.s.tieSpacing', formula: 's ≤ 0.6·min(20·Ømin; min(b, h); 400 mm) (9.5.3(3), (4)): one spacing along the storey', value: `${tieLabel(a)} ≤ ${fmt(tieMax * 100, 1)} cm`, ok: a.tieSpacing <= tieMax + 1e-6 },
          { label: 'rcSheets.s.crossties', formula: '≤ 150 mm from a held bar (9.5.3(6))', value: `${ct.x} (b) · ${ct.y} (h)` },
          { label: 'rcSheets.s.colShear', formula: 'VRd = max(VRd,c(σcp); min(VRd,s; VRd,max)) (6.2.2, 6.2.3)', value: fmt(Math.max(shearX, shearY), 3), ok: shearX <= 1 + 1e-6 && shearY <= 1 + 1e-6 },
          ...(stack.fromBelow ? [{ label: 'rcSheets.ec2.s.colLap', formula: 'l0 = α6·lb,rqd ≥ max(0.3·α6·lb,rqd; 15·Ø; 200 mm), α6 = 1.5 (8.7.3)', value: `${fmt(lap * 100, 0)} cm` }] : []),
        ],
      },
      {
        title: 'rcSheets.g.proposal',
        steps: [adopted ? { label: 'rcSheets.s.adoptedByUser', value: '' } : { label: 'rcSheets.s.iterations', formula: 'As → bars → (NEd, MEd,x, MEd,y) ≤ 1; VEd ≤ VRd', value: String(first.iterations) }],
      },
    ];

    return {
      family: 'column', key: d.key, name: d.name, level: d.level, b: d.b, h: d.h, length: d.length, cover: c.cover, demand: d,
      req: { rho: ast / (Ac * 1e4), ast, impossible, governing: gov?.demand.combination ?? '', compressionDominated },
      proposed, adopted: a, isAdopted: !!adopted, iterations: adopted ? 0 : first.iterations,
      checks: { ratio, ok, area, spacingOk, tieOk, tieMax, crossties: ct, rhoOk, shearX, shearY },
      verifications, combos, status: ok ? (generous ? 'warn' : 'ok') : 'fail', generous, steps,
    };
  };
}

function slenderSteps(g: Ec2DemandReading, f: Fmt): StepGroup {
  const ax = (name: string, r: Ec2DemandReading['planes'][number]): Step[] => [
    { label: 'rcSheets.s.slenderness', formula: `${name}: λ = l0/i = l0·√12/h; λlim = 20·A·B·C/√n, B = 1.1, C = 1.7 − rm (5.8.3.1)`, value: `${f(r.lambda, 1)} ≤ ${f(Number.isFinite(r.lambdaLim) ? r.lambdaLim : 0, 1)}?`, ok: !r.slender },
    { label: 'rcSheets.ec2.s.firstOrder', formula: `M01, M02 + NEd·ei, ei = l0/400 (5.2(7)); e0 = max(h/30; 20 mm) (6.1(4))`, value: `${f(r.M01)} · ${f(r.M02)} kN·m; ei = ${f(r.ei * 1000, 1)} mm` },
    ...(r.slender ? [{ label: 'rcSheets.s.magnifier', formula: 'M2 = NEd·(1/r)·l0²/10, 1/r = Kr·Kφ·εyd/(0.45·d); MEd = max(M02; M0e + M2; M01 + M2/2) (5.8.8)', value: `M2 = ${f(r.M2)} → MEd = ${f(r.MEd)} kN·m` }] : [{ label: 'rcSheets.ec2.s.med', formula: 'MEd = max(M02; NEd·e0)', value: `${f(r.MEd)} kN·m` }]),
  ];
  return { title: 'rcSheets.g.slenderness', steps: [{ label: 'rcSheets.s.governs', formula: `NEd = ${f(g.demand.N, 1)} kN`, value: g.demand.combination ?? '' }, ...ax('x', g.planes[0]!), ...(g.planes[1] ? ax('y', g.planes[1]) : [])] };
}
