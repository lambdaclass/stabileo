import { meshArea, meshLabel, proposeMesh } from '../bars';
import type { Fmt } from '../format';
import { SLAB_FACES, type SlabContext, type SlabDemand, type SlabFace, type SlabFaceResult, type SlabRow } from '../slab-row';
import { check, ratioOf, type CheckLine, type ComboTable, type MeshBars, type SlabAdopted, type Step, type StepGroup } from '../types';
import { flexuralSteel, matOf, maxBarSpacing, minSteel, modifiedMaxDia, momentCapacity, shearCapacity, xuLimit, GAMMA_G, type Ec2Set, type Mat } from './basis';

const MAX_ITERATIONS = 10;

export function slabSpacing(h: number, principal: boolean, peak: boolean): number {
  if (principal) return peak ? Math.min(2 * h, 0.25) : Math.min(3 * h, 0.4);
  return peak ? Math.min(3 * h, 0.4) : Math.min(3.5 * h, 0.45);
}

interface FaceEval extends SlabFaceResult { xd: number; ductile: boolean; principal: boolean; crack: { sigma: number; ok: boolean; sMax: number; diaMax: number } | null }

function stripCapacity(as: number, h: number, d: number, m: Mat): { mrd: number; xd: number } {
  if (!(as > 0)) return { mrd: 0, xd: 0 };
  const r = momentCapacity(0, { b: 1, h }, [{ y: d, area: as * 1e-4 }], m);
  return r ? { mrd: r.mrd, xd: r.x / d } : { mrd: 0, xd: 0 };
}

