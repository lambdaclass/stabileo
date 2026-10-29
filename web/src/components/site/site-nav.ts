/**
 * The site's sections, in order: the one list every public page's header is built from.
 * `section` items are parts of the landing (scrolled to there, linked to from elsewhere); `page`
 * items are pages of their own.
 */
export type NavItem =
  | { kind: 'section'; id: string; key: string }
  | { kind: 'page'; id: 'blog' | 'research' | 'tools'; to: string; key: string };

export const SITE_NAV: NavItem[] = [
  { kind: 'section', id: 'basic', key: 'landing.navBasic' },
  { kind: 'section', id: 'pro', key: 'landing.navPro' },
  { kind: 'section', id: 'ai', key: 'landing.navAi' },
  { kind: 'section', id: 'education', key: 'landing.navEducation' },
  { kind: 'section', id: 'pricing', key: 'landing.navPricing' },
  { kind: 'page', id: 'tools', to: '/tools', key: 'landing.navTools' },
  { kind: 'page', id: 'blog', to: '/blog', key: 'landing.navBlog' },
  { kind: 'page', id: 'research', to: '/research', key: 'landing.navResearch' },
];

export type NavCurrent = 'blog' | 'research' | 'tools' | null;
