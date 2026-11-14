import { beforeAll, describe, expect, it } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import { modelStore, type Material, type Section } from '../../store/model.svelte';
import { RESULT_PROPERTY_POLICY, resultPropertyFingerprint } from '../../model/result-properties';
import { uiStore } from '../../store/ui.svelte';
import {
  againstExample, corpusVersions, fingerprintDifference, modelFingerprint, openAndSolve, readCorpusText, readManifest, reset, openSession,
} from '../legacy';

const material: Required<Material> = {
  id: 1, name: 'test material', e: 101, nu: 0.21, rho: 12, fy: 31, fu: 47, fc: 23,
  alpha: 0.001, gradeId: 'test-grade', maxAggregateSizeMm: 11, spacingMarginMm: 2,
  shotcrete: false,
  timber: { fb: 1, ft: 2, fc: 3, fcPerp: 4, fv: 5, e: 6, emin: 7, kind: 'sawn', cf: { b: 1, t: 2, c: 3 } },
};
const section: Required<Omit<Section, 'built'>> = {
  id: 1, name: 'test section', a: 1, iz: 2, iy: 3, j: 4, b: 5, h: 6,
  shape: 'I', tw: 7, tf: 8, t: 9, tl: 10, rotation: 11,
  shearAreas: { basis: 'declared', asY: 1, asZ: 2 }, declared: false,
  profileFamily: 'test-family', fabrication: 'rolled',
  composition: { profileName: 'test-profile', arrangement: 'single', gapMm: 1 },
  polygon: [[0, 0], [1, 0], [1, 1]], holes: [[[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]]],
  drawn: { version: 1, refMaterialId: 1, parts: [{
    id: 1, shape: { kind: 'rect', b: 1, h: 2 }, at: [0, 0], rotationDeg: 0,
    materialId: 1, ratio: { e: 2, g: 3 },
  }], areas: [{ materialId: 1, a: 2 }] },
  canonical: { kind: 'properties-only', reason: { kind: 'noGeometry' }, a: 1, iy: 3, iz: 2, j: 4, jProvenance: 'legacy' },
};

function mutations(value: unknown, path: string[] = []): Array<{ path: string[]; value?: unknown }> {
  const changes: Array<{ path: string[]; value?: unknown }> = [];
  for (const [key, child] of Object.entries(value as object)) {
    const at = [...path, key];
    changes.push({ path: at });
    if (child !== null && typeof child === 'object') changes.push(...mutations(child, at));
    else for (const next of typeof child === 'number' ? [child + 1, child - 1] : typeof child === 'boolean' ? [!child] : [`${child}-changed`]) {
      changes.push({ path: at, value: next });
    }
  }
  return changes;
}

