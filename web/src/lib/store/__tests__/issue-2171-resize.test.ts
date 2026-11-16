import { expect, it } from 'vitest';
import { building } from './span-fixture';
import { designWithResizing, plannedGrowth, RESIZE_MAX_ROUNDS } from '../design-resize';
import { verificationStore } from '../verification.svelte';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

const knownWrong = process.env.RUN_KNOWN_WRONG === '2171' ? it : it.skip;
knownWrong('known wrong result: #2171 sizing a narrow beam must grow the secondary depth before exhausting the round bound', async () => {
  building(1);
  const run = await designWithResizing({ edited: 'overwrite', steel: false });
  expect(run.rounds).toBeLessThanOrEqual(RESIZE_MAX_ROUNDS);
  expect(run.stopped).toBe('verified');
  expect(plannedGrowth()).toEqual([]);
  expect([...verificationStore.contexts.keys()].every(id => ['VERIFIED', 'PROVISIONAL_BIAXIAL'].includes(verificationStore.outcomeFor(id)?.outcome ?? ''))).toBe(true);
}, 180_000);

it('an intentionally zero-round sizing limit leaves refused members without certificates', async () => {
  building(1);
  const run = await designWithResizing({ edited: 'overwrite', steel: false, maxRounds: 0 });
  expect(run.stopped).toBe('maxRounds');
  expect(run.rounds).toBe(0);
  const refused = [...verificationStore.contexts.keys()].map(id => verificationStore.outcomeFor(id)).filter(o => o?.outcome === 'SEARCH_EXHAUSTED');
  expect(refused.length).toBeGreaterThan(0);
  for(const o of refused) {
    expect(o?.accepted).toBeUndefined();
    expect(o?.certificate).toBeUndefined();
    expect(o?.limiting.length).toBeGreaterThan(0);
  }
},180_000);
