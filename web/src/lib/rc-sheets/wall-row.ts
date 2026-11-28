import { checkWallInPlaneShear, wallConcreteShear, maxWallSpacing, minimumWallRatios, minimumWallThickness, PHI_WALL_SHEAR } from './wall-design';
import { wallInPlane, wallOutOfPlane } from './wall-member';
import { shearFy } from '../engine/codes/argentina/cirsoc201-basis';
import { compressionLap, tensionLap } from './column-row';
import { wallSeismic, type WallSeismic } from './wall-seismic';
import { barArea, roundDown } from './bars';
import type { Fmt } from './format';
import { check, ratioOf, type TransverseList, type CheckLine, type ComboTable, type Materials, type RowStatus, type Step, type StepGroup, type WallAdopted, isGenerous } from './types';
import { critOf, type Criteria } from './criteria';

const EDITION = '2025' as const;

/**
 * At the base of a storey: in-plane axial force (+ compression), moment and shear; out-of-plane
 * moments per metre on the vertical and the horizontal bars; and the base's signed resultant in
 * global axes about the plan origin (`CutForces`), which a pier sums.
 */
export interface WallComboForces { combo: string; pu: number; mu: number; vu: number; muV: number; muH: number; global?: import('./piers').CutForces }

export interface WallDemand {
  key: string; name: string; level?: string;
  /** Combinations with no results for some of its shells: their forces were not read. */
  missing?: string[];
  /** m. */
  length: number; height: number; thickness: number;
  /** Elements along the base cut: one cannot resolve an in-plane moment from its centre stress. */
  baseElements?: number;
  /** Nodes along the base cut, and how many rest on something: a support, a bar, a slab or a shell below. */
  base?: { nodes: number; held: number; unheld?: number[] };
  /** Its base in plan, end to end along its length, m. */
  plan?: { x1: number; y1: number; x2: number; y2: number };
  /** Its base's elevation, m. */
  z?: number;
  /** The nodes along its base cut. */
  baseNodes?: number[];
  combos: WallComboForces[];
}

export interface WallContext extends TransverseList {
  mat: Materials; cover: number; barDia: number; diameters: readonly number[]; seismic?: import('./seismic').Seismic;
  /** The diameters the meshes choose among, the thinnest whose bars stand no closer than the criterion's spacing; absent, `barDia` and the longitudinal list. */
  meshDiameters?: readonly number[];
  criteria?: Criteria;
  /** The storey below has special boundary elements (chapter 18). */
  belowSpecial?: boolean;
  /** A wall of a pier: its in-plane axial force and bending are the pier's, and `boundary` the least end bars the pier asks of it. */
  pier?: { boundary?: { count: number; diameter: number } };
}

export interface WallRow {
  family: 'wall';
  key: string; name: string; level?: string;
  length: number; height: number; thickness: number;
  demand: WallDemand;
  req: { rhoL: number; rhoT: number; sMaxV: number; sMaxH: number; curtains: 1 | 2; boundary: string };
  proposed: WallAdopted;
  adopted: WallAdopted;
  isAdopted: boolean;
  iterations: number;
  verifications: CheckLine[];
  /** The largest demand over capacity of the strength checks. */
  utilization: number;
  combos: ComboTable;
  status: RowStatus;
  generous: boolean;
  steps: StepGroup[];
  /** Clear cover to the horizontal bars, m, and the tension lap of a horizontal bar, m: what the end U-bars overlap it by. */
  cover: number;
  hLap: number;
  /** The lap of each vertical bar diameter, m, and whether it is a tension lap: what the bars of the storey above, or the footing's dowels, overlap them by. */
  vLaps?: Array<{ dia: number; lap: number; tension?: boolean }>;
  /** The bottom storey, on a footing whose dowels its verticals lap with. */
  onFooting?: true;
  /** Chapter 18, where the sheets apply it. */
  seismic?: WallSeismic;
  /** The storeys of the same wall below and above it, by key (`wallStacks`): its verticals lap into the one above. */
  stack?: { below?: string; above?: string };
  /** The stirrups and ties the project allows, mm, which its boundary and cross ties are drawn with. */
  tieDiameters?: readonly number[];
  /** The closest spacing they are placed at, m. */
  minTieSpacing?: number;
  /** A wall of a pier: the section's check and the columns inside it (`pier-row.ts`). */
  pier?: import('./pier-row').WallPier;
}

const rhoOf = (m: { diameter: number; spacing: number }, curtains: number, t: number) => (m.spacing > 0 ? curtains * barArea(m.diameter) * 1e-4 / (m.spacing * t) : 0);

