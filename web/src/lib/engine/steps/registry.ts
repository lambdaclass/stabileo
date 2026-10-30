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

export type MethodGroup = 'stiffness' | 'flexibility' | 'continuous' | 'frames' | 'trusses' | 'deformation' | 'dynamics';

export const GROUP_ORDER: MethodGroup[] = ['stiffness', 'flexibility', 'continuous', 'frames', 'trusses', 'deformation', 'dynamics'];

export interface MethodContext {
  input: SolverInput;
  pm: PlaneModel;
  /** The matrix stiffness solve of the same model, for the closing comparison (null if it does not solve). */
  ref: Reference | null;
  /** What is selected in the model: some methods work on a chosen member or node. */
  selection: { members: number[]; nodes: number[] };
  /** The method's assumptions as the reader set them (see ExplainedMethod.options); absent ones take their default. */
  options?: Record<string, boolean>;
  /** What the reader chose to compute (see ExplainedMethod.params); absent ones take their default. */
  params?: Record<string, string>;
  /** The releases chosen in the force-method wizard on this same model (`force-method/releases.ts`). */
  fundamental?: string[];
  /** The model itself, for methods that cut members or read its point masses. */
  model?: import('../solver-service').ModelData & { massSource?: { points?: import('../dynamics/mass-source').PointMass[] } };
}

/**
 * A choice the reader makes above the document, other than an assumption: a
 * list (`select`), a node of the model (`node`, empty for the selected or the
 * automatic one) or a number. `when` shows it only for some values of others.
 * Words: `<labelKey>` and `<labelKey>.help`; a select's values `<labelKey>.<value>`.
 */
export interface MethodParam {
  id: string;
  kind: 'select' | 'node' | 'number';
  labelKey: string;
  values?: string[];
  default: string;
  /** Shown only while every condition holds. */
  when?: Array<{ id: string; in: string[] }>;
}

/**
 * An assumption the reader can switch, shown as a checkbox with a ? over the
 * document: "include the axial term". Words: `steps.m.<method>.opt.<id>.label`
 * and `.help`.
 */
export interface MethodOption { id: string; default: boolean }

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
  /** Assumptions the reader can switch; the document is rebuilt when one changes. */
  options?: MethodOption[];
  /** What to compute, when the method computes one of several things. */
  params?: MethodParam[];
}

/** An option's value in a context: as set, else its default. */
export function optionOn(ctx: MethodContext, m: ExplainedMethod, id: string): boolean {
  const o = m.options?.find((x) => x.id === id);
  return ctx.options?.[id] ?? o?.default ?? false;
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
