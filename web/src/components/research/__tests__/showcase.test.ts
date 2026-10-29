import { describe, expect, it, vi } from 'vitest';
import catalog from '../../../../../research/papers.json';
import { EXPERIMENTS, type Experiment } from '../experiments';
import { playPreview, previewSource, showcaseEntries, type ShowcasePaper } from '../showcase';

const paper = (id: string, year: number, title: string, showcase?: number): ShowcasePaper => ({ id, page: 'page.svelte', crossref: { year, title }, showcase });
const experiments = (...ids: string[]): Experiment[] => ids.map(paperId => ({ ...EXPERIMENTS[0], paperId }));

describe('Run it showcase', () => {
  it('includes exactly the registered runnable papers in hand-set order', () => {
    expect(showcaseEntries(catalog.papers, EXPERIMENTS).map(x => x.p.id)).toEqual(['grossman-2026', 'shauer-2025']);
  });
  it('uses rank before year, then sorts unranked entries by year and title', () => {
    const papers = [paper('z', 2026, 'Z'), paper('old', 2020, 'Old'), paper('b', 2026, 'B'), paper('ranked', 2000, 'Ranked', 1), paper('second', 2030, 'Second', 2)];
    const original = [...papers];
    expect(showcaseEntries(papers, experiments(...papers.map(p => p.id))).map(x => x.p.id)).toEqual(['ranked', 'second', 'b', 'z', 'old']);
    expect(papers).toEqual(original);
  });
  it('excludes catalogue-only entries and registrations without a page or catalogue entry', () => {
    expect(showcaseEntries([paper('catalogued', 2026, 'Catalogue'), { ...paper('no-page', 2025, 'No page'), page: undefined }], experiments('no-page', 'missing'))).toEqual([]);
  });
});

describe('showcase media selection', () => {
  it('uses only an explicit preview while visible', () => {
    expect(previewSource('preview.webm', false, true)).toBe('preview.webm');
    expect(previewSource('preview.mp4', false, true)).toBe('preview.mp4');
    expect(previewSource(undefined, false, true)).toBeUndefined();
  });
  it('keeps the still for reduced motion, offscreen cards and failed video', () => {
    expect(previewSource('preview.webm', true, true)).toBeUndefined();
    expect(previewSource('preview.webm', false, false)).toBeUndefined();
    expect(previewSource('preview.webm', false, true, true)).toBeUndefined();
  });
});


it('pauses on removal without treating the interrupted play request as a video failure', async () => {
  let reject!: (error: Error) => void;
  const video = { play: () => new Promise<void>((_, fail) => { reject = fail; }), pause: vi.fn() };
  const failed = vi.fn();
  const action = playPreview(video, failed);
  action.destroy();
  reject(new Error('play interrupted by pause'));
  await Promise.resolve();
  expect(video.pause).toHaveBeenCalledOnce();
  expect(failed).not.toHaveBeenCalled();
});

it('falls back to the poster when playing a visible video is rejected', async () => {
  const failed = vi.fn();
  playPreview({ play: () => Promise.reject(new Error('autoplay denied')), pause: vi.fn() }, failed);
  await Promise.resolve();
  expect(failed).toHaveBeenCalledOnce();
});
