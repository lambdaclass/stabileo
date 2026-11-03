import { researchAssetBase } from '../shell/assets';
import { fetchReplay, type Replay } from '../shell/replay';
import type { Step } from './protocol';

let pending: Promise<Replay<Step>> | null = null;
let loaded: Replay<Step> | null = null;

export const loadedShauerReplay = () => loaded;

/** Shared by the route loader, which starts it beside the page's chunk, and the page. A failure is retried on the next call. */
export function shauerReplay(): Promise<Replay<Step>> {
  pending ??= fetchReplay<Step>(`${researchAssetBase}shauer-2025/replay.srpl`).then((replay) => (loaded = replay)).catch((error) => {
    pending = null;
    throw error;
  });
  return pending;
}
