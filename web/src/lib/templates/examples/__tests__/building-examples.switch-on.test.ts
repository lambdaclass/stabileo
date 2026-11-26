/**
 * The gallery's buildings, loaded as their cards load them: their slabs, walls and stairs plates
 * not meshed yet, their loads and combinations written by the load generator from the settings they
 * save, the slabs' as definitions on the plates. Meshed as an analysis meshes them, every cell a
 * rectangle and none a sliver (the plates share one set of grid lines, `tartan.ts`), solved with every combination, their statics closed in force and their results held
 * to `baselines/generated/<id>.json`. The wind reaches each member as a few loads, not the
 * thousands of slivers a power-law pressure took to match to the last digit.
 */
import { describe, it, expect } from 'vitest';
import { BUILDINGS, describeBuildings } from './building-examples-fixture';

describe('the buildings of the gallery', () => {
  it('are the five concrete ones and the steel one with slabs', () => {
    expect(BUILDINGS.map((e) => e.id)).toEqual(['pro-rc-house', 'pro-rc-four-storey', 'pro-rc-steel-columns', 'pro-rc-lift-core', 'pro-rc-party-wall', 'pro-steel-building-slabs']);
  });
});

describeBuildings(['pro-rc-house', 'pro-rc-four-storey']);
