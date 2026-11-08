import { computeAsFlexure, slabProvisions, stripCapacity } from '../engine/codes/argentina/losas';
import { meshArea, meshLabel, proposeMesh } from './bars';
import type { Fmt } from './format';
import type { MeshBars, Materials, RowStatus, Signed, Step, StepGroup, SlabAdopted } from './types';

const EDITION = '2025' as const;

export type SlabFace = 'bottomX' | 'bottomY' | 'topX' | 'topY';
export const SLAB_FACES: readonly SlabFace[] = ['bottomX', 'bottomY', 'topX', 'topY'];

export interface SlabDemand {
  key: string; name: string; level?: string;
  /** m. */
  lx: number; ly: number; h: number;
  /** Wood–Armer design moments, kN·m/m, positive where the face needs steel. */
  m: Record<SlabFace, Signed>;
}

export interface SlabContext { mat: Materials; cover: number; diameters: readonly number[] }

export interface SlabFaceResult { mu: number; d: number; asStrength: number; asMin: number; asReq: number; sMax: number; phiMn: number; ok: boolean }

export interface SlabRow {
  family: 'slab';
  key: string; name: string; level?: string;
  h: number; lx: number; ly: number; oneWay: boolean;
  demand: SlabDemand;
  faces: Record<SlabFace, SlabFaceResult>;
  proposed: SlabAdopted;
  adopted: SlabAdopted;
  isAdopted: boolean;
  status: RowStatus;
  generous: boolean;
  steps: StepGroup[];
}

export function slabRow(d: SlabDemand, c: SlabContext, adopted: SlabAdopted | undefined, fmt: Fmt): SlabRow {
  const prov = slabProvisions(EDITION, c.mat.fy, d.h);
  const short = Math.min(d.lx, d.ly), long = Math.max(d.lx, d.ly);
  const oneWay = short > 0 && long / short > 2;
  const mainIsX = d.lx <= d.ly;
  const sMaxOf = (face: SlabFace) => {
    if (!oneWay) return prov.sTwoWay;
    const main = face.endsWith('X') === mainIsX;
    return main ? prov.sOneWay : prov.sDistribution;
  };
  const reqOf = (face: SlabFace, outerDia: number, innerDia: number): Omit<SlabFaceResult, 'phiMn' | 'ok'> => {
    const outer = face.endsWith('X');
    const depth = d.h - c.cover - (outer ? outerDia / 2000 : outerDia / 1000 + innerDia / 2000);
    const mu = Math.max(0, d.m[face].value);
    const asStrength = mu > 1e-6 ? computeAsFlexure(mu, d.h, depth, c.mat.fc, c.mat.fy, EDITION).As : 0;
    const needsSteel = face.startsWith('bottom') || mu > 1e-6;
    const asMin = needsSteel ? prov.AsMin : 0;
    return { mu, d: depth, asStrength, asMin, asReq: Math.max(asStrength, asMin), sMax: sMaxOf(face) };
  };

  const guessDia = c.diameters.includes(10) ? 10 : c.diameters.find((x) => x >= 8) ?? 10;
  const pre = Object.fromEntries(SLAB_FACES.map((f) => [f, reqOf(f, guessDia, guessDia)])) as Record<SlabFace, ReturnType<typeof reqOf>>;
  const meshFor = (f: SlabFace): MeshBars => (pre[f].asReq > 0 ? proposeMesh(pre[f].asReq, pre[f].sMax, c.diameters) : { dia: 0, spacing: 0 });
  const proposed: SlabAdopted = { bottomX: meshFor('bottomX'), bottomY: meshFor('bottomY'), topX: meshFor('topX'), topY: meshFor('topY') };
  const a = adopted ?? proposed;

  const faces = {} as Record<SlabFace, SlabFaceResult>;
  for (const f of SLAB_FACES) {
    const side = f.startsWith('bottom') ? 'bottom' : 'top';
    const r = reqOf(f, a[`${side}X` as SlabFace].dia || guessDia, a[`${side}Y` as SlabFace].dia || guessDia);
    const mesh = a[f];
    const as = meshArea(mesh);
    const phiMn = as > 0 ? stripCapacity(as, d.h, r.d, c.mat.fc, c.mat.fy, EDITION) : 0;
    const spacingOk = mesh.dia === 0 || mesh.spacing <= r.sMax + 1e-6;
    faces[f] = { ...r, phiMn, ok: as >= r.asReq - 1e-6 && phiMn >= r.mu - 1e-6 && spacingOk };
  }
  const allOk = SLAB_FACES.every((f) => faces[f].ok);
  const generous = SLAB_FACES.some((f) => faces[f].asReq > 0 && meshArea(a[f]) > 1.2 * faces[f].asReq + 1e-6 && faces[f].asReq > faces[f].asMin + 1e-6);

  const steps: StepGroup[] = [
    {
      title: 'rcSheets.g.data',
      steps: [
        { label: 'rcSheets.s.panel', formula: 'Lx × Ly · h', value: `${fmt(d.lx)} × ${fmt(d.ly)} m · ${fmt(d.h * 100, 0)} cm` },
        { label: oneWay ? 'rcSheets.s.oneWay' : 'rcSheets.s.twoWay', formula: 'Lmax/Lmin > 2', value: fmt(short > 0 ? long / short : 0) },
        { label: 'rcSheets.s.materials', formula: "f'c · fy", value: `${fmt(c.mat.fc, 0)} · ${fmt(c.mat.fy, 0)} MPa` },
        { label: 'rcSheets.s.slabMin', formula: 'As,min = 0.0018·b·h', value: `${fmt(prov.AsMin)} cm²/m` },
      ],
    },
    ...SLAB_FACES.map((f) => faceSteps(f, d, faces[f], a[f], fmt)),
  ];

  return {
    family: 'slab', key: d.key, name: d.name, level: d.level, h: d.h, lx: d.lx, ly: d.ly, oneWay, demand: d, faces,
    proposed, adopted: a, isAdopted: !!adopted, status: allOk ? (generous ? 'warn' : 'ok') : 'fail', generous, steps,
  };
}

function faceSteps(f: SlabFace, d: SlabDemand, r: SlabFaceResult, mesh: MeshBars, fmt: Fmt): StepGroup {
  const src = d.m[f].source;
  const steps: Step[] = [
    { label: 'rcSheets.s.muSlab', formula: 'Mu (Wood–Armer)', value: `${fmt(r.mu)} kN·m/m${src ? ` (${src.combo})` : ''}` },
    { label: 'rcSheets.s.d', formula: 'd = h − r − Ø/2', value: `${fmt(r.d * 100, 1)} cm` },
    { label: 'rcSheets.s.asStrength', formula: 'Mu ≤ φ·As·fy·(d − a/2)', value: `${fmt(r.asStrength)} cm²/m` },
    { label: 'rcSheets.s.asReq', formula: 'max(As; As,min)', value: `${fmt(r.asReq)} cm²/m` },
    { label: 'rcSheets.s.sMax', formula: 's,max', value: `${fmt(r.sMax * 100, 0)} cm` },
    { label: 'rcSheets.s.adopted', formula: mesh.dia ? meshLabel(mesh) : '—', value: `${fmt(meshArea(mesh))} cm²/m`, ok: r.ok },
    ...(r.mu > 1e-6 ? [{ label: 'rcSheets.s.verifySlab', formula: 'φMn ≥ Mu', value: `${fmt(r.phiMn)} ≥ ${fmt(r.mu)} kN·m/m`, ok: r.phiMn >= r.mu - 1e-6 }] : []),
  ];
  return { title: `rcSheets.face.${f}`, steps };
}
