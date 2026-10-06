/**
 * What a family of codes supplies the load generator: one module per load role, each behind an
 * interface, so a code of another family plugs in as a module and the flow around it (tributary
 * areas, level masses, the wind's integration in height, torsion, modal forces, combination
 * expansion, applying the plan) stays as it is.
 *
 *   basis     CombinationCode   strength and service combinations, in symbols × factors
 *   loads     ImposedLoadCode   occupancies, the live load reduction
 *   wind      WindCode          the wind of a plan
 *   snow      SnowCode          the snow of a plan
 *   seismic   SeismicCode       the seismic action of a plan, its live load in the mass
 *   thermal   ThermalCode       the restraint actions' clause
 *
 * The generator resolves each module from the adapter bound to its role (`index.ts`); a bound
 * role with no module blocks the plan by name rather than borrowing another code's numbers.
 *
 * Every case a module plans carries a neutral action category, and every combination its code,
 * edition, rule and purpose, so the design modules read which combinations are theirs.
 *
 * Pure: no store.
 */
import type { ClauseRef } from '../regulation';
import type { EngineMessage } from '../message';
import type { CombinationInputs, LoadCombinationSpec, LoadSymbol } from '../cirsoc101/combinations';
import type { OccupancyEntry, ElementKind } from '../cirsoc101/live-loads';
import type { RegulationRole } from '../roles';
import type { LevelMass, LoadPlanInput, PlanSink, SeismicPlanDetail } from '../../engine/loads/load-plan';
import type { ProvenancedValue } from '../regulation';
import type { GravityLayout } from '../../engine/loads/plan-gravity';
import type { GustResult } from '../cirsoc102/gust';

export type { ActionCategory, CodeFamilyId, CombinationOrigin } from './origin';
import type { ActionCategory, CodeFamilyId } from './origin';

export interface CodeModule {
  adapterId: string;
  role: RegulationRole;
  family: CodeFamilyId;
  edition: string;
  /** The code's name as the dialog heads its sections with it (a proper noun, the same in every language). */
  title: string;
  /** The clause each dialog section stands on, keyed by section: the dialog shows them, never writes them. */
  sections?: Readonly<Record<string, string>>;
}

export interface CombinationCode extends CodeModule {
  role: 'basis';
  strength(ci: CombinationInputs): { combinations: LoadCombinationSpec[]; refs: ClauseRef[]; notes: EngineMessage[] };
  service(ci: CombinationInputs): LoadCombinationSpec[];
  /** The action category of a symbol the code combines. */
  categoryOf(symbol: LoadSymbol | string): ActionCategory;
}

export interface ImposedLoadCode extends CodeModule {
  role: 'loads';
  occupancy(key: string): OccupancyEntry | undefined;
  reduce(o: {
    loKNm2: number; tributaryAreaM2: number; elementKind: ElementKind; floorsSupported: number;
    passengerGarage: boolean; publicAssembly: boolean; noReduction: boolean;
  }): { lKNm2: number; refs: ClauseRef[]; reason: EngineMessage };
}

export interface WindCode extends CodeModule {
  role: 'wind';
  plan(input: LoadPlanInput, levels: LevelMass[], sink: PlanSink): {
    windQh: ProvenancedValue<number> | undefined; windGust?: Partial<Record<'x' | 'y', GustResult>>;
  };
  /** The dialog's starting values for a project that has stated none. */
  defaults: { basicSpeed: number; exposure: string; enclosure: string };
}

export interface SnowCode extends CodeModule {
  role: 'snow';
  plan(input: LoadPlanInput, sink: PlanSink, layout?: GravityLayout): boolean;
}

export interface SeismicCode extends CodeModule {
  role: 'seismic';
  plan(input: LoadPlanInput, levels: LevelMass[], sink: PlanSink): {
    seismicWeight: ProvenancedValue<number> | undefined; baseShear: ProvenancedValue<number> | undefined; seismicDetail: SeismicPlanDetail | undefined;
  };
  /** The share of the live load in the seismic mass for an occupancy, when the code gives one. */
  liveInMass(occupancy: string): number | undefined;
  /** The combinations with the vertical component, when the code asks for it. */
  vertical?(combinations: LoadCombinationSpec[], detail: SeismicPlanDetail | undefined, sink: PlanSink): LoadCombinationSpec[];
  /** The dialog's starting values. */
  defaults: { zone: number; site: string; group: string };
}

export interface ThermalCode extends CodeModule {
  role: 'thermal';
  /** The clause the restraint actions' combinations stand on. */
  combinationRef: ClauseRef;
}

export interface LoadCodes {
  basis: CombinationCode;
  loads: ImposedLoadCode;
  wind?: WindCode;
  snow?: SnowCode;
  seismic?: SeismicCode;
  thermal?: ThermalCode;
}

export type AnyLoadCode = CombinationCode | ImposedLoadCode | WindCode | SnowCode | SeismicCode | ThermalCode;
