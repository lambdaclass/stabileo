import { expect, it } from 'vitest';
import { modelFeatures } from '../model-features';

it('identifies saved beam assemblies and schedules independently', () => {
  const features = (kind: string, marks: unknown[]) => modelFeatures({ detailing: { assemblies: [{ kind, marks }] } });
  expect(features('beamLine', []).has('savedBeamDetailing')).toBe(true);
  expect(features('beamLine', []).has('savedBarSchedule')).toBe(false);
  expect(features('columnStack', [{}]).has('savedBeamDetailing')).toBe(false);
  expect(features('columnStack', [{}]).has('savedBarSchedule')).toBe(true);
  expect(modelFeatures({}).has('savedBeamDetailing')).toBe(false);
});
