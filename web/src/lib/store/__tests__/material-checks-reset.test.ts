/**
 * The other materials' checks (timber, aluminium, cold-formed) are forgotten with the analysis they
 * read: a new project and a model edit each clear them, so the desk and the memoria never show a
 * previous analysis's verdicts as current.
 */
import { describe, it, expect } from 'vitest';
import { modelStore } from '..';
import { materialCheckState } from '../material-check.svelte';

const stale = () => (materialCheckState.results as Map<number, unknown>).set(1, {});

describe('the other materials\' checks', () => {
  it('are cleared by a new project', () => {
    stale();
    modelStore.announceNewProject();
    expect(materialCheckState.results.size).toBe(0);
  });
  it('are cleared by a model edit', () => {
    stale();
    modelStore.addNode(0, 0);
    expect(materialCheckState.results.size).toBe(0);
  });
});
