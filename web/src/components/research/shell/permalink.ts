/**
 * Permanent links to research experiments (research/DESIGN.md §5, docs/DEPLOY.md "Snapshots").
 *
 * Every commit on main that changes research, the engine or the viewer is kept, built, under
 * `/@<first 7 of the commit>/`; the host lists them at `/@/` (newest first, with the research
 * pages each one holds). An experiment's permanent link is this build's own snapshot when it has
 * one, otherwise the newest snapshot that holds the experiment's page.
 */
import { BUILD_COMMIT } from '../../../lib/build-info';
import { SITE_ORIGIN, publicHref } from '../../../lib/i18n/public-routes';
import type { PublicLocale } from '../../../lib/i18n/store.svelte';

export type SnapshotEntry = {
  short: string;
  commit: string;
  /** The commit's date, ISO 8601. */
  date: string;
  /** `/@<short>/` */
  url: string;
  /** The research pages it holds (`/research/<field>/<id>`). */
  research?: string[];
};

/** This build's prefix when it is itself a snapshot (`/@abc1234/`), else null. */
export const THIS_SNAPSHOT: string | null = /^\/@[0-9a-f]{7}\/$/.test(import.meta.env.BASE_URL) ? import.meta.env.BASE_URL : null;

/** The site the links name: this one, except on a development machine. */
export function siteOrigin(origin: string = location.origin): string {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin) ? SITE_ORIGIN : origin;
}

let index: Promise<SnapshotEntry[]> | null = null;

/** The host's index; empty where there is none (a development server, an older host). */
export function snapshotIndex(): Promise<SnapshotEntry[]> {
  index ??= fetch('/@/', { headers: { accept: 'application/json' } })
    .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : { snapshots: [] }))
    .then((j: { snapshots?: SnapshotEntry[] }) => (Array.isArray(j.snapshots) ? j.snapshots : []))
    .catch(() => []);
  return index;
}

export type Permalink = {
  /** The snapshot cited. */
  snapshot: Pick<SnapshotEntry, 'short' | 'commit' | 'date' | 'url'>;
  /** True when it is this very build; false when it is the newest older one holding the page. */
  current: boolean;
};

/**
 * The snapshot to cite for `path` (`/research/<field>/<id>`): this build's own if it is one or
 * the index lists it, else the newest listed snapshot holding the page, else null.
 */
export function pickSnapshot(entries: SnapshotEntry[], path: string, commit: string = BUILD_COMMIT, self: string | null = THIS_SNAPSHOT): Permalink | null {
  const page = path.replace(/\/+$/, '');
  if (self) {
    const short = self.slice(2, -1);
    const listed = entries.find((e) => e.short === short);
    return { snapshot: listed ?? { short, commit: commit.startsWith(short) ? commit : short, date: '', url: self }, current: true };
  }
  const mine = entries.find((e) => commit !== 'dev' && (e.commit.startsWith(commit) || commit.startsWith(e.commit)));
  if (mine && (!mine.research || mine.research.includes(page))) return { snapshot: mine, current: true };
  const newest = [...entries]
    .filter((e) => e.research?.includes(page))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
  return newest ? { snapshot: newest, current: false } : null;
}

/** `https://stabileo.com/@abc1234/en/research/fracture/shauer-2025/` */
export function permalinkUrl(snapshot: Pick<SnapshotEntry, 'url'>, path: string, locale: PublicLocale, origin: string = siteOrigin()): string {
  return origin + snapshot.url.replace(/\/$/, '') + publicHref(path, locale);
}
