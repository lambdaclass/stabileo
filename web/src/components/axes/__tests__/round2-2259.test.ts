import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import LoadSketch from '../../pro/loads/LoadSketch.svelte';
import { axesStore } from '../../../lib/axes/axes.svelte';
import { allChoices, makeFrame } from '../../../lib/axes/frame';
import notice from '../../../lib/provenance/result-changes/global-axes-inputs.json';
import hu from '../../../lib/i18n/locales/hu';

afterEach(() => axesStore.reset());

it('known wrong result: #2259 varying shell sketches keep coordinate endpoints and intensities together', () => {
  for (const c of allChoices()) for (const index of [0, 1]) {
    axesStore.choice = c;
    const f = makeFrame(c);
    const k = f.rows.findIndex(r => r[index] !== 0);
    const axis = (['X', 'Y', 'Z'] as const)[k]!;
    const sign = f.rows[k]![index]!;
    for (const [c1, c2] of [[1, 2], [2, 1]]) {
      const shell = { dirMode: 'down', dirAxis: 'Z', field: 'axis', q: null, corners: [], va: { axis, c1, c2, q1: 3, q2: 9 }, partial: false, gamma: null, level: null, at: { x: null, y: null, z: null }, pf: { fx: null, fy: null, fz: null } };
      const html = render(LoadSketch, { props: { v: { kind: 'surface', shell } as never } }).body;
      const texts = [...html.matchAll(/<text ([^>]+)>([^<]*)<\/text>/g)];
      const pos = (label: string) => {
        const m = texts.find(m => m[2]!.startsWith(label))!;
        expect(m).toBeDefined();
        return Number(m[1]!.match(new RegExp(`${index === 0 ? 'x' : 'y'}="([^\"]+)"`))![1]);
      };
      expect(Math.sign(pos(`${axis}₂`) - pos(`${axis}₁`))).toBe(Math.sign(c2 - c1) * sign * (index === 0 ? 1 : -1));
      if (index === 0) expect(Math.sign(pos('q₂') - pos('q₁'))).toBe(Math.sign(c2 - c1) * sign);
    }
  }
});

it('known wrong result: #2259 Hungarian modal copy and result notices are translated', () => {
  for (const key of ['landing.modTitle', 'landing.modDesc', 'landing.modTag', 'landing.modMode']) expect(hu[key]).toBeTruthy();
  expect(hu['landing.modMode']).toContain('{n}');
  for (const locale of ['es', 'pt', 'de', 'fr', 'hu', 'tr'] as const) {
    expect(notice.title[locale]).not.toBe(notice.title.en);
    expect(notice.explanation[locale]).not.toBe(notice.explanation.en);
  }
});
