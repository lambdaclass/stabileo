import { expectTypeOf, it } from 'vitest';
import type { ModelSnapshot } from '../../store/history.svelte';
import type { FeatureSnapshot } from '../model-features';

it.skip('known wrong result: #1893: a store snapshot is valid feature input', () => {
  expectTypeOf<ModelSnapshot>().toExtend<FeatureSnapshot>();
});
