/**
 * The influence line in the explained catalog. Opened from the influence-line tool it explains the
 * line on screen, with the loads typed there (`setInfluenceDocInput`); from the catalog it takes the
 * selected member (M at its midspan) or supported node (its vertical reaction), else the first
 * member's midspan.
 */
import type { ExplainedMethod, MethodContext } from '../registry';
import type { SolverInput } from '../../types';
import { tx } from '../doc';
import { buildInfluenceDoc } from '../influence-doc';
import { advancedRefusal2D } from '../../solver-service';
import { computePoints, UNIT_LOAD_DIR } from '../../influence-service';
import { unitSolver } from '../../influence/unit-sweep';
import { defaultLoadedMembers, ilLoadsValid, type IlLoads, type LivePlacement } from '../../influence/areas';
import { supportReaction, type IlTarget } from '../../influence/quantities';
import { countIndeterminacy } from '../../force-method/primary';
import type { InfluenceDirection, InfluenceQuantity } from '../../../store/model.svelte';

export interface InfluenceDocInput {
  quantity: InfluenceQuantity;
  target: IlTarget;
  direction: InfluenceDirection;
  loads: IlLoads;
  placement: LivePlacement;
  loadedIds?: number[];
}

let pending: { doc: InfluenceDocInput; on: string } | null = null;

export function structureKey(input: SolverInput): string {
  const byId = <T extends { id: number }>(m: Map<number, T>) => [...m.values()].sort((a, b) => a.id - b.id);
  return JSON.stringify([
    byId(input.nodes).map((n) => [n.id, n.x, n.z]),
    byId(input.elements).map((e) => [e.id, e.type, e.nodeI, e.nodeJ, e.hingeStart, e.hingeEnd, e.sectionId, e.materialId]),
    byId(input.supports).map((s) => [s.nodeId, s.type, s.angle ?? 0, s.kx ?? 0, s.ky ?? 0, s.kz ?? 0]),
  ]);
}

/** What the next document explains, on the structure it was chosen on; null goes back to choosing from the selection. */
export function setInfluenceDocInput(v: InfluenceDocInput | null, on: SolverInput | null = null): void { pending = v && on ? { doc: v, on: structureKey(on) } : null; }

const DEFAULT_LOADS: IlLoads = { g: 10, q: 5, P: 0 };

export function fromSelection(ctx: MethodContext): { input: InfluenceDocInput; defaulted: boolean } | null {
  const base = { direction: 'vertical' as const, loads: DEFAULT_LOADS, placement: 'zones' as const };
  const member = ctx.selection.members.find((id) => ctx.input.elements.get(id)?.type === 'frame');
  if (member !== undefined) return { input: { ...base, quantity: 'M', target: { kind: 'section', elementId: member, t: 0.5 } }, defaulted: false };
  for (const id of ctx.selection.nodes) {
    for (const s of ctx.input.supports.values()) {
      if (s.nodeId !== id) continue;
      const quantity = supportReaction(s, Math.cos(s.angle ?? 0));
      if (quantity) return { input: { ...base, quantity, target: { kind: 'node', nodeId: id } }, defaulted: false };
    }
  }
  const first = [...ctx.input.elements.values()].find((e) => e.type === 'frame') ?? [...ctx.input.elements.values()][0];
  if (!first) return null;
  return { input: { ...base, quantity: first.type === 'truss' ? 'N' : 'M', target: { kind: 'section', elementId: first.id, t: 0.5 } }, defaulted: true };
}

export function chosenInput(ctx: MethodContext) {
  const p = pending && pending.on === structureKey(ctx.input) ? pending.doc : null;
  const valid = p && (p.target.kind === 'node' ? ctx.input.nodes.has(p.target.nodeId) : ctx.input.elements.has(p.target.elementId));
  return valid ? { input: p!, defaulted: false } : fromSelection(ctx);
}

export const methods: ExplainedMethod[] = [
  {
    id: 'influenceLine', group: 'influence', example: 'continuous-beam-unequal',
    applies: (ctx) => {
      if (ctx.input.supports.size === 0) return { ok: false, reason: tx('influence.needSupport') };
      const refusal = advancedRefusal2D(unitSolver(ctx.input));
      if (refusal) return { ok: false, reason: tx('course.influence.doc.refused', { why: refusal }) };
      const c = chosenInput(ctx);
      if (c && !ilLoadsValid(c.input.loads)) return { ok: false, reason: tx('course.influence.load.nonNegative') };
      return c ? { ok: true } : { ok: false, reason: tx('influence.needNodesElems') };
    },
    build: (ctx) => {
      const c = chosenInput(ctx)!;
      const unit = unitSolver(ctx.input);
      const dir = UNIT_LOAD_DIR[c.input.direction];
      const points = computePoints(unit, c.input.quantity, c.input.target, 20, dir, c.input.direction);
      return buildInfluenceDoc({
        unit, pm: ctx.pm, quantity: c.input.quantity, target: c.input.target, points, dir,
        vertical: c.input.direction === 'vertical', loads: c.input.loads, placement: c.input.placement,
        loadedIds: c.input.loadedIds?.length ? c.input.loadedIds : defaultLoadedMembers(unit, dir),
        gh: countIndeterminacy(ctx.input).gh, defaulted: c.defaulted,
      });
    },
  },
];
