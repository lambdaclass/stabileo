import { it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { CORPUS } from '../corpus';
import { openedFeatures } from '../capture';
import type { ResultChangeRegistry } from '../../provenance/registry';
import { readRegistry } from '../../../../scripts/result-changes/registry.mjs';
import { fieldCovered } from '../../../../scripts/results-snapshot/applicability.mjs';

const request = process.env.SNAPSHOT_FEATURES;
if (request) {
  it('opens each requested corpus model in its workspace for the gate', async () => {
    const { cases, output } = JSON.parse(readFileSync(request, 'utf8'));
    const features: Record<string, string[]> = {};
    for (const item of cases) features[item.file] = await openedFeatures(item.case, item.fixture);
    writeFileSync(output, JSON.stringify(features));
  });
} else {
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
}