export const wallLabel = (a: WallAdopted): string =>
  `${a.curtains}× V Ø${a.vertical.diameter} c/${Math.round(a.vertical.spacing * 1000) / 10} · H Ø${a.horizontal.diameter} c/${Math.round(a.horizontal.spacing * 1000) / 10}${a.boundary && a.boundary.count > 0 ? ` · ${a.boundary.count} Ø${a.boundary.diameter}` : ''}`;

interface Eval {
  pm: number[]; out: number[]; shear: number[];
  rhoL: number; rhoT: number; rhoLMin: number; rhoTMin: number;
  sMaxV: number; sMaxH: number; shearSteel: boolean;
  phiVnMin: number;
}

function evaluate(d: WallDemand, c: WallContext, a: WallAdopted): Eval {
  const acv = d.length * d.thickness;
  const vuMax = Math.max(0, ...d.combos.map((k) => k.vu));
  const rhoL = rhoOf(a.vertical, a.curtains, d.thickness), rhoT = rhoOf(a.horizontal, a.curtains, d.thickness);
  const min = minimumWallRatios(a.vertical.diameter, c.mat.fy, EDITION, { horizontalDiameterMm: a.horizontal.diameter, shear: { vu: vuMax, fc: c.mat.fc, acv, hw: d.height, lw: d.length, rhoTProvided: rhoT } });
  const shearSteel = d.combos.some(k => k.vu > PHI_WALL_SHEAR * wallConcreteShear(k.pu, acv, c.mat.fc));
  const s0 = maxWallSpacing(d.thickness, EDITION).spacing;
  const sMaxV = shearSteel ? Math.min(s0, d.length / 3) : s0, sMaxH = shearSteel ? Math.min(s0, d.length / 5) : s0;
  const r = a;
  const base = { length: d.length, thickness: d.thickness, cover: c.cover, fc: c.mat.fc, fy: c.mat.fy };
  const pm = d.combos.map((k) => (c.pier ? 0 : wallInPlane({ ...base, pu: k.pu, mu: k.mu, r }).utilization));
  const out = d.combos.map((k) => Math.max(0, ...wallOutOfPlane({ ...base, pu: k.pu, muV: k.muV, muH: k.muH, r }).map((x) => x.utilization)));
  const sh = d.combos.map((k) => checkWallInPlaneShear({ length: d.length, thickness: d.thickness, fc: c.mat.fc, pu: k.pu, vu: k.vu, rhoT, fy: c.mat.fy, edition: EDITION }));
  return {
    pm, out, shear: sh.map((x) => x.utilization), rhoL, rhoT, rhoLMin: min.rhoL, rhoTMin: min.rhoT, sMaxV, sMaxH, shearSteel,
    phiVnMin: Math.min(...sh.map((x) => x.phiVn), Infinity),
  };
}

const ok1 = (v: number) => v <= 1 + 1e-6;

