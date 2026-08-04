import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { REGULATIONS_SCHEMA_VERSION, bindRole, defaultRegulations } from '../../codes/roles';
import { bump, emptyRevisions } from '../../codes/revisions';

/**
 * The regulation stack and the revision vector live on the model for the same reason
 * `codeSettings` does: so they travel through every persistence path for free — .ded
 * save/open, tab capture/restore, URL share and autosave all go through
 * snapshot()/restore(), and so does undo/redo.
 *
 * These pin that they actually do. Without them the stack was declared on the model and
 * on `ModelSnapshot`, but `snapshot()` never emitted it and `restore()` never read it, so
 * every save/open and every undo silently reset the project to `defaultRegulations()` and
 * dropped the staleness stamps that gate stored results.
 *
 * Each round-trip test blanks the live fields between snapshot and restore. Reading them
 * back without that step proves nothing: the value would still be sitting on the model
 * from before the snapshot, and the assertion passes whether or not `restore()` works.
 */
describe('project regulations persistence', () => {
  beforeEach(() => {
    modelStore.clear();
  });

  function boundToConcrete2025() {
    const roles = defaultRegulations();
    roles.concrete = {
      ...bindRole('concrete', 'cirsoc', { jurisdiction: 'CABA', adoption: 'adopted' }),
      state: 'applied', appliedAtRevision: 0,
    };
    return { version: REGULATIONS_SCHEMA_VERSION, roles };
  }

  /** What a fresh tab or a newly opened file looks like before restore() runs. */
  function blankLiveStack() {
    modelStore.model.regulations = undefined;
    modelStore.model.revisions = undefined;
  }

  it('round-trips the role bindings through snapshot and restore', () => {
    modelStore.model.regulations = boundToConcrete2025();
    const snap = modelStore.snapshot();
    blankLiveStack();

    modelStore.restore(snap);

    expect(modelStore.model.regulations?.roles.concrete.adapterId).toBe('cirsoc');
    expect(modelStore.model.regulations?.roles.concrete.jurisdiction).toBe('CABA');
    expect(modelStore.model.regulations?.roles.concrete.state).toBe('applied');
  });

  it('round-trips the revision vector, which is what gates stale results', () => {
    modelStore.model.revisions = bump(emptyRevisions(), 'analysis');
    const before = modelStore.model.revisions.analysis;
    expect(before).toBeGreaterThan(0);
    const snap = modelStore.snapshot();
    blankLiveStack();

    modelStore.restore(snap);

    expect(modelStore.model.revisions?.analysis).toBe(before);
  });

  it('survives a JSON round-trip, which is what .ded and URL sharing actually do', () => {
    modelStore.model.regulations = boundToConcrete2025();
    modelStore.model.revisions = bump(emptyRevisions(), 'analysis');

    const wire = JSON.parse(JSON.stringify(modelStore.snapshot()));
    blankLiveStack();
    modelStore.restore(wire);

    expect(modelStore.model.regulations?.roles.concrete.adapterId).toBe('cirsoc');
    expect(modelStore.model.revisions?.analysis).toBe(1);
  });

  it('unsets a stored edition that has since been withdrawn rather than carrying it', () => {
    // A project saved naming an edition whose text is not supplied must not come back
    // bound to it — the rules cannot be applied, so the binding would be a lie.
    const roles = defaultRegulations();
    roles.concrete = {
      ...roles.concrete, adapterId: 'cirsoc-2005', edition: '2005', state: 'applied',
    };
    const snap = modelStore.snapshot();
    blankLiveStack();

    modelStore.restore({
      ...snap,
      regulations: { version: REGULATIONS_SCHEMA_VERSION, roles },
    });

    expect(modelStore.model.regulations?.roles.concrete.adapterId).toBeNull();
  });

  it('gives a new project the default stack instead of inheriting the previous one', () => {
    modelStore.model.regulations = boundToConcrete2025();
    modelStore.model.regulations.roles.concrete.jurisdiction = 'Santa Fe';

    modelStore.clear();

    expect(modelStore.model.regulations?.roles.concrete.jurisdiction ?? '').toBe('');
  });
});
