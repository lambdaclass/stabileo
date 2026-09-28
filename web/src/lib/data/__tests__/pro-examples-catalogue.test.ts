/**
 * The PRO example catalogue, held to the models it loads.
 *
 * A card promises a size, a set of texts in three languages, a place in its group, and a model
 * that arrives ready to solve: no empty case, combinations only over what is loaded, and the
 * self-weight rule the example asks for. Each of those is checked here on every example.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver } from '../../engine/wasm-solver';
import es from '../../i18n/locales/es';
import en from '../../i18n/locales/en';
import pt from '../../i18n/locales/pt';
import { PRO_EXAMPLES, PRO_EXAMPLE_GROUP_ORDER, proExampleGroups, isHeavyExample } from '../pro-examples';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; });
afterEach(() => { uiStore.analysisMode = '3d'; });

describe('the catalogue', () => {
  it('has every group populated, in order, and each group from small to large', () => {
    const groups = proExampleGroups((k) => k);
    expect(groups.map((g) => g.group)).toEqual([...PRO_EXAMPLE_GROUP_ORDER]);
    for (const g of groups) {
      const sizes = g.examples.map((e) => e.stats.nodes);
      expect(sizes, g.group).toEqual([...sizes].sort((a, b) => a - b));
    }
  });

  it('loads each model from one card only', () => {
    const ids = PRO_EXAMPLES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each([['es', es], ['en', en], ['pt', pt]] as const)('says everything on a card in %s', (_lang, dict) => {
    const missing: string[] = [];
    for (const ex of PRO_EXAMPLES) {
      for (const k of [ex.nameKey, ex.descKey, ex.purposeKey, ex.lookKey, ex.groupKey, ...ex.tags]) if (!dict[k]) missing.push(k);
    }
    for (const k of ['pro.examples.look', 'pro.examples.replaceAsk', 'pro.examples.load', 'pro.examples.cancel', 'pro.stats.heavy', 'pro.stats.nodes', 'pro.stats.members', 'pro.stats.shells']) if (!dict[k]) missing.push(k);
    expect(missing).toEqual([]);
  });

  it('warns on the heavy models only', () => {
    expect(PRO_EXAMPLES.filter(isHeavyExample).map((e) => e.id).sort()).toEqual(['cad-arch-structure-dxf', 'la-bombonera', 'xl-diagrid-tower']);
  });
});

describe.each(PRO_EXAMPLES.map((e) => [e.id, e] as const))('%s', (_id, ex) => {
  it('is the size its card says, and arrives ready to solve', async () => {
    await ex.load();
    expect(modelStore.nodes.size, 'nodes').toBe(ex.stats.nodes);
    expect(modelStore.elements.size, 'members').toBe(ex.stats.members);
    expect(modelStore.quads.size + modelStore.plates.size, 'shells').toBe(ex.stats.shells ?? 0);

    // No case without a load, except the one that takes the self-weight.
    const rule = modelStore.analysis?.selfWeight ?? [];
    const loaded = new Set([...modelStore.loads.map((l) => (l.data as { caseId?: number }).caseId ?? 1), ...rule.map((r) => r.caseId)]);
    for (const c of modelStore.model.loadCases) expect(loaded.has(c.id), `case ${c.name}`).toBe(true);
    // Combinations over existing cases only, and at least one to solve.
    const cases = new Set(modelStore.model.loadCases.map((c) => c.id));
    expect(modelStore.combinations.length).toBeGreaterThan(0);
    for (const c of modelStore.combinations) for (const f of c.factors) expect(cases.has(f.caseId), c.name).toBe(true);

    // The self-weight the example asks for.
    if (ex.selfWeight === 'none') expect(rule).toEqual([]);
    else {
      expect(rule).toHaveLength(1);
      const dead = modelStore.model.loadCases.find((c) => c.id === rule[0]!.caseId);
      expect(dead?.type).toBe('D');
      if (ex.selfWeight === 'shells') expect(modelStore.model.groups.get(rule[0]!.groupId!)?.members.elements ?? []).toEqual([]);
    }
  }, 120_000);
});
