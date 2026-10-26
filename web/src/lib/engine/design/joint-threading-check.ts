/**
 * The design's reading of a beam's bars through the column cages at its joints: the verifier's
 * half of `engine/detailing/joint-threading.ts`.
 *
 * The detailing lays a beam's bars in one row of slots along its whole length, and coordinates
 * the slots across the section so they pass the columns' bars at both its joints. Where none of
 * its layouts does, the beam's bars cross the column's — a clash the detailing can only report.
 * The design now asks the same question of the same layouts against the same cages (the columns
 * designed at each joint, laid as the detailing lays them) and fails a joint no layout passes, so
 * the search looks for bars that pass, and a beam with none is refused rather than certified.
 *
 * Pure.
 */
import { beamGroups, hoggingAtSupports } from '../detailing/beam-groups';
import { beamLayoutDomain, beamRow, columnKeepOuts, columnPlan, columnTailPosts, threadsJoint } from '../detailing/joint-threading';
import { minClearSpacingColumn } from '../../codes/cirsoc201/spacing';
import { endSupportPlan, hookTails, type EndSupportInput } from './end-support-anchorage';
import type { KeepOut } from '../detailing/candidates';
import type { MemberContext } from './member-context';
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';
import type { ProvidedRebarCheck } from '../station-design-forces';
import { memberOffsetAt, type OffsetCarrier } from '../member-offsets';

interface ModelSlice {
  nodes: ReadonlyMap<number, { id: number; x: number; y: number; z?: number }>;
  /** With their declared insertions (`Element.offset`): where each one's axis stands off its nodes. */
  elements: ReadonlyMap<number, { id: number; nodeI: number; nodeJ: number; sectionId: number } & OffsetCarrier>;
  sections: ReadonlyMap<number, { b?: number; h?: number; shape?: string; rotation?: number }>;
}

export interface JointThreadingVerdict {
  end: 'start' | 'end';
  nodeId: number;
  ok: boolean;
  /** The best layout's overlap with the cage, m (negative when it misses). */
  worstOverlap: number;
  /** Slots, their bar, the member's largest bar, and the column bars read. */
  slots: number; rowDia: number; dia: number; columnBars: number;
}

/**
 * Every end of a beam framing into designed columns: whether one of its layouts passes their bars.
 * The columns read are the ones the run has designed (`MemberContext.columnBars`); a column with
 * no design is not detailed and has no bars to pass, as in the detailing.
 */
