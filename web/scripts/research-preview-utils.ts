import { createHash } from 'node:crypto';
import previews from '../src/components/research/preview-config.json';

export const configs = previews;
export const replayHash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

export function frameSteps(count: number, frames: number): number[] {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(frames) || frames < 2) throw new Error('Invalid replay/frame count');
  return Array.from({ length: frames }, (_, i) => Math.round(i * (count - 1) / (frames - 1)));
}

export function captureUrl(base: string, config: typeof configs[number]): string {
  const url = new URL(`/en${config.path}/`, base);
  url.search = config.query;
  url.searchParams.set('step', String(config.step));
  return url.href;
}
