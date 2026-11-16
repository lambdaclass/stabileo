import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { classifyEnclosure } from '../../../lib/codes/cirsoc102/wind';

it('#2203 enclosure editor can remove a wall down to the classifier minimum', () => {
  const source = readFileSync('src/components/pro/ProWindCasesPanel.svelte', 'utf8');
  expect(source).toContain('data-testid="al-wind-remove-wall-{i}"');
  expect(source).toContain('disabled={walls.length <= MIN_ENCLOSURE_WALLS}');
  expect(source).toContain('walls = walls.filter((_, index) => index !== i)');
  for (const count of [2, 3, 4]) expect(classifyEnclosure({ walls: Array.from({ length: count }, () => ({ gross: 10, openings: 0 })), roof: { gross: 10, openings: 0 } })).toBe('enclosed');
  expect(() => classifyEnclosure({ walls: [{ gross: 10, openings: 0 }], roof: { gross: 10, openings: 0 } })).toThrow('wind.enclosure.incompleteEnvelope');
});
