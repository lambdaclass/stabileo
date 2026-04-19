import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const seamFiles = [
  'web/src/lib/ai/client.ts',
  'web/src/lib/store/model.svelte.ts',
  'web/src/lib/store/ui.svelte.ts',
  'web/src/lib/geometry/coordinate-system.ts',
  'web/src/lib/engine/solver-service.ts',
  'web/src/lib/engine/solver-shells.ts',
  'web/src/components/floating-tools/ToolLoadOptions.svelte',
  'web/src/components/floating-tools/SelectedEntityPanel.svelte',
  'web/src/lib/viewport3d/camera.ts',
  'web/src/lib/viewport3d/grid.ts',
  'web/src/lib/viewport3d/picking.ts',
  'web/src/lib/viewport3d/scene-sync.ts',
  'web/src/lib/viewport3d/results-sync.ts',
  'web/src/components/Viewport3D.svelte',
  'web/src/components/floating-tools/ToolNodeOptions.svelte',
  'backend/src/capabilities/build_model.rs',
  'backend/src/capabilities/generators.rs',
  'backend/src/capabilities/edit_executor.rs',
];

const forbiddenPatterns: Array<[RegExp, string]> = [
  [/global Y (axis )?(is )?vertical/i, 'Y-up wording in contract files'],
  [/global Y in 3D/i, 'Y-up wording in contract files'],
  [/applied as -Y global/i, 'Y-down gravity wording in contract files'],
  [/negative Y\s*=\s*downward/i, 'Y-down gravity wording in contract files'],
  [/downward in global Y/i, 'Y-down gravity wording in contract files'],
  [/title=\{t\('float\.loadGlobalYDir'\)\}>Y<\/button>/, 'global vertical UI button still labeled Y'],
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

// ─── Inline axis-literal gate ─────────────────────────────────────
// These files must use named constants (GLOBAL_X/Y/Z, UP_VECTOR,
// GRAVITY_VECTOR_3D, THREEJS_CYLINDER_AXIS) instead of raw
// new THREE.Vector3(1,0,0) / (0,1,0) / (0,0,1) / (0,0,-1).
// coordinate-system.ts is excluded because that's where the constants
// are defined.

const axisLiteralGuardedFiles = [
  'web/src/lib/three/create-load-arrow.ts',
  'web/src/lib/three/create-element-mesh.ts',
  'web/src/lib/three/create-support-gizmo.ts',
  'web/src/lib/three/stress-heatmap.ts',
  'web/src/lib/three/diagram-render-3d.ts',
  'web/src/lib/three/deformed-shape-3d.ts',
  'web/src/lib/viewport3d/grid.ts',
  'web/src/components/Viewport3D.svelte',
];

const axisLiteralPatterns: Array<[RegExp, string]> = [
  [/new THREE\.Vector3\(\s*1\s*,\s*0\s*,\s*0\s*\)/, 'inline (1,0,0) — use GLOBAL_X'],
  [/new THREE\.Vector3\(\s*0\s*,\s*1\s*,\s*0\s*\)/, 'inline (0,1,0) — use GLOBAL_Y or THREEJS_CYLINDER_AXIS'],
  [/new THREE\.Vector3\(\s*0\s*,\s*0\s*,\s*1\s*\)/, 'inline (0,0,1) — use GLOBAL_Z'],
  [/new THREE\.Vector3\(\s*0\s*,\s*0\s*,\s*-1\s*\)/, 'inline (0,0,-1) — use GRAVITY_VECTOR_3D'],
  [/new THREE\.Vector3\(\s*0\s*,\s*-1\s*,\s*0\s*\)/, 'inline (0,-1,0) — suspicious Y-down vector'],
  [/new THREE\.Vector3\(\s*-1\s*,\s*0\s*,\s*0\s*\)/, 'inline (-1,0,0) — use GLOBAL_X.clone().negate()'],
];

describe('inline axis-literal gate', () => {
  it('forbids raw axis vectors in rendering files (use named constants from coordinate-system.ts)', () => {
    const violations: string[] = [];
    for (const rel of axisLiteralGuardedFiles) {
      const abs = resolve(ROOT, rel);
      let text: string;
      try { text = readFileSync(abs, 'utf8'); } catch { continue; }
      for (const [pattern, label] of axisLiteralPatterns) {
        if (pattern.test(text)) {
          violations.push(`${rel}: ${label}`);
        }
      }
    }
    expect(violations, 'Inline axis literals found — import from coordinate-system.ts instead:\n' + violations.join('\n')).toHaveLength(0);
  });
});
