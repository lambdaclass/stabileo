import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

test('@smoke repeated rendered line updates retain GPU buffers and disposal releases every buffer', async ({ page }) => {
  const { build } = await import('esbuild');
  const bundle = await build({
    stdin: { contents: `
      import * as THREE from 'three';
      import { createScalarFieldMesh } from './src/lib/three/scalar-field-mesh';
      const renderer = new THREE.WebGLRenderer();
      renderer.setSize(128, 128);
      document.body.append(renderer.domElement);
      const gl = renderer.getContext();
      const buffers = new Set();
      let created = 0;
      const create = gl.createBuffer.bind(gl), remove = gl.deleteBuffer.bind(gl);
      gl.createBuffer = () => { const b = create(); buffers.add(b); created++; return b; };
      gl.deleteBuffer = b => { buffers.delete(b); remove(b); };
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
      camera.position.z = 3;
      const mesh = createScalarFieldMesh([0, 0, 1, 0, 0, 1], [0, 1, 1, 2, 2, 0], 2);
      mesh.setResolution(128, 128);
      scene.add(mesh.group);
      renderer.render(scene, camera);
      const initial = created;
      for (let i = 0; i < 30; i++) {
        mesh.setField([i / 30, 0.5, 1], { min: 0, max: 1 });
        mesh.setDisplacement([0, 0, i / 300, 0, 0, 0], 1);
        mesh.setHidden(i % 2 ? c => c === 0 : null);
        renderer.render(scene, camera);
      }
      const afterUpdates = created;
      scene.remove(mesh.group);
      mesh.dispose();
      const remaining = buffers.size;
      renderer.dispose();
      window.result = { initial, afterUpdates, remaining };
    `, resolveDir: fileURLToPath(new URL('..', import.meta.url)) },
    bundle: true, write: false, format: 'iife',
  });
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(() => (window as unknown as { result: { initial: number; afterUpdates: number; remaining: number } }).result);
  expect(result.initial).toBeGreaterThan(0);
  expect(result.afterUpdates).toBe(result.initial);
  expect(result.remaining).toBe(0);
});
