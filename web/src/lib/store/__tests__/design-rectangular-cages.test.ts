import { beforeAll, expect, it } from 'vitest';
import { modelStore, resultsStore, uiStore } from '..';
import { verificationStore } from '../verification.svelte';
import { detailingStore } from '../detailing.svelte';
import { designRunStore } from '../design-run.svelte';
import { designWithResizing } from '../design-resize';
import { currentFrameDesignQuality } from './design-quality-fixture';
import { solveCombinations3D, validateAndSolve3D } from '../../engine/solver-service';

beforeAll(async () => {
  modelStore.clear(); resultsStore.clear(); verificationStore.clear(); detailingStore.clear();
  designRunStore.resetMarks();
  await modelStore.loadExample('rc-design-qa-8');
  uiStore.analysisMode = 'pro';
  const combo = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, true, false);
  const solved = validateAndSolve3D(modelStore.model as never, true, false);
  if (!combo || typeof combo === 'string' || !solved || typeof solved === 'string') throw new Error('fixture solve failed');
  resultsStore.setResults3D(solved);
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  await designWithResizing({ families: ['column', 'beam'], edited: 'keep', steel: false });
}, 60_000);

it('keeps rectangular column and joint ties in the same plan axes as the longitudinal cage', () => {
  const ctx = verificationStore.contextFor(1)!;
  expect(Math.abs(ctx.section.b - ctx.section.h)).toBeGreaterThan(0.04);
  const bars = detailingStore.lastRun!.assemblies.flatMap(a => a.bars);
  for (const prefix of ['col-1:ties:stirrup:', 'joint-5:ties:stirrup:']) {
    const tie = bars.find(b => b.id.startsWith(prefix));
    expect(tie, prefix).toBeDefined();
    const points = tie!.segments.flatMap(s => [s.start, s.end]);
    const width = Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
    const height = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y));
    expect(width, prefix + ' X extent').toBeCloseTo(ctx.section.b - 2 * ctx.material.cover - tie!.diameterMm / 1000, 8);
    expect(height, prefix + ' Y extent').toBeCloseTo(ctx.section.h - 2 * ctx.material.cover - tie!.diameterMm / 1000, 8);
  }
});

it('does not intersect column longitudinal bars with their column or joint perimeter ties', () => {
  const bars = new Map(detailingStore.lastRun!.assemblies.flatMap(a => a.bars).map(b => [b.id, b]));
  const bad = detailingStore.lastRun!.assemblies.flatMap(a => a.conflicts).filter(c => {
    if (c.pairClass !== 'prohibitedOverlap') return false;
    const pair = [bars.get(c.barA), bars.get(c.barB)];
    return pair.some(b => b?.role === 'longitudinal' && b.ownerElementIds.some(id => verificationStore.contextFor(id)?.elementType === 'column'))
      && pair.some(b => /^(col-|joint-).*:ties:stirrup:/.test(b?.id ?? ''));
  });
  expect(bad.map(c => `${c.barA}/${c.barB}`)).toEqual([]);
});

it('closes the fresh eight-member design and retains all final approvals on regeneration', () => {
  const quality = currentFrameDesignQuality();
  expect(quality.verifiedIds).toHaveLength(8);
  expect(quality.output.blockingConflicts).toBe(0);
  expect(quality.output.open).toEqual({});
  expect(quality.output.passingWithoutFinalVerification).toEqual([]);
  expect(quality.output.passingWithBlockingConflicts).toEqual([]);
  expect(detailingStore.generate()).not.toBeNull();
  expect(currentFrameDesignQuality()).toEqual(quality);
});
