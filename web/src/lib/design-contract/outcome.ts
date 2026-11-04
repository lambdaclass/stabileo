/**
 * What design says about one element, in one shape for every family and every code.
 *
 * Concrete has its own richer outcome (`engine/design/outcome.ts`, with the search and the
 * certificate); steel, connections and the other codes had none. This is the common reading a
 * surface needs: the status, the governing check, every check, and what was not checked.
 */
import type { CheckRow, Notice } from './check-row';
import type { DesignStatus } from './status';

export type DesignFamilyKind =
  | 'beam' | 'column' | 'wall' | 'slab' | 'footing' | 'steelMember' | 'joint' | (string & {});

export interface ElementOutcome {
  elementId: number;
  family: DesignFamilyKind;
  /** Regulation id and edition the checks are under. */
  code: string;
  edition?: string;
  status: DesignStatus;
  /** Worst ratio over the checks that are ratios; null when none is. */
  utilization: number | null;
  governing?: CheckRow;
  checks: CheckRow[];
  notices: Notice[];
}
