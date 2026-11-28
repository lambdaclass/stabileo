import { afterEach, expect, it } from 'vitest';
import { modelStore } from '../model.svelte';
import { crackedBasis } from '../cracked-deflection';
import type { ModelSnapshot } from '../history.svelte';
import saved from './fixtures/adopted-frame.json';

afterEach(() => modelStore.clear());

it('the cracked-section entry uses only offered reinforcement sources', () => {
  const project = structuredClone(saved) as unknown as ModelSnapshot;
  const adoption = saved.designData.rcSheets.adopted['beam:1:0'];
  const faces = { top: adoption.top, bottom: adoption.bottom };
  const sheet = { key: 'beam:1:0', from: 'span' as const, stirrupDia: adoption.stirrups.dia, start: faces, span: faces, end: faces };
  const member = project.elements.find(([id]) => id === 4)![1];
  const enabled = __PUBLIC_FEATURES__.proRcSheets;
  for (const reinforced of [false, true]) {
    if (reinforced) member.reinforcement = { regions: { bottomSpanLayers: [{ count: 4, diameter: 20, row: 0 }] } };
    modelStore.restore(project);
    const memberOnly = crackedBasis([4], new Map(), () => null);
    let reads = 0;
    const result = crackedBasis([4], new Map(), () => { reads++; return sheet; });
    expect(!!memberOnly).toBe(reinforced);
    if (enabled) {
      expect(reads).toBe(1);
      expect(result?.bars).toBe('sheets');
      expect(result?.Icr).toBeGreaterThan(0);
      if (reinforced) expect(result?.Icr).not.toBe(memberOnly?.Icr);
    } else {
      expect(result).toStrictEqual(memberOnly);
      expect(reads).toBe(0);
      if (memberOnly) expect(Object.hasOwn(memberOnly, 'bars')).toBe(false);
    }
  }
});
