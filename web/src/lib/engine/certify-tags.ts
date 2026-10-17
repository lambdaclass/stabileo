/**
 * Which engine call certifies a result (docs/verification/CERTIFY.md), keyed by the result.
 *
 * An analysis is solved, shown, and only then certified, in the background: certifying costs a
 * few times the solve and must never hold the result back. So the solve wrapper notes, beside the
 * result it returns, the certify export and the exact arguments it sent the engine; whoever shows
 * the result later asks for that job (`certify-jobs.ts`). A result built from something else
 * (copied, recombined, edited) has no job and is simply not certified. The result stores, which
 * copy what they publish, carry the job along (`carryCertifyJob`).
 *
 * No imports: the solver worker and the stores both read it.
 */

/** A call to one of the engine's `certify_*` exports with its arguments, as the solve sent them. */
export interface CertifyJob {
  /** The wasm export, e.g. `certify_modal_3d`. */
  name: string;
  args: unknown[];
  /** What the caller needs to read the certificate against what it shows (e.g. the plastic λ). */
  meta?: Record<string, unknown>;
}

/*
 * Kept on the result itself, under a symbol, non-enumerable: a `$state` proxy of the result (the
 * stores and components keep results in state) reads it through, while a spread copy, JSON and
 * structured cloning leave it behind, as they should (a copy may be edited).
 */
const JOB = Symbol('certifyJob');

/** Note the job that certifies `result`. Returns `result`. */
export function tagCertifyJob<R>(result: R, job: CertifyJob): R {
  if (result && typeof result === 'object') {
    try {
      Object.defineProperty(result, JOB, { value: job, enumerable: false, writable: false, configurable: true });
    } catch {
      // A frozen result is simply not certified.
    }
  }
  return result;
}

/** The job that certifies `result`, or null when it was not produced by a certifiable solve. */
export function certifyJobOf(result: unknown): CertifyJob | null {
  return result && typeof result === 'object' ? ((result as Record<symbol, CertifyJob | undefined>)[JOB] ?? null) : null;
}

/** `to` describes the same solve as `from` (a copy a store made of it): give it the same job. */
export function carryCertifyJob<R>(from: unknown, to: R): R {
  const job = certifyJobOf(from);
  return job ? tagCertifyJob(to, job) : to;
}
