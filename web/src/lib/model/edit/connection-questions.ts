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
