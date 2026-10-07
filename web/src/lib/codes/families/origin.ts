/**
 * The code-neutral words the model keeps about generated cases and combinations: what an action
 * is, and which code wrote a combination. Apart from the modules' interfaces (`load-codes.ts`),
 * so the model and the results read them without importing the generator.
 *
 * Types only.
 */

/** What an action is, whatever a code calls it: what a combination rule and a design module read. */
export type ActionCategory =
  | 'permanent' | 'imposed' | 'roofImposed' | 'wind' | 'serviceWind' | 'snow' | 'rain'
  | 'seismic' | 'thermal' | 'earthPressure' | 'fluid' | 'accidental' | 'other'
  | 'notional' | 'crane' | 'traffic' | 'mass' | 'ice';

export type CodeFamilyId = 'cirsoc' | 'eurocode' | 'aci-aisc' | 'other' | (string & {});

/** Where a generated combination came from: what a design module reads to know it is its own. */
export interface CombinationOrigin {
  /** The adapter of the basis role that wrote it. */
  code: string;
  family: CodeFamilyId;
  edition: string;
  /** The rule within the code, as it prints it (`2.3.2-2`), or the project's rule's id. */
  rule: string;
  purpose: 'strength' | 'service';
  /**
   * Its factors were edited by hand: the user's now, which "replace generated loads" keeps
   * (`store/apply-load-plan.ts`). The rest still says where it came from and what it is for.
   */
  edited?: true;
}
