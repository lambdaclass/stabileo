/**
 * A coupling beam between two seismic walls. CIRSOC 201-2025 18.1 sends seismic concrete to
 * INPRES-CIRSOC 103 Parte II, whose 3.8.1 governs it:
 *
 *  · the shear and moment the earthquake induces are carried by diagonal steel in both
 *    directions unless the nominal shear stress is below vn = 0,10·(Ln/hb)·√f'c (3.8.1.2, eq. 3-27);
 *    below it the beam is designed and detailed as a frame beam (artículo 2.2);
 *  · each diagonal group: Ash = VE / (2·φ·fy·sen α), φ = 0,90 (3.8.1.4, eq. 3-28), tied against
 *    buckling at no more than 100 mm, with a secondary mesh of side bars and stirrups, each at
 *    ρ ≥ 0,70/fy (3.8.1.4), and anchored 1,50·ld into the walls (3.8.1.5).
 *
 * The nominal shear stress is taken as vn = Vu/(φ·bw·d) with φ = 0,75 (Tabla 21.2.1(b) of CIRSOC
 * 201): Parte II states vn without restating the section it is measured on for this member.
 * α, when not stated, is the slope of the line joining the centroids of the diagonal groups at the
 * two ends: tan α = (h − 2·c)/Ln, c the depth of a group's centroid from its face. m, kN, MPa.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';
import { deriveDevelopment } from '../../../codes/cirsoc201/anchorage';

export interface CouplingBeamInput {
  /** Clear span, total depth, width and effective depth, m. */
  ln: number; h: number; bw: number; d: number;
  /** Factored seismic shear VE, kN. */
  Vu: number;
  fc: number; fy: number;
  /** Angle of the diagonals to the axis, degrees; else from `diagonalCover`. */
  alphaDeg?: number;
  /** Depth of a diagonal group's centroid from the beam's face, m; else h − d. */
  diagonalCover?: number;
  /** Diagonal bar diameter, mm, for the anchorage length. */
  barDia?: number;
  /** Area of one diagonal group placed, m². */
  ashProvided?: number;
}

export interface CouplingBeamDesign {
  rows: CheckRow[];
  /** Nominal shear stress and the limit of 3.8.1.2, MPa. */
  vn: number; vLimit: number;
  diagonal: boolean;
  /** Steel of one diagonal group, m²; null when the beam is a frame beam. */
  ash: number | null;
  alphaDeg: number;
  /** Side bars and stirrups of the mesh, m² per metre (each direction). */
  mesh: number;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });
const base = { code: 'inpres-cirsoc-103-ii', edition: '2005' } as const;

export function couplingBeamDesign(c: CouplingBeamInput): CouplingBeamDesign {
  const vn = c.Vu / (0.75 * c.bw * c.d) / 1000;
  const vLimit = 0.1 * (c.ln / c.h) * Math.sqrt(c.fc);
  const diagonal = vn >= vLimit;
  const cover = c.diagonalCover ?? c.h - c.d;
  const alphaDeg = c.alphaDeg ?? (Math.atan2(c.h - 2 * cover, c.ln) * 180) / Math.PI;
  const sin = Math.sin((alphaDeg * Math.PI) / 180);
  const mesh = (0.7 / c.fy) * c.bw;
  const rows: CheckRow[] = [{
    ...base, clause: '3.8.1.2', title: 'Shear stress against the diagonal threshold', titleKey: 'check.coupling.threshold', formula: 'vn < 0,10·(Ln/hb)·√f\'c',
    // A classification, not a limit: above the threshold the diagonals carry the shear.
    inputs: [inp('vn', vn, 'MPa'), inp('Ln/hb', c.ln / c.h)], demand: r3(vn), capacity: r3(vLimit), unit: 'MPa', ratio: null, status: 'ok',
    derivation: [diagonal ? 'diagonal steel in both directions carries the seismic shear and moment' : 'below the threshold: designed and detailed as a frame beam (artículo 2.2)', 'vn = Vu/(φ·bw·d), φ = 0,75'],
  }];
  let ash: number | null = null;
  if (!diagonal) {
    rows.push({ ...base, clause: '3.8.1.2', title: 'Coupling beam as a frame beam', titleKey: 'check.coupling.asBeam', formula: 'artículo 2.2', inputs: [], ratio: null, status: 'unsupported', derivation: ['design it with the frame beams (INPRES-CIRSOC 103 Parte II, 2.2)'] });
  } else if (sin <= 0) {
    rows.push({ ...base, clause: '3.8.1.4', title: 'Diagonal steel', titleKey: 'check.coupling.diagonal', formula: 'Ash = VE / (2·φ·fy·sen α)', inputs: [inp('α', alphaDeg, '°')], ratio: null, status: 'fail', derivation: ['the diagonals do not fit the depth'] });
  } else {
    ash = c.Vu / (2 * 0.9 * c.fy * 1000 * sin);
    const ld = c.barDia ? deriveDevelopment({ diameterMm: c.barDia, fy: c.fy, fc: c.fc, favourableSpacing: false, edition: '2025' }).ldM : null;
    const derivation = [`α = ${alphaDeg.toFixed(1)}°${c.alphaDeg === undefined ? ' (centroids of the diagonal groups at both ends)' : ''}`, 'ties or spiral on each diagonal at no more than 100 mm (3.8.1.4)',
      ld !== null ? `anchorage into each wall ≥ 1,50·ld = ${Math.round(1.5 * ld * 1000)} mm (3.8.1.5)` : 'anchorage into each wall ≥ 1,50·ld (3.8.1.5)'];
    const need = ash * 1e4;
    rows.push(c.ashProvided === undefined
      ? { ...base, clause: '3.8.1.4', title: 'Diagonal steel, each direction', titleKey: 'check.coupling.diagonal', formula: 'Ash = VE / (2·φ·fy·sen α), φ = 0,90', inputs: [inp('VE', c.Vu, 'kN'), inp('α', alphaDeg, '°'), inp('Ash,req', need, 'cm²')], demand: r3(need), unit: 'cm²', ratio: null, status: 'notVerified', derivation }
      : { ...base, clause: '3.8.1.4', title: 'Diagonal steel, each direction', titleKey: 'check.coupling.diagonal', formula: 'Ash = VE / (2·φ·fy·sen α), φ = 0,90', inputs: [inp('VE', c.Vu, 'kN'), inp('α', alphaDeg, '°')], demand: r3(need), capacity: r3(c.ashProvided * 1e4), unit: 'cm²', ratio: r3(ash / c.ashProvided), status: statusOfRatio(ash / c.ashProvided), derivation });
    rows.push({ ...base, clause: '3.8.1.4', title: 'Secondary mesh', titleKey: 'check.coupling.mesh', formula: 'ρl ≥ 0,70/fy; ρv ≥ 0,70/fy', inputs: [inp('As/s', mesh * 1e4, 'cm²/m')], demand: r3(mesh * 1e4), unit: 'cm²/m', ratio: null, status: 'notVerified',
      derivation: ['side bars on both faces and stirrups at right angles to the axis, each evenly spaced'] });
  }
  return { rows, vn: r3(vn), vLimit: r3(vLimit), diagonal, ash, alphaDeg, mesh };
}
