/**
 * The "Explained step by step" catalog: every method, the group it is listed
 * under, what the model must be for it, the example that shows it, and the
 * function that writes its document.
 *
 * Words follow one pattern per method id, so the catalog needs no table of
 * its own: `steps.m.<id>.title`, `.help` (what it does and how), `.requires`
 * ("to try it the structure must be …").
 *
 * The stiffness and flexibility methods keep their own interactive wizards
 * (`wizard`); every other method writes a StepDoc read by the one viewer.
 */
import type { SolverInput } from '../types';
import type { Applicability, StepDoc } from './doc';
import type { PlaneModel } from './plane-model';
import type { Reference } from './reference';

export type MethodGroup = 'stiffness' | 'flexibility' | 'continuous' | 'frames' | 'trusses' | 'deformation';

export const GROUP_ORDER: MethodGroup[] = ['stiffness', 'flexibility', 'continuous', 'frames', 'trusses', 'deformation'];

export interface MethodContext {
  input: SolverInput;
  pm: PlaneModel;
  /** The matrix stiffness solve of the same model, for the closing comparison (null if it does not solve). */
  ref: Reference | null;
  /** What is selected in the model: some methods work on a chosen member or node. */
  selection: { members: number[]; nodes: number[] };
}

export interface ExplainedMethod {
  id: string;
  group: MethodGroup;
  /** The example (fixture id) that satisfies the requirements. */
  example: string;
  applies(ctx: MethodContext): Applicability;
  /** Writes the document; only called when `applies` is ok. */
  build?(ctx: MethodContext): StepDoc;
  /** The stiffness and flexibility methods open their own wizard instead. */
  wizard?: 'dsm' | 'fm';
}

const methods: ExplainedMethod[] = [];

/** Methods register themselves from methods/index.ts. */
export function registerMethods(list: ExplainedMethod[]): void {
  for (const m of list) {
    const at = methods.findIndex((x) => x.id === m.id);
    if (at >= 0) methods[at] = m; else methods.push(m);
  }
}

export function allMethods(): readonly ExplainedMethod[] { return methods; }
export function methodsIn(group: MethodGroup): ExplainedMethod[] { return methods.filter((m) => m.group === group); }
export function methodById(id: string): ExplainedMethod | undefined { return methods.find((m) => m.id === id); }
