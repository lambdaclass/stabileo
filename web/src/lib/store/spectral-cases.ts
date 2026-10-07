/**
 * The results of the model's spectral load cases (`engine/spectral-case.ts`): the modes under the
 * project's mass source, each mode shape imposed and solved once, then each case's modes combined
 * with its own multipliers. Computed when the combinations are solved and handed to them as the
 * cases' results (`engine/combination-methods.ts` `finishBundle`).
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { regulationsStore } from './regulations.svelte';
import { t } from '../i18n';
import { dynamicInput } from './dynamic-input';
import { modalUntilMass } from '../engine/dynamics/requests';
import { solveModal3D } from '../engine/wasm-solver';
import { validateAndSolve3D } from '../engine/solver-service';
import { designSpectrum, isBlocked, spectralOrdinate } from '../codes/cirsoc103/spectrum';
import { combineModes, modeCoefficients, modeShapeField, userSa, G, type SpectralCaseDef } from '../engine/spectral-case';
import type { AnalysisResults3D } from '../engine/types-3d';
import type { ModalResult3D } from '../engine/result-types';
import type { Support } from './model.svelte';

/** The code's spectrum, Sa in m/s² against period, from the project's seismic regulation. */
export function codeSa(): ((t: number) => number) | string {
  const s = regulationsStore.binding('seismic')?.settings as { zone?: number; site?: string } | undefined;
  if (!s?.zone || !s.site) return t('spectralCase.noCodeSpectrum');
  const spec = designSpectrum({ zone: s.zone as never, site: s.site as never });
  if (isBlocked(spec)) return t('spectralCase.noCodeSpectrum');
  return (period) => spectralOrdinate(period, spec) * G;
}

/** The model with every node held at a mode shape's displacements, and nothing else loaded. */
export function imposed(field: Map<number, [number, number, number, number, number, number]>) {
  const supports = new Map<number, Support>();
  let id = 1;
  for (const nodeId of modelStore.nodes.keys()) {
    const [dx, dy, dz, drx, dry, drz] = field.get(nodeId) ?? [0, 0, 0, 0, 0, 0];
    supports.set(id, { id, nodeId, type: 'fixed3d', dx, dy, dz, drx, dry, drz } as Support);
    id++;
  }
  return {
    nodes: modelStore.nodes, elements: modelStore.elements, supports, loads: [],
    materials: modelStore.materials, sections: modelStore.sections,
    analysis: { ...(modelStore.model.analysis ?? {}), selfWeight: [] },
    groups: modelStore.model.groups, plates: modelStore.plates, quads: modelStore.quads,
  };
}

/** Each spectral case's result, by case id; a message when they cannot be had. */
export function spectralCaseResults(): Map<number, AnalysisResults3D> | string {
  const cases = modelStore.model.loadCases.filter((c) => c.spectral);
  if (!cases.length) return new Map();
  if (modelStore.constraints.length) return t('spectralCase.constrained');
  let modal: ModalResult3D;
  try {
    const { input, densities } = dynamicInput();
    const r = modalUntilMass((n) => solveModal3D(input, densities, n) as never, 12);
    if (typeof r.result === 'string') return r.result;
    modal = r.result as unknown as ModalResult3D;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  if (!modal.modes?.length) return t('spectralCase.noModes');
  const leftHand = uiStore.axisConvention3D === 'leftHand';
  // Each mode shape imposed and solved once; a case scales it by its own multiplier.
  const unit: AnalysisResults3D[] = [];
  for (const m of modal.modes) {
    const r = validateAndSolve3D(imposed(modeShapeField(m)) as never, false, leftHand);
    if (!r || typeof r === 'string') return r ?? t('spectralCase.noModes');
    unit.push(r);
  }
  const out = new Map<number, AnalysisResults3D>();
  const code = codeSa();
  for (const c of cases) {
    const def = c.spectral as SpectralCaseDef;
    let saOf: (t: number) => number;
    if (def.source.kind === 'code') {
      if (typeof code === 'string') return code;
      saOf = code;
    } else {
      const id = def.source.spectrumId;
      const spec = modelStore.model.dynamics?.spectra?.find((s) => s.id === id);
      if (!spec) return t('spectralCase.noSpectrum');
      saOf = (p) => userSa(spec, p);
    }
    out.set(c.id, combineModes(def.rule, def.xi, modeCoefficients(modal, def, saOf), unit));
  }
  return out;
}
