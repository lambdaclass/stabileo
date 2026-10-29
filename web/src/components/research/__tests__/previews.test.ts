import { describe, expect, it } from 'vitest';
import { configs, replayHash, frameSteps, captureUrl } from '../../../../scripts/research-preview-utils';
import { EXPERIMENTS } from '../experiments';

describe('research preview configuration', () => {
  it('covers every runnable experiment with deterministic capture settings', () => {
    expect(configs.map((c) => c.paperId)).toEqual(EXPERIMENTS.map((e) => e.paperId));
    for (const config of configs) {
      expect(config.path).toMatch(/^\/research\/[a-z0-9-]+\/[a-z0-9-]+$/);
      expect(config.frames).toBe(60);
      expect(config.step).toBeGreaterThanOrEqual(0);
      const url = new URL(captureUrl('http://localhost:1234', config));
      expect(url.searchParams.get('step')).toBe(String(config.step));
      expect(url.pathname).toBe(`/en${config.path}/`);
      expect(config.viewer).toBeTruthy();
      expect(config.slider).toBeTruthy();
    }
  });
  it('hashes replay bytes and covers the whole replay including endpoints', () => {
    expect(replayHash(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const frames = frameSteps(79, 60);
    expect(frames).toHaveLength(60);
    expect(frames[0]).toBe(0);
    expect(frames[59]).toBe(78);
    expect(frameSteps(1, 2)).toEqual([0, 0]);
    expect(() => frameSteps(0, 60)).toThrow();
  });
});
