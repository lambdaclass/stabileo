/**
 * The Meta pixel and the Google Tag Manager container, loaded once with the ids the backend serves.
 * The pixel's automatic events are off (`autoConfig`, `disablePushState`): without that it reports
 * every route change and click by itself. A vendor's failure is caught here, so it can never turn
 * a sign-up into an error.
 */
type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[]; loaded?: boolean; version?: string; push?: unknown; disablePushState?: boolean };

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
    dataLayer?: Record<string, unknown>[];
  }
}

export function safe(run: () => void): void {
  try {
    run();
  } catch {
    /* a tracker never breaks the page */
  }
}

function addScript(src: string, doc: Document): void {
  const script = doc.createElement('script');
  script.async = true;
  script.src = src;
  doc.head.appendChild(script);
}

export function loadPixel(pixelId: string, win: Window = window): void {
  if (win.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.push = fbq;
  fbq.disablePushState = true;
  win.fbq = fbq;
  win._fbq = fbq;
  fbq('set', 'autoConfig', false, pixelId);
  fbq('init', pixelId);
  addScript('https://connect.facebook.net/en_US/fbevents.js', win.document);
}

export function loadGtm(containerId: string, win: Window = window): void {
  if (win.dataLayer?.some((entry) => entry['gtm.start'])) return;
  win.dataLayer = win.dataLayer ?? [];
  win.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  addScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`, win.document);
}
