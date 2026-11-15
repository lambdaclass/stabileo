import { beamRow, type BeamDemand, type SectionEnv } from '../../beam-row';
import { beamLine } from '../../beam-line';
import { columnRow, type ColumnDemand } from '../../column-row';
import { wallRow, type WallDemand } from '../../wall-row';
import { slabPlan, type LevelGeometry, type PlanBeam } from '../../slab-plan';
import type { SlabDemand } from '../../slab-row';
import { rulesFor } from '../../codes';
import { makeFmt } from '../../format';
import type { PlanCtx } from '../draw';

export const fmt = makeFmt('.');
export const tr = (k: string, p?: Record<string, string | number>) => (p ? `${k}(${Object.values(p).join(',')})` : k);
export const ctx = (scale: number): PlanCtx => ({ scale, fmt, tr });

const env = (x: number, pos: number, neg: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: 0, nNeg: 0 });
const bctx = { mat: { fc: 30, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };

/** A two-span continuous beam on three columns, hogging over the middle one. */
export function twoSpanLine(L1 = 5, L2 = 4) {
  const span = (k: number, L: number): BeamDemand => {
    const stations = Array.from({ length: 21 }, (_, i) => {
      const x = (i / 20) * L, t = x / L;
      return { x, pos: Math.max(0, 180 * 4 * t * (1 - t) - (k === 0 ? 120 * t : 120 * (1 - t))), neg: k === 0 ? Math.max(0, 260 * (t - 0.7) / 0.3) : Math.max(0, 260 * (0.3 - t) / 0.3), v: 200 * Math.abs(1 - 2 * t) + 40 };
    });
    return {
      key: `beam:1:${k}`, name: `V1-${k + 1}`, level: 'N1', length: L, b: 0.25, h: 0.5,
      start: env(0, 0, k === 1 ? 260 : 0), span: env(L / 2, 150, 0), end: env(L, 0, k === 0 ? 260 : 0),
      negAny: { value: 0 }, nNegAny: 0, vu: { value: 240 }, nAtV: 0, tu: { value: 0 }, combos: [], env: stations,
      supportHalf: { start: 0.15, end: 0.15 }, ends: { start: { kind: 'column', half: 0.15 }, end: { kind: 'column', half: 0.15 } },
      line: { group: 1, index: k, spans: 2, startNode: k + 1, endNode: k + 2, lineName: 'V1' },
    };
  };
  const rows = [beamRow(span(0, L1), bctx, undefined, fmt), beamRow(span(1, L2), bctx, undefined, fmt)];
  return { line: { ...beamLine(rows, bctx, undefined, fmt), level: 'N1' }, rows };
}

export function columnStack() {
  const c = { mat: { fc: 30, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [12, 16, 20, 25] };
  const demand = (k: number): ColumnDemand => ({ key: `column:1:${k}`, name: 'C1', level: `N${k}`, b: 0.4, h: 0.4, length: 3, lu: 2.6, psiTop: 1.5, psiBot: 1.5, joints: { bottom: 0.5, top: 0.5 }, cases: [{ combo: 'U', pu: 900, mxTop: 40, mxBot: -20, myTop: 10, myBot: -5, vx: 20, vy: 8 }] });
  const low = columnRow(demand(0), c, undefined, fmt);
  const high = columnRow(demand(1), c, undefined, fmt, { fromBelow: true });
  return [low, high];
}

export function wall() {
  const d: WallDemand = { key: 'wall:1:0', name: 'M1', level: 'N1', length: 4, height: 3, thickness: 0.2, combos: [{ combo: 'U', pu: 1200, mu: 5000, vu: 450, muV: 4, muH: 2 }] };
  return wallRow(d, { mat: { fc: 30, fy: 420 }, cover: 0.025, barDia: 12, diameters: [10, 12, 16, 20, 25] }, undefined, fmt);
}

export function level() {
  const sctx = { mat: { fc: 25, fy: 420 }, cover: 0.02, diameters: [6, 8, 10, 12, 16] };
  const demand = (key: string, x0: number, x1: number, m: [number, number, number, number]): SlabDemand => ({
    key, name: key, level: 'N1', lx: x1 - x0, ly: 5, h: 0.15, bounds: { x0, x1, y0: 0, y1: 5, z: 3 },
    m: { bottomX: { value: m[0] }, bottomY: { value: m[1] }, topX: { value: m[2] }, topY: { value: m[3] } },
  });
  const beam = (x1: number, y1: number, x2: number, y2: number): PlanBeam => ({ x1, y1, x2, y2, b: 0.2, kind: 'beam' });
  const rules = rulesFor('cirsoc201-2025');
  const rows = [demand('L1', 0, 4, [8, 5, 12, 6]), demand('L2', 4, 9, [10, 6, 14, 7])].map((d) => rules.slabRow(d, sctx, undefined, fmt));
  const geom: LevelGeometry = { level: 'N1', beams: [beam(0, 0, 0, 5), beam(4, 0, 4, 5), beam(9, 0, 9, 5), beam(0, 0, 9, 0), beam(0, 5, 9, 5)], columns: [{ x: 0, y: 0, b: 0.3, h: 0.3 }] };
  return { plan: slabPlan('N1', rows, geom, { ...sctx, bent: false }), rows };
}
