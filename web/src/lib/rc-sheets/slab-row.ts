import { computeAsFlexure, slabProvisions, stripCapacity, stripStrain } from '../engine/codes/argentina/losas';
import { evaluateBeamSections } from '../engine/codes/argentina/cirsoc201-beam-kernel';
import { concreteBelowTopBars, confinementOf, deriveDevelopment, deriveLap, topBarFactor, type DevelopmentResult } from '../codes/cirsoc201/anchorage';
import { crackControlMaxSpacing } from '../codes/cirsoc201/crack-control';
import { meshArea, meshLabel, proposeMesh } from './bars';
import type { Fmt } from './format';
import { check, ratioOf, type CheckLine, type ComboTable, type MeshBars, type Materials, type RowStatus, type Signed, type Step, type StepGroup, type SlabAdopted, isGenerous } from './types';

const EDITION = '2025' as const;

export type SlabFace = 'bottomX' | 'bottomY' | 'topX' | 'topY';
export const SLAB_FACES: readonly SlabFace[] = ['bottomX', 'bottomY', 'topX', 'topY'];

export interface SlabDemand {
  key: string; name: string; level?: string;
  /** m. */
  lx: number; ly: number; h: number;
  /** The panel's extent in plan and its elevation, m, where the level plan places it. */
  bounds?: { x0: number; x1: number; y0: number; y1: number; z: number };
  /** Wood–Armer design moments, kN·m/m, positive where the face needs steel. */
  m: Record<SlabFace, Signed>;
  /** Largest transverse shear per metre on faces normal to X and to Y, kN/m. */
  q?: { x: Signed; y: Signed };
  combos?: SlabComboForces[];
  /** Each element's top moments over all combinations where it asks for top steel, kN·m/m, at its centre: where the top bars must reach; `box` its extent in plan. */
  topField?: Array<{ x: number; y: number; topX: number; topY: number; box?: { x0: number; x1: number; y0: number; y1: number } }>;
}

export interface SlabComboForces { combo: string; bottomX: number; bottomY: number; topX: number; topY: number; qx: number; qy: number }

/** A panel the level's plan reads as a cantilever: spanning `dir` from its one support, `length` m clear. */
export interface SlabSpan { kind: 'cantilever'; dir: 'x' | 'y'; length: number }

export interface SlabContext {
  mat: Materials; cover: number; diameters: readonly number[]; span?: SlabSpan;
  /** The project's base mat by face (`slabBase`): no face is proposed lighter than it. */
  base?: Partial<Record<SlabFace, MeshBars>>;
}

/**
 * The proposal with each face the base mat does for set to it: one that needs no steel, or where
 * `holds` says the base mat meets the face's demand (absent: as much steel as the proposal, no wider
 * apart).
 */
export function withBase(proposed: SlabAdopted, base: SlabContext['base'], holds?: (f: SlabFace, m: MeshBars) => boolean): SlabAdopted {
  if (!base) return proposed;
  const out = { ...proposed };
  for (const f of SLAB_FACES) {
    const b = base[f], p = proposed[f];
    if (!b || !(b.dia > 0) || !(b.spacing > 0)) continue;
    const enough = holds ? holds(f, b) : meshArea(b) >= meshArea(p) - 1e-9 && b.spacing <= p.spacing + 1e-9;
    if (!(p.dia > 0) || enough) out[f] = { dia: b.dia, spacing: b.spacing };
  }
  return out;
}

