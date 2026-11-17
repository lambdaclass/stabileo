import { expect, it } from 'vitest';
import { conditionHolds } from '../applicability';
import coordinates from '../result-changes/member-diagram-reference-coordinates.json';
import extrema from '../result-changes/member-combined-diagram-extrema.json';
import limits from '../result-changes/gravity-profile-intensity-limit.json';
import refusal from '../result-changes/corotational-distributed-couples-refused.json';
import residuals from '../result-changes/gravity-profile-cancellation-residuals.json';

it('scopes reference coordinate changes to spatial nonlinear members', () => {
  expect(conditionHolds(coordinates.when, new Set(['space3D', 'members', 'analysis:nonlinear']))).toBe(true);
  for (const features of [['space3D', 'analysis:nonlinear'], ['members', 'analysis:nonlinear'], ['space3D', 'members', 'analysis:linear']]) expect(conditionHolds(coordinates.when, new Set(features))).toBe(false);
  expect(coordinates.quantities).toEqual(['elementForces', 'envelope']);
});

it('scopes combined extrema to spatial member combination envelopes', () => {
  expect(conditionHolds(extrema.when, new Set(['space3D', 'frameMembers', 'combinations']))).toBe(true);
  for (const features of [['space3D', 'frameMembers'], ['space3D', 'combinations'], ['frameMembers', 'combinations']]) expect(conditionHolds(extrema.when, new Set(features))).toBe(false);
  expect(extrema.quantities).toEqual(['envelope']);
});

it('requires floor and area load regeneration for cancellation residuals', () => {
  expect(residuals.requiresFloorLoadRegeneration).toBe(true);
  expect(residuals.requiresLoadRegeneration).toBe(true);
  for (const feature of ['floorLoads', 'generatedLoads']) expect(conditionHolds(residuals.when, new Set([feature]))).toBe(true);
  expect(conditionHolds(residuals.when, new Set(['space3D', 'members']))).toBe(false);
});

it('scopes the couple refusal and requires regeneration for the intensity limit', () => {
  expect(conditionHolds(refusal.when, new Set(['space3D', 'memberCouples', 'analysis:nonlinear']))).toBe(true);
  for (const features of [['space3D', 'analysis:nonlinear'], ['space3D', 'memberCouples', 'analysis:linear']]) expect(conditionHolds(refusal.when, new Set(features))).toBe(false);
  for (const feature of ['floorLoads', 'generatedLoads']) expect(conditionHolds(limits.when, new Set([feature]))).toBe(true);
  expect(limits.requiresFloorLoadRegeneration).toBe(true);
  expect(limits.requiresLoadRegeneration).toBe(true);
  expect(conditionHolds(limits.when, new Set(['space3D', 'members']))).toBe(false);
});