export function wallRow(d: WallDemand, c: WallContext, adopted: WallAdopted | undefined, fmt: Fmt): WallRow {
  const acv = d.length * d.thickness;
  const vuMax = Math.max(0, ...d.combos.map((k) => k.vu));
  const concrete = d.combos.map(k => wallConcreteShear(k.pu, acv, c.mat.fc));
  const shearOverConcrete = d.combos.some((k, i) => k.vu > concrete[i]!);
  // §18.10.2.2 under chapter 18, §11.7.2.3 always.
  const curtains: 1 | 2 = d.thickness > 0.25 || (c.seismic && (shearOverConcrete || d.height / d.length >= 2)) ? 2 : 1;
  const rhoTShear = Math.max(0, ...d.combos.map((k, i) => k.vu / PHI_WALL_SHEAR - concrete[i]!)) / (shearFy(c.mat.fy) * 1000 * acv);

  const meshFor = (dia: number, rho: number, sMax: number) => ({ diameter: dia, spacing: roundDown(Math.max(0.075, Math.min(sMax, curtains * barArea(dia) * 1e-4 / Math.max(rho * d.thickness, 1e-9)))) });
  const meshes = c.meshDiameters?.length ? [...c.meshDiameters].sort((p, q) => p - q) : null;
  const bars = meshes ?? c.diameters;
  const meshesOf = (dia: number) => {
    const e0 = evaluate(d, c, { vertical: { diameter: dia, spacing: 0.2 }, horizontal: { diameter: dia, spacing: 0.2 }, curtains });
    return { vertical: meshFor(dia, e0.rhoLMin, e0.sMaxV), horizontal: meshFor(dia, Math.max(e0.rhoTMin, rhoTShear), e0.sMaxH) };
  };
  const roomy = (m: ReturnType<typeof meshesOf>) => Math.min(m.vertical.spacing, m.horizontal.spacing) >= critOf(c).wallMeshSpacing - 1e-9;
  const firstRoomy = (list: readonly number[]) => {
    let m = meshesOf(list[0]!);
    for (const dia of list.slice(1)) { if (roomy(m)) break; m = meshesOf(dia); }
    return m;
  };
  const start = firstRoomy(meshes ?? [c.barDia]);
  let a: WallAdopted = {
    ...start,
    curtains,
    ...(c.pier?.boundary ? { boundary: c.pier.boundary } : {}),
  };
  let iterations = 0;
  let e = evaluate(d, c, a);
  const boundaries = boundaryBars(c.diameters).flatMap((diameter) => [2, 4, 6, 8, 10, 12].map((count) => ({ count, diameter })))
    .sort((p, q) => p.count * barArea(p.diameter) - q.count * barArea(q.diameter));
  while (iterations < 12) {
    const allOk = e.pm.every(ok1) && e.out.every(ok1) && e.shear.every(ok1) && e.rhoL >= e.rhoLMin - 1e-9 && e.rhoT >= e.rhoTMin - 1e-9;
    if (allOk) break;
    iterations++;
    if (!e.pm.every(ok1)) {
      const cur = a.boundary ? a.boundary.count * barArea(a.boundary.diameter) : 0;
      const next = boundaries.find((b) => b.count * barArea(b.diameter) > cur + 1e-9);
      if (next) a = { ...a, boundary: next };
      else a = { ...a, vertical: { ...a.vertical, spacing: roundDown(Math.max(0.075, a.vertical.spacing - 0.025)) } };
    }
    if (!e.out.every(ok1) || e.rhoL < e.rhoLMin - 1e-9) a = { ...a, vertical: a.vertical.spacing > 0.1 + 1e-9 ? { ...a.vertical, spacing: roundDown(a.vertical.spacing - 0.025) } : { diameter: nextWallBar(bars, a.vertical.diameter), spacing: a.vertical.spacing } };
    if (!e.shear.every(ok1) || e.rhoT < e.rhoTMin - 1e-9) a = { ...a, horizontal: a.horizontal.spacing > 0.1 + 1e-9 ? { ...a.horizontal, spacing: roundDown(a.horizontal.spacing - 0.025) } : { diameter: nextWallBar(bars, a.horizontal.diameter), spacing: a.horizontal.spacing } };
    e = evaluate(d, c, a);
  }
  const seisOf = (x: WallAdopted) => wallSeismic(d, c, x, d.combos.map((k) => wallInPlane({ length: d.length, thickness: d.thickness, cover: c.cover, fc: c.mat.fc, fy: c.mat.fy, pu: k.pu, mu: k.mu, r: x }).c), fmt);
  // Hoops the code spaces closer than the project allows: the thinnest of the bars they hold grows, so 6·db (8·db) lifts the spacing.
  for (let guard = 0; c.seismic && !adopted && guard < 8; guard++) {
    if (!seisOf(a).underFloor?.byBars) break;
    const ext = a.boundary && a.boundary.count > 0 ? a.boundary : null;
    const thinner = ext && ext.diameter < a.vertical.diameter ? 'boundary' : 'vertical';
    const grown = thinner === 'boundary'
      ? { ...a, boundary: { ...ext!, diameter: boundaryBars(c.diameters).sort((p, q) => p - q).find((x) => x > ext!.diameter) ?? ext!.diameter } }
      : { ...a, vertical: { ...a.vertical, diameter: nextWallBar(bars, a.vertical.diameter) } };
    if (JSON.stringify(grown) === JSON.stringify(a)) break;
    a = grown; iterations++;
    e = evaluate(d, c, a);
  }
  const proposed = a;
  const ad = adopted ?? proposed;
  const ev = adopted ? evaluate(d, c, ad) : e;
  const tMin = minimumWallThickness(d.height, d.length, EDITION).thickness;
  const worst = (xs: number[]) => xs.reduce((w, x, i) => (x > xs[w]! ? i : w), 0);
  const ipm = worst(ev.pm), iout = worst(ev.out), ish = worst(ev.shear);

  const seis = c.seismic ? seisOf(ad) : null;
  const verifications: CheckLine[] = [
    ...((d.baseElements ?? 2) < 2 ? [check('rcSheets.v.wallMesh', false, { clause: '', demand: String(d.baseElements ?? 0), capacity: '≥ 2' })] : []),
    ...(d.base && d.base.held < d.base.nodes ? [check('rcSheets.v.wallBase', false, { clause: '', demand: `${d.base.held} / ${d.base.nodes}`, capacity: `${d.base.nodes} / ${d.base.nodes}` })] : []),
    ...(c.pier ? [] : [check('rcSheets.v.wallPM', ev.pm.every(ok1), { clause: '§11.5.2, §22.4', demand: d.combos[ipm]?.combo ?? '', ratio: Math.max(0, ...ev.pm) })]),
    check('rcSheets.v.wallShear', ev.shear.every(ok1), { clause: '§11.5.4', demand: `${fmt(vuMax)} kN`, capacity: `${fmt(ev.phiVnMin)} kN`, ratio: Math.max(0, ...ev.shear) }),
    check('rcSheets.v.wallOut', ev.out.every(ok1), { clause: '§11.5.1, §22.2', demand: d.combos[iout]?.combo ?? '', ratio: Math.max(0, ...ev.out) }),
    check('rcSheets.v.wallRhoL', ev.rhoL >= ev.rhoLMin - 1e-9, { clause: '§11.6', demand: `${fmt(ev.rhoLMin * 100, 3)} %`, capacity: `${fmt(ev.rhoL * 100, 3)} %`, ratio: ratioOf(ev.rhoLMin, ev.rhoL) }),
    check('rcSheets.v.wallRhoT', ev.rhoT >= ev.rhoTMin - 1e-9, { clause: '§11.6', demand: `${fmt(ev.rhoTMin * 100, 3)} %`, capacity: `${fmt(ev.rhoT * 100, 3)} %`, ratio: ratioOf(ev.rhoTMin, ev.rhoT) }),
    check('rcSheets.v.wallSpacing', ad.vertical.spacing <= ev.sMaxV + 1e-6 && ad.horizontal.spacing <= ev.sMaxH + 1e-6, { clause: '§11.7.2, §11.7.3', capacity: `V ≤ ${fmt(ev.sMaxV * 100, 0)} · H ≤ ${fmt(ev.sMaxH * 100, 0)} cm` }),
    check('rcSheets.v.wallCurtains', ad.curtains >= curtains, { clause: '§11.7.2.3', demand: `t = ${fmt(d.thickness * 100, 0)} cm`, capacity: String(ad.curtains) }),
    check('rcSheets.v.wallThickness', d.thickness >= tMin - 1e-6, { clause: '§11.3.1.1', demand: `${fmt(d.thickness * 100, 0)} cm`, capacity: `≥ ${fmt(tMin * 100, 0)} cm` }),
    ...(seis?.checks ?? []),
  ];
  const allOk = verifications.every((v) => v.ok);
  const generous = isGenerous(verifications);

  const combos: ComboTable = {
    headers: ['Pu', 'Mu', 'Vu', 'Mv', 'Mh'],
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
        { label: 'rcSheets.s.wallGeometry', formula: 'lw × hw × t', value: `${fmt(d.length)} × ${fmt(d.height)} m × ${fmt(d.thickness * 100, 0)} cm` },
        { label: 'rcSheets.s.materials', formula: "f'c · fy", value: `${fmt(c.mat.fc, 0)} · ${fmt(c.mat.fy, 0)} MPa` },
        { label: 'rcSheets.s.wallBase', formula: 'N = −Σσvv·t·w; M = Σ(N·e); V = Στ·t·w', value: '' },
        { label: 'rcSheets.s.vu', formula: 'Vu', value: `${fmt(vuMax)} kN (${d.combos[ish]?.combo ?? ''})` },
      ],
    },
    {
      title: 'rcSheets.g.wallShear',
      steps: [
        { label: 'rcSheets.s.vc', formula: "Vc = αc·√f'c·Acv", value: `${fmt(concrete[ish] ?? 0)} kN (${d.combos[ish]?.combo ?? ''})` },
        { label: 'rcSheets.s.wallRhoTReq', formula: 'ρt ≥ (Vu/φ − Vc)/(fy·Acv)', value: `${fmt(rhoTShear * 100, 3)} %` },
        { label: 'rcSheets.s.wallMin', formula: 'ρl,min · ρt,min (§11.6)', value: `${fmt(ev.rhoLMin * 100, 3)} · ${fmt(ev.rhoTMin * 100, 3)} %` },
        { label: 'rcSheets.s.wallVn', formula: "φVn = φ·min(Vc + ρt·fy·Acv; 0.66·√f'c·Acv)", value: `${fmt(ev.phiVnMin)} kN`, ok: ev.shear.every(ok1) },
      ],
    },
    {
      title: 'rcSheets.g.wallFlexure',
      steps: [
        { label: 'rcSheets.s.wallBoundary', formula: 'As,ext (Pu, Mu)', value: boundaryLabel },
        ...(c.pier ? [] : [{ label: 'rcSheets.s.wallPM', formula: 'φMn(Pu) ≥ Mu', value: `${fmt(Math.max(0, ...ev.pm), 3)} (${d.combos[ipm]?.combo ?? ''})`, ok: ev.pm.every(ok1) }]),
        { label: 'rcSheets.s.wallOut', formula: 'Mv, Mh ≤ φMn (b = 1 m)', value: `${fmt(Math.max(0, ...ev.out), 3)}`, ok: ev.out.every(ok1) },
      ],
    },
    ...(seis ? [{ title: 'rcSheets.g.seismic', steps: seis.steps }] : []),
    {
      title: 'rcSheets.g.proposal',
      steps: [
        { label: 'rcSheets.s.adopted', formula: wallLabel(ad), value: '' } as Step,
        adopted ? { label: 'rcSheets.s.adoptedByUser', value: '' } : { label: 'rcSheets.s.iterations', formula: 'ρ,min → As,ext → (Pu, Mu), Vu, (Mv, Mh)', value: String(iterations) },
        { label: 'rcSheets.s.wallScope', value: '' },
      ],
    },
  ];

  return {
    family: 'wall', key: d.key, name: d.name, level: d.level, length: d.length, height: d.height, thickness: d.thickness, demand: d,
    req: { rhoL: ev.rhoLMin, rhoT: Math.max(ev.rhoTMin, rhoTShear), sMaxV: ev.sMaxV, sMaxH: ev.sMaxH, curtains, boundary: proposed.boundary ? `${proposed.boundary.count} Ø${proposed.boundary.diameter}` : '—' },
    proposed, adopted: ad, isAdopted: !!adopted, iterations: adopted ? 0 : iterations, verifications, combos,
    utilization: Math.max(0, ...ev.pm, ...ev.shear, ...ev.out),
    status: allOk ? (generous ? 'warn' : 'ok') : 'fail', generous, steps,
    cover: c.cover,
    hLap: tensionLap(c.mat, ad.horizontal.diameter),
    vLaps: verticalLaps(c, ad, !!c.seismic || wallInTension(d)),
    ...(seis ? { seismic: seis } : {}),
    ...(c.tieDiameters ? { tieDiameters: c.tieDiameters } : {}),
    ...(c.minTieSpacing !== undefined ? { minTieSpacing: c.minTieSpacing } : {}),
  };
}

