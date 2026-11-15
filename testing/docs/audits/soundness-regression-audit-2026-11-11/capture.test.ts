import { beforeAll, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { initSolver } from '../../engine/wasm-solver';
import { CORPUS, type SnapshotCase } from '../corpus';
import { capture } from '../capture';
import { resultsStore } from '../../store/results.svelte';

const output = process.env.AUDIT_OUTPUT!;
const manifest: SnapshotCase[] = JSON.parse(readFileSync(process.env.AUDIT_MANIFEST!, 'utf8'));
beforeAll(async () => { await initSolver(); mkdirSync(output, { recursive: true }); });
const large = new Set(['gallery-cad-arch-structure-dxf','gallery-cad-arch-only-dxf','gallery-pipe-rack','gallery-mat-foundation','gallery-suspension-bridge','gallery-cable-stayed-bridge','gallery-offshore-platform','gallery-full-stadium','gallery-xl-diagrid-tower','gallery-geodesic-dome','gallery-la-bombonera','gallery-space-frame','gallery-grid-beams','gallery-tower-3d-2','gallery-tower-3d-4','gallery-hinged-arch-3d','gallery-cable-stayed-bridge-small','gallery-stadium-canopy']);
for (const c of manifest.filter(c => process.env.AUDIT_CASE ? c.name === process.env.AUDIT_CASE : !large.has(c.name))) {
  it(c.name, async () => {
    try {
      const snapshot = await capture(c);
      const raw: Record<string, unknown> = {};
      for (const key of ['singleResults','singleResults3D','results','results3D','perCase','perCase3D','perCombo','perCombo3D','pdeltaResult','pdeltaResult3D','modalResult','modalResult3D','bucklingResult','bucklingResult3D','spectralResult','spectralResult3D','diagnostics','diagnostics3D']) {
        const value = (resultsStore as unknown as Record<string, unknown>)[key];
        if (value !== undefined) raw[key] = value instanceof Map ? Object.fromEntries(value) : value;
      }
      writeFileSync(`${output}/${c.name}.json`, JSON.stringify({ ...snapshot, raw }, (key, value) => key === 'timings' ? undefined : value));
      expect(snapshot.case).toBe(c.name);
    } catch (e) {
      writeFileSync(`${output}/${c.name}.json`, JSON.stringify({ case: c.name, harnessError: String(e) }));
      throw e;
    }
  }, 600_000);
}
