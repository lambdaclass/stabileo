import { barArea, faceLayout, proposeMesh } from '../bars';
import type { BarGroup, MeshBars } from '../types';
import type { Ec2Params } from '../../engine/design/eurocode/ec2-params';
import { GAMMA_G, maxBarSpacing, modifiedMaxDia, type Mat } from './basis';

const KPA = 1000;

export interface TorsionGeom { tef: number; ak: number; uk: number; trdc: number; nu: number }

export function torsionGeom(b: number, h: number, edgeToBar: number, m: Mat): TorsionGeom {
  const tef = Math.min(Math.max((b * h) / (2 * (b + h)), 2 * edgeToBar), Math.min(b, h) / 2);
  const ak = (b - tef) * (h - tef), uk = 2 * (b - tef + (h - tef));
  return { tef, ak, uk, trdc: 2 * ak * tef * m.fctd * KPA, nu: 0.6 * (1 - m.fck / 250) };
}

export const torsionMax = (g: TorsionGeom, m: Mat, cot: number) => (2 * g.nu * m.fcdShear * KPA * g.ak * g.tef) / (cot + 1 / cot);

export function torsionSteel(T: number, g: TorsionGeom, m: Mat, cot: number): { perLeg: number; asl: number } {
  const fyd = m.fyd * KPA;
  return { perLeg: T / (2 * g.ak * fyd * cot), asl: (T * g.uk * cot) / (2 * g.ak * fyd) };
}

export function interactionStrut(T: number, V: number, g: TorsionGeom, vMax: (cot: number) => number, m: Mat, p: Ec2Params, cot0: number): number | null {
  const u = (cot: number) => T / torsionMax(g, m, cot) + V / vMax(cot);
  if (u(cot0) <= 1) return cot0;
  if (u(p.cotThetaMin) > 1) return null;
  let lo = p.cotThetaMin, hi = cot0;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (u(mid) <= 1) lo = mid; else hi = mid; }
  return lo;
}

export interface CrackRead { sigma: number; s: number; sMax: number; dia: number; diaMax: number; ok: boolean; used: boolean }

export function crackFace(groups: readonly BarGroup[], b: number, h: number, d: number, cover: number, sd: number, req: number, m: Mat, used: boolean): CrackRead {
  const first = groups.find((g) => g.count > 0) ?? { count: 0, dia: 10 };
  const provided = groups.reduce((s, g) => s + g.count * barArea(g.dia), 0);
  const lay = faceLayout([first], b, cover, sd);
  const s = (first.count > 1 ? (lay.clear[0] ?? 0) + first.dia / 1000 : b) * 1000;
  const sigma = provided > 0 ? (m.fyd * Math.min(1, req / provided)) / GAMMA_G : 0;
  const sMax = maxBarSpacing(sigma), diaMax = modifiedMaxDia(sigma, m, h, d);
  return { sigma, s, sMax, dia: first.dia, diaMax, ok: !used || s <= sMax + 1e-6 || first.dia <= diaMax + 1e-6, used };
}

export interface Skin { mesh: MeshBars; area: number; sMax: number; sigma: number }

export function skinBars(b: number, h: number, mainSigma: number, m: Mat, diameters: readonly number[]): Skin | null {
  if (h < 1 - 1e-9) return null;
  const area = (1 * 0.5 * m.fctm * b * (h / 2)) / m.fyk * 1e4;
  const perFace = area / 2 / (h / 2);
  const sigma = mainSigma / 2;
  const sMax = maxBarSpacing(sigma) / 1000;
  return { mesh: proposeMesh(perFace, sMax, diameters.filter((x) => x <= 16)), area, sMax, sigma };
}

