import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { setPublicLocale } from '../../../../lib/i18n/store.svelte';
import { PUBLIC_LOCALES } from '../../../../lib/i18n/offered';
import { fieldName } from '../../i18n';
import Heyman from '../../heyman1966/ArchPage.svelte';
import Shape from '../../feher2026/ShapePage.svelte';
import { strings as arch } from '../../dadeppo1975/i18n';
import { shapeStrings } from '../../feher2026/strings';
import { archInput } from '../../dadeppo1975/case';

afterEach(() => setPublicLocale('en'));
it('credits the source of the masonry comparisons in the verdict', () => {
  expect(render(Heyman).body.match(/<dl class="rs-verify[^"]*">.*?<\/dl>/s)?.[0]).toContain('Rizzi');
});

it.each(PUBLIC_LOCALES)('displays circle target and verdict, and mesh-specific path length in %s', locale => {
  setPublicLocale(locale);
  const row = render(Shape).body.split(shapeStrings().arcNote)[1]?.split('</p>')[0];
  expect(row).toMatch(/\b0\b/);
  expect(row).toContain('✓');
  expect(arch[locale].fullPath).toContain('{n}');
  expect(arch[locale].fullPath.replace('{n}', String(archInput(80).maxSteps))).toContain('200');
});

it.each(['de', 'fr', 'tr'] as const)('localizes all three research fields in %s', locale => {
  for (const field of ['differentiable-fem', 'constitutive', 'digital-twins']) {
    setPublicLocale('en');
    const english = fieldName(field);
    setPublicLocale(locale);
    expect(fieldName(field)).not.toEqual(english);
  }
});

it.skipIf(!process.env.RUN_KNOWN_WRONG)('known wrong result: #2505 localizes the exact circle target', () => {
  for (const [locale, label] of Object.entries({
    en: 'exact', es: 'exacto', pt: 'exato', de: 'exakt', fr: 'exact', tr: 'kesin', hu: 'egzakt', zh: '精确',
  })) {
    setPublicLocale(locale as typeof PUBLIC_LOCALES[number]);
    const row = render(Shape).body.split(shapeStrings().arcNote)[1].split('</p>')[0];
    expect(row.replace(/<!--.*?-->/gs, '')).toContain(`<sub>${label}</sub> = 0`);
  }
});
