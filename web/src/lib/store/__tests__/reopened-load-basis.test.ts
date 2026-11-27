import { afterEach, expect, it } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../index';
import { memoriaInput } from '../memoria-inputs';
import { renderMemoriaHtml, type RenderContext } from '../../report/memoria/render';
import { teAt } from '../../i18n/engine-text';
import type { EngineMessage } from '../../codes/message';
import saved from './fixtures/adopted-frame.json';

afterEach(() => { modelStore.clear(); resultsStore.clear(); });

it.skip('known wrong result: #1928 reopened load derivations print in the report language without activating their generators', () => {
  const derivation: EngineMessage[] = [
    { key: 'loads.ec.snow.duoAsMono' },
    { key: 'loads.ec.live.localQk', params: { occupancy: { key: 'loads.ec.occ.A_floor' }, force: 3 } },
    { key: 'loads.asce7.snow.assumption.ce', params: { ce: 1 } },
    { key: 'loads.tr.live.reduction.fewFloors' },
  ];
  const frame = structuredClone(saved);
  Object.assign(frame.designData, { loadBasis: { at: '2026-11-27T12:00:00Z', factors: {}, levels: [], derivation, assumptions: [], refs: [] } });
  modelStore.clear();
  resultsStore.clear();
  uiStore.analysisMode = 'pro';
  modelStore.restore(frame as never);
  for (const locale of ['en', 'es', 'pt']) {
    const ctx: RenderContext = {
      tr: (key, params) => teAt({ key, params }, locale),
      msg: m => teAt(m, locale),
      fmt: (n, digits) => n.toFixed(digits),
    };
    const input = memoriaInput(ctx.tr, locale);
    expect(input.actions.basis?.derivation).toEqual(derivation);
    const html = renderMemoriaHtml(input, new Set(['actions']), ctx, locale);
    for (const message of derivation) {
      expect(html).not.toContain(message.key);
      expect(html).toContain(ctx.msg(message).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'));
    }
    expect(html).not.toContain('loads.ec.occ.A_floor');
  }
});
