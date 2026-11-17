/**
 * The site's sections, in order: the one list every public page's header is built from.
 * `section` items are parts of the landing (scrolled to there, linked to from elsewhere); `page`
 * items are pages of their own.
 */
import { buildFeatures } from '../../../config/public-features.mjs';
import { tools, publicFeatureEnabled, PUBLIC_POLICY_AVAILABLE } from '../../lib/features';

export type NavPage = 'examples' | 'tools' | 'game' | 'research' | 'blog';

export type NavItem =
  | { kind: 'section'; id: string; key: string }
  | { kind: 'page'; id: NavPage; to: string; key: string };

const NAV_ITEMS: NavItem[] = [
  { kind: 'section', id: 'basic', key: 'landing.navProduct' },
  { kind: 'page', id: 'examples', to: '/examples', key: 'landing.navExamples' },
  { kind: 'page', id: 'tools', to: '/tools', key: 'landing.navTools' },
  { kind: 'page', id: 'research', to: '/research', key: 'landing.navResearch' },
  { kind: 'section', id: 'pricing', key: 'landing.navPricing' },
  { kind: 'page', id: 'blog', to: '/blog', key: 'landing.navBlog' },
];

export const SITE_NAV = PUBLIC_POLICY_AVAILABLE ? NAV_ITEMS.flatMap(item => {
  if (item.id === 'examples' && buildFeatures().tools && tools()) return [];
  return item.id === 'tools' && (typeof __PUBLIC_FEATURES_COMPILED__ === 'undefined' ? buildFeatures().diagramGame : __PUBLIC_FEATURES__.diagramGame) ? [item, { kind: 'page', id: 'game', to: '/diagram-game', key: 'landing.navGame' } as const] : [item];
}).filter(item => item.kind !== 'page' || publicFeatureEnabled(item.to)) : NAV_ITEMS;

export type NavCurrent = NavPage | null;

const UNDER: Array<[string, NavPage]> = [
  ...SITE_NAV.flatMap((item): Array<[string, NavPage]> => (item.kind === 'page' ? [[item.to, item.id]] : [])),
  ['/paper', 'research'],
  ['/changelog', 'blog'],
];

/** Active public section, including nested articles and tools; the paper sits under research and the changelog under the blog. */
export function currentNav(path: string): NavCurrent {
  for (const [to, id] of UNDER) {
    if (path === to || path.startsWith(to + '/')) return id;
  }
  return null;
}
