import { expect, it, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import RcPropertyLines from '../RcPropertyLines.svelte';
import { modelStore } from '../../../../lib/store';
import { patchDesignData } from '../../../../lib/store/design-data';

const row = (name: string, x: number, y: number, position?: 'edge' | 'corner', anchor: [number, number] = [0, 0]) =>
  ({ key: `footing:${name}`, name, demand: { at: { x, y, z: 0 } }, ...(position ? { edge: { position, anchor, source: 'lines' } } : {}) }) as never;
const rows = [row('C1', 0, 0, 'corner', [-1, -1]), row('C2', 6, 0, 'edge', [0, -1]), row('C6', 6, 5)];

beforeEach(() => { modelStore.clear(); });

it('says no side is a property line while none is, and offers each side and all four', () => {
  const html = render(RcPropertyLines, { props: { rows } }).body;
  expect(html).toContain('data-testid="rc-property-lines-none"');
  for (const k of ['minX', 'maxX', 'minY', 'maxY', 'all']) expect(html).toContain(`data-testid="rc-property-chip-${k}"`);
});

it('marks the declared sides and counts the footings at a line and at a corner', () => {
  patchDesignData({ propertyLines: { minX: true, minY: true } });
  const html = render(RcPropertyLines, { props: { rows } }).body;
  expect(html).not.toContain('data-testid="rc-property-lines-none"');
  expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="rc-property-chip-minX"/);
  expect(html).toMatch(/aria-pressed="false"[^>]*data-testid="rc-property-chip-maxX"/);
  expect(html).toContain('1 at a line · 1 at a corner');
});

it('draws a core\'s outline where its footing stands, not a dot', () => {
  const core = { key: 'footing:p1', name: 'M1 + C1', demand: { at: { x: 1.25, y: 1.25, z: 0 }, pier: { outline: [{ x: -0.1, y: -0.1 }, { x: 2.6, y: -0.1 }, { x: 2.6, y: 0.1 }, { x: 0.1, y: 0.1 }, { x: 0.1, y: 2.6 }, { x: -0.1, y: 2.6 }] } } } as never;
  const html = render(RcPropertyLines, { props: { rows: [core, row('C6', 6, 5)] } }).body;
  expect(html).toContain('data-testid="rc-property-pier"');
  expect((html.match(/<polygon/g) ?? []).length).toBe(1);
});
