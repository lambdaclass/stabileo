/**
 * The project's concrete as one set of properties, read by the steel joints (a base plate's
 * concrete) and by what is left of the RC detailing. The joints read it from a module of its own,
 * so deleting the RC detailing inputs cannot take the steel connections with it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { historyStore, modelStore } from '../index';
import { patchDesignData } from '../design-data';
import { defaultDesignData } from '../../model/design-data';
import { resolveConcreteProperties } from '../concrete-properties';

describe('the project concrete properties', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('the least f\'c among the concretes, the steel and the slab cover of the design data', () => {
    modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
    patchDesignData({ rebarFy: 500, covers: { ...defaultDesignData().covers, slab: 0.02 } });
    expect(resolveConcreteProperties()).toEqual({ fc: 25, fy: 500, cover: 0.02 });
  });

  it('a model with no concrete has f\'c 0: a steel\'s yield is not one', () => {
    modelStore.addMaterial({ name: 'S235', e: 200000, nu: 0.3, rho: 78.5, fy: 250, fu: 400 } as never);
    expect(resolveConcreteProperties().fc).toBe(0);
  });

  it('the steel joints read it without the RC detailing inputs', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/store/joint-typology.ts'), 'utf8');
    expect(src).toContain("from './concrete-properties'");
    expect(src).not.toMatch(/detailing-project-inputs|detailing\.svelte/);
  });
});
