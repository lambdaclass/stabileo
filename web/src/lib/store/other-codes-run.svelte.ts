/**
 * The last independent check under another code, kept while the session lasts.
 *
 * It was component state of `ProOtherCodesPanel`, so leaving the panel (another place of design,
 * another stage) threw the run away and coming back showed the empty form with nothing said. The
 * run stays here instead, with the results it was made from: on return the table is there, and
 * when those results have moved on the panel says so (`otherCodes.stale`) rather than showing
 * numbers for a model that changed. Like the check itself it is not saved with the project: this
 * mode stores nothing, the equivalences and the design for the report do (`foreign-design.ts`).
 * A new project or another project tab starts without one (`reset`).
 */
import type { OtherCodeId, OtherCodeRun } from '../engine/design/other-codes';
import type { MemberContext } from '../engine/design/other-codes/types';

function createOtherCodesRun() {
  let codeId = $state<OtherCodeId>('aisc360');
  let source = $state<'linear' | 'direct'>('linear');
  let run = $state<OtherCodeRun | null>(null);
  /** The results object the run read (linear per-combination forces, or the direct analysis). */
  let runOf = $state<unknown>(null);
  let ranDirect = $state(false);
  let missing = $state<number[]>([]);
  let failed = $state(false);
  /** Why the check could not run: "engine not available", or the engine's own message. */
  let failure = $state<{ key: string; message: string } | null>(null);
  /** Not reactive: what the certified pass re-reads, never drawn. */
  let contexts: MemberContext[] = [];

  return {
    get codeId() { return codeId; }, set codeId(v: OtherCodeId) { codeId = v; },
    get source() { return source; }, set source(v: 'linear' | 'direct') { source = v; },
    get run() { return run; },
    get runOf() { return runOf; },
    get ranDirect() { return ranDirect; },
    get missing() { return missing; },
    get failed() { return failed; },
    get failure() { return failure; },
    get contexts() { return contexts; },
    /** Keep a finished run, with what it read. */
    record(r: { run: OtherCodeRun; runOf: unknown; ranDirect: boolean; missing: number[]; contexts: MemberContext[] }) {
      run = r.run; runOf = r.runOf; ranDirect = r.ranDirect; missing = r.missing; contexts = r.contexts; failed = false; failure = null;
    },
    /** The engine could not run the check, and why. */
    fail(why: { key: string; message: string }) { run = null; failed = true; failure = why; },
    /** Another code chosen: the run was under the previous one. */
    drop() { run = null; failed = false; failure = null; },
    reset() {
      codeId = 'aisc360'; source = 'linear'; run = null; runOf = null; ranDirect = false; missing = []; failed = false; failure = null; contexts = [];
    },
  };
}

export const otherCodesRun = createOtherCodesRun();
