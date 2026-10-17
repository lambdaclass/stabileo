/**
 * Run a certify export (docs/verification/CERTIFY.md) off the main thread when it can be: in an
 * idle worker of the solver pool, else here. Certifying re-solves and checks in interval
 * arithmetic, a few times the cost of the solve, so callers start it after the result is shown
 * (`store/analysis-certificate.svelte.ts`, `store/certificate.svelte.ts`).
 */
import { certifyCallInWorker, PoolUnavailableError } from './solver-pool';
import { callCertify, hasCertify } from './wasm-solver';
import type { CertifyJob } from './certify-tags';

export { hasCertify };

/** The parsed answer of `name(...args)` (a bundle export's text as it is). */
export async function runCertify(name: string, args: unknown[]): Promise<any> {
  try {
    return await certifyCallInWorker(name, args);
  } catch (e) {
    if (!(e instanceof PoolUnavailableError)) throw e;
    return callCertify(name, args);
  }
}

/** Run a job a solve noted (`certify-tags.ts`). */
export function runCertifyJob(job: CertifyJob): Promise<any> {
  return runCertify(job.name, job.args);
}
