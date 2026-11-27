import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { setPublicLocale } from '../../../../lib/i18n/store.svelte';
import { PUBLIC_LOCALES } from '../../../../lib/i18n/offered';
import { fieldName, statusName } from '../../i18n';
import { strings as shells } from '../../shell1985/i18n';
import { strings as cantilevers } from '../../macneal1985/i18n';
import Heyman from '../../heyman1966/ArchPage.svelte';
import Shape from '../../feher2026/ShapePage.svelte';
import { strings as arch } from '../../dadeppo1975/i18n';
import { shapeStrings } from '../../feher2026/strings';

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
});

it.each(['de', 'fr', 'tr'] as const)('localizes all three research fields in %s', locale => {
  for (const field of ['differentiable-fem', 'constitutive', 'digital-twins']) {
    setPublicLocale('en');
    const english = fieldName(field);
    setPublicLocale(locale);
    expect(fieldName(field)).not.toEqual(english);
  }
});

it('localizes the exact circle target', () => {
  for (const [locale, label] of Object.entries({
    en: 'exact', es: 'exacto', pt: 'exato', de: 'exakt', fr: 'exact', tr: 'kesin', hu: 'egzakt', zh: '精确',
  })) {
    setPublicLocale(locale as typeof PUBLIC_LOCALES[number]);
    const row = render(Shape).body.split(shapeStrings().arcNote)[1].split('</p>')[0];
    expect(row.replace(/<!--.*?-->/gs, '')).toContain(`<sub>${label}</sub> = 0`);
  }
});

it.each(PUBLIC_LOCALES)('identifies the loading convention, fixed-stiffness study and recorded shell reference in %s', locale => {
  setPublicLocale(locale);
  const terms = {
    en: ['reference material coordinate s', 'fixed axial stiffness', 'roof', 'published values'],
    es: ['coordenada material de referencia s', 'rigidez axial fija', 'cubierta', 'valores publicados'],
    pt: ['coordenada material de referência s', 'rigidez axial fixa', 'cobertura', 'valores publicados'],
    de: ['Materialkoordinate s', 'fester Dehnsteifigkeit', 'Dachvergleich', 'veröffentlichten Werten'],
    fr: ['coordonnée matérielle de référence s', 'rigidité axiale fixée', 'toiture', 'valeurs publiées'],
    tr: ['s malzeme koordinatı', 'Eksenel rijitlik sabitken', 'Çatı', 'Yayımlanmış değerlerle'],
    hu: ['s referencia-anyagkoordináta', 'rögzített tengelyirányú merevség', 'tető', 'közölt értékekkel'],
    zh: ['材料坐标 s', '轴向刚度不变', '屋面', '已发表数值'],
  }[locale];
  const paragraphs = shapeStrings().why.items.map(item => item.body).join(' ');
  expect(paragraphs).toContain(terms[0]);
  expect(paragraphs).toContain(terms[1]);
  expect(cantilevers[locale].lead).toContain(terms[2]);
  expect(statusName('published-figures-compared')).toContain(terms[3]);
  expect(shells[locale].paperText).toMatch(/\|u_y\| = 1[.,]8248 × 10⁻⁵ \(u_y = −1[.,]8248 × 10⁻⁵\)/);
});
