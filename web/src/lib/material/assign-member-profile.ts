import { profileToSectionFull, type SteelProfile } from '../data/steel-profiles';
import { commercialDefaultFor, materialFromGrade, findMaterialWithGrade } from '../data/commercial-default';
import type { GradeRegion } from '../data/structural-grades';
import { modelStore } from '../store/model.svelte';

export function assignMemberProfile(id: number, profile: SteelProfile, region?: GradeRegion | null): void {
  const member = modelStore.elements.get(id);
  if (!member) return;
  modelStore.batch(() => {
    const section = modelStore.addSection({ name: profile.name, profileFamily: profile.family, ...profileToSectionFull(profile) });
    modelStore.updateElementSection(id, section);
    const grade = commercialDefaultFor(profile.family, modelStore.materials.get(member.materialId), region);
    if (!grade) return;
    const existing = findMaterialWithGrade(modelStore.materials.values(), grade.id);
    modelStore.updateElementMaterial(id, existing?.id ?? modelStore.addMaterial(materialFromGrade(grade)));
  });
}
