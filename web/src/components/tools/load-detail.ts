import type { Component } from 'svelte';
import { findTool, type ToolEntry } from './registry';

type Detail = Component<{ id: string }>;

/** The route loader resolves these before ToolsPage renders or its scroll resets. */
export const details = new Map<string, Detail>();

export const detailKey = (tool: ToolEntry) => (tool.kind === 'page' ? tool.id : tool.kind);

export async function loadToolDetail(path: string) {
  const tool = findTool(path);
  if (!tool || details.has(detailKey(tool))) return;
  const page = tool.kind === 'page' ? tool.page()
    : tool.kind === 'calculator' ? import('./CalculatorTool.svelte')
      : tool.kind === 'batch' ? import('./BatchTool.svelte')
        : import('./ModelTool.svelte');
  details.set(detailKey(tool), (await page).default as unknown as Detail);
}
