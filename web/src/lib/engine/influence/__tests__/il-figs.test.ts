import { describe, it, expect } from 'vitest';
import { releasedSupport } from '../../steps/influence-figs';

describe('Müller–Breslau releases only the target reaction', () => {
  it('a pin keeps the other translation', () => {
    expect(releasedSupport('pinned', 'Rz')).toBe('rollerV');
    expect(releasedSupport('pinned', 'Rx')).toBe('roller');
  });
  it('a fixed support keeps the rest: a pin for the moment, a guide for a translation', () => {
    expect(releasedSupport('fixed', 'My')).toBe('pinned');
    expect(releasedSupport('fixed', 'Rz')).toBe('guided');
    expect(releasedSupport('fixed', 'Rx')).toBe('guidedV');
  });
  it('a roller holding only that reaction goes', () => {
    expect(releasedSupport('roller', 'Rz')).toBeNull();
    expect(releasedSupport('rollerV', 'Rx')).toBeNull();
  });
});
