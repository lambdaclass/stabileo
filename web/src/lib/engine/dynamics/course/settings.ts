/**
 * What the reader chose in the Dynamic panel's classroom sections: the single
 * degree of freedom system, the n degree of freedom excitation, and how the
 * bars are cut and their mass modelled. The explained documents read it when
 * they are built. SI units: t, kN/m, m, s.
 */
import type { MassModel } from './mass-model';

export interface SdofSettings {
  /** 'model': k and m from a node of the model; 'manual': typed. */
  source: 'model' | 'manual';
  nodeId: number | null;
  dir: 'ux' | 'uz';
  m: number;
  k: number;
  xi: number;
  u0: number;
  v0: number;
  F0: number;
  /** Forcing frequency Ω, rad/s; null: 0.8·ω. */
  Omega: number | null;
}

export interface MdofSettings {
  source: 'model' | 'shear';
  excitation: 'free' | 'harmonic';
  xi: number;
  /** Ω/ω₁ of the harmonic excitation. */
  ratio: number;
  barMass: boolean;
}

export interface MassSettings {
  nPerMember: number;
  massModel: MassModel;
}

export interface DynamicsSettings { sdof: SdofSettings; mdof: MdofSettings; mass: MassSettings }

export const DEFAULT_SETTINGS: DynamicsSettings = {
  sdof: { source: 'model', nodeId: null, dir: 'ux', m: 2, k: 800, xi: 0.05, u0: 0.01, v0: 0, F0: 10, Omega: null },
  mdof: { source: 'model', excitation: 'free', xi: 0.05, ratio: 0.8, barMass: true },
  mass: { nPerMember: 1, massModel: 'lumped' },
};

let current: DynamicsSettings = structuredClone(DEFAULT_SETTINGS);

export function dynamicsSettings(): DynamicsSettings { return current; }

export function setDynamicsSettings(patch: { sdof?: Partial<SdofSettings>; mdof?: Partial<MdofSettings>; mass?: Partial<MassSettings> }): void {
  current = {
    sdof: { ...current.sdof, ...patch.sdof },
    mdof: { ...current.mdof, ...patch.mdof },
    mass: { ...current.mass, ...patch.mass },
  };
}

export function resetDynamicsSettings(): void { current = structuredClone(DEFAULT_SETTINGS); }

export const N_PER_MEMBER_MAX = 12;
