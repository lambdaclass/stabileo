import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { modelStore } from '../model.svelte';
import '../index';
import { loadFixture } from '../../templates/load-fixture';
import { projectPhysicalFrame } from '../physical-frame';
import { projectSheetSet, projectSheetSetAsync, setSheetEntries, patchSheetSettings } from '../sheet-set';
import { buildDocumentModel } from '../../engine/detailing/document-model';
import { membersFromModel } from '../../engine/detailing/member-geometry';
import { cachedSceneModel, sceneCacheStats } from '../../engine/detailing/scene-cache';
import { renderDrawings } from '../../engine/detailing/document-render';
import { drawingPrimitives } from '../../sheets/adapter';
import { composeSheets } from '../../sheets/compose';
import { memberNames } from '../member-names';
import { uiStore } from '../ui.svelte';

const doc = () => buildDocumentModel({ seriesId: 'S', revision: { number: 1, at: '2026-10-19T00:00:00Z', author: 'test', detailingRevision: 1, demandRevision: 1 }, regulations: [], assemblies: [{ id: 'frame', label: 'Frame', kind: 'beamLine', elementIds: [], bars: [], marks: [], joints: [], conflicts: [], unsupported: [], detailingRevision: 1, demandRevision: 1, state: 'COORDINATED', maturity: 'VALIDATED', provenance: { edition: '2025', verifierId: 'test', trace: [], assumptions: [] } }], laps: [], certificates: [] });
afterEach(() => { modelStore.clear(); uiStore.analysisMode = '2d'; });

it('known wrong result: #2092 both sheet builders render the shared physical scene unchanged', async () => {
  for (const mode of ['2d', '3d', 'pro'] as const) {
    modelStore.clear();
    uiStore.analysisMode = mode;
    modelStore.bulkMutate(() => loadFixture(JSON.parse(readFileSync('src/lib/engine/physical/__tests__/fixtures/physical-joints-frame.json', 'utf8')) as never, modelStore.fixtureApi() as never));
    patchSheetSettings({ language: 'en' });
    setSheetEntries([{ id: 'physical', kind: 'detailing' }]);
    const document = doc(), m = modelStore.model;
    const { members } = membersFromModel({ elementIds: [...m.elements.keys()].sort((a, b) => a - b), nodes: [...m.nodes.values()], elements: [...m.elements.values()], sections: [...m.sections.values()] });
    const scene = cachedSceneModel(document, members, { physical: projectPhysicalFrame() });
    const expected = renderDrawings(document, { locale: 'en', projectName: 'Frame', scene, members, memberName: (id) => memberNames().atLevel(id) }).sheets.map((s) => ({ key: `physical:${s.name}`, title: s.caption ?? s.name, ...drawingPrimitives(s.sheet, 'en') }));
    expect(expected.length).toBeGreaterThan(0);
    const hits = sceneCacheStats().hits;
    const sync = projectSheetSet(document, 'Frame');
    const async = await projectSheetSetAsync(document, 'Frame');
    for (const sheets of [sync, async!]) {
      expect(sheets.flatMap((s) => s.placed ?? []).map((p) => ({ key: p.key, width: p.mw, height: p.mh }))).toEqual(expected.map((d) => ({ key: d.key, width: d.width, height: d.height })));
    }
    const composed = composeSheets(expected, 'A1');
    const drawn = sync.flatMap((s) => (s.placed ?? []).map((p) => s.primitives.slice((s.blockCount ?? 0) + p.from, (s.blockCount ?? 0) + p.to)));
    expect(drawn).toEqual(composed.flatMap((s) => s.drawings.map((p) => s.primitives.slice(p.from, p.to))));
    expect(async).toEqual(sync);
    expect(sceneCacheStats().hits).toBeGreaterThanOrEqual(hits + 2);
  }
});

it('sheet builders retain ordinary model plans without a document and honor cancellation', async () => {
  modelStore.bulkMutate(() => loadFixture(JSON.parse(readFileSync('src/lib/engine/physical/__tests__/fixtures/physical-joints-frame.json', 'utf8')) as never, modelStore.fixtureApi() as never));
  setSheetEntries([{ id: 'formwork', kind: 'formwork' }, { id: 'physical', kind: 'detailing' }]);
  const sync = projectSheetSet(null, 'Frame');
  expect(sync.flatMap((s) => s.drawings).some((k) => k.startsWith('formwork:'))).toBe(true);
  expect(sync.flatMap((s) => s.drawings).some((k) => k.startsWith('physical:'))).toBe(false);
  expect(await projectSheetSetAsync(null, 'Frame')).toEqual(sync);
  const aborted = new AbortController();
  aborted.abort();
  expect(await projectSheetSetAsync(doc(), 'Frame', { signal: aborted.signal })).toBeNull();
});
