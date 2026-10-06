/**
 * The questions the editor asks right after an edit leaves things touching
 * without a connection, in words, for both viewports: a member drawn across
 * others or over nodes (2D and 3D), a node dropped on a node or on members.
 * What to ask about and how to connect is connection-check's; the queue is
 * connection-prompt's.
 */
import { t } from '../../i18n';
import { modelStore, uiStore } from '../../store';
import { connectionPrompt } from '../../store/connection-prompt.svelte';
import {
  membersCrossing, nodesOnMember, nodeCoincidentWith, membersThroughNode,
  connectMember, connectNodeToMembers, joinNodes,
} from './connection-check';
import { overlappingMemberPairs, type OverlapPair } from '../../engine/model-diagnostics';
import { toDisplay, unitLabel } from '../../utils/units';

/**
 * A member just drawn that crosses others or runs over nodes without being
 * connected to them: ask whether to connect it there.
 */
export function askToConnectMember(id: number) {
  const crossed = membersCrossing(id);
  const over = nodesOnMember(id);
  if (!crossed.length && !over.length) return;
  const parts: string[] = [];
  if (crossed.length === 1) parts.push(t('connect.memberCrossesOne').replace('{o}', String(crossed[0])));
  else if (crossed.length > 1) parts.push(t('connect.memberCrossesMany').replace('{n}', String(crossed.length)));
  if (over.length === 1) parts.push(t('connect.memberOverNodeOne').replace('{o}', String(over[0])));
  else if (over.length > 1) parts.push(t('connect.memberOverNodesMany').replace('{n}', String(over.length)));
  connectionPrompt.ask({
    message: t('connect.memberLead').replace('{e}', String(id)) + ' ' + parts.join(t('connect.and')) + t('connect.memberTail') + '.',
    accept: t('connect.connect'),
    decline: t('connect.leaveApart'),
    run: () => connectMember(id),
    stillApplies: () => modelStore.elements.has(id) && (membersCrossing(id).length > 0 || nodesOnMember(id).length > 0),
    key: `member:${id}`,
  });
}

/** A node dropped on another node or on members: ask whether to join it there. */
export function askToConnectNode(id: number) {
  const onto = nodeCoincidentWith(id);
  if (onto !== null) {
    connectionPrompt.ask({
      message: t('connect.nodeOnNode').replace('{a}', String(id)).replace('{b}', String(onto)),
      accept: t('connect.joinNodes'),
      decline: t('connect.keepApart'),
      run: () => {
        const r = joinNodes(id, onto);
        if (r.droppedSupports) uiStore.toast(t('connect.droppedSupport'), 'info');
      },
      stillApplies: () => modelStore.nodes.has(id) && modelStore.nodes.has(onto) && nodeCoincidentWith(id) === onto,
      key: `node:${id}`,
    });
    return;
  }
  const through = membersThroughNode(id);
  if (!through.length) return;
  connectionPrompt.ask({
    message: (through.length === 1 ? t('connect.nodeOnMemberOne').replace('{e}', String(through[0])) : t('connect.nodeOnMembersMany').replace('{n}', String(through.length)))
      .replace('{a}', String(id)),
    accept: t('connect.splitAndConnect'),
    decline: t('connect.leaveApart'),
    run: () => connectNodeToMembers(id),
    stillApplies: () => modelStore.nodes.has(id) && membersThroughNode(id).length > 0,
    key: `node:${id}`,
  });
}

/*
 * Members lying over each other: one repeating another's two nodes, or both on
 * the same stretch of a line. Two load paths where the drawing shows one, so
 * the structure comes out stiffer than anything that will be built. The
 * editor asks, in the same queue as the connection questions, whether to
 * remove the newer one or keep both (a reinforced stretch may be meant).
 */

function overlapPairs(): OverlapPair[] {
  return overlappingMemberPairs(modelStore.elements, modelStore.nodes);
}

function stillOverlap(a: number, b: number): boolean {
  const ea = modelStore.elements.get(a), eb = modelStore.elements.get(b);
  if (!ea || !eb) return false;
  return overlappingMemberPairs(new Map([[a, ea], [b, eb]]), modelStore.nodes).length > 0;
}

function askAboutPair(p: OverlapPair, undoesEdit = false): void {
  const sys = uiStore.unitSystem;
  const shared = `${+toDisplay(p.length, 'length', sys).toFixed(3)} ${unitLabel('length', sys)}`;
  const message = p.duplicate
    ? t('overlap.duplicate').replace('{b}', String(p.b)).replace('{a}', String(p.a))
    : t('overlap.overlaps').replace('{b}', String(p.b)).replace('{a}', String(p.a)).replace('{len}', shared);
  connectionPrompt.ask({
    message,
    accept: t('overlap.removeOne').replace('{b}', String(p.b)),
    decline: t('overlap.keepBoth'),
    run: () => modelStore.removeElement(p.b),
    stillApplies: () => stillOverlap(p.a, p.b),
    key: `overlap:${p.a}-${p.b}`,
    undoesEdit,
  });
}

/**
 * Ask about every member in `ids` that lies over another one. Returns true when
 * there was something to ask, so the caller can skip the connection question:
 * "connect it where it crosses" means nothing for a member on top of another.
 */
export function askAboutOverlaps(ids: Iterable<number>): boolean {
  const wanted = new Set(ids);
  if (!wanted.size) return false;
  let asked = false;
  for (const p of overlapPairs()) {
    if (!wanted.has(p.a) && !wanted.has(p.b)) continue;
    askAboutPair(p);
    asked = true;
  }
  return asked;
}

/**
 * A member just drawn over another: "delete" right away undoes the drawing,
 * with the nodes and splits it made for its ends.
 */
function askAboutDrawnOverlaps(id: number): boolean {
  let asked = false;
  for (const p of overlapPairs()) {
    if (p.a !== id && p.b !== id) continue;
    askAboutPair({ ...p, a: p.a === id ? p.b : p.a, b: id }, true);
    asked = true;
  }
  return asked;
}

/** After a model is opened or imported: one question per pair, in the same queue. */
export function askAboutOverlapsInModel(): void {
  // PRO has no connection card (Viewport3D keeps it off there), so nothing is asked.
  if (uiStore.appMode === 'pro') return;
  for (const p of overlapPairs()) askAboutPair(p);
}

/** A member just drawn: ask about an overlap if there is one, else about its connections. */
export function askAboutNewMember(id: number): void {
  if (!askAboutDrawnOverlaps(id)) askToConnectMember(id);
}
