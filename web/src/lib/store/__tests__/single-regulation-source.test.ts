/**
 * One regulation selector, one resolved concrete code.
 *
 * ── The defect this pins down ──────────────────────────────────────
 *
 * The concrete design code was chosen in three places at once:
 *
 *   · a dropdown beside the Design commands wrote `verificationStore.activeCodeId`, and the
 *     code check, the candidate search and detailing all read it;
 *   · Project Regulations bound a `concrete` role, which reached only detailing's EDITION;
 *   · a legacy v1 field, `codeSettings.concreteEdition`, silently swapped the adapter inside
 *     `design-run`.
 *
 * They could disagree, and the disagreement was not cosmetic: a member could be verified
 * against one edition's clauses and detailed under the other's. The dropdown also listed the
 * whole adapter registry, which showed "CIRSOC 201" twice and offered the 2005 edition whose
 * official text is not supplied with this app.
 *
 * These are source-level gates as well as behavioural ones. A behavioural test passes again
 * the moment someone reintroduces a second writer that happens to agree on the default.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  optionsForRole, allOptionsForRole, optionLabel, bindingLabel,
} from '../../codes/roles';
import { cirsoc201Adapter2025, cirsoc201Adapter2005 } from '../../engine/design/adapters/cirsoc201-adapter';
import { listDesignCodes } from '../../engine/design/code-adapter';

const SRC = join(__dirname, '../../..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

describe('the design toolbar carries no regulation selector', () => {
  const toolbar = read('components/pro/design/DesignToolbar.svelte');

  it('has no code-select control', () => {
    expect(toolbar).not.toContain('code-select');
    expect(toolbar).not.toMatch(/<select/);
  });

  it('does not enumerate the adapter registry', () => {
    // Listing every registered adapter is what produced the duplicate label and offered an
    // unsourced edition. The toolbar has no business knowing the registry exists.
    expect(toolbar).not.toContain('listDesignCodes');
  });

  it('shows the active code as a read-out, and a way to change it', () => {
    expect(toolbar).toContain('data-testid="active-concrete-code"');
    expect(toolbar).toContain('data-testid="goto-project-regulations"');
  });
});

describe('no independent design-code state survives', () => {
  it('the verification store no longer owns a writable active code', () => {
    const src = read('lib/store/verification.svelte.ts');
    expect(src).not.toMatch(/let activeCodeId\s*=\s*\$state/);
    expect(src).not.toMatch(/setActiveCode\s*\(/);
  });

  it('every design consumer resolves through the project binding', () => {
    for (const rel of [
      'lib/store/verification.svelte.ts',
      'lib/store/design-run.svelte.ts',
      'lib/store/detailing.svelte.ts',
      'components/pro/design/BatchEditDialog.svelte',
    ]) {
      const src = read(rel);
      expect(src, `${rel} still reads a toolbar adapter`)
        .not.toMatch(/getDesignCode\(\s*verificationStore\.activeCodeId\s*\)/);
      expect(src, `${rel} reads a bare activeCodeId`).not.toMatch(/[^.]\bactiveCodeId\b/);
      expect(src, `${rel} does not consult Project Regulations`)
        .toContain('concreteDesignCode()');
    }
  });

  it('design-run no longer swaps the adapter from the legacy edition field', () => {
    const src = read('lib/store/design-run.svelte.ts');
    // The old bypass: `if (id === 'cirsoc' && codeSettings?.concreteEdition === '2005')`.
    expect(src).not.toMatch(/codeSettings\?\.\s*concreteEdition\s*===/);
  });
});

describe('CIRSOC 201 appears once per edition, and 2005 is not selectable', () => {
  it('the two adapters no longer share a display name', () => {
    expect(cirsoc201Adapter2025.name).not.toBe(cirsoc201Adapter2005.name);
    expect(cirsoc201Adapter2025.name).toContain('2025');
    expect(cirsoc201Adapter2005.name).toContain('2005');
  });

  it('no two registered adapters share a display name', () => {
    const names = listDesignCodes().map((a) => a.name);
    expect(new Set(names).size, `duplicate label in ${names.join(', ')}`).toBe(names.length);
  });

  it('the concrete role offers exactly one usable CIRSOC 201 option', () => {
    const usable = optionsForRole('concrete')
      .filter((o) => o.maturity !== 'UNSUPPORTED');
    const cirsoc = usable.filter((o) => o.regulation === 'cirsoc-201');
    expect(cirsoc).toHaveLength(1);
    expect(cirsoc[0].edition).toBe('2025');
  });

  it('CIRSOC 201-2005 is reserved: catalogued, explained, and NOT offered', () => {
    // `optionsForRole` is what populates a control that applies a binding, and it filters on
    // availability — so the unsourced edition never reaches a selector at all.
    expect(optionsForRole('concrete').map((o) => o.adapterId)).not.toContain('cirsoc-2005');
    // It stays in the catalogue so the adapter seam and the edition-aware plumbing remain
    // exercised, and a future sourced 2005 adapter is a catalogue edit rather than a
    // re-architecture. It has to say why it is unavailable.
    const o = allOptionsForRole('concrete').find((x) => x.adapterId === 'cirsoc-2005')!;
    expect(o).toBeDefined();
    expect(o.maturity).toBe('UNSUPPORTED');
    expect(o.availability).toBe('UNAVAILABLE_SOURCE');
    expect(o.noteKey).toBeTruthy();
  });

  it('every concrete option renders an edition-qualified label', () => {
    for (const o of allOptionsForRole('concrete')) {
      const label = optionLabel(o);
      expect(label.params?.edition, `${o.adapterId}`).toBeTruthy();
    }
  });
});

describe('roles stay independent — one selector per role, not one code per project', () => {
  it('loads, wind, seismic and concrete each keep their own options', () => {
    for (const role of ['loads', 'wind', 'seismic', 'concrete'] as const) {
      expect(optionsForRole(role).length, role).toBeGreaterThan(0);
    }
  });

  it('a concrete-role change is design-only; a loads-role change is load-affecting', async () => {
    const { isLoadAffecting } = await import('../../codes/roles');
    expect(isLoadAffecting('concrete')).toBe(false);
    expect(isLoadAffecting('steel')).toBe(false);
    expect(isLoadAffecting('loads')).toBe(true);
    expect(isLoadAffecting('wind')).toBe(true);
    expect(isLoadAffecting('seismic')).toBe(true);
  });

  it('a mixed stack is representable — CIRSOC loads with a non-CIRSOC concrete adapter', () => {
    const concrete = optionsForRole('concrete').map((o) => o.adapterId);
    expect(concrete).toContain('eurocode');
    expect(concrete).toContain('aci-aisc');
    const loads = optionsForRole('loads').map((o) => o.family);
    expect(loads).toContain('cirsoc');
  });
});

describe('an unbound concrete role is stated, never defaulted', () => {
  it('bindingLabel never renders blank', () => {
    const unbound = { adapterId: null, nameKey: '', edition: '' } as never;
    expect(bindingLabel(unbound).key).toBeTruthy();
  });
});
