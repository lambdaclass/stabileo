/**
 * What a change to the model does to the outputs built before it.
 *
 * Measured on the acceptance run: after a section change the detailing still weighed the same,
 * the thirty sheets were still offered and nothing said they described the old structure. The
 * rule now:
 *  - a structural edit retires the current document and moves the document revision on;
 *  - the detailing stays (it is the person's reinforcement) and says it is out of date, through
 *    the design fingerprint it was stamped with, after a reload too;
 *  - a document built from out-of-date detailing says OUTDATED on its face;
 *  - a reinforcement edit does not make the detailing out of date (it has its own path), and
 *    undoing the structural edit makes it current again.
 *
 * The chain is the production one, on the committed project with a column and its footing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { detailingStore } from '../detailing.svelte';
import '../index';
import { serializeProject, deserializeProject } from '../file';
import { runProductionChain } from '../../export/__tests__/rc-cad-chain';
import { readinessBanner } from '../../engine/detailing/document-render';

const build = () => detailingStore.buildDocument({ author: 'test', at: '2026-10-11T00:00:00Z' });

/** A structural edit: the first material 10 % stiffer. */
function stiffenFirstMaterial(): void {
  const m = [...modelStore.materials.values()][0]!;
  modelStore.updateMaterial(m.id, { e: m.e * 1.1 });
}

describe('outputs after a change to the model', () => {
  beforeEach(() => historyStore.clear());

  it('the detailing is current right after it is generated, and its document is not out of date', async () => {
    const r = await runProductionChain();
    expect(r.persisted.length).toBeGreaterThan(0);
    expect(detailingStore.modelStale).toBe(false);
    const doc = build()!;
    expect(doc.readiness).not.toBe('OUTDATED');
  });

  it('a structural edit retires the document, moves the revision on, and marks the detailing out of date', async () => {
    await runProductionChain();
    const doc = build()!;
    const rev = doc.revision.number;
    stiffenFirstMaterial();
    expect(detailingStore.document).toBeNull();
    expect(detailingStore.documentRevision).toBe(rev + 1);
    expect(detailingStore.modelStale).toBe(true);
    const again = build()!;
    expect(again.readiness).toBe('OUTDATED');
    expect(readinessBanner(again, 'es')).toMatch(/^DESACTUALIZADO/);
    expect(readinessBanner(again, 'en')).toMatch(/^OUT OF DATE/);
  });

  it('out of date survives saving and reopening, and so does the revision', async () => {
    await runProductionChain();
    build();
    stiffenFirstMaterial();
    const rev = detailingStore.documentRevision;
    const file = serializeProject();
    modelStore.clear();
    expect(deserializeProject(file)).toBe(true);
    expect(detailingStore.modelStale).toBe(true);
    expect(detailingStore.documentRevision).toBe(rev);
    expect(detailingStore.documentEverBuilt).toBe(true);
  });

  it('saving and opening without a change does not make anything out of date', async () => {
    await runProductionChain();
    const file = serializeProject();
    modelStore.clear();
    expect(deserializeProject(file)).toBe(true);
    expect(detailingStore.modelStale).toBe(false);
  });

  it('undoing the edit makes the detailing current again', async () => {
    await runProductionChain();
    historyStore.clear();
    stiffenFirstMaterial();
    expect(detailingStore.modelStale).toBe(true);
    historyStore.undo();
    expect(detailingStore.modelStale).toBe(false);
  });
});
