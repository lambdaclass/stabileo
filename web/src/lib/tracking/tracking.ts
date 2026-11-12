/**
 * Inside the register page's editor frame, events go to the page above, which owns the trackers.
 * `SignUpClick` is sent only once Google answered for someone new, never for a returning person.
 */
import { API_URL } from '../api/client';
import { accounts } from '../features';
import { adConsent } from './ad-consent.svelte';
import { captureVisit, noteArrival, readVisit } from './visit';
import { loadGtm, loadPixel, safe } from './vendors';

export type TrackingIds = { meta_pixel_id: string | null; gtm_container_id: string | null };

type PixelCall = ['track' | 'trackCustom', string, Record<string, unknown>?, { eventID: string }?];
type Emission = { pixel: PixelCall; gtm: Record<string, unknown> };

const RELAY = 'stbTrackingRelay';
const TIMEOUT_MS = 3000;

let ready: Promise<TrackingIds | null> | null = null;

function automated(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

function parentRelay(): ((e: Emission) => void) | null {
  try {
    if (window.top && window.top !== window.self) {
      return ((window.top as unknown as Record<string, unknown>)[RELAY] as ((e: Emission) => void) | undefined) ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

function framed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

export async function fetchTrackingIds(fetcher: typeof fetch = fetch): Promise<TrackingIds | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(`${API_URL}/api/v1/marketing/tracking`, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: TrackingIds };
    return body.data ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let loaded = false;

export function startTracking(fetchIds: () => Promise<TrackingIds | null> = fetchTrackingIds): Promise<TrackingIds | null> {
  if (ready) return ready;
  if (automated() || !accounts() || framed()) {
    ready = Promise.resolve(null);
    return ready;
  }
  safe(() => void noteArrival());
  ready = fetchIds().then((ids) => {
    if (!ids || (!ids.meta_pixel_id && !ids.gtm_container_id)) return null;
    (window as unknown as Record<string, unknown>)[RELAY] = (e: Emission) => void send(e);
    adConsent.offer(() => load(ids));
    void import('./ad-consent-banner').then((m) => m.mountAdConsentBanner()).catch(() => {});
    return ids;
  });
  return ready;
}

function pageLocation(): string {
  return `${location.origin}${location.pathname}${location.search}`;
}

function load(ids: TrackingIds): void {
  if (loaded) return;
  loaded = true;
  safe(() => void captureVisit());
  safe(() => {
    if (ids.meta_pixel_id) {
      loadPixel(ids.meta_pixel_id);
      // The pixel reports location.href, and a shared model lives in its fragment.
      if (!sharedModel()) window.fbq?.('track', 'PageView');
    }
    if (ids.gtm_container_id) {
      loadGtm(ids.gtm_container_id);
      window.dataLayer?.push({ event: 'page_view', page_path: location.pathname, page_location: pageLocation(), ...utms() });
    }
  });
}

export async function hashedId(id: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const sharedModel = (): boolean => /^#(data=|embed=|code=)/.test(location.hash);

function utms(): Record<string, string> {
  const visit = readVisit();
  return Object.fromEntries(Object.entries(visit).filter(([key]) => key.startsWith('utm_')));
}

async function send(e: Emission): Promise<void> {
  const ids = await (ready ?? Promise.resolve(null));
  if (!ids || !loaded || !adConsent.granted) return;
  safe(() => {
    if (ids.meta_pixel_id && !sharedModel()) window.fbq?.(...e.pixel);
    if (ids.gtm_container_id) window.dataLayer?.push({ ...e.gtm, ...utms() });
  });
}

function emit(e: Emission): void {
  const relay = parentRelay();
  if (relay) safe(() => relay(e));
  else void send(e);
}

export const tracking = {
  signUpClick(placement: string) {
    emit({ pixel: ['trackCustom', 'SignUpClick', { placement }], gtm: { event: 'sign_up_click', placement } });
  },
  registrationStart(placement: string) {
    emit({ pixel: ['trackCustom', 'RegistrationStart', { placement }], gtm: { event: 'sign_up_start', placement } });
  },
  registrationStep(step: 'terms') {
    emit({ pixel: ['trackCustom', 'RegistrationStep', { step }], gtm: { event: 'sign_up_step', step } });
  },
  async completeRegistration(accountId: string) {
    const eventID = await hashedId(accountId).catch(() => null);
    if (!eventID) return;
    emit({ pixel: ['track', 'CompleteRegistration', {}, { eventID }], gtm: { event: 'sign_up', event_id: eventID } });
  },
  login() {
    emit({ pixel: ['trackCustom', 'Login'], gtm: { event: 'login' } });
  },
  async firstSave(accountId: string) {
    const hash = await hashedId(accountId).catch(() => null);
    if (!hash) return;
    const eventID = `first_save-${hash}`;
    emit({ pixel: ['trackCustom', 'FirstSave', {}, { eventID }], gtm: { event: 'first_save', event_id: eventID } });
  },
};

export function resetTrackingForTests(): void {
  ready = null;
  loaded = false;
}
