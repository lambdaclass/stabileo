/**
 * The certificate of one analysis result on screen (modal, P-Delta, spectral, harmonic, time
 * history, plastic collapse), computed in the background (docs/verification/CERTIFY.md).
 *
 * A component makes one and tells it which result it shows (`track`). If the solve that made the
 * result noted how to certify it (`engine/certify-tags.ts`), the certificate is computed after a
 * short pause, in a worker when the pool is there, and only for the result still shown then; a
 * result with no such note leaves it idle. The result is shown first, always.
 */
import { certifyJobOf, type CertifyJob } from '../engine/certify-tags';
import { runCertifyJob, hasCertify } from '../engine/certify-jobs';
import { errorText } from '../utils/error-text';

export type BackgroundCertificate<C> =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'done'; answer: C; job: CertifyJob }
  | { status: 'failed'; reason: string };

const SETTLE_MS = 250;

export function createBackgroundCertificate<C = unknown>(settleMs = SETTLE_MS) {
  let state = $state<BackgroundCertificate<C>>({ status: 'idle' });
  let current: unknown = undefined;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    get state() { return state; },

    /** The result now on screen (null: none). Same result as before: nothing to do. */
    track(result: unknown): void {
      if (result === current) return;
      current = result;
      generation++;
      if (timer !== null) { clearTimeout(timer); timer = null; }
      const job = certifyJobOf(result);
      if (!job || !hasCertify(job.name)) { state = { status: 'idle' }; return; }
      state = { status: 'pending' };
      const gen = generation;
      timer = setTimeout(async () => {
        timer = null;
        let next: BackgroundCertificate<C>;
        try {
          next = { status: 'done', answer: (await runCertifyJob(job)) as C, job };
        } catch (e) {
          next = { status: 'failed', reason: errorText(e, 'error') };
        }
        if (gen === generation) state = next;
      }, settleMs);
    },
  };
}
