export type ForceMethodErrorKey =
  | 'hypostatic' | 'noRedundants' | 'unstable' | 'tooHyperstatic'
  | 'count' | 'clash' | 'partialCut' | 'hingeAll' | 'singular' | 'nothing';

export interface ForceMethodErrorDetail {
  /** Releases chosen, against GH (`count`). */
  chosen?: number;
  /** Nodes that move in the mechanism (`unstable`), or where a release adds nothing (`hingeAll`). */
  nodes?: number[];
  /** Frame members meeting at that node (`hingeAll`). */
  k?: number;
  /** Member and end of an unsupported set of cuts (`partialCut`). */
  elementId?: number;
  end?: 'I' | 'J';
  /** 1-based indices of the redundants the system cannot determine (`singular`). */
  which?: number[];
}

export class ForceMethodError extends Error {
  /** `dofs`: for an unstable structure, the DOFs its mechanism moves; `gh` when it is too hyperstatic or the count is wrong. */
  constructor(
    public key: ForceMethodErrorKey,
    public dofs: string[] = [], public gh = 0, public detail: ForceMethodErrorDetail = {},
  ) { super(key); }
}
