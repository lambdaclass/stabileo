/** Where the product app lives, for links from the admin site to its public pages. */
export function productUrl(): string {
  const configured = import.meta.env.VITE_PRODUCT_URL as string | undefined;
  if (configured) return configured.replace(/\/+$/, '');
  const { protocol, hostname, port } = location;
  if (hostname.startsWith('admin.')) return `${protocol}//${hostname.slice('admin.'.length)}`;
  const productPort = port ? String(Number(port) - 1) : '';
  return `${protocol}//${hostname}${productPort ? `:${productPort}` : ''}`;
}
