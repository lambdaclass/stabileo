/**
 * One rectangular concrete member designed to EN 1992-1-1 from simultaneous forces: every tuple
 * is one combination at one station, its N, Vy, Vz, My, Mz and T as they act together there
 * (`station-design-forces.ts`). The tuples are the governing demands (each force's peak with what
 * acts with it) and, when given, every combination at every station: a column's governing tuple
 * can be no force's peak (a smaller compression with nearly its largest moment). Nothing is taken
 * from two tuples at once: a beam's faces take the largest moment of their own sign, each shear
 * is designed on the face its own moment puts in tension, and a column is designed for every
 * tuple with its own axial force and both of its moments.
 *
 * Axes, as the app reads them (`design-axes.ts`): My bends over the depth h and pairs with Vz; Mz
 * bends over the width b and pairs with Vy. A beam is designed about the axis `resolveDesignAxes`
 * names, the section turned (width h, depth b) when it is Mz. A column has both planes: My's with
 * width b and depth h, Mz's with width h and depth b, each with its own l0 = k·L (kStrong for the
 * axis of the larger inertia, kWeak for the other, 1 when the member states none) and φef.
 *
 * What the design does not cover is a row that says so (status notVerified), never a silence:
 * axial force in a beam above 0,1·fcd·Ac in compression (which only raises the flexural and shear
 * resistance below the balanced point, so it is left out on the safe side up to there) or above
 * 0,01·fcd·Ac in tension (which lowers both); the moment about a beam's secondary axis past 10 %
 * of its primary one (`BIAXIAL_RATIO_THRESHOLD`). Torsion is designed for the solid section by
 * 6.3.2: no torsion steel where TEd/TRd,c + VEd/VRd,c ≤ 1 (6.3.2(5)); otherwise the struts by
 * Eq. 6.29 on the shear's own strut (cotθ = 1 when that one does not carry both), the links and
 * the longitudinal steel of 6.28. Compatibility torsion (6.3.1(2)) is not told apart: every
 * torsion is designed.
 *
 * Where the member holds bars they are checked too: a beam's steel at each demand's station
 * against the steel that demand needs, its links against the shear's; a column's bars carrying
 * every demand.
 */
import type { GoverningDemand } from '../../station-design-forces';
import type { StationTuple } from '../other-codes/types';
import { resolveDesignAxes, tupleMoment, tupleShear } from '../design-axes';
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';
import type { ProvidedReinforcement } from '../../../design-contract/reinforcement';
import { ec2Material, type Ec2Params } from './ec2-params';
import { ec2BeamDesign, ec2FlexuralSteel, ec2Shear, ec2ShearRow, type Ec2Shear } from './ec2-beam';
import { biaxialRow, ec2ColumnRows, ec2ColumnSolve, type Ec2ColumnInput } from './ec2-column';
import { beamBarsAt, columnBars } from './ec2-provided';

export interface Ec2MemberInput {
  kind: 'beam' | 'column';
  /** Section width (along local z) and depth (along local y), m. */
  b: number; h: number;
  /** Member length, m, and its effective-length factors. */
  L: number; kStrong?: number; kWeak?: number;
  demands: readonly GoverningDemand[];
  /** Every combination at every station (`MemberContext.tuples`), designed besides the governing demands. */
  tuples?: readonly StationTuple[];
  /** Columns: the moments at both ends (t = 0, t = 1) of each combination, by combination id. */
  ends?: ReadonlyMap<number, { my: [number, number]; mz: [number, number] }>;
  cover: number; linkDia: number; barDia: number;
  fck: number; fyk: number;
  params: Ec2Params;
  /** Columns: braced or not, and why. Absent: braced, said as an assumption. */
  sway?: { braced: boolean; basis: string };
  /** Columns: φ(∞,t0) and M0Eqp/M0Ed of each plane, and what they rest on. Absent: φef = 0. */
  creep?: { phiInf: number; ratioMy: number; ratioMz: number; basis: string[] };
  provided?: ProvidedReinforcement;
}

