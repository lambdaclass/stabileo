import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

// Exercise the component's actual camera functions with a real Three camera, without requiring
// WebGL in Node. Only renderer/DOM services are stubbed; no copy of the fit/resize algorithm.
const component = readFileSync(new URL('../../../components/viewport/ScalarFieldViewer.svelte', import.meta.url), 'utf8');
const script = component.split('<script lang="ts">')[1].split('</script>')[0];
const ast = ts.createSourceFile('viewer.ts', script, ts.ScriptTarget.Latest, true);
const functions = ast.statements.filter((s) => ts.isFunctionDeclaration(s) && ['fit', 'resize', 'updateZoom'].includes(s.name?.text ?? ''));
const js = ts.transpileModule(functions.map((s) => s.getText(ast).replace(/^export /, '')).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

it.each([[0, 0], [0, 400], [600, 0]])('defers fitting a hidden %s×%s container until its first visible resize', (width, height) => {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  const container = { clientWidth: width, clientHeight: height };
  const setSize = vi.fn();
  const controls = { target: new THREE.Vector3(), enableRotate: true };
  const api = runInNewContext(`let pendingFit = true; let zoomText = ''; ${js}; ({ fit, resize })`, {
    THREE, camera, container, controls, renderer: { setSize }, field: null,
    bounds: () => [-0.5, -0.5, 0.5, 0.5], projection: 'plan', invalidate: vi.fn(),
    scalarFieldScale: () => '',
  }) as { fit(): void; resize(): void };
  api.fit();
  expect(camera.position.toArray()).toEqual([0, 0, 0]);
  expect([camera.near, camera.far, ...camera.position.toArray()].every(Number.isFinite)).toBe(true);
  container.clientWidth = 600; container.clientHeight = 400;
  api.resize();
  expect(setSize).toHaveBeenCalledWith(600, 400);
  expect(camera.aspect).toBe(1.5);
  expect(camera.position.z).toBeGreaterThan(1);
  expect([camera.near, camera.far, ...camera.position.toArray()].every(Number.isFinite)).toBe(true);
  const corner = new THREE.Vector3(0.5, 0.5, 0).project(camera);
  expect(Math.abs(corner.x)).toBeLessThan(1);
  expect(Math.abs(corner.y)).toBeLessThan(1);
  // Ordinary resizes after the pending fit preserve the user's camera position.
  camera.position.multiplyScalar(2);
  const moved = camera.position.clone();
  api.resize();
  expect(camera.position.equals(moved)).toBe(true);
});

it('fits displaced corners at the chosen scale and preserves explicit cropping', () => {
  const boundsFunction = ast.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === 'bounds')!;
  const boundsJs = ts.transpileModule(boundsFunction.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 1000);
  const context = {
    THREE, camera, container: { clientWidth: 600, clientHeight: 400 },
    controls: { target: new THREE.Vector3(), enableRotate: true }, renderer: {},
    xy: [0, 0, 1, 1], displacement: [-3, -2, 4, 5], deformScale: 2,
    view: null as number[] | null, projection: 'plan', invalidate: vi.fn(), scalarFieldScale: () => '',
  };
  const api = runInNewContext(`let pendingFit = false; let zoomText = ''; ${boundsJs}; ${js}; ({ fit, bounds })`, context);
  expect(api.bounds()).toEqual([-6, -4, 9, 11]);
  api.fit();
  camera.updateMatrixWorld();
  for (const [x, y] of [[-6, -4], [9, 11]]) {
    const corner = new THREE.Vector3(x, y, 0).project(camera);
    expect(Math.abs(corner.x)).toBeLessThan(1);
    expect(Math.abs(corner.y)).toBeLessThan(1);
  }
  context.view = [0, 0, 1, 1];
  expect(api.bounds()).toEqual(context.view);
});
