/**
 * The roof's dead load field (`ProRoofLoadSection.svelte`). Empty means "the floors' dead load";
 * anything else that did not read — "0,8 kN", "1.2.3", a negative — set it to that as well, so a
 * typo switched the roof to the floors' value with nothing on screen saying so. Unreadable text
 * keeps the value there was, as `QuantityInput` does.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readRoofDead } from '../auto-loads-sections';

const section = readFileSync(join(process.cwd(), 'src/components/pro/ProRoofLoadSection.svelte'), 'utf8');
const kgf = (v: number) => v * 0.00980665;

describe("the roof's dead load as typed", () => {
  it('only an empty field means the floors\' dead load', () => {
    expect(readRoofDead('', 0.8, (v) => v)).toBeNull();
    expect(readRoofDead('   ', 0.8, (v) => v)).toBeNull();
  });

  it('text that does not read, or a negative, keeps the value there was', () => {
    for (const raw of ['0,8 kN', '1.2.3', 'abc', '-1']) expect(readRoofDead(raw, 0.8, (v) => v)).toBe(0.8);
    expect(readRoofDead('abc', null, (v) => v)).toBeNull();
  });

  it('a number reads with a comma or a point, in the display units', () => {
    expect(readRoofDead('1,25', null, (v) => v)).toBe(1.25);
    expect(readRoofDead('0', 0.8, (v) => v)).toBe(0);
    expect(readRoofDead('100', null, kgf)).toBeCloseTo(0.980665, 9);
  });

  it('the field goes through it, and shows the kept value again', () => {
    expect(section).toMatch(/config\.dead = readRoofDead\(el\.value, config\.dead,/);
    expect(section).toMatch(/el\.value = deadText\(config\.dead\)/);
    expect(section).not.toMatch(/: null; \}\} data-testid="al-roof-dead"/);
  });
});
