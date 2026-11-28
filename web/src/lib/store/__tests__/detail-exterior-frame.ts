import { expect } from 'vitest';
import { modelStore } from '../model.svelte';
import { designRunStore } from '../design-run.svelte';
import { detailingStore } from '../detailing.svelte';

export function detailExteriorFrame(extraIds: readonly number[] = [], verifierId?: string) {
  const nodes = modelStore.nodes;
  const exteriorY = Math.min(...Array.from(nodes.values(), node => node.y));
  const ids = new Set(extraIds);
  for (const member of modelStore.elements.values()) {
    if (nodes.get(member.nodeI)?.y === exteriorY && nodes.get(member.nodeJ)?.y === exteriorY) ids.add(member.id);
  }
  detailFrame(ids, verifierId);
}

export function detailFrame(ids: ReadonlySet<number>, verifierId?: string) {
  const demands = designRunStore.computeDemands();
  expect(demands.ok, demands.reasonKey).toBe(true);
  const check = designRunStore.runCodeCheck();
  expect(check.ok, check.reasonKey).toBe(true);

  const run = designRunStore.autoDesign(ids, { deferDetailing: true });
  expect(run.ok, run.reasonKey).toBe(true);
  for (const id of ids) expect(run.outcomes?.has(id), `design reached element ${id}`).toBe(true);
  expect(detailingStore.generate({ verifierId }), detailingStore.lastError ?? 'frame detailing').toBeTruthy();
}
