/**
 * Reading the analyses' certificates (`certificate-types.ts`) against what the app shows:
 * which enclosure belongs to a mode on screen, the frequencies they bound, whether the plastic
 * collapse factor shown lies in the certified enclosure. Every derived bound is widened by a few
 * ulps for the f64 arithmetic that derives it, so it stays a bound.
 */
import type { ModalCertificate, ModeEnclosure, PlasticCertificate } from './certificate-types';

const TWO_PI = 2 * Math.PI;
/** Relative widening for the few f64 operations a derived bound goes through. */
const SLACK = 8 * Number.EPSILON;

const down = (x: number) => x * (1 - SLACK);
const up = (x: number) => x * (1 + SLACK);

/** The frequency (Hz) interval an ω² enclosure gives; `hi` null when ω² is unbounded above. */
export function frequencyInterval(e: ModeEnclosure): { lo: number; hi: number | null } {
  const lo = e.omega2Lower > 0 ? down(Math.sqrt(e.omega2Lower) / TWO_PI) : 0;
  const hi = e.omega2Upper === null || !Number.isFinite(e.omega2Upper) ? null : up(Math.sqrt(Math.max(0, e.omega2Upper)) / TWO_PI);
  return { lo, hi };
}

/**
 * The enclosure of the engine mode whose computed frequency is `frequencyHz` (the app may drop or
 * reorder modes, so they are matched by value, not by index). Null when none matches.
 */
export function modeEnclosureOf(cert: ModalCertificate | null | undefined, frequencyHz: number): ModeEnclosure | null {
  if (!cert || cert.status !== 'certified' || !(frequencyHz > 0)) return null;
  const w2 = (TWO_PI * frequencyHz) ** 2;
  let best: ModeEnclosure | null = null;
  let gap = Infinity;
  for (const m of cert.modes) {
    const d = Math.abs(m.omega2Computed - w2) / Math.max(w2, m.omega2Computed);
    if (d < gap) { gap = d; best = m; }
  }
  return gap <= 1e-9 ? best : null;
}

/** The frequency below which no mode was missed, Hz; null when completeness is not certified. */
export function modalCutoffHz(cert: ModalCertificate | null | undefined): number | null {
  if (!cert || cert.status !== 'certified' || cert.completeModes <= 0 || !(cert.cutoffOmega2 > 0)) return null;
  return down(Math.sqrt(cert.cutoffOmega2) / TWO_PI);
}

/**
 * The collapse factor shown against the certified enclosure: `within` false when it lies outside
 * (by more than f64 round-off of the incremental analysis), with how far outside, relative.
 */
export function plasticReading(cert: PlasticCertificate, lambda: number): { lo: number | null; up: number | null; within: boolean | null; deviation: number } {
  const lo = cert.lambdaLower, hi = cert.lambdaUpper;
  if (lo === null && hi === null) return { lo, up: hi, within: null, deviation: 0 };
  const scale = Math.max(Math.abs(lambda), 1e-300);
  const below = lo !== null && lambda < lo ? (lo - lambda) / scale : 0;
  const above = hi !== null && lambda > hi ? (lambda - hi) / scale : 0;
  const deviation = Math.max(below, above);
  return { lo, up: hi, within: deviation <= 1e-9, deviation };
}
