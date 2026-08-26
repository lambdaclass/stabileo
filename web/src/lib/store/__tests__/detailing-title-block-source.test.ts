/**
 * The rótulo's codes come from the Reglamentos stage, and from nowhere else.
 *
 * ── Why this is a store test and not an e2e ────────────────────────
 *
 * The requirement is "el rótulo muestra automáticamente las normas seleccionadas en la etapa
 * Reglamentos" and "si cambia la selección, el rótulo se actualiza". Both are claims about
 * WHERE the list is read from, and the honest way to pin that is to compare the list against
 * the bindings themselves. Reaching Reglamentos through the UI to rebind a role would test the
 * journey to that screen, which is a different subject with a different failure mode.
 *
 * `title-block-config.test.ts` covers the pure half: different bindings give a different list,
 * and the function takes no second argument an author's text could arrive through.
 */

import { describe, it, expect } from 'vitest';
import '../index';
import { regulationsStore } from '../regulations.svelte';
import { detailingSheet } from '../detailing-sheet.svelte';
import { REGULATION_ROLES } from '../../codes/roles';
import { t } from '../../i18n';

/** The bound roles, as the rótulo would print them. */
function expected(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const role of REGULATION_ROLES) {
    const b = regulationsStore.binding(role);
    if (b.adapterId === null) continue;
    const text = [t(b.nameKey), b.edition].filter(Boolean).join(' · ')
      + (b.jurisdiction ? ` (${b.jurisdiction})` : '');
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
  }
  return out;
}

describe('the rótulo prints the Reglamentos selection', () => {
  it('is exactly the bound roles, in their order', () => {
    expect(detailingSheet.titleBlockCodes.map((c) => c.text)).toEqual(expected());
  });

  /*
   * The decision, as a property of the surface: there is no writer for the codes. `setTitleBlock`
   * takes the identification and nothing else, so no path exists through which a project could
   * carry a code the bindings do not.
   */
  it('offers no way to write a code', () => {
    detailingSheet.setTitleBlock({
      project: 'Obra', subtitle: 'Etapa 2', office: 'Estudio',
      // A field an older project might still carry. It must not survive into the config.
      declaredCodes: ['Ordenanza 4711'],
    } as never);
    expect(detailingSheet.titleBlockConfig).toEqual({
      project: 'Obra', subtitle: 'Etapa 2', office: 'Estudio',
    });
    expect(detailingSheet.titleBlockCodes.map((c) => c.text)).toEqual(expected());
  });

  /*
   * "No code governs this role" and "a code governs it and I cannot name it" are different
   * statements, and only the first is true of an unbound role — so nothing is printed for it.
   */
  it('says nothing about a role nobody has bound', () => {
    const printed = detailingSheet.titleBlockCodes.map((c) => c.text);
    // `expected()` dedupes, because one instrument bound to two roles is one line on a rótulo.
    expect(printed).toEqual(expected());
    for (const role of REGULATION_ROLES) {
      if (regulationsStore.binding(role).adapterId !== null) continue;
      const name = t(regulationsStore.binding(role).nameKey).trim();
      // An unbound role may not even have a name to look for; an empty needle matches
      // everything, so the check has to be skipped rather than made vacuously true.
      if (name.length === 0) continue;
      expect(printed.some((p) => p.includes(name)), `${role} is not printed`).toBe(false);
    }
  });
});
