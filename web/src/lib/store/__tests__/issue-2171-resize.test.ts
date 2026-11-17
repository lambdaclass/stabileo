import { expect, it } from 'vitest';
import { building } from './span-fixture';
import { designWithResizing, plannedGrowth, RESIZE_MAX_ROUNDS } from '../design-resize';
import { verificationStore } from '../verification.svelte';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

it('known wrong result: #2171 sizing a narrow beam must grow the secondary depth before exhausting the round bound', async () => {
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

for (const maxRounds of [1, 2]) it(`known wrong result: #2171 sizing reports the boundary at ${maxRounds} rounds`, async () => {
  building(1);
  const run=await designWithResizing({edited:'overwrite',steel:false,maxRounds});
  expect(run.rounds).toBe(maxRounds);
  expect(run.stopped).toBe('maxRounds');
  const refused=[...verificationStore.contexts.keys()].map(id=>verificationStore.outcomeFor(id)).filter(o=>o?.outcome==='SEARCH_EXHAUSTED');
  expect(refused.length>0).toBe(true);
  if (maxRounds === 2) expect(refused.map(o => [o!.elementId, o!.limiting])).toEqual([
    ...[27, 28, 29, 30, 31, 61, 62, 63, 64, 65].map(id => [id, ['congestion']]),
    ...[44, 45, 46, 47, 48, 66, 67, 68, 69, 70, 100, 101, 102, 103, 104].map(id => [id, ['anchorage']]),
  ].sort((a, b) => Number(a[0]) - Number(b[0])));

  for(const outcome of refused) {
    expect(outcome?.accepted).toBeUndefined();
    expect(outcome?.certificate).toBeUndefined();
  }
},180_000);