/** How a panel spans: as its plan says when it is a cantilever, one way along it with one-way shear only across its support; else one-way past 2:1, both ways checked in shear. */
export function slabSpan(d: Pick<SlabDemand, 'lx' | 'ly'>, c: Pick<SlabContext, 'span'>, fmt: Fmt): { oneWay: boolean; mainIsX: boolean; shear: { x: boolean; y: boolean }; step?: Step } {
  const k = c.span;
  if (k?.kind === 'cantilever') return { oneWay: true, mainIsX: k.dir === 'x', shear: { x: k.dir === 'x', y: k.dir === 'y' }, step: { label: 'rcSheets.s.cantilever', formula: 'Lv', value: `${fmt(k.length)} m` } };
  const short = Math.min(d.lx, d.ly), long = Math.max(d.lx, d.ly);
  return { oneWay: short > 0 && long / short > 2, mainIsX: d.lx <= d.ly, shear: { x: true, y: true } };
}

export interface SlabFaceResult {
  mu: number; d: number; asStrength: number; asMin: number;
  /** What the distribution face of a one-way panel carries for the main face's steel, cm²/m; 0 elsewhere. */
  asDistribution?: number;
  asReq: number; sMax: number; phiMn: number; ok: boolean;
  /** The net tensile strain the face's steel reaches, and the least of a tension-controlled section; where the code's row reads it. */
  strain?: { epsT: number; epsTMin: number };
}

/** A slab bar's layout as §25.4.2.4 reads it: clear cover and spacing between centres, m. */
export interface SlabBarLayout { cover: number; spacing: number }

/** ld of a slab bar by the general expression of CIRSOC 201 §25.4.2.4, with cb from its cover and spacing and Ktr = 0. */
export function cirsocSlabDevelopment(mat: Materials, dia: number, top: boolean, h: number, layout: SlabBarLayout): DevelopmentResult {
  const psiT = top ? topBarFactor(concreteBelowTopBars(h, layout.cover, 0, dia)) : 1;
  return deriveDevelopment({ diameterMm: dia, fy: mat.fy, fc: mat.fc, favourableSpacing: false, confinement: confinementOf(dia, layout.cover * 1000, layout.spacing * 1000), psiT, edition: EDITION });
}

export const cirsocSlabLap = (mat: Materials, dia: number, top: boolean, h: number, layout: SlabBarLayout): number =>
  deriveLap(cirsocSlabDevelopment(mat, dia, top, h, layout), { edition: EDITION }).lapM;

/** What a code adds to the slab rows: the distribution steel of a one-way panel as a share of the main steel, and how a face's bars develop. */
export interface SlabRowCode {
  distribution?: { share: number; clause: string };
  development?: { of(mat: Materials, dia: number, top: boolean, h: number, layout: SlabBarLayout): DevelopmentResult; clause: string };
  /** The crack-control spacing of a one-way panel's main bars, m, from fy and their clear cover to the tension face. */
  crackSpacing?: { of(fy: number, clearCover: number): number; clause: string };
  /** The largest spacing of a one-way panel's main and distribution bars where the code allows more, m. */
  oneWaySpacing?: { max: number; clause: string };
  /** The bottom bars of a cantilever, which carries none in tension: the span's carried into it. */
  cantileverBottom?: { clause: string };
}

/** CIRSOC 201-2025 and ACI 318-19 §7.7.2.2: a one-way slab's main bars within the spacing of §24.3.2, with fs = ⅔·fy (§24.3.2.1). */
const CRACK_SPACING: NonNullable<SlabRowCode['crackSpacing']> = {
  of: (fy, clearCover) => crackControlMaxSpacing(EDITION, { fy, clearCoverToTensionFace: clearCover }).maxSpacing,
  clause: '§7.7.2.2, §24.3.2',
};

export const ACI_SLAB_ROW: SlabRowCode = { crackSpacing: CRACK_SPACING };

/**
 * CIRSOC 201-2025 and the cátedra where it is silent or laxer (FIUBA notes §13.1–13.2): distribution
 * steel at least a fifth of the main steel, a one-way panel's bars at most 25 cm apart, and a
 * cantilever's bottom bars carried in from the span for the positive moments while it is built.
 */
