/**
 * The application's three modes and their addresses: `/app/basic`, `/app/education`,
 * `/app/pro`. App.svelte switches between them; Root.svelte enters the application at the one a
 * public page opens.
 */
export type AppMode = 'basico' | 'educativo' | 'pro';

export function modeToPath(mode: AppMode): string {
  if (mode === 'educativo') return '/app/education';
  if (mode === 'pro') return '/app/pro';
  return '/app/basic';
}

/** The mode an address names; anything else is Basic. */
export function pathToMode(pathname: string): AppMode {
  if (pathname === '/app/pro' || pathname === '/app/pro/') return 'pro';
  if (pathname === '/app/education' || pathname === '/app/education/') return 'educativo';
  return 'basico';
}

/** A tab's name as it goes in the address (`?tab=`): lowercase ASCII words joined by hyphens. */
export function slugifyTabName(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'new-structure';
}
