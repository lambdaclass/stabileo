/** Every «does not verify» names the article it fails, by failure class or by category. */
import { describe, it, expect } from 'vitest';
import { checkClause, checkLabel } from '../check-clauses';

describe('the article a check stands on', () => {
  it('reads the failure class, with the chapter of the member type', () => {
    expect(checkClause({ limiting: 'shear', category: 'Shear Support (Vz)' }, 'beam')).toBe('22.5');
    expect(checkClause({ limiting: 'minSteel', category: 'Min steel (span)' }, 'beam')).toBe('9.6.1');
    expect(checkClause({ limiting: 'minSteel', category: 'Min steel ratio' }, 'column')).toBe('10.6.1');
    expect(checkClause({ limiting: 'tieSpacing', category: 'Tie spacing' }, 'column')).toBe('25.7.2');
  });

  it('keeps an article the category already states, and falls back on the category', () => {
    expect(checkClause({ category: 'Skin (§9.7.2.3)' }, 'beam')).toBe('9.7.2.3');
    expect(checkLabel({ category: 'Skin (§9.7.2.3)' }, 'beam')).toBe('Skin (§9.7.2.3)');
    expect(checkLabel({ category: 'Anchorage bottom' }, 'beam')).toBe('Anchorage bottom (25.4)');
    expect(checkClause({ category: 'Bottom Span (My+)' }, 'beam')).toBe('22.3');
  });

  it('names none for a provision the app does not implement', () => {
    expect(checkClause({ limiting: 'unsupportedCheck', category: 'Something' }, 'beam')).toBeNull();
  });
});
