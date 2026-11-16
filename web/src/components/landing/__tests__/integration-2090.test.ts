import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import Topopt from '../hero/TopoptFigure.svelte';
import Truss from '../TrussFigure.svelte';
import { HeroLoop } from '../hero/loop.svelte';
import { FRAME_ITERATION, FRAME_COMPLIANCE } from '../hero/topopt-data';
import { i18n } from '../../../lib/i18n/store.svelte';

afterEach(() => { vi.restoreAllMocks(); i18n.locale = 'en'; });

it('known wrong result: #2090 numerical topology results select a stored solved frame', () => {
  for (const seconds of [0, 0.04, 0.1, 0.3, 2, 6, 10, 12]) {
    vi.spyOn(HeroLoop.prototype, 'seconds', 'get').mockReturnValue(seconds);
    const html = render(Topopt).body;
    const iteration = Number(/<b>(\d+) \/ \d+<\/b>/.exec(html)![1]);
    const at = FRAME_ITERATION.indexOf(iteration);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(html).toContain(`${Math.round(100 * FRAME_COMPLIANCE[at]! / FRAME_COMPLIANCE[0]!)} %`);
    vi.restoreAllMocks();
  }
});

it('known wrong result: #2090 the truss visibly identifies normalized deformation and near-zero members', () => {
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const) {
    i18n.locale = locale;
    const html = render(Truss, { props: { prefersReducedMotion: true } }).body;
    const caption = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/.exec(html)![1];
    expect(caption).toContain('data-testid="truss-normalized"');
    expect(caption).toContain('data-testid="truss-zero"');
    expect(caption).not.toContain('landing.fig');
  }
});
