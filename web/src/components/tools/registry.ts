import type { Component } from 'svelte';

export const TOPICS = ['beams', 'stability', 'stresses', 'models'] as const;
export type Topic = typeof TOPICS[number];

export type ReviewBatch = 'tools-batch-1' | 'tools-batch-2';

/**
 * One public tool, at `/<locale>/tools/<id>/`. Its title and subtitle are `tools.<id>` and
 * `tools.<id>.subtitle` in the tools dictionaries; its card picture is drawn by ToolPreview.svelte.
 * `calculator`, `batch` and `model` are drawn by this folder's own pages; a `page` tool brings its
 * own component, which receives `{ id }`.
 */
export type ToolEntry = {
  id: string;
  topic: Topic;
  dated: { review: ReviewBatch } | { updated: string };
} & (
  | { kind: 'calculator' | 'batch' | 'model' }
  | { kind: 'page'; page: () => Promise<{ default: Component<{ id: string }> }> }
);

export const TOOLS: readonly ToolEntry[] = [
  { id: 'simply-supported-beam', topic: 'beams', kind: 'calculator', dated: { review: 'tools-batch-1' } },
  { id: 'cantilever-beam', topic: 'beams', kind: 'calculator', dated: { review: 'tools-batch-1' } },
  { id: 'continuous-beam', topic: 'beams', kind: 'batch', dated: { review: 'tools-batch-2' } },
  { id: 'influence-line', topic: 'beams', kind: 'batch', dated: { review: 'tools-batch-2' } },
  { id: 'portal-frame', topic: 'beams', kind: 'batch', dated: { review: 'tools-batch-2' } },
  { id: 'truss-2d', topic: 'beams', kind: 'batch', dated: { review: 'tools-batch-2' } },
  { id: 'beam-frame', topic: 'beams', kind: 'model', dated: { updated: '2026-11-11' } },
  { id: 'column-buckling', topic: 'stability', kind: 'calculator', dated: { review: 'tools-batch-1' } },
  { id: 'beam-natural-frequency', topic: 'stability', kind: 'batch', dated: { review: 'tools-batch-2' } },
  { id: 'tower', topic: 'stability', kind: 'model', dated: { updated: '2026-11-11' } },
  { id: 'earthquake-frame', topic: 'stability', kind: 'model', dated: { updated: '2026-11-11' } },
  { id: 'rc-column', topic: 'stresses', kind: 'model', dated: { updated: '2026-11-11' } },
  { id: 'slab-on-columns', topic: 'models', kind: 'model', dated: { updated: '2026-11-11' } },
  { id: 'outrigger', topic: 'models', kind: 'model', dated: { updated: '2026-11-11' } },
];

export const TOOL_ROUTE = '/tools';

export function findTool(path: string): ToolEntry | undefined {
  const route = path.replace(/\/+$/, '');
  return TOOLS.find(tool => route === `${TOOL_ROUTE}/${tool.id}`);
}

export function toolsIn(topic: Topic): ToolEntry[] {
  return TOOLS.filter(tool => tool.topic === topic);
}

export function toolPaths(): string[] {
  return [TOOL_ROUTE, ...TOOLS.map(tool => `${TOOL_ROUTE}/${tool.id}`)];
}

export function toolLastmod(tool: ToolEntry, reviews: { id: string; reviews: { date: string }[] }[]): string {
  if ('updated' in tool.dated) return tool.dated.updated;
  const batch = (tool.dated as { review: ReviewBatch }).review;
  return reviews.find(b => b.id === batch)!.reviews.map(r => r.date).sort().at(-1)!;
}
