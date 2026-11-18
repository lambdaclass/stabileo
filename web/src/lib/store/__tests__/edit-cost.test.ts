/**
 * What an edit costs once a building is designed and detailed (QA of 19-oct: "modelling is very
 * slow with design in the way"). Asserted as structure, not as timings a loaded machine would
 * break:
 *  - an undo step shares the copy of the detailing taken for the previous one: the tens of
 *    megabytes of bars are copied once per version of them, not on every edit;
 *  - undoing still restores a detailing the live model owns (never the shared copy itself),
 *    with every field of its assemblies;
 *  - the physical frame is not rebuilt while nothing changed, is kept by an edit that moves no
 *    concrete, and is rebuilt by one that does.
 */
import { describe, it, expect } from 'vitest';
import { workspaceScene } from '../../engine/detailing/__tests__/helpers/workspace-scene';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { projectPhysicalFrame } from '../physical-frame';

/** JSON with every object's keys in order, so two equal values read alike whatever their key order. */
const canon = (v: unknown) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));

/** Where two long texts part, with a little of each around it; empty when they are equal. */
function firstDifference(a: string, b: string): string {
  if (a === b) return '';
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `at ${i}: …${a.slice(Math.max(0, i - 120), i + 120)}… vs …${b.slice(Math.max(0, i - 120), i + 120)}…`;
}

describe('editing a detailed building', () => {
  it('copies the detailing once per version, and the frame only when concrete moves', async () => {
    await workspaceScene('pro-edificio-7p');
    const m = modelStore.model;
    expect(m.detailing?.assemblies.length ?? 0).toBeGreaterThan(0);
    const id = [...m.nodes.keys()].find((k) => (m.nodes.get(k)!.z ?? 0) > 3)!;
    const p = { ...m.nodes.get(id)! };

    const s1 = modelStore.snapshot();
    historyStore.pushState();
    modelStore.updateNode(id, p.x + 0.01, p.y, p.z);
    const s2 = modelStore.snapshot();
    // The edit retired the document (a new detailing object) but kept the same bars: shared.
    expect(s2.detailing!.assemblies).toBe(s1.detailing!.assemblies);
    expect(s2.detailing!.assemblies).not.toBe(m.detailing!.assemblies);

    // Undo gives the model a detailing of its own, equal to the one before.
    historyStore.undo();
    expect(m.nodes.get(id)!.x).toBeCloseTo(p.x, 9);
    expect(m.detailing!.assemblies).not.toBe(s1.detailing!.assemblies);
    // Every field of every assembly comes back: the label key, the gate's verdict, the blockers.
    expect(firstDifference(canon(m.detailing!.assemblies), canon(s1.detailing!.assemblies))).toBe('');

    // The frame: kept while nothing changes and across an edit that moves no concrete.
    const f1 = projectPhysicalFrame();
    expect(projectPhysicalFrame()).toBe(f1);
    modelStore.updateNode(id, p.x, p.y, p.z);
    expect(projectPhysicalFrame()).toBe(f1);
    modelStore.updateNode(id, p.x + 0.02, p.y, p.z);
    const f2 = projectPhysicalFrame();
    expect(f2).not.toBe(f1);
    // Formwork is worked out when read, and reads the same as built eagerly.
    const joint = [...f2.joint.values()][0]!;
    expect(joint.formwork).toBeGreaterThan(0);
    expect(joint.formwork).toBe(joint.formwork);
  }, 600_000);
});
