/**
 * The force-method wizard's choices: which releases make the primary
 * structure (none: the method chooses) and whether frame members' axial term
 * enters the coefficients. They hold for the model they were made on; once
 * the model changes they are dropped and the method chooses again.
 */
import type { ForceMethodOptions } from '../engine/force-method/solve';

export interface FmChoiceError { key: string; params: Record<string, string | number>; nodes: number[] }

let mode = $state<'auto' | 'manual'>('auto');
let draft = $state<string[]>([]);
let applied = $state<string[] | null>(null);
let axial = $state(true);
let version = $state(-1);
let error = $state<FmChoiceError | null>(null);

export const fmChoice = {
  get mode() { return mode; },
  get draft() { return draft; },
  get applied() { return applied; },
  get axial() { return axial; },
  get error() { return error; },

  /** The solver options for the model at `modelVersion`; a choice made on another model is dropped. */
  optionsFor(modelVersion: number): ForceMethodOptions {
    if (version !== modelVersion) this.reset(modelVersion);
    return { axial, ...(applied ? { releases: [...applied] } : {}) };
  },
  /** The releases chosen on the model at `modelVersion`, without touching the choice (safe to read anywhere). */
  releasesFor(modelVersion: number): string[] | undefined {
    return version === modelVersion && applied ? [...applied] : undefined;
  },
  reset(modelVersion: number): void {
    mode = 'auto'; draft = []; applied = null; error = null; version = modelVersion;
  },
  setMode(m: 'auto' | 'manual'): void {
    mode = m;
    error = null;
    if (m === 'manual' && draft.length === 0 && applied) draft = [...applied];
  },
  toggle(key: string): void {
    draft = draft.includes(key) ? draft.filter((k) => k !== key) : [...draft, key];
    error = null;
  },
  clearDraft(): void { draft = []; error = null; },
  setAxial(on: boolean): void { axial = on; },
  /** The result now on screen was solved with these releases (null: the method's own). */
  solvedWith(releases: string[] | null, modelVersion: number): void {
    applied = releases ? [...releases] : null;
    version = modelVersion;
    error = null;
  },
  fail(e: FmChoiceError): void { error = e; },
};
