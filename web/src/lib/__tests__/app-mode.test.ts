import { describe, it, expect } from 'vitest';
import { examCodeFromPath, examPath, modeToPath, pathToMode, slugifyTabName } from '../app-mode';

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
  it('reads an exam address as Education and gives its code back, case-insensitively', () => {
    expect(examPath(' k7q2m9xwpa ')).toBe('/app/exam/K7Q2M9XWPA');
    expect(examCodeFromPath('/app/exam/k7q2m9xwpa/')).toBe('K7Q2M9XWPA');
    expect(pathToMode('/app/exam/K7Q2M9XWPA')).toBe('educativo');
    expect(examCodeFromPath('/app/exam/')).toBeNull();
    expect(examCodeFromPath('/app/exam/AB/C')).toBeNull();
    expect(examCodeFromPath('/app/education')).toBeNull();
  });
});
