import { expect, it } from 'vitest';
import { frameDesignQuality } from './design-quality-fixture';

// Physically clear final passes on 184184c32, before lap-aware seeds. Its reported 80
// included ten members with unattempted cage clashes missing from their holds. Preserve
// the 70 actual passes by identity; never use a UI pass count alone as the quality metric.
const PREVIOUS_PASSES = [2, 4, 7, 8, 9, 13, 16, 17, 18, 19, 20, 38, 42, 43, 48,
  52, 53, 54, 55, 58, 63, 68, 70, 74, 77, 78, 79, 82, 83, 84, 89,
  94, 97, 98, 99, 102, 103, 104, 107, 109, 113, 114, 115, 118, 119, 121, 122, 123, 124,
  125, 136, 137, 138, 139, 140, 142, 143, 144, 147, 148, 149, 152, 153, 154, 157, 158, 159,
  185, 201, 202];

it('verifies two more columns without losing previous passes or hiding physical blockers', async () => {
  const { output, verifiedIds } = await frameDesignQuality();
  expect(output.aborted).toBe(false);
  expect(output.notReached).toBe(0);
  expect(Object.values(output.counts).reduce((a, b) => a + b, 0)).toBe(408);
  expect(output.passingWithBlockingConflicts).toEqual([]);
  expect(output.passingWithoutFinalVerification).toEqual([]);
  expect(verifiedIds).toEqual(expect.arrayContaining([...PREVIOUS_PASSES, 32, 34]));
  expect(verifiedIds.length).toBeGreaterThanOrEqual(72);
  expect(output.exhausted).toBeLessThanOrEqual(35);
  expect(output.counts.fail).toBeLessThanOrEqual(288);
  expect(output.blockingConflicts).toBeLessThanOrEqual(2981);
  const achievedOpen: Record<string, number> = {
    generation: 2, 'detailing.clash.unresolved': 3323, 'detailing.lapCheck.unarranged': 97,
    'detailing.lapCheck.integrity': 42, 'detailing.lapCheck.spacing': 9,
    'detailing.lapCheck.pitch': 4, 'detailing.lapCheck.noPartner': 2,
  };
  for (const [key, count] of Object.entries(output.open)) {
    // Newly exposed final-depth failures were absent from the old physical-only tally;
    // the independent assertion above forbids counting any of them as approved.
    if (key === 'detailing.finalVerification.failed') continue;
    expect(count, key).toBeLessThanOrEqual(achievedOpen[key] ?? 0);
  }
}, 600_000);