export function jointThreading(ctx: MemberContext, rebar: ProvidedReinforcement, support: EndSupportInput): JointThreadingVerdict[] {
  const md = ctx.modelData as unknown as ModelSlice | undefined;
  const el = md?.elements?.get(ctx.elementId);
  if (!md?.nodes || !el || !md.sections || !ctx.columnBars) return [];
  const a = md.nodes.get(el.nodeI), b = md.nodes.get(el.nodeJ);
  if (!a || !b) return [];
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // As `generateBeamBars`' transverse axis (axis × up): the detailing's `t`.
  const t = { x: (b.y - a.y) / L, y: -(b.x - a.x) / L };
  const stirrupDiaMm = support.seat.stirrupDiaMm;
  const seated: MemberContext = { ...ctx, material: { ...ctx.material, stirrupDia: stirrupDiaMm } };
  const groups = beamGroups(rebar as never, {
    ctx: seated, edition: ctx.codeEdition, maxAggregateSizeMm: ctx.material.maxAggregateSize.value, hogging: hoggingAtSupports(ctx),
  });
  if (!groups) return [];
  const row = beamRow(groups);
  const ownTails = hookTails(support, { start: el.nodeI, end: el.nodeJ });
  const keepAt = (nodeId: number): { keep: KeepOut[]; bars: number } => {
    // Where this beam ends here, its own tails stand beside the column's bars (below).
    const cage = nodeId === el.nodeI ? support.cages.start : support.cages.end;
    const ours = cage.continues ? undefined : ownTails.filter((x) => x.nodeId === nodeId);
    // The column bars that pass through the joint: the column below's, which run up through
    // it into their lap; the column above stands on the joint's top face (`generate-column`
    // `jointBand`), so its bars are read only where no column runs up into the node.
    const node = md.nodes.get(nodeId)!;
    const atNode = [...md.elements.values()].flatMap((e) => {
      if (e.nodeI !== nodeId && e.nodeJ !== nodeId) return [];
      const p = md.nodes.get(e.nodeI), q = md.nodes.get(e.nodeJ);
      if (!p || !q || Math.hypot(q.x - p.x, q.y - p.y) > 1e-6) return [];
      const far = e.nodeI === nodeId ? q : p;
      return [{ e, below: (far.z ?? 0) < (node.z ?? 0) }];
    });
    const through = atNode.some((x) => x.below) ? atNode.filter((x) => x.below) : atNode;
    const cols: Parameters<typeof columnKeepOuts>[0][number][] = [];
    // The slots are measured from the beam's axis, the node plus its declared insertion; each
    // column's cage stands on its own (`columnPlan` `shift`), as the detailing lays them.
    const beamOff = memberOffsetAt(el, nodeId, md.nodes, md.sections);
    for (const { e } of through) {
      const bars = ctx.columnBars!.get(e.id);
      const s = md.sections.get(e.sectionId);
      if (!bars || !s?.b || !s.h || (s.shape && s.shape !== 'rect')) continue;
      const c = memberOffsetAt(e, nodeId, md.nodes, md.sections);
      const shift = { x: c.x - beamOff.x, y: c.y - beamOff.y };
      cols.push({ b: s.b, h: s.h, cover: ctx.material.cover, tieDiaMm: ctx.material.stirrupDia, ...bars,
        ...(Math.abs(shift.x) > 1e-12 || Math.abs(shift.y) > 1e-12 ? { shift } : {}) });
    }
    // The beams crossing this one here are not read: where their hooks stand depends on how the
    // two mats are ranked and on designs made in some order, so a design reading them refused or
    // passed a beam by which crossing beam was designed first (the span fixture: three spans of
    // fourteen refused on one slab mesh and none on the others, and mirror-image beams designed
    // apart). Their bars against these are the detailing's to coordinate (`run-detailing`
    // `crossingHookTails`), and what it cannot it reports. The column is fixed when this beam is
    // designed, and is read in full.
    // Where it ends here, its own tails stand beside the column's bars (`columnTailPosts`).
    const out = nodeId === el.nodeI ? { x: -(b.x - a.x) / L, y: -(b.y - a.y) / L } : { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const plan = columnPlan(cols);
    const tailPosts = ours?.length ? columnTailPosts({
      bars: plan.map((p) => ({ along: p.x * out.x + p.y * out.y, across: p.x * t.x + p.y * t.y, diameterMm: p.diameterMm })),
      plan, u: { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, t,
      ours, placement: 0, tieDiaMm: ctx.material.stirrupDia, clearedAtMm: row.dia,
      clear: (d) => minClearSpacingColumn(ctx.codeEdition, { barDiameterMm: d, maxAggregateSizeMm: ctx.material.maxAggregateSize.value }).minClear,
    }) : [];
    return { keep: [...columnKeepOuts(cols, t, 0), ...tailPosts], bars: cols.reduce((n, c) => n + c.count, 0) };
  };
  const ends = [{ end: 'start' as const, nodeId: el.nodeI }, { end: 'end' as const, nodeId: el.nodeJ }].map((x) => ({ ...x, ...keepAt(x.nodeId) }));
  if (ends.every((x) => x.bars === 0)) return [];
  const domain = beamLayoutDomain({
    row, section: ctx.section, cover: ctx.material.cover, stirrupDiaMm,
    edition: ctx.codeEdition, maxAggregateSizeMm: ctx.material.maxAggregateSize.value, placement: 0,
    obstacles: ends.flatMap((x) => x.keep), maxTopLayers: endSupportPlan(support).maxTopLayers,
  });
  return ends.filter((x) => x.bars > 0).map((x) => {
    const r = domain.length ? threadsJoint(domain, row.dia, x.keep) : { ok: false, worstOverlap: 0 };
    return { end: x.end, nodeId: x.nodeId, ok: r.ok, worstOverlap: r.worstOverlap, slots: row.count, rowDia: row.rowDia, dia: row.dia, columnBars: x.bars };
  });
}

/** The verdicts as rows of the verifier: a joint no layout passes fails the member. */
export function jointThreadingChecks(verdicts: readonly JointThreadingVerdict[]): ProvidedRebarCheck[] {
  return verdicts.map((v) => ({
    category: `Bars through the joint (${v.end})`, demandCategory: null,
    status: v.ok ? 'ok' : 'fail', ratio: Number.NaN,
    unit: 'mm', method: 'area', tuplesChecked: 0,
    description: v.ok
      ? `${v.slots} slots Ø${v.rowDia} pass the ${v.columnBars} column bars`
      : `no layout of ${v.slots} slots Ø${v.rowDia} (largest bar Ø${v.dia}) passes the ${v.columnBars} column bars: the best one overlaps them by ${(-v.worstOverlap * 1000).toFixed(1)} mm`,
    limiting: 'congestion',
  } satisfies ProvidedRebarCheck));
}
