import { describe, it, expect, beforeEach } from 'vitest';
import { projectSettings } from '../project-settings.svelte';
import { proNav } from '../pro-nav.svelte';
import { paletteActions } from '../../pro/palette-actions';

describe('the project’s properties have one place', () => {
  beforeEach(() => projectSettings.close());

  it('opens on the page each way in asks for', () => {
    proNav.openRegulations();
    expect(projectSettings.page).toBe('regulations');
    proNav.openProjectInfo();
    expect(projectSettings.page).toBe('data');
    projectSettings.close();
    expect(projectSettings.page).toBeNull();
  });

  it('is found from the command search, page by page', () => {
    const run = (id: string) => paletteActions().find((a) => a.cmd.id === `act-${id}`)!.cmd.action!();
    run('project-data');
    expect(projectSettings.page).toBe('data');
    run('regulations');
    expect(projectSettings.page).toBe('regulations');
    run('templates');
    expect(projectSettings.page).toBe('templates');
  });
});
