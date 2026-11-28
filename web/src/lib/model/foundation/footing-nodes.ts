import type { Footing } from '../footing';

export type StoredFooting = Footing & {
  wallStripSpan?: { wallGroupId: number; nodeId: number; anchors: number[]; mesh: number[] };
};

export function snapshotWallStrip(authored: Footing, resolved: Footing): StoredFooting {
  const points = authored.supportedNodeIds;
  if (!points) return authored;
  if (!resolved.supportedNodeIds || points.length === resolved.supportedNodeIds.length || authored.wallGroupId === undefined) {
    return { ...authored, supportedNodeIds: [...points] };
  }
  const anchors = [...points];
  const nodes = [...resolved.supportedNodeIds];
  return { ...authored, supportedNodeIds: nodes, wallStripSpan: {
    wallGroupId: authored.wallGroupId, nodeId: authored.nodeId, anchors, mesh: nodes.slice(anchors.length),
  } };
}

export function authoredWallStrip(stored: StoredFooting): Footing {
  if (!stored.wallStripSpan) return stored;
  const { wallStripSpan: span, ...footing } = stored;
  const nodes = footing.supportedNodeIds;
  if (footing.kind !== 'strip' || span.wallGroupId !== footing.wallGroupId || span.nodeId !== footing.nodeId
    || !Array.isArray(span.anchors) || !Array.isArray(span.mesh) || !Array.isArray(nodes)) return footing;
  const inventory = [...span.anchors, ...span.mesh];
  if (inventory.length !== nodes.length || !inventory.every((n, i) => Number.isSafeInteger(n) && n === nodes[i])) return footing;
  return { ...footing, supportedNodeIds: [...span.anchors] };
}

export function remapFootingNodes(footing: Footing, to: ReadonlyMap<number, number>): Footing {
  const node = (n: number) => to.get(n) ?? n;
  if (!to.has(footing.nodeId) && !footing.supportedNodeIds?.some(n => to.has(n))
    && !footing.straps?.some(s => s.nodeId !== undefined && to.has(s.nodeId))) return footing;
  const nodeId = node(footing.nodeId);
  return {
    ...footing, nodeId,
    ...(footing.supportedNodeIds ? { supportedNodeIds: [...new Set(footing.supportedNodeIds.map(node))].filter(n => n !== nodeId) } : {}),
    ...(footing.straps ? { straps: footing.straps.map(s => s.nodeId === undefined ? s : { ...s, nodeId: node(s.nodeId) }) } : {}),
  };
}
