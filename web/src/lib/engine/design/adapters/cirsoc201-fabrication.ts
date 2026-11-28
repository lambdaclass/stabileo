import { minMandrelDiameter } from '../../../codes/cirsoc201/bar-geometry';
export { longerSheetCompressionLap } from '../../../codes/cirsoc201/anchorage';

export function scheduleMandrelMm(diameterMm: number, transverse: boolean): number {
  const role = transverse && diameterMm <= 25 ? 'transverse' : 'longitudinal';
  return 1000 * minMandrelDiameter(diameterMm, role).value;
}
