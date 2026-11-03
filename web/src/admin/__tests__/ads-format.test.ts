import { describe, it, expect } from 'vitest';
import { count, delta, money, percent, triggerLabel, channelLabel } from '../ads/ads-format';

describe('ads formatting', () => {
  it('shows a dash for what a source does not measure, never zero', () => {
    expect(count(null)).toBe('—');
    expect(money(undefined, 'USD')).toBe('—');
    expect(percent(null)).toBe('—');
    expect(count(0)).toBe('0');
  });

  it('marks the currency and compares with the previous period', () => {
    expect(money(12.5, 'USD')).toMatch(/^US\$ 12[.,]50$/);
    expect(money(150000, 'ARS')).toMatch(/^\$ 150[.,]000$/);
    expect(delta(15, 10)).toBe(0.5);
    expect(delta(15, 0)).toBeNull();
  });

  it('words where an account came from and what asked for it', () => {
    expect(channelLabel('tiktok')).toBe('tiktok');
    expect(triggerLabel('gate.save')).not.toBe('gate.save');
    expect(triggerLabel('register.hero')).not.toBe('register.hero');
    expect(triggerLabel('something_new')).toBe('something_new');
  });
});
