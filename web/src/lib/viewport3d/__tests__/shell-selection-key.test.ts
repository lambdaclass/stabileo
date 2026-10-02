/**
 * A click on a plate or a quad in Shells mode selects the shell, by its "p"/"q" key — the key
 * box and lasso selection fill `selectedShells` with. Handing the bare id to `selectElement`
 * named the frame member with that number, which Delete then removed.
 */
import { describe, it, expect } from 'vitest';
import { shellSelectionKey } from '../picking';

describe('shellSelectionKey', () => {
  it('keys a plate and a quad apart, though they share the number', () => {
    expect(shellSelectionKey({ type: 'plate', id: 7 })).toBe('p7');
    expect(shellSelectionKey({ type: 'quad', id: 7 })).toBe('q7');
  });
  it('has no key for a member, a node or nothing', () => {
    expect(shellSelectionKey({ type: 'element', id: 7 })).toBeNull();
    expect(shellSelectionKey({ type: 'node', id: 7 })).toBeNull();
    expect(shellSelectionKey(null)).toBeNull();
  });
});
