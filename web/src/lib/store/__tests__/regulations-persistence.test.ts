import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import {
  REGULATIONS_SCHEMA_VERSION, bindRole, defaultRegulations, migrateRegulations,
} from '../../codes/roles';
import { emptyRevisions } from '../../codes/revisions';

/**
 * The regulation stack and the revision vector live on the model for the same reason
 * `codeSettings` does: every persistence path — .ded save/open, undo/redo, tab
 * capture/restore, autosave — goes through `snapshot()`/`restore()`.
 *
 * Both fields were declared on `StructureModel` AND on `ModelSnapshot` and were emitted
 * by neither. So a project opened from disk silently reverted to the default regulations,
 * an undo reverted them, and the revision vector every stored certificate is stamped
 * against was replaced by an empty one — which makes a stale certificate look current,
 * the precise failure the revision graph exists to prevent.
 *
 * These tests pin the round trip. They are written against `snapshot()`/`restore()`
 * rather than a component, because that pair is what all four persistence paths share.
 */
describe('regulation stack and revision vector persistence', () => {
  beforeEach(() => {
    modelStore.clear();
  });

  it('round-trips a chosen regulation binding through snapshot and restore', () => {
    const roles = defaultRegulations();
    roles.concrete = {
      ...bindRole('concrete', 'cirsoc', { jurisdiction: 'CABA', adoption: 'adopted' }),
      state: 'applied',
      appliedAtRevision: 4,
      configComplete: true,
    };
    modelStore.model.regulations = { version: REGULATIONS_SCHEMA_VERSION, roles };

    const snap = modelStore.snapshot();
    expect(snap.regulations, 'snapshot() must emit the stack').toBeDefined();

    modelStore.clear();
    modelStore.restore(snap);

    expect(modelStore.model.regulations?.roles.concrete.jurisdiction).toBe('CABA');
    expect(modelStore.model.regulations?.roles.concrete.adoption).toBe('adopted');
    expect(modelStore.model.regulations?.roles.concrete.appliedAtRevision).toBe(4);
  });

  it('round-trips the revision vector, and does NOT reset it to empty', () => {
    const advanced = { ...emptyRevisions(), analysis: 6, design: 5, detailing: 3 };
    modelStore.model.revisions = advanced;

    const snap = modelStore.snapshot();
    expect(snap.revisions, 'snapshot() must emit the vector').toBeDefined();

    modelStore.clear();
    modelStore.restore(snap);

    // Zeroing this on open is the dangerous failure: a certificate stamped at
    // analysis 2 would compare as fresh against an empty vector.
    expect(modelStore.model.revisions).toEqual(advanced);
    expect(modelStore.model.revisions).not.toEqual(emptyRevisions());
  });

  it('survives the JSON round-trip that .ded and autosave actually perform', () => {
    const roles = defaultRegulations();
    roles.concrete = {
      ...bindRole('concrete', 'cirsoc', { jurisdiction: 'Santa Fe' }),
      state: 'applied',
      appliedAtRevision: 1,
      configComplete: true,
    };
    modelStore.model.regulations = { version: REGULATIONS_SCHEMA_VERSION, roles };
    modelStore.model.revisions = { ...emptyRevisions(), design: 9 };

    const wire = JSON.parse(JSON.stringify(modelStore.snapshot()));
    modelStore.clear();
    modelStore.restore(wire);

    expect(modelStore.model.regulations?.roles.concrete.jurisdiction).toBe('Santa Fe');
    expect(modelStore.model.revisions?.design).toBe(9);
  });

  it('upgrades a v1 CIRSOC-specific payload instead of discarding it', () => {
    // v1 was `{ concreteEdition, loadEdition, windEdition, jurisdiction, concrete }`.
    // `migrateRegulations` handled this from the day it was written and had no caller.
    const snap = modelStore.snapshot();
    (snap as unknown as Record<string, unknown>).regulations = {
      version: 1,
      concreteEdition: '2025',
      jurisdiction: 'Córdoba',
    };
    modelStore.restore(snap);

    const stack = modelStore.model.regulations;
    expect(stack?.version).toBe(REGULATIONS_SCHEMA_VERSION);
    expect(stack?.roles.concrete.adapterId).not.toBeNull();
  });

  it('leaves an ABSENT stack absent, so restore stays idempotent', () => {
    // Materialising the default here would break a contract that has nothing to do with
    // regulations: Cancel on a CAD draft restores the snapshot taken before Apply and is
    // asserted to undo exactly, so `restore(snapshot())` must be a no-op. Absent already
    // means "derive the defaults" at every read, so respecting it costs nothing.
    const snap = modelStore.snapshot();
    delete (snap as unknown as Record<string, unknown>).regulations;
    modelStore.restore(snap);

    expect(modelStore.model.regulations).toBeUndefined();
  });

  it('restore(snapshot()) is a no-op for the regulation and revision fields', () => {
    // The property the CAD-draft Cancel path depends on, pinned directly rather than
    // observed through that path.
    const roles = defaultRegulations();
    roles.concrete = {
      ...bindRole('concrete', 'cirsoc', { jurisdiction: 'Salta' }),
      state: 'applied',
      appliedAtRevision: 3,
      configComplete: true,
    };
    modelStore.model.regulations = { version: REGULATIONS_SCHEMA_VERSION, roles };
    modelStore.model.revisions = { ...emptyRevisions(), analysis: 2 };

    const first = modelStore.snapshot();
    modelStore.restore(first);
    const second = modelStore.snapshot();

    expect(second.regulations).toEqual(first.regulations);
    expect(second.revisions).toEqual(first.revisions);
  });

  it('the absent case and the default it stands in for agree', () => {
    // Why leaving it absent is safe: the value the migration would have written is the
    // same one every reader derives when the field is missing.
    expect(migrateRegulations(undefined).stored.roles).toEqual(defaultRegulations());
  });
});

/**
 * Deliberately NOT asserted here: that `regulationsStore.binding('concrete')` reflects a
 * restore. The store reads through `$derived(model.regulations ?? …)`, and a `$derived`
 * read outside an effect root does not recompute — a plain assignment with no snapshot
 * involved is equally invisible to it under bare Vitest. An assertion through the store
 * would therefore be measuring the harness, not the code, and would pass or fail for
 * reasons unrelated to persistence. The model round trip above is the real seam; the
 * store's reactivity over it is Svelte's, exercised in the app and by Playwright.
 */
