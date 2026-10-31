/** The engine sets this diagnostic only after certifying finite exhaustion.
 * Use the returned count, without parsing or displaying the engine's English.
 */
export function finiteSpectrumWarning(
  result: { modes: readonly unknown[]; finiteSpectrumDiagnostic?: string },
  translate: (key: string) => string,
): string {
  return result.finiteSpectrumDiagnostic
    ? translate('advanced.finiteSpectrum').replace('{n}', String(result.modes.length))
    : '';
}