export type Ec2MemberDesign =
  | { skip: string }
  | { rows: CheckRow[]; data: Array<[string, string]>; axis: 'My' | 'Mz' };

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });
const cm2 = (v: number) => `${(v * 1e4).toFixed(2)} cm²`;
const where = (d: StationTuple) => ({ combination: d.comboName, location: `x = ${d.stationX.toFixed(2)} m` });
const NOISE = 1e-6;
const idle = (d: StationTuple) => [d.forces.n, d.forces.vy, d.forces.vz, d.forces.my, d.forces.mz, d.forces.torsion].every((v) => Math.abs(v) < NOISE);

/** Compression up to this share of fcd·Ac is left out of a beam's design (safe side); tension up to the second. */
export const BEAM_AXIAL_COMPRESSION_SHARE = 0.1;
export const BEAM_AXIAL_TENSION_SHARE = 0.01;

export function ec2MemberDesign(i: Ec2MemberInput): Ec2MemberDesign {
  // One tuple per combination and station: categories that peak at the same place are one demand.
  const seen = new Set<string>();
  const ds = [...i.demands, ...(i.tuples ?? [])].filter((d) => { const k = `${d.comboId}|${d.stationT}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (!ds.length || ds.every(idle)) return { skip: 'otherCodes.skip.noDemand' };
  return i.kind === 'beam' ? beam(i, ds) : column(i, ds);
}

interface TorsionCase { T: number; V: number; s: Ec2Shear; bw: number; at: { combination: string; location: string } }

/** Torsion of the solid rectangle b × h by 6.3.2; null when no demand carries any. */
function torsion(i: Ec2MemberInput, b: number, h: number, cases: TorsionCase[]): { row: CheckRow; aswS: number; asl: number } | null {
  const live = cases.filter((c) => c.T > NOISE);
  if (!live.length) return null;
  const p = i.params, m = ec2Material(i.fck, i.fyk, p), base = { code: p.code, edition: '2004' };
  const c = i.cover + (i.linkDia + i.barDia / 2) / 1000;
  // tef = A/u, not less than twice the cover to the bars' centres, not more than the half-width (6.3.2(1)).
  const tef = Math.min(Math.max((b * h) / (2 * (b + h)), 2 * c), Math.min(b, h) / 2);
  const Ak = (b - tef) * (h - tef), uk = 2 * (b - tef + (h - tef));
  const fctd = (p.alphaCT * 0.7 * m.fctm) / p.gammaC;
  const tRdc = 2 * Ak * tef * fctd * 1000;
  const nu = 0.6 * (1 - i.fck / 250);
  const tRdMax = (cot: number) => (2 * nu * m.fcdShear * 1000 * Ak * tef) / (cot + 1 / cot);
  const fywd = (i.fyk / p.gammaS) * 1000, fyd = fywd;
  const screen = live.map((x) => ({ x, u: x.T / tRdc + x.V / Math.max(x.s.vrdc, NOISE) }));
  const worstScreen = screen.reduce((a, q) => (q.u > a.u ? q : a));
  const common = [inp('TRd,c', tRdc, 'kN·m'), inp('tef', tef * 1000, 'mm'), inp('Ak', Ak * 1e4, 'cm²')];
  if (worstScreen.u <= 1) {
    return {
      row: { ...base, clause: '6.3.2(5)', title: 'Torsion', titleKey: 'check.ec2.torsion', formula: 'TEd/TRd,c + VEd/VRd,c ≤ 1: minimum links only',
        inputs: [inp('TEd', worstScreen.x.T, 'kN·m'), inp('VEd', worstScreen.x.V, 'kN'), ...common, inp('VRd,c', worstScreen.x.s.vrdc, 'kN')],
        ratio: r3(worstScreen.u), status: statusOfRatio(worstScreen.u), ...worstScreen.x.at,
        derivation: ['TRd,c = 2·Ak·tef·fctd (6.3.2(1)), fctd = αct·0,7·fctm/γc'] },
      aswS: 0, asl: 0,
    };
  }
  const designed = live.map((x) => {
    const vMax = (cot: number) => (x.bw * x.s.z * x.s.nu1 * m.fcdShear * 1000) / (cot + 1 / cot);
    let cot = x.s.cotTheta;
    let u = x.T / tRdMax(cot) + x.V / vMax(cot);
    if (u > 1) { cot = 1; u = x.T / tRdMax(1) + x.V / vMax(1); }
    const shearLinks = x.V > x.s.vrdc ? Math.max(x.V / (x.s.z * fywd * cot), x.s.aswMin) : x.s.aswMin;
    const perLeg = x.T / (2 * Ak * fywd * cot);
    return { x, cot, u, aswS: shearLinks + 2 * perLeg, asl: (x.T * uk * cot) / (2 * Ak * fyd) };
  });
  const gov = designed.reduce((a, q) => (q.u > a.u ? q : a));
  const aswS = Math.max(...designed.map((q) => q.aswS)), asl = Math.max(...designed.map((q) => q.asl));
  return {
    row: { ...base, clause: '6.3.2', title: 'Torsion', titleKey: 'check.ec2.torsion', formula: 'TEd/TRd,max + VEd/VRd,max ≤ 1 (6.29); links and ΣAsl by 6.28',
      inputs: [inp('TEd', gov.x.T, 'kN·m'), inp('VEd', gov.x.V, 'kN'), ...common, inp('TRd,max', tRdMax(gov.cot), 'kN·m'), inp('cotθ', gov.cot), inp('Asw/s', aswS * 1e4, 'cm²/m'), inp('ΣAsl', asl * 1e4, 'cm²')],
      ratio: r3(gov.u), status: statusOfRatio(gov.u), ...gov.x.at,
      derivation: [`TEd/TRd,c + VEd/VRd,c = ${worstScreen.u.toFixed(3)} > 1 (6.3.2(5)): torsion designed`,
        `links for shear and torsion together, Asw/s = ${(aswS * 1e4).toFixed(2)} cm²/m (two legs); ΣAsl = ${(asl * 1e4).toFixed(2)} cm² spread around the perimeter, besides the flexural steel (6.3.2(3), 9.2.3(4))`,
        'compatibility torsion (6.3.1(2)) is not told apart: every torsion is designed'] },
    aswS, asl,
  };
}

function beam(i: Ec2MemberInput, ds: StationTuple[]): Ec2MemberDesign {
  const p = i.params, m = ec2Material(i.fck, i.fyk, p), base = { code: p.code, edition: '2004' };
  // The axis from the peaks of each category, all of them: two categories peaking at one station are one tuple in `ds`.
  const axes = resolveDesignAxes('beam', { b: i.b, h: i.h }, { elementId: 0, length: i.L, demands: [...i.demands] });
  const b = axes.bFlex, h = axes.hFlex;
  const M = (d: StationTuple) => tupleMoment(d.forces, axes.flexure);
  const V = (d: StationTuple) => Math.abs(tupleShear(d.forces, axes.shear));
  const pick = (f: (d: StationTuple) => number) => ds.reduce<StationTuple | null>((a, d) => (f(d) > NOISE && (!a || f(d) > f(a)) ? d : a), null);
  const pos = pick(M), neg = pick((d) => -M(d));
  const shears = ds.map((d) => ({ VEd: V(d), face: (M(d) < 0 ? 'neg' : 'pos') as 'pos' | 'neg', ...where(d) }));
  const des = ec2BeamDesign({
    b, h, cover: i.cover, linkDia: i.linkDia, barDia: i.barDia, fck: i.fck, fyk: i.fyk,
    MEdPos: pos ? M(pos) : 0, MEdNeg: neg ? -M(neg) : 0, VEd: Math.max(...shears.map((s) => s.VEd)), params: p, shears,
    at: { ...(pos ? { pos: where(pos) } : {}), ...(neg ? { neg: where(neg) } : {}) },
  });
  const rows = [...des.rows];
  const shearRow = rows.find((r) => r.titleKey === 'check.ec2.shearMax');
  if (shearRow && axes.flexure === 'Mz') shearRow.derivation = [...(shearRow.derivation ?? []), 'section turned: Mz bends over the width, the shear is Vy'];

  // Axial force: what the flexural design leaves out.
  const ac = b * h, fcdAc = m.fcd * 1000 * ac;
  const limitOf = (n: number) => (n < 0 ? BEAM_AXIAL_COMPRESSION_SHARE : BEAM_AXIAL_TENSION_SHARE) * fcdAc;
  const axial = ds.filter((d) => Math.abs(d.forces.n) > limitOf(d.forces.n)).sort((a, c) => Math.abs(c.forces.n) / limitOf(c.forces.n) - Math.abs(a.forces.n) / limitOf(a.forces.n))[0];
  if (axial) {
    const n = axial.forces.n, lim = limitOf(n);
    rows.push({ ...base, clause: '6.1', title: 'Axial force in a beam', titleKey: 'check.ec2.axialNotEvaluated',
      formula: `|NEd| ≤ ${BEAM_AXIAL_COMPRESSION_SHARE}·fcd·Ac in compression, ≤ ${BEAM_AXIAL_TENSION_SHARE}·fcd·Ac in tension, to be designed in pure bending`,
      inputs: [inp('NEd', Math.abs(n), 'kN'), inp('limit', lim, 'kN')], demand: r3(Math.abs(n)), capacity: r3(lim), unit: 'kN', ratio: null, status: 'notVerified', ...where(axial),
      derivation: [`${n < 0 ? 'compression' : 'tension'} of ${Math.abs(n).toFixed(1)} kN: the beam is designed in pure bending and this axial force is not evaluated`] });
  }
  if (axes.biaxial) {
    const sec = Math.max(...ds.map((d) => Math.abs(tupleMoment(d.forces, axes.secondaryFlexure))));
    rows.push({ ...base, clause: '6.1', title: 'Bending about the secondary axis', titleKey: 'check.ec2.beamBiaxial',
      formula: `${axes.secondaryFlexure} ≤ 0,1·${axes.flexure}, to be designed about one axis`, inputs: [inp(axes.secondaryFlexure, sec, 'kN·m')],
      ratio: null, status: 'notVerified', derivation: [`the beam is designed about ${axes.flexure}; ${axes.secondaryFlexure} = ${sec.toFixed(1)} kN·m is not evaluated`] });
  }
  const tor = torsion(i, i.b, i.h, ds.map((d, k) => ({ T: Math.abs(d.forces.torsion), V: shears[k]!.VEd, s: des.shear[k]!, bw: b, at: where(d) })));
  if (tor) rows.push(tor.row);

  // The bars the beam holds, at each demand's station.
  if (i.provided) {
    const d2 = i.cover + (i.linkDia + i.barDia / 2) / 1000, dd = h - d2;
    const asMin = Math.max((p.beamMinFctm * m.fctm) / i.fyk, p.beamMinAbs) * b * dd;
    if (axes.flexure !== 'My') {
      rows.push({ ...base, clause: '6.1', title: 'Bars placed', titleKey: 'check.ec2.barsProvided', formula: 'As,req ≤ As,prov at each station', inputs: [], ratio: null, status: 'notVerified',
        derivation: ['the bars are placed for bending over the depth; this beam bends about its width (Mz)'] });
    } else {
      let worst: { u: number; d: StationTuple; req: number; prov: number } | null = null;
      let worstLinks: { u: number; d: StationTuple; req: number; prov: number; s: number } | null = null;
      ds.forEach((d, k) => {
        const bars = beamBarsAt(i.provided, d.stationT);
        if (!bars) return;
        const mo = M(d);
        if (Math.abs(mo) > NOISE) {
          const f = ec2FlexuralSteel(Math.abs(mo), b, dd, d2, i.fck, i.fyk, p);
          const [tension, other] = mo >= 0 ? [bars.bottom, bars.top] : [bars.top, bars.bottom];
          const req = Math.max(f.as, asMin);
          const u = Math.max(tension > 0 ? req / tension : Number.POSITIVE_INFINITY, f.as2 > 0 ? (other > 0 ? f.as2 / other : Number.POSITIVE_INFINITY) : 0);
          if (!worst || u > worst.u) worst = { u, d, req, prov: tension };
        }
        const need = des.shear[k]!.aswS;
        if (bars.links) {
          const sMax = p.linkMaxSpacing * dd;
          const u = Math.max(need / bars.links.aswS, bars.links.spacing / sMax);
          if (!worstLinks || u > worstLinks.u) worstLinks = { u, d, req: need, prov: bars.links.aswS, s: bars.links.spacing };
        }
      });
      const w = worst as { u: number; d: StationTuple; req: number; prov: number } | null;
      if (w) rows.push({ ...base, clause: '6.1; 9.2.1.1', title: 'Bars placed', titleKey: 'check.ec2.barsProvided', formula: 'As,req ≤ As,prov at each station (face in tension, and compression steel where K > K\')',
        inputs: [inp('As,req', w.req * 1e4, 'cm²'), inp('As,prov', w.prov * 1e4, 'cm²')], demand: r3(w.req * 1e4), capacity: r3(w.prov * 1e4), unit: 'cm²',
        ratio: Number.isFinite(w.u) ? r3(w.u) : null, status: statusOfRatio(w.u), ...where(w.d) });
      const l = worstLinks as { u: number; d: StationTuple; req: number; prov: number; s: number } | null;
      if (l) rows.push({ ...base, clause: '6.2.3(3); 9.2.2(6)', title: 'Links placed', titleKey: 'check.ec2.linksProvided', formula: 'Asw/s,req ≤ Asw/s,prov; s ≤ 0,75·d',
        inputs: [inp('Asw/s,req', l.req * 1e4, 'cm²/m'), inp('Asw/s,prov', l.prov * 1e4, 'cm²/m'), inp('s', l.s * 1000, 'mm'), inp('s,max', p.linkMaxSpacing * dd * 1000, 'mm')],
        ratio: r3(l.u), status: statusOfRatio(l.u), ...where(l.d),
        ...(tor && tor.aswS > 0 ? { derivation: ['the links torsion adds are in the torsion row, not here'] } : {}) });
    }
  }
  const data: Array<[string, string]> = [['As,inf', cm2(des.asBottom)], ['As,sup', cm2(des.asTop)], ['Asw/s', `${(Math.max(des.aswS, tor?.aswS ?? 0) * 1e4).toFixed(2)} cm²/m`]];
  if (tor && tor.asl > 0) data.push(['ΣAsl,T', cm2(tor.asl)]);
  return { rows, data, axis: axes.flexure };
}

function column(i: Ec2MemberInput, ds: StationTuple[]): Ec2MemberDesign {
  const p = i.params, base = { code: p.code, edition: '2004' };
  const yStrong = i.h >= i.b;
  const kMy = (yStrong ? i.kStrong : i.kWeak) ?? 1, kMz = (yStrong ? i.kWeak : i.kStrong) ?? 1;
  const phiInf = i.creep?.phiInf ?? 0;
  const braced = i.sway?.braced ?? true;
  const input: Ec2ColumnInput = {
    planes: [
      { b: i.b, h: i.h, l0: kMy * i.L, phiEf: phiInf * (i.creep?.ratioMy ?? 0) },
      { b: i.h, h: i.b, l0: kMz * i.L, phiEf: phiInf * (i.creep?.ratioMz ?? 0) },
    ],
    cover: i.cover, linkDia: i.linkDia, barDia: i.barDia, fck: i.fck, fyk: i.fyk, params: p, braced,
    demands: ds.map((d) => {
      const e = i.ends?.get(d.comboId);
      return { N: -d.forces.n, planes: [{ M: d.forces.my, ...(e ? { ends: e.my } : {}) }, { M: d.forces.mz, ...(e ? { ends: e.mz } : {}) }], ...where(d) };
    }),
  };
  const res = ec2ColumnSolve(input);
  const assumptions = [
    i.sway?.basis ?? 'braced: not stated, taken as braced',
    ...(i.creep?.basis ?? ['φef = 0: creep not stated']),
    `l0 = k·L, L = ${i.L.toFixed(2)} m: plane y (My, over h) k = ${kMy}, plane z (Mz, over b) k = ${kMz}${braced ? '' : '; an unbraced column needs its sway k (5.8.3.2(3)), as stated on the member'}`,
  ];
  const names = ['y', 'z'];
  const rows = ec2ColumnRows(input, res, { names, assumptions, ...(i.creep ? { phiInf } : {}) });
  const as = res.as ?? res.asMax;

  // Shear in both planes, each on half the steel, with σcp = NEd/Ac.
  const ac = i.b * i.h;
  const sMax = Math.min(20 * (i.barDia / 1000), Math.min(i.b, i.h), 0.4);
  const cases = ds.flatMap((d, k) => {
    const N = input.demands[k]!.N, scp = N / (ac * 1000);
    return ([['Vz', i.b, i.h, Math.abs(d.forces.vz)], ['Vy', i.h, i.b, Math.abs(d.forces.vy)]] as const).map(([label, bw, depth, VEd]) => ({
      label, VEd, k, bw, ...where(d), s: ec2Shear({ bw, d: depth - res.d2, fck: i.fck, fyk: i.fyk, asl: as / 2, VEd, sigmaCp: scp }, p),
    }));
  });
  rows.push(ec2ShearRow(cases, base, sMax, 'Shear', '9.5.3(3)'));
  const tor = torsion(i, i.b, i.h, ds.map((d, k) => {
    const pair = cases.filter((c) => c.k === k).reduce((a, c) => (c.VEd / Math.max(c.s.vrdc, NOISE) > a.VEd / Math.max(a.s.vrdc, NOISE) ? c : a));
    return { T: Math.abs(d.forces.torsion), V: pair.VEd, s: pair.s, bw: pair.bw, at: where(d) };
  }));
  if (tor) rows.push(tor.row);

  const bars = columnBars(i.provided, i.cover, i.linkDia);
  if (bars) {
    const placed = { ...input, planes: [{ ...input.planes[0]!, as: bars.planeMy }, { ...input.planes[1]!, as: bars.planeMz }], provided: { asTotal: bars.total, d2: bars.d2 } };
    const got = ec2ColumnSolve(placed), g = got.governing;
    rows.push(g.biaxial
      ? { ...biaxialRow(base, g, { names }, 'check.ec2.barsProvided', 'Bars placed'), clause: '6.1; 5.8.9(4)' }
      : { ...base, clause: '6.1; 5.8', title: 'Bars placed', titleKey: 'check.ec2.barsProvided', formula: 'MEd ≤ MRd at NEd in each plane, with the bars placed',
        inputs: [inp('NEd', g.demand.N, 'kN'), ...g.planes.flatMap((r, k) => [inp(`MEd,${names[k]}`, r.MEd, 'kN·m'), inp(`MRd,${names[k]}`, r.MRd ?? 0, 'kN·m')]), inp('As,prov', bars.total * 1e4, 'cm²')],
        ratio: Number.isFinite(g.u) ? r3(g.u) : null, status: statusOfRatio(g.u),
        ...(g.demand.combination ? { combination: g.demand.combination } : {}), ...(g.demand.location ? { location: g.demand.location } : {}) });
    if (bars.links) {
      const need = Math.max(...cases.map((c) => c.s.aswS), tor?.aswS ?? 0);
      const u = Math.max(need / bars.links.aswS, bars.links.spacing / sMax);
      rows.push({ ...base, clause: '6.2.3(3); 9.5.3(3)', title: 'Links placed', titleKey: 'check.ec2.linksProvided', formula: 'Asw/s,req ≤ Asw/s,prov (the same legs in either plane); s ≤ min(20·φ; b; 400 mm)',
        inputs: [inp('Asw/s,req', need * 1e4, 'cm²/m'), inp('Asw/s,prov', bars.links.aswS * 1e4, 'cm²/m'), inp('s', bars.links.spacing * 1000, 'mm'), inp('s,max', sMax * 1000, 'mm')],
        ratio: r3(u), status: statusOfRatio(u) });
    }
  }
  const g = res.governing;
  const data: Array<[string, string]> = res.as !== null
    ? [['As', cm2(res.as)], ['MEd,y', `${g.planes[0]!.MEd.toFixed(1)} kN·m`], ['MEd,z', `${g.planes[1]!.MEd.toFixed(1)} kN·m`], ['Asw/s', `${(Math.max(...cases.map((c) => c.s.aswS), tor?.aswS ?? 0) * 1e4).toFixed(2)} cm²/m`]]
    : [];
  if (tor && tor.asl > 0) data.push(['ΣAsl,T', cm2(tor.asl)]);
  return { rows, data, axis: g.planes[0]!.MEd >= g.planes[1]!.MEd ? 'My' : 'Mz' };
}