export function makeSlabRow(set: Ec2Set) {
  return function slabRow(d: SlabDemand, c: SlabContext, adopted: SlabAdopted | undefined, fmt: Fmt): SlabRow {
    const p = set.p, m = matOf(c.mat.fc, c.mat.fy, p);
    const short = Math.min(d.lx, d.ly), long = Math.max(d.lx, d.ly);
    const oneWay = short > 0 && long / short > 2;
    const mainIsX = d.lx <= d.ly;
    const principalOf = (f: SlabFace) => !oneWay || f.endsWith('X') === mainIsX;
    const crackChecked = d.h > 0.2 + 1e-9;
    const xl = xuLimit(m.fck, p);

    const faceOf = (f: SlabFace, a: SlabAdopted, guess: number): FaceEval => {
      const side = f.startsWith('bottom') ? 'bottom' : 'top';
      const outerDia = a[`${side}X` as SlabFace].dia || guess, innerDia = a[`${side}Y` as SlabFace].dia || guess;
      const depth = d.h - c.cover - (f.endsWith('X') ? outerDia / 2000 : outerDia / 1000 + innerDia / 2000);
      const mu = Math.max(0, d.m[f].value);
      const asStrength = mu > 1e-6 ? flexuralSteel(mu, 0, { b: 1, h: d.h }, depth, c.cover, m, p).as * 1e4 : 0;
      const principal = principalOf(f);
      const needsSteel = f.startsWith('bottom') || mu > 1e-6;
      const asMin = needsSteel && principal ? minSteel(m, p, 1, depth) * 1e4 : 0;
      const other = SLAB_FACES.find((g) => g !== f && g.startsWith(side))!;
      const secondaryMin = !principal && needsSteel ? 0.2 * meshArea(a[other]) : 0;
      const asReq = Math.max(asStrength, asMin, secondaryMin);
      const sMax = slabSpacing(d.h, principal, mu > 1e-6);
      const mesh = a[f], as = meshArea(mesh);
      const cap = stripCapacity(as, d.h, depth, m);
      const ductile = !(mu > 1e-6) || cap.xd <= xl + 1e-9;
      const spacingOk = mesh.dia === 0 || mesh.spacing <= sMax + 1e-6;
      const crack = crackChecked && mu > 1e-6 && as > 0 ? (() => {
        const sigma = (m.fyd * Math.min(1, asStrength / as)) / GAMMA_G;
        const sMx = maxBarSpacing(sigma), diaMax = modifiedMaxDia(sigma, m, d.h, depth);
        return { sigma, sMax: sMx, diaMax, ok: mesh.spacing * 1000 <= sMx + 1e-6 || mesh.dia <= diaMax + 1e-6 };
      })() : null;
      const ok = as >= asReq - 1e-6 && cap.mrd >= mu - 1e-6 && spacingOk && ductile && (!crack || crack.ok) && as <= p.beamMaxRatio * d.h * 1e4 + 1e-6;
      return { mu, d: depth, asStrength, asMin: Math.max(asMin, secondaryMin), asReq, sMax, phiMn: cap.mrd, ok, xd: cap.xd, ductile, principal, crack };
    };

    const guess = c.diameters.includes(10) ? 10 : c.diameters.find((x) => x >= 8) ?? 10;
    const empty: MeshBars = { dia: 0, spacing: 0 };
    const zero: SlabAdopted = { bottomX: empty, bottomY: empty, topX: empty, topY: empty };
    const pre = Object.fromEntries(SLAB_FACES.map((f) => [f, faceOf(f, zero, guess)])) as Record<SlabFace, FaceEval>;
    let proposed: SlabAdopted = Object.fromEntries(SLAB_FACES.map((f) => [f, pre[f].asReq > 0 ? proposeMesh(pre[f].asReq, pre[f].sMax, c.diameters) : empty])) as unknown as SlabAdopted;
    const evalAll = (a: SlabAdopted) => Object.fromEntries(SLAB_FACES.map((f) => [f, faceOf(f, a, guess)])) as Record<SlabFace, FaceEval>;
    let ev = evalAll(proposed), iterations = 0;
    while (SLAB_FACES.some((f) => !ev[f].ok) && iterations < MAX_ITERATIONS) {
      iterations++;
      const next = { ...proposed };
      for (const f of SLAB_FACES) {
        if (ev[f].ok) continue;
        const target = Math.max(ev[f].asReq, meshArea(proposed[f]) * (ev[f].phiMn > 0 && ev[f].mu > ev[f].phiMn ? ev[f].mu / ev[f].phiMn : 1) + 0.01);
        const sMax = ev[f].crack && !ev[f].crack.ok ? Math.min(ev[f].sMax, ev[f].crack.sMax / 1000) : ev[f].sMax;
        next[f] = proposeMesh(target, Math.max(0.05, sMax), c.diameters);
      }
      proposed = next;
      ev = evalAll(proposed);
    }
    const a = adopted ?? proposed;
    const faces = adopted ? evalAll(a) : ev;

    const shearOf = (dir: 'X' | 'Y') => {
      const top = meshArea(a[`top${dir}`]) > 0, face: SlabFace = top ? `top${dir}` : `bottom${dir}`;
      const asl = Math.min(meshArea(a[`bottom${dir}`]), meshArea(a[face]) || Infinity);
      return shearCapacity(1, faces[face].d, (Number.isFinite(asl) ? asl : 0) * 1e-4, 0, m, p).vrdc;
    };
    const shear = { x: { vu: d.q?.x.value ?? 0, phiVc: shearOf('X') }, y: { vu: d.q?.y.value ?? 0, phiVc: shearOf('Y') } };
    const asMax = p.beamMaxRatio * d.h * 1e4;
    const verifications: CheckLine[] = [
      ...SLAB_FACES.filter((f) => faces[f].mu > 1e-6).map((f) => check(`rcSheets.v.slab.${f}`, faces[f].phiMn >= faces[f].mu - 1e-6, { clause: '6.1, 3.1.7(3)', demand: `${fmt(faces[f].mu)} kN·m/m`, capacity: `${fmt(faces[f].phiMn)} kN·m/m`, ratio: ratioOf(faces[f].mu, faces[f].phiMn) })),
      ...SLAB_FACES.filter((f) => faces[f].mu > 1e-6 && !faces[f].ductile).map((f) => check('rcSheets.ec2.v.xd', false, { clause: '5.5(4)', demand: `x/d = ${fmt(faces[f].xd, 3)}`, capacity: `≤ ${fmt(xl, 2)}` })),
      ...SLAB_FACES.filter((f) => faces[f].asReq > 0).map((f) => check(`rcSheets.v.slabMin.${f}`, meshArea(a[f]) >= faces[f].asReq - 1e-6, { clause: faces[f].principal ? '9.3.1.1(1)' : '9.3.1.1(1), 9.3.1.1(2)', demand: `${fmt(faces[f].asReq)} cm²/m`, capacity: `${fmt(meshArea(a[f]))} cm²/m`, ratio: ratioOf(faces[f].asReq, meshArea(a[f])) })),
      check('rcSheets.ec2.v.asMax', SLAB_FACES.every((f) => meshArea(a[f]) <= asMax + 1e-6), { clause: '9.3.1.1(1), 9.2.1.1(3)', demand: `${fmt(Math.max(...SLAB_FACES.map((f) => meshArea(a[f]))))} cm²/m`, capacity: `≤ ${fmt(asMax)} cm²/m` }),
      check('rcSheets.v.slabSpacing', SLAB_FACES.every((f) => a[f].dia === 0 || a[f].spacing <= faces[f].sMax + 1e-6), { clause: '9.3.1.1(3)', capacity: `≤ ${fmt(Math.min(...SLAB_FACES.map((f) => faces[f].sMax)) * 100, 0)} cm` }),
      ...(crackChecked ? [check('rcSheets.ec2.v.crack', SLAB_FACES.every((f) => !faces[f].crack || faces[f].crack!.ok), { clause: '7.3.3(2)' })] : []),
      ...(d.q ? [
        check('rcSheets.v.slabShearX', shear.x.vu <= shear.x.phiVc + 1e-6, { clause: '6.2.2(1)', demand: `${fmt(shear.x.vu)} kN/m`, capacity: `${fmt(shear.x.phiVc)} kN/m`, ratio: ratioOf(shear.x.vu, shear.x.phiVc) }),
        check('rcSheets.v.slabShearY', shear.y.vu <= shear.y.phiVc + 1e-6, { clause: '6.2.2(1)', demand: `${fmt(shear.y.vu)} kN/m`, capacity: `${fmt(shear.y.phiVc)} kN/m`, ratio: ratioOf(shear.y.vu, shear.y.phiVc) }),
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
          { label: oneWay ? 'rcSheets.s.oneWay' : 'rcSheets.s.twoWay', formula: 'Lmax/Lmin > 2', value: fmt(short > 0 ? long / short : 0) },
          { label: 'rcSheets.s.materials', formula: 'fck · fyk → fcd · fyd', value: `${fmt(m.fck, 0)} · ${fmt(m.fyk, 0)} → ${fmt(m.fcd)} · ${fmt(m.fyd)} MPa` },
          { label: 'rcSheets.s.slabMin', formula: 'As,min = max(0.26·fctm/fyk; 0.0013)·b·d (9.3.1.1(1), 9.2.1.1(1)); secondary ≥ 0.2·As,principal (9.3.1.1(2))', value: '' },
          { label: 'rcSheets.ec2.s.slabSpacing', formula: 'principal ≤ min(3h; 400) [min(2h; 250)], secondary ≤ min(3.5h; 450) [min(3h; 400)] mm (9.3.1.1(3)); [ ] where the face carries moment', value: '' },
          crackChecked ? { label: 'rcSheets.ec2.s.crackSlab', formula: 'σs = fyd·(As,req/As,prov)/γG; Table 7.3N or 7.2N (7.3.3(2))', value: '' } : { label: 'rcSheets.ec2.s.crackThin', formula: 'h ≤ 200 mm (7.3.3(1))', value: '' },
        ],
      },
      ...SLAB_FACES.map((f) => faceSteps(f, d, faces[f], a[f], xl, fmt)),
      ...(d.q ? [{
        title: 'rcSheets.g.slabShear',
        steps: [
          { label: 'rcSheets.s.slabShearX', formula: 'vEd ≤ VRd,c, bw = 1 m (6.2.2(1))', value: `${fmt(shear.x.vu)} ≤ ${fmt(shear.x.phiVc)} kN/m`, ok: shear.x.vu <= shear.x.phiVc + 1e-6 },
          { label: 'rcSheets.s.slabShearY', formula: 'vEd ≤ VRd,c, bw = 1 m (6.2.2(1))', value: `${fmt(shear.y.vu)} ≤ ${fmt(shear.y.phiVc)} kN/m`, ok: shear.y.vu <= shear.y.phiVc + 1e-6 },
          { label: 'rcSheets.s.punchingOut', value: '' },
        ],
      }] : []),
      { title: 'rcSheets.g.proposal', steps: [adopted ? { label: 'rcSheets.s.adoptedByUser', value: '' } : { label: 'rcSheets.s.iterations', formula: 'As → MRd ≥ MEd; s ≤ s,max; 7.3.3', value: String(iterations) }] },
    ];

    return {
      family: 'slab', key: d.key, name: d.name, level: d.level, h: d.h, lx: d.lx, ly: d.ly, oneWay, demand: d, faces, shear, verifications, combos,
      proposed, adopted: a, isAdopted: !!adopted, status: allOk ? (generous ? 'warn' : 'ok') : 'fail', generous, steps,
    };
  };
}

