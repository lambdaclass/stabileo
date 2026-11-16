import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { expect, it, vi } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { freshStamp } from '../solve-stamp';
import { createRecheckStore } from '../../store/recheck.svelte';
import type { FeatureSnapshot } from '../model-features';

const change = RESULT_CHANGES.changes.find(c => c.id === 'gravity-stations-and-edits')!;
for (const mode of ['2d', '3d', 'pro']) for (const type of ['distributed', 'distributed3d', 'pointOnElement', 'pointOnElement3d']) {
  it(`known wrong result: #2219 manual load restoration survives a current solve ${mode} ${type}`, async () => {
    const snapshot: FeatureSnapshot = { loads: [{ type, data: { elementId: 1, qI: 1, qJ: 1, p: 1, a: 0.5 } }] };
    const stamp = freshStamp();
    const ids = (s: FeatureSnapshot) => assessProject(s, stamp, mode).changes.map(c => c.id);
    expect(ids(snapshot)).toContain(change.id);
    for (const version of [0, change.resultsVersion - 1]) {
      snapshot.loads![0]!.data!.memberLoadsVersion = version;
      expect(ids(snapshot)).toContain(change.id);
    }
    const store = createRecheckStore();
    store.openProject({ ...snapshot, solvedWith: stamp }, mode);
    await vi.waitFor(() => expect(store.pending).toBe(false));
    expect(store.assessment?.changes.map(c => c.id)).toContain(change.id);
    store.acknowledge(); store.noteSolved('linear');
    store.openProject({ ...snapshot, solvedWith: store.capture() }, mode);
    await vi.waitFor(() => expect(store.pending).toBe(false));
    expect(store.assessment?.changes.map(c => c.id)).toContain(change.id);
    expect(store.noticeOpen).toBe(true);
    snapshot.loads![0]!.data!.memberLoadsVersion = change.resultsVersion;
    expect(ids(snapshot)).not.toContain(change.id);
    store.openProject({ ...snapshot, solvedWith: store.capture() }, mode);
    await vi.waitFor(() => expect(store.pending).toBe(false));
    expect(store.assessment?.changes.map(c => c.id)).not.toContain(change.id);
    expect(store.noticeOpen).toBe(false);
    snapshot.loads!.push({ type, data: { memberLoadsVersion: change.resultsVersion - 1 } });
    expect(ids(snapshot)).toContain(change.id);
  });
}
it('a current solve with only nodal loading has no member restoration notice', () => {
  expect(assessProject({ loads: [{ type: 'nodal3d', data: { fz: -1 } }] }, freshStamp(), '3d').changes.map(c => c.id)).not.toContain(change.id);
});

for (const spatial of [false, true]) it(`newly restored manual loads keep their version through saving and loading spatial=${spatial}`, () => {
  modelStore.clear();
  const i = modelStore.addNode(0, 0, 0), j = modelStore.addNode(2, 0, 0), e = modelStore.addElement(i, j);
  if (spatial) {
    modelStore.addDistributedLoad3D(e, 0, 0, -1, -1);
    modelStore.addPointLoadOnElement3D(e, 0.5, 0, -1);
  } else {
    modelStore.addDistributedLoad(e, -1);
    modelStore.addPointLoadOnElement(e, 0.5, -1);
  }
  const snapshot = modelStore.snapshot();
  expect(assessProject(snapshot as never, freshStamp()).changes.map(c => c.id)).not.toContain(change.id);
  expect(snapshot.loads.every(l => 'memberLoadsVersion' in l.data && l.data.memberLoadsVersion === RESULT_CHANGES.currentResultsVersion)).toBe(true);
  modelStore.restore(snapshot);
  expect(modelStore.snapshot().loads).toEqual(snapshot.loads);
  const old = { type: 'distributed' as const, data: { id: 100, elementId: e, qI: -1, qJ: -1 } };
  modelStore.addLoadEntry(old);
  expect(assessProject(modelStore.snapshot() as never, freshStamp()).changes.map(c => c.id)).toContain(change.id);
});
