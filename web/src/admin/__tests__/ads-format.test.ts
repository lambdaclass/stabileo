import { describe, it, expect } from 'vitest';
import { count, percent, triggerLabel, channelLabel } from '../ads/ads-format';

describe('ads formatting', () => {
  it('shows a dash for what is not known, never zero', () => {
    expect(count(null)).toBe('—');
    expect(percent(null)).toBe('—');
    expect(count(0)).toBe('0');
  });

  it('words where an account came from and what asked for it', () => {
    expect(channelLabel('tiktok')).toBe('tiktok');
    expect(triggerLabel('gate.save')).not.toBe('gate.save');
    expect(triggerLabel('register.hero')).not.toBe('register.hero');
    expect(triggerLabel('something_new')).toBe('something_new');
  });
});
