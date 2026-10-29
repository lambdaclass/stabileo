/**
 * Links that leave the app (release notes, documentation, contact) open in the system browser.
 *
 * The webview would otherwise do nothing with a `target="_blank"` link, or navigate the app's own
 * window away from the application. Only https addresses go out, through the opener plugin, whose
 * scope (`desktop/src-tauri/capabilities/default.json`) allows https and nothing else.
 */
import { openUrl } from '@tauri-apps/plugin-opener';

/** The https address `href` points to outside the app, or null. */
export function externalHttps(href: string, base = location.href): string | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.origin === new URL(base).origin) return null;
  return url.href;
}

function local(href: string): boolean {
  try {
    const url = new URL(href, location.href);
    return url.origin === location.origin && url.protocol === location.protocol;
  } catch { return false; }
}

function open(url: string): void {
  void openUrl(url).catch((err) => console.warn('[stabileo] open link:', err));
}

let installed = false;

export function routeExternalLinks(): void {
  if (installed) return;
  installed = true;

  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button > 1) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const raw = a.getAttribute('href') ?? '';
      const url = externalHttps(raw);
      if (url) {
        e.preventDefault();
        open(url);
      } else if (!local(raw)) {
        // http and mailto: neither navigate the app away nor leave through the opener.
        e.preventDefault();
      }
    },
    true,
  );
  // Middle click opens a "new window" in some webviews.
  document.addEventListener('auxclick', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href]');
    if (a) e.preventDefault();
  }, true);

  // window.open(url) to an outside address; blank windows (printable reports) keep the webview's own.
  const nativeOpen = window.open.bind(window);
  window.open = (url?: string | URL, target?: string, features?: string): Window | null => {
    const href = url === undefined ? '' : String(url);
    const ext = href ? externalHttps(href) : null;
    if (ext) {
      open(ext);
      return null;
    }
    if (href && !local(href)) return null;
    return nativeOpen(url, target, features);
  };
}
