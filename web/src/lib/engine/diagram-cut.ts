import type { ElementEnvelopeDiagram } from './types';

export interface DiagramCutLocation {
  x: number;
  rebased?: { offset: number; local: DiagramCutLocation };
}

const cutBits = new DataView(new ArrayBuffer(8));

export function distanceUnits(value: number): bigint {
  cutBits.setFloat64(0, value);
  const bits = cutBits.getBigUint64(0);
  const exponent = (bits >> 52n) & 0x7ffn;
  const fraction = bits & 0xfffffffffffffn;
  const units = exponent === 0n ? fraction : (fraction | (1n << 52n)) << (exponent - 1n);
  return bits >> 63n ? -units : units;
}

export function distanceFromUnits(units: bigint, divisor = 1n): number {
  const magnitude = units < 0n ? -units : units;
  const shift = Math.max(0, (magnitude / divisor).toString(2).length - 53);
  const scale = divisor << BigInt(shift);
  const significand = magnitude / scale;
  const remainder = 2n * (magnitude % scale);
  const rounded = remainder > scale || (remainder === scale && significand % 2n !== 0n)
    ? significand + 1n : significand;
  const distance = Number(rounded) * 2 ** (shift - 1074);
  return units < 0n ? -distance : distance;
}

export function exactCutUnits(cut: DiagramCutLocation): bigint {
  return cut.rebased ? distanceUnits(cut.rebased.offset) + exactCutUnits(cut.rebased.local) : distanceUnits(cut.x);
}

export function sameCutLocation(a: DiagramCutLocation, b: DiagramCutLocation): boolean {
  return a.x === b.x && (!(a.rebased || b.rebased) || exactCutUnits(a) === exactCutUnits(b));
}

export function envelopeJumpCuts(d: ElementEnvelopeDiagram, length: number): NonNullable<ElementEnvelopeDiagram['jumpCuts']> {
  if (d.jumpCuts) return d.jumpCuts;
  return d.tPositions.flatMap((t, i, stations) => {
    if (stations[i - 1] === t || stations[i + 1] !== t || stations[i + 2] === t) return [];
    if (d.posValues[i] === d.posValues[i + 1] && d.negValues[i] === d.negValues[i + 1]) return [];
    return [{ index: i, distance: t * length }];
  });
}
