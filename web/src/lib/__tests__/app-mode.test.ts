import { describe, it, expect } from 'vitest';
import { modeToPath, pathToMode, slugifyTabName } from '../app-mode';

describe('app modes and their addresses', () => {
  it('round-trips every mode', () => {
    for (const m of ['basico', 'educativo', 'pro'] as const) expect(pathToMode(modeToPath(m))).toBe(m);
  });
  it('reads a trailing slash, and anything else as Basic', () => {
    expect(pathToMode('/app/pro/')).toBe('pro');
    expect(pathToMode('/app')).toBe('basico');
    expect(pathToMode('/app/unknown')).toBe('basico');
  });
  it('slugifies a tab name without accents or punctuation, never to nothing', () => {
    expect(slugifyTabName('Pórtico 3D — nave')).toBe('portico-3d-nave');
    expect(slugifyTabName('***')).toBe('new-structure');
  });
});
