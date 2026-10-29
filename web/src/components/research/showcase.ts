import type { Experiment } from './experiments';

export type ShowcasePaper = {
  id: string;
  page?: string;
  showcase?: number;
  crossref: { year: number; title: string };
};

/** Only registered browser experiments with a catalogue page can enter Run it. */
export function showcaseEntries<P extends ShowcasePaper>(papers: P[], experiments: Experiment[]) {
  const byId = new Map(papers.map(p => [p.id, p]));
  return experiments.flatMap(e => {
    const p = byId.get(e.paperId);
    return p?.page ? [{ e, p }] : [];
  }).sort((a, b) =>
    (a.p.showcase ?? Infinity) - (b.p.showcase ?? Infinity) ||
    b.p.crossref.year - a.p.crossref.year ||
    a.p.crossref.title.localeCompare(b.p.crossref.title));
}

export function previewSource(preview: string | undefined, reducedMotion: boolean, visible: boolean, failed = false) {
  return !reducedMotion && visible && !failed ? preview : undefined;
}

/** Ignore a pending play rejection caused by removing an offscreen video. */
export function playPreview(video: Pick<HTMLVideoElement, 'play' | 'pause'>, failed: () => void) {
  let active = true;
  try {
    video.play()?.catch(() => { if (active) failed(); });
  } catch {
    failed();
  }
  return { destroy: () => { active = false; video.pause(); } };
}