export const CIRSOC_SLAB_ROW: SlabRowCode = {
  distribution: { share: 0.2, clause: '§24.4.3.2; FIUBA §13.1' },
  oneWaySpacing: { max: 0.25, clause: 'FIUBA §13.1' },
  cantileverBottom: { clause: 'FIUBA §13.2' },
  development: { of: cirsocSlabDevelopment, clause: '§25.4.2.4, Tabla 25.4.2.5' },
  crackSpacing: CRACK_SPACING,
};

export interface SlabRow {
  family: 'slab';
  key: string; name: string; level?: string;
  h: number; lx: number; ly: number; oneWay: boolean;
  demand: SlabDemand;
  faces: Record<SlabFace, SlabFaceResult>;
  proposed: SlabAdopted;
  adopted: SlabAdopted;
  isAdopted: boolean;
  shear: { x: { vu: number; phiVc: number }; y: { vu: number; phiVc: number } };
  verifications: CheckLine[];
  combos: ComboTable;
  status: RowStatus;
  generous: boolean;
  steps: StepGroup[];
  /** The proposal took more steel than its strength asks, for its deflection. */
  byDeflection?: true;
}

export const slabRowFor = (code: SlabRowCode) => (d: SlabDemand, c: SlabContext, adopted: SlabAdopted | undefined, fmt: Fmt): SlabRow => designSlab(d, c, adopted, fmt, code);

export const slabRow = slabRowFor({});

