/**
 * The role selectors of the project regulations (`role-select-options.ts`).
 *
 * A load role lists only the codes with a module to generate with. That filter also took out the
 * code a role was BOUND to when it had none (here a Eurocode adapter, its module mocked away), so the selector
 * read "— not selected —" over a bound role. And the dead load's typed row had a field with no
 * accessible name.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../lib/codes/families', async (orig) => {
  const actual = await orig<typeof import('../../../../lib/codes/families')>();
  return { ...actual, hasLoadModule: (id: string) => id !== 'en1991-1-4' && id !== 'en1990' && actual.hasLoadModule(id) };
});
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

  it('offers only the codes with a module otherwise: every family\'s wind code but the one without', () => {
    expect(ids('wind', 'cirsoc102-2025')).toEqual(['cirsoc102-2025', 'en1991-1-4-uk', 'asce7-22-wind', 'ts498-1997-wind']);
    expect(ids('wind', null)).toEqual(ids('wind', 'cirsoc102-2025'));
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
