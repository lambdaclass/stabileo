import { it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { CORPUS } from '../corpus';
import { openedFeatures } from '../capture';

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
  it('reads a committed project through the same open path', async () => {
    const c = CORPUS.find((c) => 'ded' in c.source)!;
    expect(await openedFeatures(c)).toContain('footings');
  });
}
