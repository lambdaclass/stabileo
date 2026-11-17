import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { ensurePublicLocale, i18n, PUBLIC_LOCALES } from '../../../lib/i18n/store.svelte';
import Building from '../hero/BuildingFigure.svelte';
import Section from '../hero/SectionFigure.svelte';
import { AXIAL, COMBINATION } from '../hero/building-data';

const reproduce = process.env.RUN_KNOWN_WRONG === '2285' ? it : it.skip;
const frame = vi.hoisted(() => ({ progress: 0 }));

vi.mock('../hero/loop.svelte', async (importOriginal) => {
  const loop = await importOriginal<typeof import('../hero/loop.svelte')>();
  return {
    ...loop,
    HeroLoop: class extends loop.HeroLoop {
      constructor(...args: ConstructorParameters<typeof loop.HeroLoop>) {
        super(...args);
        this.u = frame.progress;
      }
    },
  };
});

const terms = {
  en: { compression: 'Compression', tension: 'Tension', zero: 'Zero' },
  es: { compression: 'Compresión' },
  pt: { compression: 'Compressão' },
  de: { compression: 'Druck' },
  fr: { compression: 'Compression' },
  tr: { compression: 'Basınç' },
  hu: { compression: 'Nyomás' },
};

function caption(html: string) {
  return html.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/)![1].replace(/<!--[\s\S]*?-->/g, '');
}

function stressesInCaption(html: string) {
  return [...caption(html).matchAll(/<i class="hf-sw" style="background: ([^"]+)"><\/i>(σ \w+) <b>([^<]+) MPa<\/b>([^<]*)/g)]
    .map(([, color, extreme, value, sense]) => ({ color, extreme, value, sense: sense.trim() }));
}

afterEach(() => {
  i18n.locale = 'en';
});

reproduce('known wrong result: #2285 the building caption keeps the sign of the governing axial force in every locale', async () => {
  frame.progress = 0.5;
  const compression = Math.min(...AXIAL);
  expect(-compression).toBeGreaterThan(Math.max(...AXIAL));
  for (const locale of PUBLIC_LOCALES) {
    await ensurePublicLocale(locale);
    i18n.locale = locale;
    const force = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(compression);
    const text = caption(render(Building).body);
    expect.soft(text, locale).toContain(`<b>${force} kN</b>`);
    expect.soft(text, locale).toContain(`(${terms[locale].compression})`);
    expect.soft(text, locale).toContain(COMBINATION);
  }
});

reproduce('known wrong result: #2285 section stress extrema use the colour and wording of the displayed sign', async () => {
  const compression = 'var(--sa-c)';
  const tension = 'var(--sa-t)';
  const zero = 'var(--fg-2)';
  frame.progress = 0.4137;
  for (const locale of PUBLIC_LOCALES) {
    await ensurePublicLocale(locale);
    i18n.locale = locale;
    const fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect.soft(stressesInCaption(render(Section).body), locale).toEqual([
      { color: compression, extreme: 'σ max', value: fmt.format(-0.13), sense: `(${terms[locale].compression})` },
      { color: compression, extreme: 'σ min', value: fmt.format(-0.14), sense: `(${terms[locale].compression})` },
    ]);
  }

  i18n.locale = 'en';
  const samples = [
    [0.41015, '+0.01', '-0.27', tension, 'tension'],
    [0.4102, '0.00', '-0.27', zero, 'zero'],
    [0.41045, '0.00', '-0.26', zero, 'zero'],
    [0.4105, '-0.01', '-0.26', compression, 'compression'],
    [0.45, '+1.03', '-1.29', tension, 'tension'],
  ] as const;
  for (const [progress, max, min, maxColor, maxSense] of samples) {
    frame.progress = progress;
    const html = render(Section).body;
    const labels = stressesInCaption(html);
    expect.soft(labels, `cut at ${progress}`).toEqual([
      { color: maxColor, extreme: 'σ max', value: max, sense: `(${terms.en[maxSense]})` },
      { color: compression, extreme: 'σ min', value: min, sense: '(Compression)' },
    ]);
    const fibres = [...html.matchAll(/<text class="sa-val"[^>]*fill="([^"]+)"[^>]*>([^<]+)<\/text>/g)]
      .map(([, color, value]) => ({ color, value }));
    expect.soft(fibres, `cut at ${progress}`).toEqual(expect.arrayContaining([
      { color: maxColor, value: max },
      { color: compression, value: min },
    ]));
  }
});
