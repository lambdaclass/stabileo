import { mount } from 'svelte';
import AdConsentBanner from './AdConsentBanner.svelte';

let mounted = false;

export function mountAdConsentBanner(doc: Document = document): void {
  if (mounted || !doc.body) return;
  mounted = true;
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  mount(AdConsentBanner, { target: host });
}
