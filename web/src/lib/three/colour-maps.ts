/**
 * Colour maps for scalar fields. `shell` is the app's plate/shell contour ramp. `sequential` is
 * viridis (perceptually uniform, readable with colour-vision deficiencies) for magnitudes such as
 * damage; `diverging` runs from compression blue through a neutral to tension vermillion,
 * symmetric about zero, for signed values such as axial force (Crameri et al. 2020).
 */
import * as THREE from 'three';
import { shellContourColor } from './shell-contour-colour';

export type ColourMap = 'shell' | 'sequential' | 'diverging';

const VIRIDIS = ['#440154', '#472c7a', '#3b518b', '#2c718e', '#21908d', '#27ad81', '#5cc863', '#aadc32', '#fde725'];
const DIVERGING = ['#2c6cb4', '#6e98c8', '#a9bfd6', '#5b6b78', '#d9a08f', '#e3744f', '#e5482a'];

function ramp(stops: string[], t: number): number {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const a = new THREE.Color(stops[i]);
  const b = new THREE.Color(stops[i + 1]);
  return a.lerp(b, x - i).getHex();
}

/** The colour of value `v` on `map` over [min, max] (diverging: symmetric about zero). */
export function colourFor(map: ColourMap, v: number, min: number, max: number): number {
  if (map === 'shell') return shellContourColor(v, min, max);
  if (map === 'sequential') return ramp(VIRIDIS, max > min ? (v - min) / (max - min) : 0.5);
  const m = Math.max(Math.abs(min), Math.abs(max)) || 1;
  return ramp(DIVERGING, 0.5 + v / (2 * m));
}
