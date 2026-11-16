import { expect, it, vi } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { freshStamp } from '../solve-stamp';
import { createRecheckStore } from '../../store/recheck.svelte';
import type { FeatureSnapshot } from '../model-features';

const change = RESULT_CHANGES.changes.find(c => c.id === 'gravity-stations-and-edits')!;
const knownWrong = it.skipIf(process.env.RUN_KNOWN_WRONG_RESULT !== '1');
for (const mode of ['2d', '3d', 'pro']) for (const type of ['distributed', 'distributed3d', 'pointOnElement', 'pointOnElement3d']) {
  knownWrong(`known wrong result: #2219 manual load restoration survives a current solve ${mode} ${type}`, async () => {
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
