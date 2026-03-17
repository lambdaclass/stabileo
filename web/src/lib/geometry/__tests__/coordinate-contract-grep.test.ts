import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const seamFiles = [
  'web/src/lib/ai/client.ts',
  'web/src/lib/geometry/coordinate-system.ts',
  'web/src/lib/viewport3d/camera.ts',
  'web/src/lib/viewport3d/grid.ts',
  'web/src/lib/viewport3d/picking.ts',
  'web/src/components/Viewport3D.svelte',
  'web/src/components/floating-tools/ToolNodeOptions.svelte',
  'backend/src/capabilities/build_model.rs',
  'backend/src/capabilities/generators.rs',
  'backend/src/capabilities/edit_executor.rs',
];

const forbiddenPatterns: Array<[RegExp, string]> = [
  [/global Y (axis )?(is )?vertical/i, 'Y-up wording in contract files'],
  [/verticalAxis\s*===\s*['"]z['"]/, 'inline vertical-axis branching instead of shared helpers'],
  [/node\.y[^\n]{0,40}(elevation|floor|story)/i, 'raw node.y treated as elevation'],
  [/new THREE\.Vector3\(0,\s*-1,\s*0\)/, 'Y-down gravity vector in 3D contract files'],
];

describe('coordinate contract grep gate', () => {
  it('rejects suspicious Y-up assumptions in seam files', () => {
    for (const rel of seamFiles) {
      const text = readFileSync(resolve(ROOT, rel), 'utf8');
      for (const [pattern, label] of forbiddenPatterns) {
        expect(text, `${label} in ${rel}`).not.toMatch(pattern);
      }
    }
  });
});
