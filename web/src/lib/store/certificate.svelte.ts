/**
 * The certificate of the linear static result on screen (docs/verification/CERTIFY.md): the base
 * solve, a load case, a combination or the envelope.
 *
 * Not the design-code "verification" (`verification.svelte.ts`): this is a rigorous bound on how
 * far the computed displacements and member forces can be from the exact solution of the
 * assembled system, checked in interval arithmetic by the engine and proved in Lean.
 *
 * Certifying costs a few times the solve, so it never delays the results: a published solve is
 * certified after a short pause (live-calc re-solves on every edit; only the one that stays is
 * certified), in a worker when the pool is there. Only results that carry the input they were
 * solved from can be certified: plain linear static solves (`certifiableInputOf`) and the cases
 * and combinations of one engine multi-case solve (`certifiableMultiCaseOf`); anything else
 * leaves the store idle.
 */
import { certifiableInputOf, certifiableMultiCaseOf, type CertifiableInput } from '../engine/solver-service';
import { certifyInWorker, PoolUnavailableError } from '../engine/solver-pool';
import {
  certifyLinearWire, hasCertifyExport, type LinearCertificate, type LinearCertificateOnly,
  type ForceBound2D, type ForceBound3D, type ShellBound, type MultiCaseCertificate, type CombinationCertificate,
  type StationBound2D, type StationBound3D,
} from '../engine/wasm-solver';
import { runCertify, hasCertify } from '../engine/certify-jobs';
import { errorText } from '../utils/error-text';
import { resultsStore } from './results.svelte';

export { formatBound } from '../utils/certificate-format';

type Dim = '2d' | '3d';
type ForceBound = ForceBound2D | ForceBound3D;

/**
 * A certificate as the results panel reads it. `relBound` (relative to the computed
 * displacements) exists for a single solve only; a combination's bound is absolute.
 */
export type ShownCertificate =
  | { status: 'certified'; absBound: number; relBound: number | null }
  | { status: 'uncertified'; reason: string };

/** What is on screen: the base solve, one load case, one combination or the envelope. */
export type CertificateScope = 'single' | 'case' | 'combo' | 'envelope';

interface Certified {
  certificate: ShownCertificate;
  forceBounds: Map<number, ForceBound>;
  /** Shells (3D base solve only), keyed `kind:id`. */
  shellBounds: Map<string, ShellBound>;
  /** A combination's bound at every diagram station of each member (design checks read it). */
  stationBounds?: Map<number, StationBound2D | StationBound3D>;
}

export type CertificateState =
  | { status: 'idle' }
  | { status: 'pending'; dim: Dim; scope?: CertificateScope }
  | ({ status: 'done'; dim: Dim; scope?: CertificateScope } & Certified);

type MultiState =
  | { status: 'idle' }
  | { status: 'pending'; dim: Dim }
  | { status: 'done'; dim: Dim; cases: Map<number, Certified>; combos: Map<number, Certified>; envelope: Certified | null };

const SETTLE_MS = 250;
const MULTI_EXPORT = { '2d': 'certify_multi_case_2d', '3d': 'certify_multi_case_3d' } as const;
const BUNDLE_EXPORT = { '2d': 'export_linear_bundle_2d', '3d': 'export_linear_bundle_3d' } as const;

const shellKey = (kind: string, id: number) => `${kind}:${id}`;

function fromLinear(out: LinearCertificateOnly): Certified {
  return {
    certificate: out.certificate,
    forceBounds: new Map((out.forceBounds ?? []).map((b) => [b.elementId, b])),
    shellBounds: new Map((out.shellBounds ?? []).map((b) => [shellKey(b.kind, b.elementId), b])),
  };
}

