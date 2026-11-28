import type { LoadModelData, PlannedSurface } from '../engine/loads/load-plan';

export interface PhysicalLoadProvider {
  project(analytical: LoadModelData): LoadModelData;
  pressures(generatedBy: string): {
    collect(load: PlannedSurface, caseId: number): boolean;
    write(): void;
  };
}

export const physicalLoadProvider: PhysicalLoadProvider | undefined = undefined;
