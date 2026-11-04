/**
 * Structural dynamics in the catalog: the single degree of freedom system,
 * the n degree of freedom system and its modal decomposition, and the
 * distributed mass with its discretization and condensation. Their numbers
 * (m, k, ξ, the excitation, n per member, the mass model) are set in the
 * Dynamic panel; the engine's modal analysis is the reference they compare to.
 */
import type { ExplainedMethod, MethodContext } from '../registry';
import { sdofApplies, buildSdof } from '../dynamics/sdof-doc';
import { mdofApplies, buildMdof } from '../dynamics/mdof-doc';
import { massApplies, buildMass } from '../dynamics/mass-doc';
import { dynamicsSettings } from '../../dynamics/course/settings';
import { subdivideForAnalysis } from '../../../model/edit/analysis-subdivision';
import { buildSolverInput2D } from '../../solver-service';
import { withBasicMass } from '../../dynamics/basic-mass';
import { solveModal, isWasmReady } from '../../wasm-solver';

/** The engine's frequencies, Hz, of the model cut into n segments per member; null when it cannot run. */
export function engineFrequencies(ctx: Pick<MethodContext, 'model'>, n: number, barMass = true, count = 8): number[] | null {
  if (!ctx.model || !isWasmReady()) return null;
  try {
    const sub = subdivideForAnalysis(ctx.model, n);
    const input = buildSolverInput2D(sub.model);
    if (!input) return null;
    const phys = withBasicMass(input, { ...sub.model, massSource: ctx.model.massSource });
    const densities = barMass ? phys.densities : new Map([...phys.densities.keys()].map((k) => [k, 0]));
    return solveModal(phys.input, densities, count).modes.map((m: { frequency: number }) => m.frequency);
  } catch {
    return null;
  }
}

export const methods: ExplainedMethod[] = [
  { id: 'sdof', group: 'dynamics', example: 'dynamics-column-mass', applies: sdofApplies, build: buildSdof },
  {
    id: 'mdofModal', group: 'dynamics', example: 'dynamics-shear-building', applies: mdofApplies,
    build: (ctx) => {
      const s = dynamicsSettings();
      return buildMdof(ctx, () => engineFrequencies(ctx, s.mdof.source === 'shear' ? Math.max(4, s.mass.nPerMember) : s.mass.nPerMember, s.mdof.barMass));
    },
  },
  { id: 'massDiscretization', group: 'dynamics', example: 'cantilever', applies: massApplies, build: (ctx) => buildMass(ctx, (n) => engineFrequencies(ctx, n)) },
];