function missedMutations(kind: 'material' | 'section'): string[] {
  const source = kind === 'material' ? material : section;
  const fields = Object.fromEntries(Object.entries(source).filter(([k]) => k !== 'id' && (kind !== 'material' || k !== 'name')));
  const missed: string[] = [];
  for (const workspace of ['2d', '3d', 'pro'] as const) {
    reset(workspace);
    const table = kind === 'material' ? modelStore.materials : modelStore.sections;
    table.set(1, structuredClone(source) as Material & Section);
    const reference = modelFingerprint();
    for (const mutation of mutations(fields)) {
      const changed = structuredClone(source) as unknown as Record<string, unknown>;
      let parent = changed;
      for (const key of mutation.path.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
      const key = mutation.path.at(-1)!;
      if ('value' in mutation) parent[key] = mutation.value;
      else delete parent[key];
      table.set(1, changed as unknown as Material & Section);
      const fingerprint = modelFingerprint();
      if (!fingerprintDifference('migration', reference, fingerprint)) missed.push(`${workspace}:${mutation.path.join('.')}:${JSON.stringify(mutation.value) ?? 'deleted'}`);
      if (!fingerprintDifference('reverse migration', fingerprint, reference)) missed.push(`${workspace}:reverse:${mutation.path.join('.')}`);
    }
    table.set(1, structuredClone(source) as Material & Section);
    expect(fingerprintDifference('unchanged', reference, modelFingerprint())).toBeNull();
  }
  return missed;
}

describe('material and section migration fingerprint #1318', () => {
  beforeAll(async () => { await initSolver(); });

  it('#1318: detects deletion and changes of every material result property', () => {
    expect(missedMutations('material')).toEqual([]);
  });

  it('#1318: detects deletion and changes of every section result property', () => {
    expect(missedMutations('section')).toEqual([]);
  });

  it('#1318: rejects migrated steel Fy loss and changes through project open', async () => {
    const entry = readManifest('v0.4.0').examples.find(e => e.example === 'truss')!;
    for (const action of ['delete', 'increase', 'decrease']) {
      const opened = await openAndSolve(readCorpusText(`v0.4.0/${entry.file}`), {
        solve: false,
        beforeOpen: f => {
          const snapshot = f.snapshot as { materials: Array<[number, Material]> };
          const m = snapshot.materials[0][1];
          expect(m.fy).toBeGreaterThan(0);
          if (action === 'delete') delete m.fy;
          else m.fy! *= action === 'increase' ? 2 : 0.5;
        },
      });
      expect((await againstExample('steel', 'v0.4.0', entry, opened, false)).failure).toContain('material[1].fy');
    }
  });

  it("#1318: rejects migrated concrete f'c loss and changes through project open", async () => {
    const entry = readManifest('v0.4.0').examples.find(e => e.example === 'rc-beam-flexure')!;
    for (const action of ['delete', 'increase', 'decrease']) {
      const opened = await openAndSolve(readCorpusText(`v0.4.0/${entry.file}`), {
        solve: false,
        beforeOpen: f => {
          const snapshot = f.snapshot as { materials: Array<[number, Material]> };
          const m = snapshot.materials.find(([, m]) => m.name === 'H-25')![1];
          expect(m.fy).toBeGreaterThan(0);
          if (action === 'delete') delete m.fy;
          else m.fy! *= action === 'increase' ? 2 : 0.5;
        },
      });
      expect((await againstExample('concrete', 'v0.4.0', entry, opened, false)).failure).toContain('material[2].fy');
    }
  });

  it('#1318: session tabs detect strength loss and changes in every workspace', async () => {
    const manifest = readManifest('v0.4.0');
    const text = readCorpusText(`v0.4.0/${manifest.session.file}`);
    const reference = await openSession(text);
    const broken = await openSession(text, {
      beforeOpen: file => {
        const tabs = file.tabs as Array<{ modelSnapshot: { materials: Array<[number, Material]> } }>;
        for (const [index, tab] of tabs.entries()) {
          const m = tab.modelSnapshot.materials.find(([, m]) => m.fy !== undefined)![1];
          if (index === 0) delete m.fy;
          else m.fy! *= index === 1 ? 2 : 0.5;
        }
      },
    });
    expect(broken.tabs.map(t => t.analysisMode)).toEqual(['2d', '3d', 'pro']);
    for (const [index, tab] of broken.tabs.entries()) {
      expect(fingerprintDifference('session migration', reference.tabs[index].fingerprint, tab.fingerprint)).toMatch(/material\[\d+\]\.fy/);
    }
  });

  it('#1318: absent, undefined, null, zero and adjacent numbers retain their meaning', () => {
    reset('2d');
    const fingerprints = [undefined, null, 0, Number.MIN_VALUE, -Number.MIN_VALUE, 1, 1 + Number.EPSILON].map(value => {
      modelStore.materials.set(1, { ...material, maxAggregateSizeMm: value });
      return modelFingerprint();
    });
    for (const [i, a] of fingerprints.entries()) {
      expect(fingerprintDifference('same', a, a)).toBeNull();
      for (const b of fingerprints.slice(i + 1)) expect(fingerprintDifference('changed', a, b)).not.toBeNull();
    }
    const absent: Material = { ...material };
    delete absent.maxAggregateSizeMm;
    modelStore.materials.set(1, absent);
    expect(modelFingerprint()).toEqual(fingerprints[0]);
  });

  it('#1318: only explicitly classified non-result metadata can be ignored', () => {
    for (const [kind, source] of [['material', material], ['section', section]] as const) {
      const fingerprint = (value: unknown) => kind === 'material'
        ? resultPropertyFingerprint(kind, value as Material) : resultPropertyFingerprint(kind, value as Section);
      const reference = fingerprint(source);
      const policy = RESULT_PROPERTY_POLICY[kind];
      for (const [key, entry] of Object.entries(policy)) {
        if (entry === true) continue;
        expect(entry.nonResult.length).toBeGreaterThan(0);
        expect(fingerprint({ ...source, [key]: 'different metadata' })).toEqual(reference);
      }
      expect(fingerprint({ ...source, futureStrength: 1 })).not.toEqual(reference);
      expect(fingerprint({ ...source, futureStrength: 2 })).not.toEqual(fingerprint({ ...source, futureStrength: 1 }));
      expect(fingerprint(Object.fromEntries(Object.entries(source).reverse()))).toEqual(reference);
    }
  });

  it('#1318: every real corpus migration preserves its saved material properties', async () => {
    let projects = 0;
    for (const tag of corpusVersions()) {
      const manifest = readManifest(tag);
      for (const entry of manifest.examples) {
        const text = readCorpusText(`${tag}/${entry.file}`);
        const saved = JSON.parse(text) as { snapshot: { materials: Array<[number, Material]> } };
        const reference = Object.assign({}, ...saved.snapshot.materials.map(([, m]) => resultPropertyFingerprint('material', m)));
        const opened = await openAndSolve(text, { solve: false });
        const migrated = Object.fromEntries(Object.entries(opened.fingerprint).filter(([key]) => key.startsWith('material[')));
        expect(fingerprintDifference(`${tag}/${entry.example} material migration`, reference, migrated)).toBeNull();
        projects++;
      }
    }
    expect(projects).toBe(187);
  }, 120_000);

  it('unchanged steel and concrete projects still match their saved examples #1318', async () => {
    for (const example of ['truss', 'rc-beam-flexure', '3d-portal-frame']) {
      const entry = readManifest('v0.4.0').examples.find(e => e.example === example)!;
      const opened = await openAndSolve(readCorpusText(`v0.4.0/${entry.file}`), { solve: false });
      expect(uiStore.analysisMode).toBe(entry.analysisMode);
      expect((await againstExample(example, 'v0.4.0', entry, opened, false)).failure).toBeNull();
    }
  });
});
