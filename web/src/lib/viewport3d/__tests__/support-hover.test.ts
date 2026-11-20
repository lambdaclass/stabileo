import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { axesStore } from '../../axes/axes.svelte';
import { supportTypeShown } from '../../axes/user-names';
import { t } from '../../i18n';
import gridBeams from '../../templates/fixtures/grid-beams.json';
import { resolveHitUserData } from '../picking';

const source = readFileSync(new URL('../../../components/Viewport3D.svelte', import.meta.url), 'utf8');
const script = source.split('<script lang="ts">')[1].split('</script>')[0];
const ast = ts.createSourceFile('Viewport3D.ts', script, ts.ScriptTarget.Latest, true);
const hover = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'runHoverRaycast')!;
const { outputText } = ts.transpileModule(hover.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
});

afterEach(() => {
  vi.unstubAllGlobals();
  axesStore.reset();
});

function hoverAtCenter(type: 'support' | 'element', support = gridBeams.supports[0]) {
  const camera = new THREE.PerspectiveCamera();
  camera.position.z = 5;
  camera.updateMatrixWorld();
  const target = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  target.userData = { type, id: support.id };
  const group = new THREE.Group().add(target);
  return runInNewContext(`
    let hoveredData = null, hoveredNodeId3D = null, hoverTooltip = null;
    ${outputText}
    runHoverRaycast({ clientX: 50, clientY: 50 });
    hoverTooltip?.text;
  `, {
    camera, mouse: new THREE.Vector2(), raycaster: new THREE.Raycaster(),
    nodesParent: new THREE.Group(), elementsParent: type === 'element' ? group : new THREE.Group(),
    supportsParent: type === 'support' ? group : new THREE.Group(), shellsParent: new THREE.Group(),
    container: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    uiStore: { is3DWorkspace: true },
    modelStore: {
      supports: new Map([[support.id, support]]),
      elements: new Map([[support.id, { id: support.id, type: 'frame', nodeI: 1, nodeJ: 2 }]]),
    },
    updateMouseNDC: vi.fn(), applyHoverColor: vi.fn(), invalidate: vi.fn(),
    resolveHitUserData, supportTypeShown, t,
  });
}

it.each([
  { globalAxes: false, rollerLabel: 'rollerY' },
  { globalAxes: true, rollerLabel: 'rollerX' },
])('shows the grid-beams support tooltip with globalAxes=$globalAxes', ({ globalAxes, rollerLabel }) => {
  vi.stubGlobal('__PUBLIC_FEATURES__', { ...featuresForMode('production'), globalAxes });
  axesStore.choice = { up: '+Y', right: '+Z', hand: 'right' };

  const pinned = gridBeams.supports[0];
  expect(hoverAtCenter('support', pinned)).toBe(`Support ${pinned.id} [pinned3d]`);
  expect(hoverAtCenter('support', { ...pinned, type: 'rollerY' })).toBe(`Support ${pinned.id} [${rollerLabel}]`);
});

it('shows the member tooltip on a member hit', () => {
  expect(hoverAtCenter('element')).toBe('Elem 1 [frame] 1→2');
});
