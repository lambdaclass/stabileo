import { msg } from '../../codes/message';

export const MODAL_SEISMIC_UNAVAILABLE = 'loadPlan.blocked.modalUnavailable';
export const MODAL_SEISMIC_ISSUE_URL = 'https://github.com/lambdaclass/stabileo/issues/2319';

export function modalSeismicRefusal(seismic: { enabled: boolean; method?: string; modal?: unknown } | undefined) {
  return seismic?.enabled && (seismic.method === 'modal' || seismic.modal !== undefined)
    ? msg(MODAL_SEISMIC_UNAVAILABLE)
    : undefined;
}

export function hasModalSeismicDerivation(derivation: readonly { key?: string }[] | undefined): boolean {
  return Array.isArray(derivation) && derivation.some(row => row?.key === 'loadPlan.derivation.modal');
}
