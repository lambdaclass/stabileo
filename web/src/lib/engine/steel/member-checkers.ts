/**
 * Which regulation checks a metallic member, by its section: CIRSOC 301-2018 the hot-rolled and
 * welded ones, CIRSOC 303-2009 the cold-formed ones (Chapter A of 301 sends them there by name).
 * 303 is registered and not implemented: the interface is ready for it, and until it is, a
 * cold-formed member is reported not designed, with the reason, and never checked by 301.
 */
import { isColdFormedSection } from '../../profiles/cold-formed-catalogue';

export interface SteelMemberChecker {
  code: string;
  edition: string;
  /** Whether this regulation is the one for the section. */
  covers(section: { name?: string; profileFamily?: string } | undefined): boolean;
  implemented: boolean;
  /** Why it does not run, when it is not implemented. */
  reasonKey?: string;
}

export const STEEL_MEMBER_CHECKERS: readonly SteelMemberChecker[] = [
  { code: 'cirsoc-303', edition: '2009', covers: (s) => isColdFormedSection(s), implemented: false, reasonKey: 'steel.checker.coldFormedNotImplemented' },
  { code: 'cirsoc-301', edition: '2018', covers: () => true, implemented: true },
];

/** The checker for a section: the first that covers it. */
export const steelCheckerFor = (section: { name?: string; profileFamily?: string } | undefined): SteelMemberChecker =>
  STEEL_MEMBER_CHECKERS.find((c) => c.covers(section))!;
