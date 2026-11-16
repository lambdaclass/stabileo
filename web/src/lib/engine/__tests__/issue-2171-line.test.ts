import { expect, it } from 'vitest';
import { lineFromMembers, membersFromLine, updateZone, equalizeZones } from '../design/beam-line';

for (const secondaryLegs of [2, 3, 4, 5, 6]) it(`known wrong result: #2171 beam-line projection preserves horizontal crossties ${secondaryLegs}`, () => {
  const cage = { diameter: 8, legs: 4, secondaryLegs, spacing: 0.1 };
  const members = [{ id: 1, L: 4, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0, reinforcement: { regions: {
    bottomSpan: { count: 4, diameter: 16 }, topStart: { count: 4, diameter: 16 }, topEnd: { count: 4, diameter: 16 },
    stirrupsSupport: cage, stirrupsSpan: cage,
  } } }];
  const line = lineFromMembers(members);
  expect(line.stirrups.length).toBeGreaterThan(0);
  for (const zone of line.stirrups) expect(zone.secondaryLegs).toBe(secondaryLegs);
  const edited = updateZone(line, line.stirrups[0]!.id, { secondaryLegs: 6 });
  expect(edited.stirrups[0]!.secondaryLegs).toBe(6);
  const restored = membersFromLine(edited, members).get(1)!;
  expect(restored.regions!.stirrupsSupport!.secondaryLegs).toBe(6);
});


it('known wrong result: #2171 support projection and equalization retain both directional bounds', () => {
  const members = [{ id: 1, L: 4, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }];
  const line = { version: 1 as const, members: [1], lengths: [4], bars: [], stirrups: [
    { id: 'start', from: 0, to: 1, diameter: 8, legs: 2, secondaryLegs: 6, spacing: 0.1 },
    { id: 'span', from: 1, to: 3, diameter: 8, legs: 4, secondaryLegs: 4, spacing: 0.1 },
    { id: 'end', from: 3, to: 4, diameter: 8, legs: 6, secondaryLegs: 2, spacing: 0.1 },
  ] };
  const support = membersFromLine(line, members).get(1)!.regions!.stirrupsSupport!;
  expect(support.legs).toBe(2);
  expect(support.secondaryLegs).toBe(2);
  for (const zone of equalizeZones(line, ['start', 'end']).stirrups.filter(z => z.id !== 'span')) {
    expect(zone.legs).toBe(6);
    expect(zone.secondaryLegs).toBe(6);
  }
});
