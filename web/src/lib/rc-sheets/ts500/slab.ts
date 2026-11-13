import { meshArea, meshLabel, proposeMesh } from '../bars';
import type { Fmt } from '../format';
import { SLAB_FACES, type SlabContext, type SlabDemand, type SlabFace, type SlabFaceResult, type SlabRow } from '../slab-row';
import { check, ratioOf, type CheckLine, type ComboTable, type MeshBars, type SlabAdopted, type Step, type StepGroup } from '../types';
import { toConfirm as U, ts500Mat, vcrOf, type Ts500Mat } from './basis';
import { designFlexure, stripCapacity } from './section';
import { materialSteps } from './steps';

function minima(t: Ts500Mat): { main: number; dist: number; each: number; sum: number } {
  const mild = t.fyk < 400;
  return { main: mild ? 0.003 : 0.002, dist: 0.2, each: 0.0015, sum: mild ? 0.004 : 0.0035 };
}

export function slabRow(d: SlabDemand, c: SlabContext, adopted: SlabAdopted | undefined, fmt: Fmt): SlabRow {
  const t = ts500Mat(c.mat);
  const short = Math.min(d.lx, d.ly), long = Math.max(d.lx, d.ly);
  const oneWay = short > 0 && long / short > 2;
  const mainIsX = d.lx <= d.ly;
  const mins = minima(t);
  const isMain = (face: SlabFace) => face.endsWith('X') === mainIsX;
  const sMaxOf = (face: SlabFace) => (oneWay ? (isMain(face) ? Math.min(1.5 * d.h, 0.2) : 0.3) : (isMain(face) ? Math.min(1.5 * d.h, 0.2) : 0.25));
  const depthOf = (face: SlabFace, outerDia: number, innerDia: number) => d.h - c.cover - (face.endsWith('X') ? outerDia / 2000 : outerDia / 1000 + innerDia / 2000);
  const strength = (face: SlabFace, depth: number) => {
    const mu = Math.max(0, d.m[face].value);
    return { mu, as: mu > 1e-6 ? designFlexure({ b: 1, h: d.h }, t, mu, 0, depth, d.h - depth).as : 0 };
  };
  const reqOf = (face: SlabFace, outerDia: number, innerDia: number): Omit<SlabFaceResult, 'phiMn' | 'ok'> => {
    const depth = depthOf(face, outerDia, innerDia);
    const { mu, as } = strength(face, depth);
    const needsSteel = face.startsWith('bottom') || mu > 1e-6;
    let asMin = 0;
    if (needsSteel) {
      if (!oneWay) asMin = mins.each * d.h * 1e4;
      else if (isMain(face)) asMin = mins.main * d.h * 1e4;
      else {
        const main: SlabFace = face.startsWith('bottom') ? (mainIsX ? 'bottomX' : 'bottomY') : (mainIsX ? 'topX' : 'topY');
        const mainReq = Math.max(strength(main, depthOf(main, outerDia, innerDia)).as, mins.main * d.h * 1e4);
        asMin = mins.dist * mainReq;
      }
    }
    return { mu, d: depth, asStrength: as, asMin, asReq: Math.max(as, asMin), sMax: sMaxOf(face) };
  };

  const guessDia = c.diameters.includes(10) ? 10 : c.diameters.find((x) => x >= 8) ?? 10;
  const pre = Object.fromEntries(SLAB_FACES.map((f) => [f, reqOf(f, guessDia, guessDia)])) as Record<SlabFace, ReturnType<typeof reqOf>>;
  const sumMin = oneWay ? 0 : mins.sum * d.h * 1e4;
  const shortBottom: SlabFace = mainIsX ? 'bottomX' : 'bottomY';
  const shortfall = Math.max(0, sumMin - pre.bottomX.asReq - pre.bottomY.asReq);
  const target = (f: SlabFace) => pre[f].asReq + (f === shortBottom ? shortfall : 0);
  const meshFor = (f: SlabFace): MeshBars => (target(f) > 0 ? proposeMesh(target(f), pre[f].sMax, c.diameters) : { dia: 0, spacing: 0 });
  const proposed: SlabAdopted = { bottomX: meshFor('bottomX'), bottomY: meshFor('bottomY'), topX: meshFor('topX'), topY: meshFor('topY') };
  const a = adopted ?? proposed;

  const faces = {} as Record<SlabFace, SlabFaceResult>;
  for (const f of SLAB_FACES) {
    const side = f.startsWith('bottom') ? 'bottom' : 'top';
    const r = reqOf(f, a[`${side}X` as SlabFace].dia || guessDia, a[`${side}Y` as SlabFace].dia || guessDia);
    const as = meshArea(a[f]);
    const phiMn = as > 0 ? stripCapacity({ b: 1, h: d.h, layers: [{ depth: r.d, area: as * 1e-4 }] }, t, 0) : 0;
    const spacingOk = a[f].dia === 0 || a[f].spacing <= r.sMax + 1e-6;
    faces[f] = { ...r, phiMn, ok: as >= r.asReq - 1e-6 && phiMn >= r.mu - 1e-6 && spacingOk };
  }
  const shearCap = (dir: 'X' | 'Y') => {
    const face: SlabFace = meshArea(a[`top${dir}`]) > 0 ? `top${dir}` : `bottom${dir}`;
    return vcrOf(t, 1, Math.min(faces[face].d, faces[`bottom${dir}`].d), 0, d.h);
  };
  const shear = { x: { vu: d.q?.x.value ?? 0, phiVc: shearCap('X') }, y: { vu: d.q?.y.value ?? 0, phiVc: shearCap('Y') } };
  const minClause = oneWay ? 'TS 500 (one-way slabs)' : 'TS 500 (two-way slabs)';
  const label = (k: string) => (oneWay ? U(k) : k);
  const sumProvided = meshArea(a.bottomX) + meshArea(a.bottomY);
  const verifications: CheckLine[] = [
    ...SLAB_FACES.filter((f) => faces[f].mu > 1e-6).map((f) => check(`rcSheets.v.slab.${f}`, faces[f].phiMn >= faces[f].mu - 1e-6, { clause: '7.1', demand: `${fmt(faces[f].mu)} kN·m/m`, capacity: `${fmt(faces[f].phiMn)} kN·m/m`, ratio: ratioOf(faces[f].mu, faces[f].phiMn) })),
    ...SLAB_FACES.filter((f) => faces[f].asReq > 0).map((f) => check(label(`rcSheets.v.slabMin.${f}`), meshArea(a[f]) >= faces[f].asReq - 1e-6, { clause: minClause, demand: `${fmt(faces[f].asReq)} cm²/m`, capacity: `${fmt(meshArea(a[f]))} cm²/m`, ratio: ratioOf(faces[f].asReq, meshArea(a[f])) })),
    ...(oneWay ? [] : [check('rcSheets.ts500.v.slabSum', sumProvided >= sumMin - 1e-6, { clause: minClause, demand: `${fmt(sumMin)} cm²/m`, capacity: `${fmt(sumProvided)} cm²/m`, ratio: ratioOf(sumMin, sumProvided) })]),
    check(label('rcSheets.v.slabSpacing'), SLAB_FACES.every((f) => a[f].dia === 0 || a[f].spacing <= faces[f].sMax + 1e-6), { clause: minClause, capacity: `≤ ${fmt(Math.min(...SLAB_FACES.map((f) => faces[f].sMax)) * 100, 0)} cm` }),
    ...(d.q ? [
      check('rcSheets.v.slabShearX', shear.x.vu <= shear.x.phiVc + 1e-6, { clause: '8.1.3', demand: `${fmt(shear.x.vu)} kN/m`, capacity: `${fmt(shear.x.phiVc)} kN/m`, ratio: ratioOf(shear.x.vu, shear.x.phiVc) }),
      check('rcSheets.v.slabShearY', shear.y.vu <= shear.y.phiVc + 1e-6, { clause: '8.1.3', demand: `${fmt(shear.y.vu)} kN/m`, capacity: `${fmt(shear.y.phiVc)} kN/m`, ratio: ratioOf(shear.y.vu, shear.y.phiVc) }),
    ] : []),
  ];
  const allOk = SLAB_FACES.every((f) => faces[f].ok) && verifications.every((v) => v.ok);
  const cap = (f: SlabFace) => faces[f].phiMn;
  const combos: ComboTable = {
    headers: ['rcSheets.face.bottomX', 'rcSheets.face.bottomY', 'rcSheets.face.topX', 'rcSheets.face.topY', 'qx', 'qy'],
    rows: (d.combos ?? []).map((k) => {
      const ratio = Math.max(ratioOf(k.bottomX, cap('bottomX')), ratioOf(k.bottomY, cap('bottomY')), ratioOf(k.topX, cap('topX')), ratioOf(k.topY, cap('topY')),
        d.q ? ratioOf(k.qx, shear.x.phiVc) : 0, d.q ? ratioOf(k.qy, shear.y.phiVc) : 0);
      return { combo: k.combo, values: [fmt(k.bottomX, 1), fmt(k.bottomY, 1), fmt(k.topX, 1), fmt(k.topY, 1), fmt(k.qx, 1), fmt(k.qy, 1)], ratio, ok: ratio <= 1 + 1e-6 };
    }),
  };
  const generous = SLAB_FACES.some((f) => faces[f].asReq > 0 && meshArea(a[f]) > 1.2 * faces[f].asReq + 1e-6 && faces[f].asReq > faces[f].asMin + 1e-6);

  const steps: StepGroup[] = [
    {
      title: 'rcSheets.g.data',
      steps: [
        { label: 'rcSheets.s.panel', formula: 'Lx × Ly · h', value: `${fmt(d.lx)} × ${fmt(d.ly)} m · ${fmt(d.h * 100, 0)} cm` },
        { label: oneWay ? 'rcSheets.s.oneWay' : 'rcSheets.s.twoWay', formula: 'ℓl/ℓs > 2', value: fmt(short > 0 ? long / short : 0) },
        ...materialSteps(t, fmt),
        oneWay
          ? { label: U('rcSheets.s.slabMin'), formula: `ρ ≥ ${fmt(mins.main, 3)} (main); As ≥ As,main/5 (distribution); ρ = As/(b·h)`, value: `${fmt(mins.main * d.h * 1e4)} cm²/m` }
          : { label: 'rcSheets.s.slabMin', formula: `ρx + ρy ≥ ${fmt(mins.sum, 4)}; ρx, ρy ≥ ${fmt(mins.each, 4)}; ρ = As/(b·h)`, value: `${fmt(sumMin)} · ${fmt(mins.each * d.h * 1e4)} cm²/m` },
        { label: oneWay ? U('rcSheets.s.sMax') : 'rcSheets.s.sMax', formula: oneWay ? 'ℓs ≤ min(1.5·h; 200 mm); ℓl ≤ 300 mm' : 'ℓs ≤ min(1.5·h; 200 mm); ℓl ≤ 250 mm', value: '' },
      ],
    },
    ...SLAB_FACES.map((f) => faceSteps(f, d, faces[f], a[f], fmt)),
    ...(d.q ? [{
      title: 'rcSheets.g.slabShear',
      steps: [
        { label: 'rcSheets.s.slabShearX', formula: 'qx ≤ Vcr = 0.65·fctd·b·d (b = 1 m)', value: `${fmt(shear.x.vu)} ≤ ${fmt(shear.x.phiVc)} kN/m`, ok: shear.x.vu <= shear.x.phiVc + 1e-6 },
        { label: 'rcSheets.s.slabShearY', formula: 'qy ≤ Vcr = 0.65·fctd·b·d (b = 1 m)', value: `${fmt(shear.y.vu)} ≤ ${fmt(shear.y.phiVc)} kN/m`, ok: shear.y.vu <= shear.y.phiVc + 1e-6 },
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
    { label: 'rcSheets.s.muSlab', formula: 'Md (Wood–Armer)', value: `${fmt(r.mu)} kN·m/m${src ? ` (${src.combo})` : ''}` },
    { label: 'rcSheets.s.d', formula: 'd = h − c − Ø/2', value: `${fmt(r.d * 100, 1)} cm` },
    { label: 'rcSheets.s.asStrength', formula: 'Mr(As) = Md (7.1)', value: `${fmt(r.asStrength)} cm²/m` },
    { label: 'rcSheets.s.asReq', formula: 'max(As; As,min)', value: `${fmt(r.asReq)} cm²/m` },
    { label: 'rcSheets.s.sMax', formula: 's,max', value: `${fmt(r.sMax * 100, 0)} cm` },
    { label: 'rcSheets.s.adopted', formula: mesh.dia ? meshLabel(mesh) : '—', value: `${fmt(meshArea(mesh))} cm²/m`, ok: r.ok },
    ...(r.mu > 1e-6 ? [{ label: 'rcSheets.s.verifySlab', formula: 'Mr ≥ Md', value: `${fmt(r.phiMn)} ≥ ${fmt(r.mu)} kN·m/m`, ok: r.phiMn >= r.mu - 1e-6 }] : []),
  ];
  return { title: `rcSheets.face.${f}`, steps };
}
