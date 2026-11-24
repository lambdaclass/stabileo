import { it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { CORPUS, type SnapshotCase } from '../corpus';
import { capture, openedFeatures } from '../capture';
import { buildProjectFile } from '../../store/file';
import { getFixture } from '../../templates/fixture-index';
import type { JSONModel } from '../../templates/load-fixture';
import type { ResultChangeRegistry } from '../../provenance/registry';
import { readRegistry } from '../../../../scripts/result-changes/registry.mjs';
import { fieldCovered } from '../../../../scripts/results-snapshot/applicability.mjs';

it('opens corpus models for result applicability', async () => {
  const portal = CORPUS.find(c => c.name === '2d-in-3d-portal-frame')!;
  const request = process.env.SNAPSHOT_FEATURES;
  const { cases, output }: {
    cases: { file: string; case: SnapshotCase; fixture?: unknown }[];
    output?: string;
  } = request ? JSON.parse(readFileSync(request, 'utf8')) : { cases: [{ file: portal.name, case: portal }] };
  expect(cases.length).toBeGreaterThan(0);
  const features: Record<string, string[]> = {};
  for (const item of cases) {
    const opened = await openedFeatures(item.case, item.fixture);
    expect(opened).toContain(item.case.workspace === '2d' ? 'plane2D' : 'space3D');
    features[item.file] = opened;
  }
  if (output) writeFileSync(output, JSON.stringify(features));
});

it('uses the opened fixture and workspace, with only recorded analyses', async () => {
  const c = CORPUS.find((c) => c.name === '2d-in-3d-portal-frame')!;
  const features = await openedFeatures(c);
  expect(features).toContain('space3D');
  expect(features).not.toContain('plane2D');
  expect(features).toContain('analysis:linear');
  expect(features).not.toContain('analysis:modal');
  const pro = await openedFeatures(CORPUS.find((c) => c.name === 'pro-3d-portal-frame')!);
  expect(pro).toContain('analysis:modal');
});

it('#2276 the corrected bundled beam has narrowly scoped design coverage', async () => {
  const beam = CORPUS.find(c => c.name === 'design-rc-beam-flexure')!;
  const features = await openedFeatures(beam);
  expect(features).toEqual(expect.arrayContaining(['space3D', 'concreteMembers', 'rollerSupports', 'example:rc-beam-flexure']));
  const registry: ResultChangeRegistry = readRegistry();
  const entry = registry.changes.find(change => change.id === 'bundled-rc-beam-bearing-design');
  expect(entry).toBeDefined();
  if (!entry?.quantities?.every((quantity): quantity is string => typeof quantity === 'string')) {
    throw new Error('Expected the bundled beam design result change to declare its fields');
  }
  const coverage = { ...entry, quantities: entry.quantities };
  expect(fieldCovered(coverage, 'design.member[e1].ratio', features)).toBe(true);
  expect(fieldCovered(coverage, 'design.rc[e1].checks[1].demand', features)).toBe(true);
  expect(fieldCovered(coverage, 'design.rc[e1].checks[1].demand', features.filter(f => f !== 'example:rc-beam-flexure'))).toBe(false);
  expect(fieldCovered(coverage, 'base.reactions[n3].my', features)).toBe(false);
  expect(fieldCovered(coverage, 'design.rc[e1].someOtherOutput', features)).toBe(false);
});

it('reads a committed project through the same open path', async () => {
  const c = CORPUS.find((c) => 'ded' in c.source)!;
  expect(await openedFeatures(c)).toContain('footings');
});


it('covers the fixture replay change only when its source declares the same release twice', async () => {
  const c = CORPUS.find(c => c.name === '2d-in-3d-portal-frame')!;
  if (!('example' in c.source)) throw new Error('Expected an example');
  const fixture = structuredClone(await getFixture(c.source.example)?.()) as JSONModel;
  const member = fixture.elements[0];
  delete member.hingeStart;
  member.releaseI = { mz: true };

  const registry: ResultChangeRegistry = readRegistry();
  const entry = registry.changes.find(change => change.id === 'fixture-release-aliases');
  if (!entry?.quantities?.every((quantity): quantity is string => typeof quantity === 'string')) {
    throw new Error('Expected fixture release result changes to declare their fields');
  }
  const coverage = { ...entry, quantities: entry.quantities };
  expect(fieldCovered(coverage, 'base.reactions[n1].my', await openedFeatures(c, fixture))).toBe(false);

  member.hingeStart = true;
  const features = await openedFeatures(c, fixture);
  expect(fieldCovered(coverage, 'base.reactions[n1].my', features)).toBe(true);
  expect(fieldCovered(coverage, 'solve.ok', features)).toBe(false);
});

it.each(['2d', '3d'] as const)('#2532 attributes a blocked %s model open to its source alias conflict', async workspace => {
  const c = CORPUS.find(c => c.name === (workspace === '2d' ? '2d-portal-frame' : '2d-in-3d-portal-frame'))!;
  if (!('example' in c.source)) throw new Error('Expected an example');
  const fixture = structuredClone(await getFixture(c.source.example)?.()) as JSONModel;
  const member = fixture.elements[0];
  member.releaseI = { mz: true };
  member.hingeStart = true;
  const features = await openedFeatures(c, fixture);
  expect(features).not.toContain('conflictingModelAliases');
  expect((await capture(c, { fixture })).values['solve.ok']).toBe(true);

  const project = buildProjectFile();
  const projectCase = { ...c, source: { ded: 'alias-conflict.ded' } };
  const stored = project.snapshot.elements[0][1];
  Object.assign(stored, { hingeStart: false });
  member.hingeStart = false;
  const entry = (readRegistry() as ResultChangeRegistry).changes.find(change => change.id === 'canonical-model-aliases');
  if (!entry?.quantities?.every((quantity): quantity is string => typeof quantity === 'string')) {
    throw new Error('Expected the alias refusal result change to declare its fields');
  }
  const coverage = { ...entry, quantities: entry.quantities };
  const openings = [{ c, fixture }, { c: projectCase, fixture: project }];
  for (const opening of openings) {
    const refused = await openedFeatures(opening.c, opening.fixture);
    expect(refused).toContain(workspace === '2d' ? 'plane2D' : 'space3D');
    expect(fieldCovered(coverage, 'solve.ok', refused)).toBe(true);
    expect(fieldCovered(coverage, 'base.reactions[n1].my', refused)).toBe(false);
    expect((await capture(opening.c, { fixture: opening.fixture })).values).toEqual({
      'solve.ok': false, 'solve.refusal': expect.stringMatching(/releaseI\.mz.*hingeStart/),
    });
  }
});

it('#2370 attributes only the out-of-plane nodal vector refusal to its registry entry', async () => {
  const c = CORPUS.find(c => c.name === '2d-portal-frame')!;
  if (!('example' in c.source)) throw new Error('Expected an example');
  const fixture = structuredClone(await getFixture(c.source.example)?.()) as JSONModel;
  const [node] = fixture.nodes;
  const data = { id: 1, nodeId: node.id, fx: 0, fy: 0, fz: -3, mx: 0, my: 3, mz: 0 };
  fixture.loads = [{ type: 'nodal', data }];
  const entry = (readRegistry() as ResultChangeRegistry).changes.find(change => change.id === 'planar-nodal-vectors');
  if (!entry?.quantities?.every((quantity): quantity is string => typeof quantity === 'string')) {
    throw new Error('Expected the planar nodal vector result change to declare its fields');
  }
  const coverage = { ...entry, quantities: entry.quantities };
  expect(fieldCovered(coverage, 'solve.ok', await openedFeatures(c, fixture))).toBe(false);
  expect((await capture(c, { fixture })).values['solve.ok']).toBe(true);

  data.mx = 1;
  const refused = await openedFeatures(c, fixture);
  expect(refused).not.toContain('conflictingModelAliases');
  expect(fieldCovered(coverage, 'solve.ok', refused)).toBe(true);
  expect(fieldCovered(coverage, 'base.reactions[n1].my', refused)).toBe(false);
  expect((await capture(c, { fixture })).values).toEqual({
    'solve.ok': false, 'solve.refusal': expect.stringMatching(/outside the plane.*mx/),
  });
});
