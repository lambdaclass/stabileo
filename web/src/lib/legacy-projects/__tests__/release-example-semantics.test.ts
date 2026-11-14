import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import { modelStore, type Material } from '../../store/model.svelte';
import { againstExample, openAndSolve, openExample, readCorpusText, readManifest, savedFixture } from '../legacy';

beforeAll(async () => { await initSolver(); });

describe('release example semantics #2091', () => {
  for (const version of ['v0.2.0', 'v0.3.0']) {
    for (const example of ['truss', '3d-portal-frame', 'torre-irregular-con-retiros']) {
      it(`#2091: ${version}/${example} keeps the release's absent strengths`, async () => {
        const entry = readManifest(version).examples.find(e => e.example === example)!;
        const opened = await openAndSolve(readCorpusText(`${version}/${entry.file}`), { solve: false });
        expect(opened.fingerprint['material[1].fu']).toBeUndefined();
        expect(await againstExample(example, version, entry, opened, false)).toMatchObject({ failure: null });
      });
    }
  }

  it('#2091: later default fields cannot enter a release reference', async () => {
    const version = 'v0.4.0';
    const entry = readManifest(version).examples.find(e => e.example === 'truss')!;
    const opened = await openAndSolve(readCorpusText(`${version}/${entry.file}`), { solve: false });
    const clear = modelStore.clear.bind(modelStore);
    const spy = vi.spyOn(modelStore, 'clear').mockImplementation(() => {
      clear();
      const material = modelStore.materials.get(1)!;
      modelStore.materials.set(1, { ...material, fy: material.fy! * 2, futureStrength: { value: 1 } } as Material);
      const section = modelStore.sections.get(1)!;
      modelStore.sections.set(1, { ...section, a: section.a * 2 });
    });
    try {
      expect(await againstExample('future defaults', version, entry, opened, false)).toMatchObject({ failure: null });
    } finally {
      spy.mockRestore();
    }
  });

  it('refuses a reference without recorded release defaults, below and above the recorded releases', async () => {
    const entry = readManifest('v0.4.0').examples.find(e => e.example === 'truss')!;
    const { fixture } = savedFixture(entry.example, entry.fixtureBlob);
    for (const version of ['v0.1.0', 'v0.5.0']) {
      await expect(openExample('truss', '2d', { solve: false, release: version, fixture }))
        .rejects.toThrow('no verified example defaults recorded');
    }
    const opened = await openAndSolve(readCorpusText(`v0.4.0/${entry.file}`), { solve: false });
    expect(await againstExample('recorded release', 'v0.4.0', entry, opened, false)).toMatchObject({ failure: null });
  });

  it('#1318: saved Fu remains required and exact on both sides of its recorded value', async () => {
    const version = 'v0.4.0';
    const entry = readManifest(version).examples.find(e => e.example === 'truss')!;
    for (const action of ['unchanged', 'delete', 'increase', 'decrease']) {
      const opened = await openAndSolve(readCorpusText(`${version}/${entry.file}`), {
        solve: false,
        beforeOpen: file => {
          const snapshot = file.snapshot as { materials: Array<[number, Material]> };
          const material = snapshot.materials.find(([id]) => id === 1)![1];
          expect(material.fu).toBeGreaterThan(0);
          if (action === 'delete') delete material.fu;
          if (action === 'increase') material.fu! *= 2;
          if (action === 'decrease') material.fu! /= 2;
        },
      });
      const result = await againstExample(action, version, entry, opened, false);
      if (action === 'unchanged') expect(result.failure).toBeNull();
      else expect(result.failure).toContain('material[1].fu');
    }
  });
});