function designSlab(d: SlabDemand, c: SlabContext, adopted: SlabAdopted | undefined, fmt: Fmt, code: SlabRowCode): SlabRow {
  const prov = slabProvisions(EDITION, c.mat.fy, d.h);
  const short = Math.min(d.lx, d.ly), long = Math.max(d.lx, d.ly);
  const sp = slabSpan(d, c, fmt), oneWay = sp.oneWay;
  const mainIsX = sp.mainIsX;
  const sMaxOf = (face: SlabFace, clearCover: number) => {
    if (!oneWay) return prov.sTwoWay;
    const main = face.endsWith('X') === mainIsX;
    const own = main ? Math.min(prov.sOneWay, code.crackSpacing?.of(c.mat.fy, clearCover) ?? Infinity) : prov.sDistribution;
    return Math.min(own, code.oneWaySpacing?.max ?? Infinity);
  };
  const cantilever = c.span?.kind === 'cantilever';
  const tensionSide = cantilever ? 'top' : 'bottom';
  const share = oneWay ? code.distribution?.share ?? 0 : 0;
  const isDistribution = (face: SlabFace) => share > 0 && face.startsWith(tensionSide) && face.endsWith('X') !== mainIsX;
  const mainOf = (face: SlabFace): SlabFace => `${face.startsWith('bottom') ? 'bottom' : 'top'}${mainIsX ? 'X' : 'Y'}` as SlabFace;
  const reqOf = (face: SlabFace, outerDia: number, innerDia: number, mainArea = 0): Omit<SlabFaceResult, 'phiMn' | 'ok'> => {
    const outer = face.endsWith('X');
    const depth = d.h - c.cover - (outer ? outerDia / 2000 : outerDia / 1000 + innerDia / 2000);
    const mu = Math.max(0, d.m[face].value);
    const asStrength = mu > 1e-6 ? computeAsFlexure(mu, d.h, depth, c.mat.fc, c.mat.fy, EDITION).As : 0;
    const needsSteel = mu > 1e-6 || (cantilever ? face.startsWith('top') || !!code.cantileverBottom : face.startsWith('bottom'));
    const asMin = needsSteel ? prov.AsMin : 0;
    const asDistribution = isDistribution(face) ? share * mainArea : 0;
    return { mu, d: depth, asStrength, asMin, asDistribution, asReq: Math.max(asStrength, asMin, asDistribution), sMax: sMaxOf(face, c.cover + (outer ? 0 : outerDia / 1000)) };
  };

  const guessDia = c.diameters.includes(10) ? 10 : c.diameters.find((x) => x >= 8) ?? 10;
  // The depths follow the bars chosen: propose with a guessed diameter, then again with the diameters
  // the proposal took, until it settles, then close the spacing of any face still short.
  const reqWith = (p: SlabAdopted | null) => Object.fromEntries(SLAB_FACES.map((f) => {
    const side = f.startsWith('bottom') ? 'bottom' : 'top';
    return [f, reqOf(f, p?.[`${side}X` as SlabFace].dia || guessDia, p?.[`${side}Y` as SlabFace].dia || guessDia, p ? meshArea(p[mainOf(f)]) : 0)];
  })) as Record<SlabFace, ReturnType<typeof reqOf>>;
  const meshesFor = (pre: Record<SlabFace, ReturnType<typeof reqOf>>): SlabAdopted =>
    Object.fromEntries(SLAB_FACES.map((f) => [f, pre[f].asReq > 0 ? proposeMesh(pre[f].asReq, pre[f].sMax, c.diameters) : { dia: 0, spacing: 0 }])) as unknown as SlabAdopted;
  let proposed = meshesFor(reqWith(null));
  for (let k = 0; k < 6; k++) {
    const next = meshesFor(reqWith(proposed));
    if (SLAB_FACES.every((f) => next[f].dia === proposed[f].dia && Math.abs(next[f].spacing - proposed[f].spacing) < 1e-9)) break;
    proposed = next;
  }
  for (let k = 0; k < 8; k++) {
    const req = reqWith(proposed);
    const short = SLAB_FACES.filter((f) => req[f].mu > 1e-6 && proposed[f].dia > 0 && stripCapacity(meshArea(proposed[f]), d.h, req[f].d, c.mat.fc, c.mat.fy, EDITION) < req[f].mu - 1e-6);
    if (!short.length) break;
    for (const f of short) {
      const m = proposed[f];
      proposed = { ...proposed, [f]: m.spacing > 0.075 + 1e-9 ? { dia: m.dia, spacing: Math.round((m.spacing - 0.025) * 1000) / 1000 } : { dia: c.diameters.find((x) => x > m.dia) ?? m.dia, spacing: m.spacing } };
    }
  }
  for (const f of SLAB_FACES.filter(isDistribution)) {
    const r = reqWith(proposed)[f];
    if (meshArea(proposed[f]) < r.asReq - 1e-6) proposed = { ...proposed, [f]: proposeMesh(r.asReq, r.sMax, c.diameters) };
  }
  if (c.base) {
    const req = reqWith(proposed);
    proposed = withBase(proposed, c.base, (f, m) => meshArea(m) >= req[f].asReq - 1e-6 && m.spacing <= req[f].sMax + 1e-9
      && (req[f].mu <= 1e-6 || stripCapacity(meshArea(m), d.h, req[f].d, c.mat.fc, c.mat.fy, EDITION) >= req[f].mu - 1e-6));
  }
  const a = adopted ?? proposed;

  const faces = {} as Record<SlabFace, SlabFaceResult>;
  for (const f of SLAB_FACES) {
    const side = f.startsWith('bottom') ? 'bottom' : 'top';
    const r = reqOf(f, a[`${side}X` as SlabFace].dia || guessDia, a[`${side}Y` as SlabFace].dia || guessDia, meshArea(a[mainOf(f)]));
    const mesh = a[f];
    const as = meshArea(mesh);
    const phiMn = as > 0 ? stripCapacity(as, d.h, r.d, c.mat.fc, c.mat.fy, EDITION) : 0;
    const spacingOk = mesh.dia === 0 || mesh.spacing <= r.sMax + 1e-6;
    const strain = r.mu > 1e-6 && as > 0 ? stripStrain(as, d.h, r.d, c.mat.fc, c.mat.fy, EDITION) : undefined;
    const ductile = !strain || strain.epsT >= strain.epsTMin - 1e-9;
    faces[f] = { ...r, phiMn, ok: as >= r.asReq - 1e-6 && phiMn >= r.mu - 1e-6 && spacingOk && ductile, ...(strain ? { strain } : {}) };
  }
  const shearCap = (dir: 'X' | 'Y') => {
    const face: SlabFace = meshArea(a[`top${dir}`]) > 0 ? `top${dir}` : `bottom${dir}`;
    const tension = cantilever ? meshArea(a[`top${dir}`]) : Math.min(meshArea(a[`bottom${dir}`]), meshArea(a[face]) || Infinity);
    const r = evaluateBeamSections([{ edition: EDITION, fc: c.mat.fc * 1e6, fy: c.mat.fy * 1e6, b: 1, h: d.h, d: faces[face].d, As: tension * 1e-4, Ag: d.h }])?.[0];
    return r && r.shearValid ? 0.75 * r.Vc / 1e3 : 0;
  };
  const shear = { x: { vu: d.q?.x.value ?? 0, phiVc: shearCap('X') }, y: { vu: d.q?.y.value ?? 0, phiVc: shearCap('Y') } };
  const minClause = (f: SlabFace) => {
    if (!cantilever) return '§7.6.1, §8.6.1';
    if (f.startsWith('bottom') && faces[f].mu <= 1e-6) return code.cantileverBottom?.clause ?? '§7.6.1';
    return f.endsWith('X') === mainIsX ? '§7.6.1' : '§24.4.3.2';
  };
  const verifications: CheckLine[] = [
    ...SLAB_FACES.filter((f) => faces[f].mu > 1e-6).map((f) => check(`rcSheets.v.slab.${f}`, faces[f].phiMn >= faces[f].mu - 1e-6, { clause: '§22.2', demand: `${fmt(faces[f].mu)} kN·m/m`, capacity: `${fmt(faces[f].phiMn)} kN·m/m`, ratio: ratioOf(faces[f].mu, faces[f].phiMn) })),
    ...SLAB_FACES.filter((f) => faces[f].strain && faces[f].strain!.epsT < faces[f].strain!.epsTMin - 1e-9).map((f) => check('rcSheets.v.ductility', false, { clause: oneWay ? '§7.3.3.1' : '§8.3.3.1', demand: `εt = ${fmt(faces[f].strain!.epsT * 1000)} ‰`, capacity: `≥ ${fmt(faces[f].strain!.epsTMin * 1000)} ‰` })),
    ...SLAB_FACES.filter((f) => faces[f].asReq > 0).map((f) => check(`rcSheets.v.slabMin.${f}`, meshArea(a[f]) >= faces[f].asReq - 1e-6, { clause: minClause(f), demand: `${fmt(faces[f].asReq)} cm²/m`, capacity: `${fmt(meshArea(a[f]))} cm²/m`, ratio: ratioOf(faces[f].asReq, meshArea(a[f])) })),
    ...SLAB_FACES.filter((f) => (faces[f].asDistribution ?? 0) > 0).map((f) => check(`rcSheets.v.slabDistribution.${f}`, meshArea(a[f]) >= faces[f].asDistribution! - 1e-6, { clause: code.distribution!.clause, demand: `${fmt(faces[f].asDistribution!)} cm²/m`, capacity: `${fmt(meshArea(a[f]))} cm²/m`, ratio: ratioOf(faces[f].asDistribution!, meshArea(a[f])) })),
    check('rcSheets.v.slabSpacing', SLAB_FACES.every((f) => a[f].dia === 0 || a[f].spacing <= faces[f].sMax + 1e-6), { clause: oneWay ? ['§7.7.2.3', code.crackSpacing?.clause, code.oneWaySpacing?.clause].filter(Boolean).join(', ') : '§8.7.2.2', capacity: `≤ ${fmt(Math.min(...SLAB_FACES.map((f) => faces[f].sMax)) * 100, 0)} cm` }),
    ...(d.q ? [
      ...(sp.shear.x ? [check('rcSheets.v.slabShearX', shear.x.vu <= shear.x.phiVc + 1e-6, { clause: '§22.5, §7.5.3', demand: `${fmt(shear.x.vu)} kN/m`, capacity: `${fmt(shear.x.phiVc)} kN/m`, ratio: ratioOf(shear.x.vu, shear.x.phiVc) })] : []),
      ...(sp.shear.y ? [check('rcSheets.v.slabShearY', shear.y.vu <= shear.y.phiVc + 1e-6, { clause: '§22.5, §7.5.3', demand: `${fmt(shear.y.vu)} kN/m`, capacity: `${fmt(shear.y.phiVc)} kN/m`, ratio: ratioOf(shear.y.vu, shear.y.phiVc) })] : []),
    ] : []),
  ];
  const allOk = SLAB_FACES.every((f) => faces[f].ok) && verifications.every((v) => v.ok);
  const generous = isGenerous(verifications);
  const cap = (f: SlabFace) => faces[f].phiMn;
  const combos: ComboTable = {
    headers: ['rcSheets.face.bottomX', 'rcSheets.face.bottomY', 'rcSheets.face.topX', 'rcSheets.face.topY', 'qx', 'qy'],
    rows: (d.combos ?? []).map((k) => {
      const ratio = Math.max(ratioOf(k.bottomX, cap('bottomX')), ratioOf(k.bottomY, cap('bottomY')), ratioOf(k.topX, cap('topX')), ratioOf(k.topY, cap('topY')),
        d.q && sp.shear.x ? ratioOf(k.qx, shear.x.phiVc) : 0, d.q && sp.shear.y ? ratioOf(k.qy, shear.y.phiVc) : 0);
      return { combo: k.combo, values: [fmt(k.bottomX, 1), fmt(k.bottomY, 1), fmt(k.topX, 1), fmt(k.topY, 1), fmt(k.qx, 1), fmt(k.qy, 1)], ratio, ok: ratio <= 1 + 1e-6 };
    }),
  };

  const steps: StepGroup[] = [
    {
      title: 'rcSheets.g.data',
      steps: [
        { label: 'rcSheets.s.panel', formula: 'Lx × Ly · h', value: `${fmt(d.lx)} × ${fmt(d.ly)} m · ${fmt(d.h * 100, 0)} cm` },
        sp.step ?? { label: oneWay ? 'rcSheets.s.oneWay' : 'rcSheets.s.twoWay', formula: 'Lmax/Lmin > 2', value: fmt(short > 0 ? long / short : 0) },
        { label: 'rcSheets.s.materials', formula: "f'c · fy", value: `${fmt(c.mat.fc, 0)} · ${fmt(c.mat.fy, 0)} MPa` },
        { label: 'rcSheets.s.slabMin', formula: 'As,min = 0.0018·b·h', value: `${fmt(prov.AsMin)} cm²/m` },
      ],
    },
    ...SLAB_FACES.map((f) => faceSteps(f, d, faces[f], a[f], fmt)),
    ...(code.development ? [developmentSteps(d, c, a, code.development, fmt)] : []),
    ...(d.q ? [{
      title: 'rcSheets.g.slabShear',
      steps: [
        ...(sp.shear.x ? [{ label: 'rcSheets.s.slabShearX', formula: 'qx ≤ φ·Vc (b = 1 m)', value: `${fmt(shear.x.vu)} ≤ ${fmt(shear.x.phiVc)} kN/m`, ok: shear.x.vu <= shear.x.phiVc + 1e-6 }] : []),
        ...(sp.shear.y ? [{ label: 'rcSheets.s.slabShearY', formula: 'qy ≤ φ·Vc (b = 1 m)', value: `${fmt(shear.y.vu)} ≤ ${fmt(shear.y.phiVc)} kN/m`, ok: shear.y.vu <= shear.y.phiVc + 1e-6 }] : []),
        { label: 'rcSheets.s.punchingOut', value: '' },
      ],
    }] : []),
  ];

  return {
    family: 'slab', key: d.key, name: d.name, level: d.level, h: d.h, lx: d.lx, ly: d.ly, oneWay, demand: d, faces, shear, verifications, combos,
    proposed, adopted: a, isAdopted: !!adopted, status: allOk ? (generous ? 'warn' : 'ok') : 'fail', generous, steps,
  };
}

