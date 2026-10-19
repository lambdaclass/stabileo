/**
 * A column's interaction curves for the editor, from its actual bars on its actual outline: φPn
 * against φMn bending over the depth (the My demands) and over the width (the Mz demands), with
 * every combination's demand point at each station. Same engine as the shaped check, and the same
 * φ and axial cap as the verifier (CIRSOC 201-2025, `CIRSOC201_DESIGN_EDITION`).
 */
import { interactionCurve, type Bar, type Outline } from '../codes/argentina/cirsoc201-section';
import { CIRSOC201_DESIGN_EDITION } from '../codes/argentina/cirsoc201-basis';
import { generateInteractionDiagram, type InteractionDiagram } from '../codes/argentina/interaction-diagram';
import { computeColumnLayout, resolveColumnReinf } from '../station-design-forces';
import { outlineOf, shapedBarPositions } from './shaped-column';
import type { MemberContext } from './member-context';
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';

export interface InteractionPlot {
  overDepth: Array<{ M: number; P: number }>;
  overWidth: Array<{ M: number; P: number }>;
  demands: Array<{ P: number; Mdepth: number; Mwidth: number; combo: string }>;
}

/** A column's outline and its bars about the centroid, from its provided reinforcement. */
export function columnSectionOf(ctx: MemberContext, r: ProvidedReinforcement | undefined): { outline: Outline; bars: Bar[] } | null {
  if (!r) return null;
  const tieDia = r.shaped?.spiral?.diameter ?? r.stirrups?.diameter ?? ctx.material.stirrupDia;
  if (ctx.shape) {
    if (!r.shaped) return null;
    const a = Math.PI * r.shaped.diameter ** 2 / 4 / 1e6;
    return { outline: outlineOf(ctx.shape), bars: shapedBarPositions(ctx.shape, r.shaped.count, r.shaped.diameter, ctx.material.cover, tieDia).map((p) => ({ ...p, area: a })) };
  }
  const col = resolveColumnReinf(r.column, r.longitudinal);
  if (!col) return null;
  const { b, h } = ctx.section;
  const lay = computeColumnLayout(col.totalCount, col.cornerDia, b, h, ctx.material.cover, tieDia, r.column);
  return { outline: { kind: 'rect', b, h }, bars: lay.bars.map((q) => ({ x: q.x - b / 2, y: q.y - h / 2, area: Math.PI * q.diameter ** 2 / 4 / 1e6 })) };
}

export function columnInteraction(ctx: MemberContext, r: ProvidedReinforcement | undefined): InteractionPlot | null {
  const sec = columnSectionOf(ctx, r);
  if (!sec || !r) return null;
  const { outline, bars } = sec;
  const mat = { fc: ctx.material.fc, fy: ctx.material.fy, confinement: r.shaped?.spiral ? 'spiral' as const : 'ties' as const, edition: CIRSOC201_DESIGN_EDITION };
  const pts = (theta: number, pick: 'x' | 'y') => interactionCurve(outline, bars, mat, theta, 40)
    .map((p) => ({ M: Math.abs(pick === 'x' ? p.phiMnx : p.phiMny), P: p.phiPn }));
  const mag = ctx.slenderDeltaNs * (ctx.slenderDeltaS ?? 1);
  const demands = (ctx.stations?.comboResults ?? []).flatMap((c) => c.stations.map((s) => ({
    P: -s.n, Mdepth: Math.abs(s.my) * mag, Mwidth: Math.abs(s.mz) * mag, combo: c.comboName,
  })));
  return { overDepth: pts(Math.PI / 2, 'x'), overWidth: pts(0, 'y'), demands };
}

/** The verification detail's diagram: the section's own curves, or the rectangle's φPn–φMn. */
export type VerificationColumnDiagram =
  | { kind: 'shaped'; plot: InteractionPlot }
  | { kind: 'rect'; diagram: InteractionDiagram; Nu: number; Mu: number };

/**
 * Which diagram the verification detail draws for a column, and the diagram.
 *
 * A circular, T or L column carries `longitudinal` beside `shaped` (`setShapedBars` writes both),
 * and reading that as a rectangle's bars drew a rectangle's diagram for it. A shaped column gets
 * its own outline and bars instead (`columnInteraction`, the engine its check uses). A rectangle
 * keeps the two-face diagram with its governing demand point.
 */
export function verificationColumnDiagram(ctx: MemberContext, r: ProvidedReinforcement | undefined): VerificationColumnDiagram | null {
  if (ctx.elementType !== 'column' || !r) return null;
  if (ctx.shape) {
    const plot = columnInteraction(ctx, r);
    return plot ? { kind: 'shaped', plot } : null;
  }
  const col = resolveColumnReinf(r.column, r.longitudinal);
  if (!col) return null;
  const area = (d: number) => Math.PI * d * d / 400;
  const AsProv = 4 * area(col.cornerDia) + (col.totalCount - 4) * area(col.faceDia);
  const abs = (c: string) => ctx.demands?.demands.find((x) => x.category === c)?.absValue ?? 0;
  return {
    kind: 'rect',
    diagram: generateInteractionDiagram({
      b: ctx.section.b, h: ctx.section.h, fc: ctx.material.fc, fy: ctx.material.fy,
      cover: ctx.material.cover + ctx.material.stirrupDia / 1000 + col.cornerDia / 2000,
      AsProv, barCount: col.totalCount, barDia: col.cornerDia, edition: CIRSOC201_DESIGN_EDITION,
    }),
    Nu: abs('N_compression'),
    Mu: Math.max(abs('My+'), abs('My-'), abs('Mz+'), abs('Mz-')) * ctx.slenderDeltaNs * (ctx.slenderDeltaS ?? 1),
  };
}