function fromCombination(c: CombinationCertificate<ForceBound, StationBound2D | StationBound3D>): Certified {
  const certificate: ShownCertificate = c.certified && c.dispAbsBound !== null && Number.isFinite(c.dispAbsBound)
    ? { status: 'certified', absBound: c.dispAbsBound, relBound: null }
    : { status: 'uncertified', reason: c.reason ?? 'not certified' };
  return {
    certificate,
    forceBounds: new Map((c.forceBounds ?? []).map((b) => [b.elementId, b])),
    shellBounds: new Map(),
    stationBounds: certificate.status === 'certified' ? new Map((c.stationBounds ?? []).map((b) => [b.elementId, b])) : new Map(),
  };
}

function failed(reason: string): Certified {
  return { certificate: { status: 'uncertified', reason }, forceBounds: new Map(), shellBounds: new Map() };
}

function createCertificateStore() {
  let state = $state<CertificateState>({ status: 'idle' });
  let multi = $state<MultiState>({ status: 'idle' });
  /** The input of the certified base solve: the certificate bundle is exported from it. */
  let linearInput: CertifiableInput | null = null;
  let generation = 0;
  let multiGeneration = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let multiTimer: ReturnType<typeof setTimeout> | null = null;

  async function run(gen: number, dim: Dim, input: CertifiableInput): Promise<void> {
    let out: Certified;
    try {
      let raw: LinearCertificateOnly;
      try {
        raw = await certifyInWorker(dim, input.wire());
      } catch (e) {
        if (!(e instanceof PoolUnavailableError)) throw e;
        raw = certifyLinearWire(dim, input.wire());
      }
      out = fromLinear(raw);
    } catch (e) {
      out = failed(errorText(e, 'error'));
    }
    if (gen !== generation) return; // superseded by a newer solve or a clear
    state = { status: 'done', dim, ...out };
  }

  async function runMulti(gen: number, dim: Dim, found: NonNullable<ReturnType<typeof certifiableMultiCaseOf>>): Promise<void> {
    let next: MultiState;
    try {
      const out: MultiCaseCertificate<ForceBound> = await runCertify(MULTI_EXPORT[dim], [found.input.wire()]);
      const caseByName = new Map(out.cases.map((c) => [c.name, c]));
      const comboByName = new Map(out.combinations.map((c) => [c.name, c]));
      const cases = new Map<number, Certified>();
      for (const id of found.cases) {
        const c = caseByName.get(found.input.caseNames.get(id) ?? '');
        if (c) cases.set(id, fromLinear({ certificate: c.certificate, forceBounds: c.forceBounds }));
      }
      const combos = new Map<number, Certified>();
      for (const id of found.combos) {
        const c = comboByName.get(found.input.comboNames.get(id) ?? '');
        if (c) combos.set(id, fromCombination(c));
      }
      next = { status: 'done', dim, cases, combos, envelope: found.envelope ? fromCombination(out.envelope) : null };
    } catch (e) {
      const reason = failed(errorText(e, 'error'));
      next = {
        status: 'done', dim,
        cases: new Map([...found.cases].map((id) => [id, reason])),
        combos: new Map([...found.combos].map((id) => [id, reason])),
        envelope: found.envelope ? reason : null,
      };
    }
    if (gen !== multiGeneration) return;
    multi = next;
  }

  function multiShown(dim: Dim, pick: (m: Extract<MultiState, { status: 'done' }>) => Certified | null | undefined, scope: CertificateScope): CertificateState {
    if (multi.status === 'idle' || multi.dim !== dim) return { status: 'idle' };
    if (multi.status === 'pending') return { status: 'pending', dim, scope };
    const c = pick(multi);
    return c ? { status: 'done', dim, scope, ...c } : { status: 'idle' };
  }

  return {
    get state() { return state; },
    get multiState() { return multi; },

    /** A base static solve was published (or, with null, the results were cleared). */
    track(results: object | null, dim: Dim): void {
      generation++;
      if (timer !== null) { clearTimeout(timer); timer = null; }
      if (!results) {
        multiGeneration++;
        if (multiTimer !== null) { clearTimeout(multiTimer); multiTimer = null; }
        if (multi.status !== 'idle' && multi.dim === dim) multi = { status: 'idle' };
      }
      const input = results ? certifiableInputOf(results) : null;
      linearInput = null;
      if (!input || input.dim !== dim || !hasCertifyExport()) { state = { status: 'idle' }; return; }
      linearInput = input;
      state = { status: 'pending', dim };
      const gen = generation;
      timer = setTimeout(() => { timer = null; void run(gen, dim, input); }, SETTLE_MS);
    },

    /** A combination bundle was published: certify its cases, combinations and envelope. */
    trackCombinations(perCase: Map<number, object>, perCombo: Map<number, object>, dim: Dim): void {
      multiGeneration++;
      if (multiTimer !== null) { clearTimeout(multiTimer); multiTimer = null; }
      const found = certifiableMultiCaseOf(perCase, perCombo);
      if (!found || found.input.dim !== dim || !hasCertify(MULTI_EXPORT[dim])) { multi = { status: 'idle' }; return; }
      multi = { status: 'pending', dim };
      const gen = multiGeneration;
      multiTimer = setTimeout(() => { multiTimer = null; void runMulti(gen, dim, found); }, SETTLE_MS);
    },

    /**
     * The certificate of the results on screen in the workspace's dimension: the base solve, the
     * load case, the combination or the envelope being viewed. Idle when there is none.
     */
    shown(is3D: boolean): CertificateState {
      const dim: Dim = is3D ? '3d' : '2d';
      const onScreen = is3D ? resultsStore.results3D : resultsStore.results;
      if (!onScreen) return { status: 'idle' };
      const view = resultsStore.activeView;
      const caseId = resultsStore.activeCaseId;
      const comboId = resultsStore.activeComboId;
      if (view === 'envelope') return multiShown(dim, (m) => m.envelope, 'envelope');
      if (view === 'combo') return comboId === null ? { status: 'idle' } : multiShown(dim, (m) => m.combos.get(comboId), 'combo');
      if (caseId !== null) return multiShown(dim, (m) => m.cases.get(caseId), 'case');
      if (state.status === 'idle' || state.dim !== dim) return { status: 'idle' };
      return { ...state, scope: 'single' };
    },

    /** The force bounds of one member of the results on screen, when certified. */
    forceBound<B extends ForceBound>(is3D: boolean, elementId: number): B | null {
      const s = this.shown(is3D);
      return s.status === 'done' ? (s.forceBounds.get(elementId) as B | undefined) ?? null : null;
    },

    /** The bounds on one shell's stress resultants on screen (3D base solve), when certified. */
    shellBound(kind: ShellBound['kind'], elementId: number): ShellBound | null {
      const s = this.shown(true);
      return s.status === 'done' ? s.shellBounds.get(shellKey(kind, elementId)) ?? null : null;
    },

    /**
     * The certified station bound of one member in one published combination (3D: what the design
     * checks read), whatever is on screen. Null while pending, or when that combination, or the
     * member in it, is not certified.
     */
    comboStationBound3D(comboId: number, elementId: number): StationBound3D | null {
      const dim: Dim = '3d';
      if (multi.status !== 'done' || multi.dim !== dim) return null;
      return (multi.combos.get(comboId)?.stationBounds?.get(elementId) as StationBound3D | undefined) ?? null;
    },

    /** Whether the base solve on screen can be exported as a certificate bundle. */
    canExportBundle(is3D: boolean): boolean {
      const s = this.shown(is3D);
      return s.status === 'done' && s.scope === 'single' && linearInput !== null && hasCertify(BUNDLE_EXPORT[linearInput.dim]);
    },

    /**
     * The certificate bundle of the base solve on screen (`stabileo.linear-certificate.v2` JSON, with the
     * provenance of the solve: SHA-256 of the canonical input, engine version and commit),
     * which `lake exe certcheck` re-checks without trusting the engine. Null when there is none.
     */
    async exportBundle(is3D: boolean): Promise<string | null> {
      const input = linearInput;
      if (!input || !this.canExportBundle(is3D)) return null;
      return runCertify(BUNDLE_EXPORT[input.dim], [JSON.stringify(input.wire())]);
    },
  };
}

export const certificateStore = createCertificateStore();

export type { LinearCertificate };
