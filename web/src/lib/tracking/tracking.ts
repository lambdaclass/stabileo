/**
 * Advertising measurement in the browser: the Meta pixel and GTM, loaded with the ids the backend
 * serves (`GET /api/v1/marketing/tracking`), and named events for each step to an account.
 *
 * A click is never named like the conversion it leads to: `SignUpClick` is the click,
 * `CompleteRegistration` the account the backend created, sent with the account's id as event id
 * so Meta counts it once against the copy the backend sends. Nothing loads for an automated
 * browser (tests, the prerender), with the accounts feature off, or with no ids saved. Inside the
 * register page's editor frame, events go to the page above, which owns the trackers.
 */
import { API_URL } from '../api/client';
import { accounts } from '../features';
import { captureVisit, readVisit } from './visit';
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

/** Starts once per page: keeps the visit, then loads whatever trackers have ids. */
export function startTracking(fetchIds: () => Promise<TrackingIds | null> = fetchTrackingIds): Promise<TrackingIds | null> {
  if (ready) return ready;
  if (automated() || !accounts() || framed()) {
    ready = Promise.resolve(null);
    return ready;
  }
  safe(() => void captureVisit());
  ready = fetchIds().then((ids) => {
    if (!ids) return null;
    safe(() => {
      if (ids.meta_pixel_id) {
        loadPixel(ids.meta_pixel_id);
        window.fbq?.('track', 'PageView');
      }
      if (ids.gtm_container_id) {
        loadGtm(ids.gtm_container_id);
        window.dataLayer?.push({ event: 'page_view', page_path: location.pathname, ...utms() });
      }
    });
    (window as unknown as Record<string, unknown>)[RELAY] = (e: Emission) => void send(e);
    return ids;
  });
  return ready;
}

function utms(): Record<string, string> {
  const visit = readVisit();
  return Object.fromEntries(Object.entries(visit).filter(([key]) => key.startsWith('utm_')));
}

async function send(e: Emission): Promise<void> {
  const ids = await (ready ?? Promise.resolve(null));
  if (!ids) return;
  safe(() => {
    if (ids.meta_pixel_id) window.fbq?.(...e.pixel);
    if (ids.gtm_container_id) window.dataLayer?.push({ ...e.gtm, ...utms() });
  });
}

function emit(e: Emission): void {
  const relay = parentRelay();
  if (relay) safe(() => relay(e));
  else void send(e);
}

/** Where on the page a sign-up click happened: `register.hero`, `gate.save`, `account_button`. */
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
  completeRegistration(accountId: string) {
    emit({ pixel: ['track', 'CompleteRegistration', {}, { eventID: accountId }], gtm: { event: 'sign_up', event_id: accountId } });
  },
  login() {
    emit({ pixel: ['trackCustom', 'Login'], gtm: { event: 'login' } });
  },
  firstSave(accountId: string) {
    const eventID = `first_save-${accountId}`;
    emit({ pixel: ['trackCustom', 'FirstSave', {}, { eventID }], gtm: { event: 'first_save', event_id: eventID } });
  },
};

export function resetTrackingForTests(): void {
  ready = null;
}
