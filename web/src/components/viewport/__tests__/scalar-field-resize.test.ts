import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { scalarFieldScale } from '../scalar-field-scale';
it('refreshes the displayed zoom after resize and fit change the projection', () => {
  const source = readFileSync(new URL('../ScalarFieldViewer.svelte', import.meta.url), 'utf8');
  for (const name of ['resize', 'fit']) {
    const body = source.slice(source.indexOf(`function ${name}(`)).split('\n  function ')[0];
    expect(body).toContain('updateZoom();');
    expect(body.indexOf('updateZoom();')).toBeGreaterThan(body.indexOf('camera.updateProjectionMatrix();'));
  }
});

it('displays the new pixel scale after the viewport height doubles', () => {
  expect(scalarFieldScale(400, 10, 90)).toBe('20.0 px/unit');
  expect(scalarFieldScale(800, 10, 90)).toBe('40.0 px/unit');
});
