import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import {
  DAGG_ASSUMED_MM, defaultCodeSettings, migrateCodeSettings,
} from '../../codes/project-code-settings';

/**
 * Code settings live on the model so they travel through every persistence path for
 * free — .ded, tab capture/restore, URL share, autosave all go through
 * snapshot()/restore(). These tests pin that, and pin the migration decision that a
 * settings-less project becomes a 2005 project rather than inheriting the 2025 default.
 */
describe('project code settings persistence', () => {
  beforeEach(() => {
    modelStore.clear();
  });

  it('gives a new model the edition in force', () => {
    expect(modelStore.model.codeSettings?.concreteEdition).toBe('2025');
  });

  it('round-trips through snapshot and restore', () => {
    modelStore.model.codeSettings = {
      ...defaultCodeSettings(),
      jurisdiction: { name: 'CABA', basis: 'adopted', instrument: 'Ley 6438' },
      concrete: { maxAggregateSizeMm: 19, shotcrete: false },
    };
    const snap = modelStore.snapshot();
    modelStore.clear();
    expect(modelStore.model.codeSettings?.concrete.maxAggregateSizeMm).toBeNull();

    modelStore.restore(snap);
    expect(modelStore.model.codeSettings).toEqual({
      ...defaultCodeSettings(),
      jurisdiction: { name: 'CABA', basis: 'adopted', instrument: 'Ley 6438' },
      concrete: { maxAggregateSizeMm: 19, shotcrete: false },
    });
  });

  it('survives a JSON round-trip, which is what .ded and URL sharing actually do', () => {
    modelStore.model.codeSettings = {
      ...defaultCodeSettings(),
      concreteEdition: '2005',
      concrete: { maxAggregateSizeMm: 25, shotcrete: true },
    };
    const wire = JSON.parse(JSON.stringify(modelStore.snapshot()));
    modelStore.clear();
    modelStore.restore(wire);
    expect(modelStore.model.codeSettings?.concreteEdition).toBe('2005');
    expect(modelStore.model.codeSettings?.concrete).toEqual({ maxAggregateSizeMm: 25, shotcrete: true });
  });

  it('does not share mutable state between a snapshot and the live model', () => {
    const snap = modelStore.snapshot();
    modelStore.model.codeSettings!.concrete.maxAggregateSizeMm = 32;
    expect(snap.codeSettings?.concrete.maxAggregateSizeMm).toBeNull();
  });

  it('stamps a settings-less project as 2005, not as the 2025 default', () => {
    // The whole point: those stored results were produced by a verifier implementing
    // 2005 rules. Adopting the 2025 default would misrepresent what they were checked
    // against.
    const snap = modelStore.snapshot();
    delete (snap as { codeSettings?: unknown }).codeSettings;
    modelStore.restore(snap);
    expect(modelStore.model.codeSettings?.concreteEdition).toBe('2005');
    expect(modelStore.model.codeSettings?.loadEdition).toBe('2005');
    expect(modelStore.model.codeSettings?.windEdition).toBe('2005');
  });

  it('emits a warning notice for a legacy project', () => {
    const { notices } = migrateCodeSettings(undefined);
    const legacy = notices.find((n) => n.key === 'codes.migration.legacyProject');
    expect(legacy?.severity).toBe('warning');
  });

  it('keeps an absent aggregate size absent rather than baking in the assumption', () => {
    // null must survive persistence: it is what makes the assumption visible on every
    // subsequent open. Persisting 20 would erase the distinction permanently.
    const wire = JSON.parse(JSON.stringify(modelStore.snapshot()));
    expect(wire.codeSettings.concrete.maxAggregateSizeMm).toBeNull();
    modelStore.restore(wire);
    expect(modelStore.model.codeSettings?.concrete.maxAggregateSizeMm).toBeNull();
    expect(modelStore.model.codeSettings?.concrete.maxAggregateSizeMm).not.toBe(DAGG_ASSUMED_MM);
  });

  it('rejects a corrupted settings blob without throwing', () => {
    const snap = modelStore.snapshot();
    (snap as { codeSettings?: unknown }).codeSettings = { concreteEdition: 'banana', concrete: 'nope' };
    expect(() => modelStore.restore(snap)).not.toThrow();
    expect(modelStore.model.codeSettings?.concreteEdition).toBe('2025');
    expect(modelStore.model.codeSettings?.concrete.maxAggregateSizeMm).toBeNull();
  });
});
