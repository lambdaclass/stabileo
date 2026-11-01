import { expect, it, vi } from 'vitest';
import { viewerInteraction } from '../viewer-interaction';
import { Playback } from '../playback.svelte';

it.each(['pointerdown', 'wheel', 'keydown', 'click'])('pauses playback for viewer %s, including keyboard camera activation', event => {
  vi.useFakeTimers();
  const playback = new Playback(10, 10);
  playback.setCount(20);
  playback.startAutoplay({ reducedMotion: false, narrow: false });
  const host = new EventTarget();
  const interaction = viewerInteraction(host, () => playback.pause());
  host.dispatchEvent(new Event(event));
  const shown = playback.shown;
  vi.advanceTimersByTime(100);
  expect(playback.playing).toBe(false);
  expect(playback.shown).toBe(shown);
  interaction.destroy();
  playback.dispose();
  vi.useRealTimers();
});
