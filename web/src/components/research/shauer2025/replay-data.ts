import { researchAssetBase } from '../shell/assets';
import { fetchReplay, type Replay } from '../shell/replay';
import type { Step } from './protocol';

export const SHAUER_REPLAY_URL = `${researchAssetBase}shauer-2025/replay.srpl`;

let pending: Promise<Replay<Step>> | null = null;
let loaded: Replay<Step> | null = null;

export const loadedShauerReplay = () => loaded;

export function shauerReplay(): Promise<Replay<Step>> {
  pending ??= fetchReplay<Step>(SHAUER_REPLAY_URL).then((replay) => (loaded = replay)).catch((error) => {
    pending = null;
    throw error;
  });
  return pending;
}
