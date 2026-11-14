import { describe, it, expect } from 'vitest';
import { ALL_DICTS } from '../locales/all';

describe('the admin site names a model\'s members as the app does', () => {
  it.each([
    ['es', 'Barras'],
    ['pt', 'Barras'],
    ['de', 'Stäbe'],
    ['fr', 'Barres'],
    ['tr', 'Çubuklar'],
  ])('%s: the projects table counts bars, not people', (code, term) => {
    expect((ALL_DICTS[code] as Record<string, string>)['admin.projects.members']).toBe(term);
  });
});
