/**
 * The "cuts" explained step-by-step method: the internal forces N, V and M of
 * a plane frame or beam, member by member and segment by segment, from the
 * equilibrium of the part of the structure on one side of a section.
 *
 * The order is the hand calculation's: classify the structure; get the
 * reactions (from equilibrium when it is statically determinate, from the
 * matrix solve when it is not, and said so); get every member's forces at its
 * start I by cutting just after I; then, for a section at x from I in each
 * segment between load discontinuities, write N(x), V(x), M(x) as the
 * equilibrium of the piece between I and the section.
 *
 * Signs, stated once in the document and used everywhere: local axes x from
 * I to J and y a quarter turn counter-clockwise; on the piece between I and
 * the section, N acts along +x (tension positive), V along −y, and M is
 * counter-clockwise, which tensions the −y face (the reference's sagging
 * moment). With w and P positive towards −y (fem.ts's convention) this gives
 * M(x) = M_i + V_i x − ΣP(x − a) − ∫w(ξ)(x − ξ)dξ − ΣC, and V = dM/dx.
 *
 * Everything is computed from the solver's own input (plane-model.ts), so the
 * numbers are the loads the matrix solve sees; the closing comparison checks
 * them against it. The statics live in ../cuts-statics.ts, the laws along
 * each member in ../cuts-segments.ts; this file says when the method applies
 * and puts the document together.
 */
import type { ExplainedMethod, MethodContext } from '../registry';
import type { StepDoc } from '../doc';
import { tx } from '../doc';
import { hasSpecialSupports, hasThermal } from '../plane-model';
import { computeStaticDegree } from '../../kinematic-2d';
import { classificationStep, cutsContext, endForcesBlocks, introBlocks, jointCheckBlocks, reactionsStep, type Reactions } from '../cuts-statics';
import { cutMember, diagramsStep, segmentsStep, valuesStep, type MemberCut } from '../cuts-segments';

/** Beyond this the document stops being something a person reads through. */
export const CUTS_MAX_MEMBERS = 30;

// ─── Applicability ────────────────────────────────────────────────

function applies(ctx: MethodContext) {
  const { pm, input, ref } = ctx;
  if (pm.members.size === 0) return { ok: false as const, reason: tx('steps.req.noMembers') };
  if (pm.members.size > CUTS_MAX_MEMBERS) return { ok: false as const, reason: tx('steps.cuts.req.tooMany', { n: pm.members.size, max: CUTS_MAX_MEMBERS }) };
  for (const id of pm.memberOrder) {
    const m = pm.members.get(id)!;
    if (m.truss) return { ok: false as const, reason: tx('steps.cuts.req.truss', { m: m.name }) };
  }
  if (hasSpecialSupports(pm)) return { ok: false as const, reason: tx('steps.req.special') };
  for (const s of pm.supports.values()) {
    if (!['fixed', 'pinned', 'rollerX', 'rollerZ'].includes(s.type)) return { ok: false as const, reason: tx('steps.req.special') };
  }
  // A support with its own list of held components is not what the plane model reads from its type.
  for (const s of input.supports.values()) if ((s as { restrainedDofs?: unknown }).restrainedDofs) return { ok: false as const, reason: tx('steps.req.special') };
  if ((input.constraints?.length ?? 0) > 0 || (input.connectors?.size ?? 0) > 0) return { ok: false as const, reason: tx('steps.cuts.req.connectors') };
  if (hasThermal(pm)) return { ok: false as const, reason: tx('steps.req.thermal') };
  if (!ref) return { ok: false as const, reason: tx('steps.req.unstable') };
  if (computeStaticDegree(input).degree < 0) return { ok: false as const, reason: tx('steps.req.unstable') };
  return { ok: true as const };
}

// ─── The document ─────────────────────────────────────────────────

interface Built {
  doc: StepDoc;
  /** What the method found, for the tests. */
  reactions: Reactions;
  reactionsFromStatics: boolean;
  cuts: Map<number, MemberCut>;
}

export function buildCuts(ctx: MethodContext): Built {
  const S = cutsContext(ctx);
  const { pm, loadsBy, tree } = S;
  const intro = introBlocks(S);
  const cls = classificationStep(S);
  const reac = reactionsStep(S, cls.sd, cls.gh);
  const { reactions, solved } = reac;

  const end = endForcesBlocks(S, reactions);
  // Every member's segments, from its forces at I.
  const cuts = new Map<number, MemberCut>();
  for (const id of pm.memberOrder) {
    const e = end.ends.get(id)!;
    cuts.set(id, cutMember(pm.members.get(id)!, loadsBy.get(id)!, e.Ni, e.Vi, e.Mi));
  }
  const endStep = { title: tx('steps.cuts.end.title'), blocks: [...end.blocks, ...jointCheckBlocks(S, end.ends, reactions)] };

  const steps = [cls.step, reac.step, endStep, segmentsStep(S, cuts), valuesStep(S, cuts, reactions, solved, reac.unknowns), diagramsStep(S, cuts)];
  const doc: StepDoc = { method: 'cuts', title: tx('steps.m.cuts.title'), subtitle: tx(tree ? 'steps.cuts.subtitle' : 'steps.cuts.subtitleRing'), intro, steps };
  return { doc, reactions, reactionsFromStatics: !!solved, cuts };
}

export const methods: ExplainedMethod[] = [
  {
    id: 'cuts', group: 'deformation', example: 'portal-frame',
    applies,
    build: (ctx) => buildCuts(ctx).doc,
  },
];
