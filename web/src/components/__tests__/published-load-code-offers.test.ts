import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ProAutoLoadsDialog from '../pro/ProAutoLoadsDialog.svelte';
import { modelStore } from '../../lib/store/model.svelte';
import { bindRole, defaultRegulations, findOption, roleUsable, validateStack } from '../../lib/codes/roles';
import { loadCodeFor } from '../../lib/codes/families';

afterEach(() => modelStore.clear());

it.skip('known wrong result: #1928 the published load dialog offers the generator families this build implements', () => {
  modelStore.clear();
  const html = render(ProAutoLoadsDialog, { props: { open: true, onclose() {} } }).body;
  expect(html).not.toContain('data-testid="al-family"');
  expect(html).toContain('data-testid="al-');
});

it.skip('known wrong result: #1928 load authority cannot be usable without its generating module', () => {
  const roles = defaultRegulations();
  for (const [role, id] of [['basis', 'en1990'], ['loads', 'en1991-1-1'], ['wind', 'en1991-1-4'], ['seismic', 'en1998-1']] as const) {
    expect(loadCodeFor(id)).toBeUndefined();
    expect(findOption(id)?.maturity).toBe('UNSUPPORTED');
    const explicit = { ...roles, [role]: { ...bindRole(role, id), configComplete: true } };
    expect(roleUsable(explicit, role)).toBe(false);
    expect(validateStack(explicit).problems).toContainEqual(expect.objectContaining({ key: 'regulations.problem.unsupportedAdapter', roles: [role], severity: 'error' }));
  }
  expect(loadCodeFor(roles.basis.adapterId)).toBeDefined();
  expect(roleUsable(roles, 'basis')).toBe(true);
});
