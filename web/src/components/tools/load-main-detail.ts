import { BATCH_IDS } from './batch';
import { TOOL_IDS } from './calculators';

export let batchTool: typeof import('./MainBatchTool.svelte').default | undefined;
export let toolViewer: typeof import('./ToolViewer.svelte').default | undefined;
export async function loadToolDetail(path: string) {
  const id = path.replace(/\/+$/, '').split('/').pop();
  if (BATCH_IDS.some(value => value === id)) batchTool = (await import('./MainBatchTool.svelte')).default;
  if (TOOL_IDS.some(value => value === id)) toolViewer = (await import('./ToolViewer.svelte')).default;
}
