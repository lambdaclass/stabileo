const VIRIDIS = ['#440154', '#472c7a', '#3b518b', '#2c718e', '#21908d', '#27ad81', '#5cc863', '#aadc32', '#fde725'];
const DIVERGING = ['#2c6cb4', '#6e98c8', '#a9bfd6', '#5b6b78', '#d9a08f', '#e3744f', '#e5482a'];

function mix(stops: string[], t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const [a, b] = [stops[i], stops[i + 1]].map(hex => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16)));
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(' ')})`;
}

/** Viridis over [min, max] for magnitudes; for signed values, blue compression to vermillion tension, symmetric about zero. */
export function fieldColour(signed: boolean, v: number, min: number, max: number): string {
  if (signed) {
    const m = Math.max(Math.abs(min), Math.abs(max)) || 1;
    return mix(DIVERGING, 0.5 + v / (2 * m));
  }
  return mix(VIRIDIS, max > min ? (v - min) / (max - min) : 0.5);
}

export const SEQUENTIAL_STOPS = VIRIDIS;
export const DIVERGING_STOPS = DIVERGING;