/** Whether any combination pulls an end of the wall's section: its in-plane force less its moment over the section modulus. */
export const wallInTension = (d: Pick<WallDemand, 'length' | 'thickness' | 'combos'>): boolean =>
  d.combos.some((k) => k.pu / (d.length * d.thickness) - (6 * Math.abs(k.mu)) / (d.thickness * d.length ** 2) < -1e-9);

/**
 * The lap of each vertical bar diameter with the storey above or the footing's dowels, m: §25.5.5.1
 * in compression (a third longer under 21 MPa), a class B tension lap no shorter where an end is
 * pulled or chapter 18 applies (§18.10.2.3).
 */
export function verticalLaps(c: Pick<WallContext, 'mat'>, ad: WallAdopted, tension: boolean): Array<{ dia: number; lap: number; tension: boolean }> {
  return [...new Set([ad.vertical.diameter, ...(ad.boundary ? [ad.boundary.diameter] : [])])].map((dia) => ({ dia, lap: verticalLap(c.mat, dia, tension), tension }));
}

export const verticalLap = (mat: Materials, dia: number, tension: boolean): number => {
  const compression = compressionLap(mat, dia);
  return tension ? Math.max(tensionLap(mat, dia), compression) : compression;
};

/** The bars a wall's boundary takes from the project's list, mm: Ø12 to Ø25, or the whole list when none falls there. */
export const boundaryBars = (list: readonly number[]): number[] => { const own = list.filter((x) => x >= 12 && x <= 25); return own.length ? own : [...list]; };

/** The next bar of the project's list above `d` a wall's web steps up to, mm; `d` when the list has none. */
export const nextWallBar = (list: readonly number[], d: number): number => [...list].sort((p, q) => p - q).find((x) => x > d && x >= 8 && x <= 25) ?? d;
