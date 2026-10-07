/**
 * The what-if panel names each load by its values, in the project's units. A 3D tendon's chip
 * printed its force as the stored kN with no unit («P=500»), beside chips reading «P=50.99 tf».
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../../../components/WhatIfPanel.svelte', import.meta.url)), 'utf8');

describe('the what-if prestress chip', () => {
  it('formats the tendon force as a force, with its unit', () => {
    const line = src.split('\n').find((l) => l.includes("l.type === 'prestress3d'"));
    expect(line).toBeDefined();
    expect(line).toMatch(/P=\$\{F\(l\.data\.force\b/);
    expect(line).not.toMatch(/P=\$\{l\.data\.force\}/);
  });
});
