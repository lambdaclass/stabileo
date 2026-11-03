/**
 * PRO's videos on YouTube, offered in Project beside the examples. A video with no address yet is
 * listed as being prepared and is never recommended. Each has an English version and, where it
 * exists, a Spanish one, which the Spanish interface takes.
 */
export interface ProVideo {
  id: 'building' | 'walkthrough';
  titleKey: string;
  descKey: string;
  minutes: number;
  /** YouTube video ids by language. */
  youtube: { en?: string; es?: string };
}

export const PRO_VIDEOS: readonly ProVideo[] = [
  { id: 'building', titleKey: 'videos.building.title', descKey: 'videos.building.desc', minutes: 4, youtube: {} },
  { id: 'walkthrough', titleKey: 'videos.walkthrough.title', descKey: 'videos.walkthrough.desc', minutes: 20, youtube: {} },
];

/** The video's address for the interface's language, or the English one; null before it is published. */
export function videoUrl(v: ProVideo, locale: string): string | null {
  const id = (locale === 'es' ? v.youtube.es : undefined) ?? v.youtube.en;
  return id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : null;
}

export const publishedVideos = (locale: string, list: readonly ProVideo[] = PRO_VIDEOS) => list.filter((v) => videoUrl(v, locale));

const OFFERED_KEY = 'stabileo-pro-videos-offered';

/** Whether the first-time recommendation was already shown in this browser. */
export function videosOffered(): boolean {
  try { return localStorage.getItem(OFFERED_KEY) === '1'; } catch { return true; }
}
export function markVideosOffered(): void {
  try { localStorage.setItem(OFFERED_KEY, '1'); } catch { /* private mode */ }
}