function faceSteps(f: SlabFace, d: SlabDemand, r: FaceEval, mesh: MeshBars, xl: number, fmt: Fmt): StepGroup {
  const src = d.m[f].source;
  const steps: Step[] = [
    { label: 'rcSheets.s.muSlab', formula: 'MEd (Wood–Armer)', value: `${fmt(r.mu)} kN·m/m${src ? ` (${src.combo})` : ''}` },
    { label: 'rcSheets.s.d', formula: 'd = h − c − Ø/2', value: `${fmt(r.d * 100, 1)} cm` },
    { label: 'rcSheets.s.asStrength', formula: 'η·fcd·λx·(d − λx/2) = MEd; As = η·fcd·λx/fyd', value: `${fmt(r.asStrength)} cm²/m` },
    { label: 'rcSheets.s.asReq', formula: r.principal ? 'max(As; As,min)' : 'max(As; As,min; 0.2·As,principal)', value: `${fmt(r.asReq)} cm²/m` },
    { label: 'rcSheets.s.sMax', formula: r.principal ? 'principal (9.3.1.1(3))' : 'secondary (9.3.1.1(3))', value: `${fmt(r.sMax * 100, 0)} cm` },
    { label: 'rcSheets.s.adopted', formula: mesh.dia ? meshLabel(mesh) : '—', value: `${fmt(meshArea(mesh))} cm²/m`, ok: r.ok },
    ...(r.mu > 1e-6 ? [{ label: 'rcSheets.s.verifySlab', formula: `MRd ≥ MEd; x/d = ${fmt(r.xd, 3)} ≤ ${fmt(xl, 2)}`, value: `${fmt(r.phiMn)} ≥ ${fmt(r.mu)} kN·m/m`, ok: r.phiMn >= r.mu - 1e-6 && r.ductile }] : []),
    ...(r.crack ? [{ label: 'rcSheets.ec2.s.crackSpacing', formula: `σs = ${fmt(r.crack.sigma, 0)} MPa: s ≤ ${fmt(r.crack.sMax, 0)} mm | Ø ≤ ${fmt(r.crack.diaMax, 1)} mm`, value: mesh.dia ? meshLabel(mesh) : '—', ok: r.crack.ok }] : []),
  ];
  return { title: `rcSheets.face.${f}`, steps };
}
