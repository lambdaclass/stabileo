import { describe, expect, it, vi } from 'vitest';
import { Playback } from '../playback.svelte';

describe('Playback autoplay rules', () => {
  it('plays through, holds at the end, then loops', () => {
    vi.useFakeTimers();
    const p = new Playback(100, 2000);
    p.setCount(3);
    p.startAutoplay({ reducedMotion: false, narrow: false });
    expect(p.shown).toBe(0);
    vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(100);
    expect(p.shown).toBe(2);
    vi.advanceTimersByTime(1999);
    expect(p.shown).toBe(2);
    vi.advanceTimersByTime(1);
    expect(p.shown).toBe(0);
    p.dispose();
    vi.useRealTimers();
  });

  it('shows the last step and does not move under reduced motion', () => {
    const p = new Playback();
    p.setCount(5);
    p.startAutoplay({ reducedMotion: true, narrow: false });
    expect(p.shown).toBe(4);
    expect(p.playing).toBe(false);
  });

  it('plays once on a narrow screen', () => {
    vi.useFakeTimers();
    const p = new Playback(100, 500);
    p.setCount(2);
    p.startAutoplay({ reducedMotion: false, narrow: true });
    vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(500);
    expect(p.shown).toBe(1);
    expect(p.playing).toBe(false);
    vi.useRealTimers();
  });

  it('stops for good on any interaction', () => {
    vi.useFakeTimers();
    const p = new Playback(100, 500);
    p.setCount(4);
    p.startAutoplay({ reducedMotion: false, narrow: false });
    p.seek(2);
    vi.advanceTimersByTime(5000);
    expect(p.shown).toBe(2);
    expect(p.auto).toBe(false);
    p.startAutoplay({ reducedMotion: false, narrow: false });
    expect(p.playing).toBe(false);
    vi.useRealTimers();
  });

  it('pauses while off screen and resumes when visible', () => {
    vi.useFakeTimers();
    const p = new Playback(100, 500);
    p.setCount(4);
    p.startAutoplay({ reducedMotion: false, narrow: false });
    p.setVisible(false);
    vi.advanceTimersByTime(1000);
    expect(p.shown).toBe(0);
    p.setVisible(true);
    vi.advanceTimersByTime(100);
    expect(p.shown).toBe(1);
    p.dispose();
    vi.useRealTimers();
  });
});


it('interact directly stops playback and clears its pending timer', () => {
  vi.useFakeTimers();
  try {
    const p = new Playback(100, 500);
    p.setCount(4);
    p.startAutoplay({ reducedMotion: false, narrow: false });
    p.interact();
    expect(p.playing).toBe(false);
    expect(p.auto).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(p.shown).toBe(0);
  } finally { vi.useRealTimers(); }
});


it('a queued visibility notification cannot restart a disposed timer', () => {
  vi.useFakeTimers();
  try {
    const p = new Playback();
    p.setCount(4);
    p.startAutoplay({ reducedMotion: false, narrow: false });
    p.dispose();
    p.setVisible(true);
    expect(p.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
