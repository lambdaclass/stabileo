import { rs } from '../i18n';

export function forceScale(strain: number) {
  return strain ? 1 / strain : 1;
}

export function forceLegend(strain: number) {
  if (strain < 0) return rs().springsCompressionLegend;
  if (strain > 0) return rs().springsTensionLegend;
  return rs().springsZeroLegend;
}
