/**
 * Rules added from a library template get ids no rule of the project already has.
 *
 * `useTemplate` numbered them `r${n}` on from the list's length, so a project left with r2 and
 * r3 (r1 deleted) and a one-rule template got a second r3: the keyed table then edited or removed
 * both at once. Every other way in (a new rule, CIRSOC 101's set, a template file) already took
 * its ids from `freshRuleIds`; the component is read here because the numbering lived in it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { freshRuleIds } from '../../../lib/engine/loads/combination-rules';

const source = readFileSync(join(process.cwd(), 'src/components/pro/ProCombinationRules.svelte'), 'utf8');

describe('rules from a library template', () => {
  it('take their ids from freshRuleIds, not from the length of the list', () => {
    const body = source.slice(source.indexOf('function useTemplate'), source.indexOf('async function importTemplate'));
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain('freshRuleIds(');
    expect(body).not.toMatch(/r\$\{\+\+n\}|(^|[^.\w])rules\.length/);
  });

  it('beside r2 and r3, a one-rule template gets an id of its own', () => {
    const rules = [{ id: 'r2' }, { id: 'r3' }];
    const [id] = freshRuleIds(rules, 1);
    expect(rules.some((r) => r.id === id)).toBe(false);
  });
});
