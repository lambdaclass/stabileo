/** The pixel's cookies the backend sends Meta with a conversion, read here because the Google window does not carry them. */
export function pixelCookies(doc: Pick<Document, 'cookie'> = document, search = location.search, now = Date.now()): { fbp?: string; fbc?: string } {
  const cookie = (name: string) => doc.cookie.split('; ').find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
  const fbp = cookie('_fbp');
  const fbclid = new URLSearchParams(search).get('fbclid');
  const fbc = cookie('_fbc') ?? (fbclid ? `fb.1.${now}.${fbclid}` : undefined);
  return { ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}) };
}
