import { describe, it, expect } from 'vitest';
import { userCompare } from '../plastic/user-compare';

describe('the proposed mechanism against the step-by-step λc', () => {
  it('compares only with a verified collapse', () => {
    expect(userCompare({ isMechanism: true, collapseFactor: 2 }, 2.5)).toEqual({ lambda: 2, diff: 25 });
    expect(userCompare({ isMechanism: false, collapseFactor: 1.4 }, 2.5)).toBeNull();
    expect(userCompare({ isMechanism: true, unresolved: true, collapseFactor: 1.4 }, 2.5)).toBeNull();
    expect(userCompare({ isMechanism: true, collapseFactor: Infinity }, 2.5)).toBeNull();
  });
});