function faceSteps(f: SlabFace, d: SlabDemand, r: SlabFaceResult, mesh: MeshBars, fmt: Fmt): StepGroup {
  const src = d.m[f].source;
  const steps: Step[] = [
    { label: 'rcSheets.s.muSlab', formula: 'Mu (Wood–Armer)', value: `${fmt(r.mu)} kN·m/m${src ? ` (${src.combo})` : ''}` },
    { label: 'rcSheets.s.d', formula: 'd = h − r − Ø/2', value: `${fmt(r.d * 100, 1)} cm` },
    { label: 'rcSheets.s.asStrength', formula: 'Mu ≤ φ·As·fy·(d − a/2)', value: `${fmt(r.asStrength)} cm²/m` },
    ...(r.asDistribution ? [{ label: 'rcSheets.s.slabDistribution', formula: 'As,rep ≥ max(0.0018·b·h; As,ppal/5)', value: `${fmt(r.asDistribution)} cm²/m` }] : []),
    { label: 'rcSheets.s.asReq', formula: r.asDistribution ? 'max(As; As,min; As,rep)' : 'max(As; As,min)', value: `${fmt(r.asReq)} cm²/m` },
    { label: 'rcSheets.s.sMax', formula: 's,max', value: `${fmt(r.sMax * 100, 0)} cm` },
    { label: 'rcSheets.s.adopted', formula: mesh.dia ? meshLabel(mesh) : '—', value: `${fmt(meshArea(mesh))} cm²/m`, ok: r.ok },
    ...(r.mu > 1e-6 ? [{ label: 'rcSheets.s.verifySlab', formula: 'φMn ≥ Mu', value: `${fmt(r.phiMn)} ≥ ${fmt(r.mu)} kN·m/m`, ok: r.phiMn >= r.mu - 1e-6 }] : []),
  ];
  return { title: `rcSheets.face.${f}`, steps };
}

