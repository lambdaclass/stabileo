/**
 * The 2D despiece's actions, for `drawFreeBody`: what `computeDespieceVectors` says acts at every
 * cut and support (tested for equilibrium there), grouped by the piece it acts on.
 */
import { computeDespieceVectors, type DespieceBasis, type DespieceElement, type DespieceElementForces, type DespieceNode, type DespieceReaction } from './draw-despiece';
import { freeBodyKeeps, type FBAction, type FBEnd, type FBSupport } from './free-body';
import { TWO_D_NODAL_LOAD_LABELS, TWO_D_REACTION_LABELS } from '../geometry/coordinate-system';

function shownName(component: string): string {
  switch (component) {
    case 'Fx': return TWO_D_NODAL_LOAD_LABELS.horizontal;
    case 'Fz': return TWO_D_NODAL_LOAD_LABELS.vertical;
    case 'Rx': return TWO_D_REACTION_LABELS.horizontal;
    case 'Rz': return TWO_D_REACTION_LABELS.vertical;
    case 'My': return TWO_D_REACTION_LABELS.moment;
    default: return component;
  }
}

export function freeBodyActions2D(args: {
  elements: DespieceElement[];
  getNode: (id: number) => DespieceNode | undefined;
  getElementForces: (id: number) => DespieceElementForces | undefined;
  reactions: Map<number, DespieceReaction>;
  basis: DespieceBasis;
  resultant: boolean;
  showReactions: boolean;
  /** Components below this share of their piece's own actions are left out (`freeBodyKeeps`); 0 keeps all. */
  negligible?: number;
}): { ends: FBEnd[]; supports: FBSupport[] } {
  const vectors = computeDespieceVectors({
    ...args, sep: 1, vectorMode: 'all', fmt: () => '',
  });
  // What is negligible is read against the piece's own actions (`freeBodyKeeps`): a member's
  // against its two ends, a reaction against the same component at every support.
  const share = args.negligible ?? 0;
  const top = () => ({ force: 0, moment: 0 });
  const model = { member: top(), reaction: top() };
  const own = new Map<string, { force: number; moment: number }>();
  const ownKey = (v: (typeof vectors)[number]) => (v.side === 'reaction' ? `R|${v.component}` : `M|${v.elementId}`);
  for (const v of vectors) {
    const m = model[v.side === 'reaction' ? 'reaction' : 'member'];
    m[v.glyph] = Math.max(m[v.glyph], Math.abs(v.value));
    const o = own.get(ownKey(v)) ?? own.set(ownKey(v), top()).get(ownKey(v))!;
    o[v.glyph] = Math.max(o[v.glyph], Math.abs(v.value));
  }
  const elementOf = new Map(args.elements.map((e) => [e.id, e]));
  /** A force's arm across its member: the member's length times the share of it across the axis. */
  const lever = (v: (typeof vectors)[number]): number => {
    const e = v.elementId !== undefined ? elementOf.get(v.elementId) : undefined;
    const ni = e && args.getNode(e.nodeI), nj = e && args.getNode(e.nodeJ);
    if (!ni || !nj) return 0;
    const dx = nj.x - ni.x, dy = nj.y - ni.y, L = Math.hypot(dx, dy);
    return L > 0 ? Math.abs((v.dirx ?? 0) * dy - (v.diry ?? 0) * dx) : 0;
  };
  const ends = new Map<string, FBEnd>();
  const supports = new Map<number, FBSupport>();
  for (const v of vectors) {
    const base = { own: own.get(ownKey(v))!, model: model[v.side === 'reaction' ? 'reaction' : 'member'] };
    if (!freeBodyKeeps(v.value, v.glyph, share, base, v.side === 'reaction' ? 0 : lever(v))) continue;
    const a: FBAction = {
      name: shownName(v.component ?? ''), kind: v.glyph, magnitude: Math.abs(v.value), color: v.color,
      dir: { x: v.dirx ?? 0, y: v.diry ?? 0 }, ccw: v.ccw,
    };
    if (v.side === 'reaction') {
      const s = supports.get(v.nodeId!) ?? { nodeId: v.nodeId!, actions: [] };
      s.actions.push(a);
      supports.set(v.nodeId!, s);
      continue;
    }
    const key = `${v.side}|${v.elementId}|${v.end}`;
    const e = ends.get(key) ?? { memberId: v.elementId!, end: v.end!, nodeId: v.nodeId!, side: v.side, actions: [] };
    e.actions.push(a);
    ends.set(key, e);
  }
  return { ends: [...ends.values()], supports: [...supports.values()] };
}
