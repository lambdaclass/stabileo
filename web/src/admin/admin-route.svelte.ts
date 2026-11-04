export type AdminPage = 'users' | 'settings' | 'allowlist';

export const PAGE_PATHS: Record<AdminPage, string> = {
  users: '/',
  settings: '/settings',
  allowlist: '/allowlist',
};

export const OAUTH_CALLBACK_PATH = '/oauth/callback';

function normalize(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

export function pageFromPath(pathname: string): AdminPage {
  const path = normalize(pathname);
  const found = (Object.keys(PAGE_PATHS) as AdminPage[]).find((p) => PAGE_PATHS[p] === path);
  return found ?? 'users';
}

export function isOAuthCallback(pathname: string): boolean {
  return normalize(pathname) === OAUTH_CALLBACK_PATH;
}

let path = $state(typeof location === 'undefined' ? '/' : location.pathname);

export const adminRoute = {
  get path() { return path; },
  get page() { return pageFromPath(path); },
  get isCallback() { return isOAuthCallback(path); },

  navigate(page: AdminPage): void {
    const target = PAGE_PATHS[page];
    if (normalize(path) === target && !location.search) return;
    history.pushState(null, '', target);
    path = target;
  },

  replace(url: string): void {
    history.replaceState(null, '', url);
    path = new URL(url, location.origin).pathname;
  },

  sync(): void {
    path = location.pathname;
  },
};