function developmentSteps(d: SlabDemand, c: SlabContext, a: SlabAdopted, dev: NonNullable<SlabRowCode['development']>, fmt: Fmt): StepGroup {
  const steps: Step[] = SLAB_FACES.filter((f) => a[f].dia > 0 && a[f].spacing > 0).map((f) => {
    const top = f.startsWith('top');
    const inner = !f.endsWith('X');
    const cover = c.cover + (inner ? a[`${top ? 'top' : 'bottom'}X`].dia / 1000 : 0);
    const r = dev.of(c.mat, a[f].dia, top, d.h, { cover, spacing: a[f].spacing });
    const cb = Math.min(cover * 1000 + a[f].dia / 2, a[f].spacing * 500);
    return { label: `rcSheets.face.${f}`, formula: `${meshLabel(a[f])}: cb = min(r + db/2; s/2) = ${fmt(cb, 0)} mm; (cb + Ktr)/db = ${fmt(r.confinementTerm ?? 0, 2)} ≤ 2.5`, value: `ℓd = ${fmt(r.ldM * 100, 0)} cm` };
  });
  return { title: 'rcSheets.g.slabAnchorage', steps: [{ label: 'rcSheets.s.slabLd', formula: `ℓd = fy·ψt·ψs·ψg/(1.1·λ·√f'c·(cb + Ktr)/db)·db ≥ 300 mm (${dev.clause})`, value: '' }, ...steps] };
}
