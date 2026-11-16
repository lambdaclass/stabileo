import { adConsent } from './ad-consent.svelte';

export function pixelCookies(doc: Pick<Document, 'cookie'> = document, search = location.search, now = Date.now()): { fbp?: string; fbc?: string } {
  const cookie = (name: string) => doc.cookie.split('; ').find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
  const fbp = cookie('_fbp');
  const fbclid = new URLSearchParams(search).get('fbclid');
  const fbc = cookie('_fbc') ?? (fbclid ? `fb.1.${now}.${fbclid}` : undefined);
  return { ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}) };
}

/** Empty without advertising consent: the backend sends Meta nothing for an attribution without `consent`. */
export function adAttribution(): Record<string, unknown> {
  return adConsent.granted ? { consent: true, ...pixelCookies() } : {};
}
