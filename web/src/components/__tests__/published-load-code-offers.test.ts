import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ProAutoLoadsDialog from '../pro/ProAutoLoadsDialog.svelte';
import { modelStore } from '../../lib/store/model.svelte';
import { bindRole, defaultRegulations, findOption, roleUsable, validateStack } from '../../lib/codes/roles';
import { loadCodeFor } from '../../lib/codes/families';

afterEach(() => modelStore.clear());

it('known wrong result: #1928 the published load dialog offers the generator families this build implements', () => {
  modelStore.clear();
  const html = render(ProAutoLoadsDialog, { props: { open: true, onclose() {} } }).body;
  expect(html).not.toContain('data-testid="al-family"');
  expect(html).toContain('data-testid="al-');
});

it('known wrong result: #1928 load authority cannot be usable without its generating module', () => {
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

it.skip.each(['deserializeProject', 'loadProject', 'loadFile'] as const)('known wrong result: #1928 %s preserves a saved foreign load authority without granting it an implementation', async opener => {
  const { regulationsStore } = await import('../../lib/store/regulations.svelte');
  const { FAMILY_STACKS } = await import('../../lib/codes/families/stacks');
  const { serializeProject, deserializeProject, loadProject, loadFile } = await import('../../lib/store/file');
  const { REGULATIONS_SCHEMA_VERSION, allOptionsForRole } = await import('../../lib/codes/roles');
  modelStore.clear();
  const before = JSON.stringify(regulationsStore.roles);
  expect(regulationsStore.requestStack(FAMILY_STACKS.us).kind).toBe('refused');
  expect(JSON.stringify(regulationsStore.roles)).toBe(before);
  const roles = defaultRegulations();
  const id = 'asce7-22-basis';
  roles.basis = { ...bindRole('basis', id, { settings: { source: 'saved project' } }), state: 'applied', configComplete: true };
  modelStore.model.regulations = { version: REGULATIONS_SCHEMA_VERSION, roles };
  const text = serializeProject();
  modelStore.clear();
  if (opener === 'deserializeProject') expect(deserializeProject(text)).toBe(true);
  else await ({ loadProject, loadFile })[opener](new File([text], 'load-authority.ded'));
  expect(regulationsStore.roles.basis.adapterId).toBe(id);
  expect(regulationsStore.roles.basis.settings).toEqual({ source: 'saved project' });
  expect(regulationsStore.usable('basis')).toBe(false);
  expect(loadCodeFor(id)).toBeUndefined();
  expect(allOptionsForRole('basis').map(option => option.adapterId)).not.toContain(id);
});
