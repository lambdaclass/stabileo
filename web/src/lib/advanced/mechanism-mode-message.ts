import { tp } from '../i18n';

export function mechanismModeMessage(n: number, degree?: number): string {
  if (degree === undefined) {
    return n === 1 ? tp('kinematic.mechanismDetected', { n }) : tp('kinematic.mechanismDetectedPlural', { n });
  }
  return n === 1 ? tp('kinematic.hiddenMechanism', { n, degree }) : tp('kinematic.hiddenMechanismPlural', { n, degree });
}
