import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { ensurePublicLocale, i18n, PUBLIC_LOCALES } from '../../../lib/i18n/store.svelte';
import Building from '../hero/BuildingFigure.svelte';
import Section from '../hero/SectionFigure.svelte';
import Shed from '../hero/ShedFigure.svelte';
import Modal from '../hero/ModalFigure.svelte';
import { AXIAL, COMBINATION } from '../hero/building-data';
import { MEMBERS } from '../hero/shed-data';

const frame = vi.hoisted(() => ({ progress: undefined as number | undefined }));

vi.mock('../hero/loop.svelte', async (importOriginal) => {
  const loop = await importOriginal<typeof import('../hero/loop.svelte')>();
  return {
    ...loop,
    HeroLoop: class extends loop.HeroLoop {
      constructor(...args: ConstructorParameters<typeof loop.HeroLoop>) {
        super(...args);
        if (frame.progress !== undefined) this.u = frame.progress;
      }
    },
  };
});

const terms = {
  en: { compression: 'Compression', tension: 'Tension', zero: 'Zero' },
  es: { compression: 'Compresión' },
  pt: { compression: 'Compressão' },
  de: { compression: 'Druck' },
  fr: { compression: 'En compression' },
  tr: { compression: 'Basınç' },
  hu: { compression: 'Nyomás' },
  zh: { compression: '受压' },
};

function caption(html: string) {
  return html.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/)![1].replace(/<!--[\s\S]*?-->/g, '');
}

function stressesInCaption(html: string) {
  return [...caption(html).matchAll(/<i class="hf-sw" style="background: ([^"]+)"><\/i>(σ \w+) <b>([^<]+) MPa<\/b>([^<]*)/g)]
    .map(([, color, extreme, value, sense]) => ({ color, extreme, value, sense: sense.trim() }));
}

afterEach(() => {
  frame.progress = undefined;
  i18n.locale = 'en';
});

it('#2285 the building caption keeps the sign of the governing axial force in every locale', async () => {
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
    if (locale === 'en') expect.soft(text).toContain('Governing N');
  }
});

it('#2285 section stress extrema use the colour and wording of the displayed sign', async () => {
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
    const fibres = [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<text(?=[^>]*class="sa-val[ "])[^>]*fill="([^"]+)"[^>]*>([^<]+)<\/text>/g)]
      .map(([, color, value]) => ({ color, value }));
    expect.soft(fibres, `cut at ${progress}`).toEqual(expect.arrayContaining([
      { color: maxColor, value: max },
      { color: compression, value: min },
    ]));
  }
});

function shedLines(prefersReducedMotion = false) {
  const { body } = render(Shed, { props: { prefersReducedMotion } });
  return [...body.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)" stroke="([^"]+)" stroke-width="([^"]+)" stroke-opacity="([^"]+)"/g)]
    .map(([, x1, y1, x2, y2, colour, width, opacity]) => ({
      start: [Number(x1), Number(y1)],
      end: [Number(x2), Number(y2)],
      colour,
      width: Number(width),
      opacity: Number(opacity),
    }));
}

it('#2285 coincident shed members show distinct stress levels on separate strokes', () => {
  const distinctLevels = new Set(MEMBERS.map(([a, b, level]) => `${Math.min(a, b)},${Math.max(a, b)},${level}`));

  for (const progress of [0, 0.2, 0.4, 0.5, 0.7, undefined]) {
    frame.progress = progress;
    const lines = shedLines(progress === undefined);
    const seen = new Map<string, string>();
    const conflicts = new Set<string>();
    for (const { start, end, colour, width } of lines) {
      const segment = [start.join(','), end.join(',')].sort().join(' → ');
      const style = `${colour}/${width}`;
      const previous = seen.get(segment);
      if (previous && previous !== style) conflicts.add(`${segment}: ${previous} and ${style}`);
      seen.set(segment, style);
    }
    expect.soft([...conflicts], `shed progress ${progress ?? 'reduced motion'}`).toEqual([]);
    expect.soft(lines).toHaveLength(distinctLevels.size);
  }

  const lines = shedLines(true);
  const coincident = lines.filter(({ start, end }) =>
    Math.hypot((start[0] + end[0]) / 2 - 168.1, (start[1] + end[1]) / 2 - 132.4) < 2.5);
  expect(coincident.map(({ colour, opacity }) => ({ colour, opacity }))).toEqual([
    { colour: '#3f8fa6', opacity: 1 },
    { colour: '#e5482a', opacity: 1 },
  ]);
  const [low, high] = coincident;
  const dx = low.end[0] - low.start[0];
  const dy = low.end[1] - low.start[1];
  const clearance = Math.abs(dx * (high.start[1] - low.start[1]) - dy * (high.start[0] - low.start[0]))
    / Math.hypot(dx, dy);
  expect(clearance).toBeGreaterThan((low.width + high.width) / 2);

  expect(lines).toContainEqual({
    start: [69, 216.5], end: [72.2, 214.2], colour: '#3b5368', width: 0.7, opacity: 1,
  });
});

it('#2285 the modal drawing oscillates at the frequency ratios in its caption', () => {
  const duration = 18;
  const segment = duration / 3;
  const format = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function sample(mode: number, offset: number) {
    frame.progress = ((mode - 1) * segment + offset) / duration;
    const html = render(Modal).body;
    const x = Number(html.match(/<line(?=[^>]*class="md-beam\b)[^>]*x1="([^"]+)"/)![1]);
    const label = caption(html).match(/ω([₁₂₃]) \/ ω₁ <b>([^<]+)<\/b>/)!;
    expect(label[1]).toBe(['₁', '₂', '₃'][mode - 1]);
    return { x, ratio: label[2] };
  }

  const baseline = sample(1, 0).x;
  const halfCycles: number[] = [];
  for (const mode of [1, 2, 3]) {
    let before = 0.04;
    const first = sample(mode, before);
    let after = 0.08;
    expect(first.x).toBeGreaterThan(baseline);
    while (after < 2 && sample(mode, after).x > baseline) {
      before = after;
      after += 0.04;
    }
    expect(sample(mode, after).x).toBeLessThan(baseline);
    for (let i = 0; i < 20; i++) {
      const mid = (before + after) / 2;
      if (sample(mode, mid).x > baseline) before = mid;
      else after = mid;
    }
    halfCycles.push((before + after) / 2);
    expect.soft(format.format(halfCycles[0] / halfCycles[mode - 1]), `mode ${mode}`).toBe(first.ratio);
  }
});
