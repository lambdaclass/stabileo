/**
 * The role selectors of the project regulations (`role-select-options.ts`).
 *
 * A load role lists only the codes with a module to generate with. That filter also took out the
 * code a role was BOUND to when it had none — a Eurocode adapter saved earlier — so the selector
 * read "— not selected —" over a bound role. And the dead load's typed row had a field with no
 * accessible name.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { roleSelectOptions } from '../role-select-options';
import { hasLoadModule } from '../../../../lib/codes/families';

const ids = (role: Parameters<typeof roleSelectOptions>[0], bound: string | null) =>
  roleSelectOptions(role, bound).map((x) => `${x.option.adapterId}${x.noModule ? ' (no module)' : ''}`);

describe('a load role\'s selector', () => {
  it('lists the code bound to it even with no module, marked, so it shows what is bound', () => {
    expect(hasLoadModule('en1991-1-4')).toBe(false);
    expect(ids('wind', 'en1991-1-4')).toContain('en1991-1-4 (no module)');
    expect(ids('basis', 'en1990')).toContain('en1990 (no module)');
  });

  it('offers only the codes with a module otherwise', () => {
    expect(ids('wind', 'cirsoc102-2025')).toEqual(['cirsoc102-2025']);
    expect(ids('wind', null)).toEqual(['cirsoc102-2025']);
  });

  it('a design role is not filtered, and lists each option once', () => {
    const concrete = ids('concrete', 'cirsoc');
    expect(concrete).toContain('cirsoc');
    expect(new Set(concrete).size).toBe(concrete.length);
    expect(concrete.some((s) => s.endsWith('(no module)'))).toBe(false);
  });

  it('the panel lists through it, and the bound code without a module cannot be chosen again', () => {
    const panel = readFileSync(join(process.cwd(), 'src/components/pro/design/ProjectRegulationsPanel.svelte'), 'utf8');
    expect(panel).toMatch(/\{@const opts = roleSelectOptions\(role, b\.adapterId\)\}/);
    expect(panel).toMatch(/<option value=\{o\.adapterId\} disabled=\{noModule\}>[^\n]*regulations\.noGeneratorModule/);
  });
});

describe("the dead load's typed row", () => {
  it('has an accessible name', () => {
    const builder = readFileSync(join(process.cwd(), 'src/components/pro/ProDeadLoadBuilder.svelte'), 'utf8');
    expect(builder).toMatch(/<QuantityInput [^>]*testid="dead-q"[^>]*ariaLabel=\{t\('loads\.dead\.custom'\)\}/);
  });
});
