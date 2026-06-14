// Room-label detection on the uploaded architectural DXFs (V1/V2). The
// shipped example fixtures use a single global L (room-based loads are
// opt-in); this test confirms the importer DETECTS the room labels that exist
// in those plans when their room-text layer is mapped to 'text'.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { parseCadDxf } from '../parse';
import { suggestLayerMappings, extractArchPlan } from '../classify';
import type { LayerRole } from '../types';

const V2 = 'src/lib/cad/__tests__/fixtures/V2-Architecture.dxf';

describe('room-label detection on uploaded plans', () => {
  it.runIf(existsSync(V2))('V2 architecture: detects residential room categories where labelled', () => {
    const doc = parseCadDxf(readFileSync(V2, 'utf8'), 'V2-Architecture.dxf');
    // Map the architectural room-text layer to 'text' so room labels are read
    // (the V2 example build leaves it ignored to avoid load noise).
    const mappings = suggestLayerMappings(doc, 'm').map((m) =>
      /T - Locales/i.test(m.layer) ? { ...m, role: 'text' as LayerRole } : m);
    const plan = extractArchPlan(doc, mappings, 'm');

    expect(plan.roomLabels.length).toBeGreaterThan(0);
    const cats = new Set(plan.roomLabels.map((r) => r.category));
    // V2 has ESTAR (living), BAÑO/COCINA/VESTIDOR (private), BALCON (balcony).
    expect(cats.has('living')).toBe(true);
    expect(cats.has('private')).toBe(true);
    expect(cats.has('balcony')).toBe(true);
    // Every detected label carries a CIRSOC load value.
    for (const r of plan.roomLabels) expect(r.q).toBeGreaterThan(0);
  });

  it.runIf(existsSync(V2))('default mapping (room layer ignored) yields no room labels → global L behavior', () => {
    const doc = parseCadDxf(readFileSync(V2, 'utf8'), 'V2-Architecture.dxf');
    // Mirror the example build: T-Locales ignored.
    const mappings = suggestLayerMappings(doc, 'm').map((m) =>
      /T - Locales/i.test(m.layer) ? { ...m, role: 'ignore' as LayerRole } : m);
    const plan = extractArchPlan(doc, mappings, 'm');
    expect(plan.roomLabels.length).toBe(0);
  });
});
