/** The engine sets this diagnostic only after certifying finite exhaustion.
 * Use the returned count, without parsing or displaying the engine's English.
 */
export function finiteSpectrumWarning(
  result: { modes: readonly unknown[]; finiteSpectrumDiagnostic?: string },
  translate: (key: string) => string,
): string {
  if (!result.finiteSpectrumDiagnostic) return '';
  const n = result.modes.length;
  return n === 1 ? translate('advanced.finiteSpectrumOne') : translate('advanced.finiteSpectrum').replace('{n}', String(n));
}

const BELOW_THRESHOLD = /Modal completeness could not be established: only (\d+) of (\d+) computed modes passed the positive-frequency threshold/;
const NOT_CERTIFIED = /could not establish convergence and Sturm completeness for (\d+) free DOFs/;

/** The engine's modal refusals, in the user's language; any other text is returned unchanged. */
export function modalFailureText(message: string, translate: (key: string) => string): string {
  const below = BELOW_THRESHOLD.exec(message);
  if (below) return translate('advanced.modalIncomplete').replace('{n}', below[1]).replace('{m}', below[2]);
  const failed = NOT_CERTIFIED.exec(message);
  if (failed) return translate('advanced.eigenFailure').replace('{n}', failed[1]);
  return message;
}
