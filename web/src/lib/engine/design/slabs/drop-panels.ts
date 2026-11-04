/**
 * Drop panels and column capitals of a flat slab (CIRSOC 201-2025 8.2.4, 22.6.4.1): the drop's
 * own limits, and two-way shear at both critical sections the thickness change creates — at d/2
 * from the column (or the capital's edge) with the depth of slab and drop together, and at d/2
 * outside the drop with the slab's depth alone. Interior columns; at an edge or a corner the outer
 * section is reported as not evaluated. vc by 22.6.5.2 with the size effect λs. m, kN, MPa.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';
import { shearSqrtFc } from '../../codes/argentina/cirsoc201-basis';

export interface DropPanel { bx: number; by: number; depth: number }
export interface ColumnHead { b: number; h: number; capital?: number }

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });

/** 8.2.4: projection under the slab ≥ h/4; extension from the support centre ≥ L/6 each way. */
export function dropPanelRules(drop: DropPanel, slabH: number, spans: { x: number; y: number }): CheckRow[] {
  const lower = (key: string, title: string, clause: string, formula: string, need: number, have: number, unit: string, inputs: CheckInput[]): CheckRow => {
    const ratio = have > 0 ? need / have : Number.POSITIVE_INFINITY;
    return { code: 'cirsoc-201', edition: '2025', clause, title, titleKey: `check.drop.${key}`, formula, inputs, demand: r3(need), capacity: r3(have), unit, ratio: r3(ratio), status: statusOfRatio(ratio) };
  };
  return [
    lower('depth', 'Drop projection', '8.2.4(a)', 'h,drop ≥ h/4', slabH / 4, drop.depth, 'm', [inp('h', slabH * 1000, 'mm'), inp('h,drop', drop.depth * 1000, 'mm')]),
    lower('extentX', 'Drop extent, x', '8.2.4(b)', 'bx/2 ≥ Lx/6', spans.x / 6, drop.bx / 2, 'm', [inp('Lx', spans.x, 'm'), inp('bx', drop.bx, 'm')]),
    lower('extentY', 'Drop extent, y', '8.2.4(b)', 'by/2 ≥ Ly/6', spans.y / 6, drop.by / 2, 'm', [inp('Ly', spans.y, 'm'), inp('by', drop.by, 'm')]),
  ];
}

/** vc of 22.6.5.2 for a section of perimeter bo and depth d around a loaded area c1 × c2, MPa. */
export function twoWayVc(fc: number, d: number, bo: number, c1: number, c2: number, alphaS = 40): { vc: number; lambdaS: number } {
  const lambdaS = Math.min(1, Math.sqrt(2 / (1 + 0.004 * d * 1000)));
  const beta = Math.max(c1, c2) / Math.max(1e-9, Math.min(c1, c2));
  // §22.6.3.1: «El valor de √f´c usado para calcular vc para corte en dos direcciones no deben exceder 8,3 MPa.»
  const sq = shearSqrtFc(fc);
  const vc = Math.min(0.33 * lambdaS * sq, 0.17 * (1 + 2 / beta) * lambdaS * sq, 0.083 * (2 + (alphaS * d) / bo) * lambdaS * sq);
  return { vc, lambdaS };
}

export interface HeadPunching {
  Vu: number; qu: number; slabH: number; cover: number; barDia: number; fc: number;
  column: ColumnHead; drop?: DropPanel; position: 'interior' | 'edge' | 'corner'; comboName?: string;
}

/** Two-way shear at the inner and, under a drop, the outer critical section. */
export function headPunching(i: HeadPunching): CheckRow[] {
  const db = i.barDia / 1000;
  const c1 = i.column.capital ?? i.column.b, c2 = i.column.capital ?? i.column.h;
  const dIn = i.slabH + (i.drop?.depth ?? 0) - i.cover - db, dOut = i.slabH - i.cover - db;
  const at = i.comboName ? { combination: i.comboName } : {};
  const section = (key: string, title: string, clause: string, a: number, b: number, d: number): CheckRow => {
    const bo = 2 * (a + d) + 2 * (b + d);
    const vuForce = Math.max(0, i.Vu - i.qu * (a + d) * (b + d));
    const vu = vuForce / (bo * d) / 1000;
    const { vc, lambdaS } = twoWayVc(i.fc, d, bo, a, b);
    const phiVc = 0.75 * vc, ratio = vu / phiVc;
    return { code: 'cirsoc-201', edition: '2025', clause, title, titleKey: `check.drop.${key}`, formula: 'vu ≤ φ·vc (22.6.5.2)',
      inputs: [inp('Vu', vuForce, 'kN'), inp('bo', bo, 'm'), inp('d', d * 1000, 'mm'), inp('λs', lambdaS), inp('vc', vc, 'MPa')], demand: r3(vu), capacity: r3(phiVc), unit: 'MPa', ratio: r3(ratio), status: statusOfRatio(ratio), ...at };
  };
  if (i.position !== 'interior') {
    return [{ code: 'cirsoc-201', edition: '2025', clause: '22.6.4.1', title: 'Punching at the head', titleKey: 'check.drop.notInterior', formula: 'interior columns', inputs: [], ratio: null, status: 'unsupported' }];
  }
  const rows = [section('inner', i.column.capital ? 'Punching at the capital' : 'Punching at the column', '22.6.4.1(a)', c1, c2, dIn)];
  if (i.drop) rows.push(section('outer', 'Punching outside the drop', '22.6.4.1(b)', i.drop.bx, i.drop.by, dOut));
  return rows;
}
