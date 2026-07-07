// PR [14] — drive the REAL user DXFs through the SHIPPED import path and
// confirm: (a) the auto path on a wrong unit yields a degenerate model that
// diagnostics CATCH, and (b) crop + role overrides + beam-grid inference +
// pruning produce a visibly better, connected, load-bearing draft.
//
// This is the regression baseline the audit was missing — the curated JSON
// fixtures never exercised the shipped auto/inference path on the raw files.
//
// The two real DXFs are PROPRIETARY client drawings (~6 MB each) and are NOT
// committed (see fixtures/.gitignore). These suites skip themselves when the
// files are absent, so CI stays green; run them locally with the files present.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseCadDxf, suggestUnitFromExtent } from '../parse';
import { suggestLayerMappings, extractArchPlan } from '../classify';
import { cropDoc, type PlanWindow } from '../infer';
import { buildDraft } from '../draft-build';
import { diagnoseDraft } from '../diagnostics';
import type { CadUnit, LayerMapping, RcDraftAssumptions } from '../types';

const DIR = join(__dirname, 'fixtures');
const V1_PATH = join(DIR, 'V1-Architecture-plus-structure.dxf');
const V2_PATH = join(DIR, 'V2-Architecture.dxf');
const HAS_V1 = existsSync(V1_PATH);
const HAS_V2 = existsSync(V2_PATH);

function assumptions(over: Partial<RcDraftAssumptions> = {}): RcDraftAssumptions {
  return {
    nFloors: 1, storyHeights: [3], concreteGrade: 'H-30',
    columnSection: { b: 0.2, h: 0.4 }, beamSection: { b: 0.15, h: 0.4 },
    slabThickness: 0.15, wallThickness: 0.2, baseSupport: 'fixed3d',
    deadLoad: 7, liveLoad: 2, generateCombos: true, meshSlabs: true,
    meshMode: 'targetSize', meshTargetSize: 1.4, meshDivisions: 2,
    splitBeams: true, snapTolerance: 0.03, detectOffsets: true, offsetTolerance: 0.03,
    ...over,
  };
}

function override(mappings: LayerMapping[], roles: Record<string, LayerMapping['role']>): LayerMapping[] {
  return mappings.map((m) => (roles[m.layer] ? { ...m, role: roles[m.layer] } : m));
}

// The structural-plan window in V1's modelspace (located by inspection — the
// same window the example build script uses).
const V1_WIN: PlanWindow = { x0: 188.5, x1: 211, y0: 55.5, y1: 67 };

describe.skipIf(!HAS_V1)('real DXF V1 — shipped path', () => {
  let doc: ReturnType<typeof parseCadDxf>;
  beforeAll(() => { doc = parseCadDxf(readFileSync(V1_PATH, 'utf8'), 'V1.dxf'); });

  it('parses a large real DXF with hundreds of layers', () => {
    expect(doc.entities.length).toBeGreaterThan(1000);
    expect(doc.layers.length).toBeGreaterThan(100);
  });

  it('unit sanity flags the mm header as metre-scale', () => {
    // The header says mm; the drawing is in metres.
    const s = suggestUnitFromExtent(doc.bbox, 'mm');
    expect(s).not.toBeNull();
    expect(s!.suggested).toBe('m');
  });

  it('auto path (wrong mm unit, no crop) → diagnostics catch a bad model', () => {
    const unit: CadUnit = doc.suggestedUnit ?? 'mm';
    const mappings = suggestLayerMappings(doc, unit);
    const plan = extractArchPlan(doc, mappings, unit);
    const draft = buildDraft({ plan, assumptions: assumptions(), source: { fileName: 'V1.dxf', importedAtIso: '2026-06-14T00:00:00Z' } });
    const d = diagnoseDraft(draft);
    // The silent dud the audit found is now LOUD: not a clean solvable model.
    expect(d.solvableShape).toBe(false);
    expect(d.level).not.toBe('ok');
  });

  it('crop + role overrides + inference → a connected, load-bearing draft', () => {
    const unit: CadUnit = 'm'; // corrected
    const cropped = cropDoc(doc, V1_WIN);
    const mappings = override(suggestLayerMappings(cropped, unit), {
      'CGC COLUMNAS': 'column', 'CGC VIGAS': 'beam',
      'R&S COLUMNAS EJES': 'ignore', 'R&S COLUMNAS REF': 'ignore',
      'R&S LOSAS REF': 'ignore', 'R&S VIGAS REF': 'ignore',
      'R&S CORTES': 'ignore', 'R&S ESCALERAS': 'ignore', 'T - Locales': 'ignore',
    });
    const plan = extractArchPlan(cropped, mappings, unit);
    expect(plan.columns.length).toBeGreaterThan(4);

    const draft = buildDraft({
      plan, assumptions: assumptions(), source: { fileName: 'V1.dxf', importedAtIso: '2026-06-14T00:00:00Z' },
      inference: { pruneDisconnectedBeams: true, inferSlabPanels: true, snapPanelsToColumns: true, pruneFloatingMembers: true },
    });
    // Inference produced slabs that are not drawn in the file …
    expect(draft.counts.slabQuads).toBeGreaterThan(0);
    expect(draft.warnings.some((w) => w.message.startsWith('inferredSlabPanels:'))).toBe(true);
    // … and the pruned model is a single connected component (no 'disconnected').
    const d = diagnoseDraft(draft);
    expect(d.checks.some((c) => c.id === 'disconnected')).toBe(false);
    // Provenance honestly records the inference.
    expect(draft.provenance.assumptions.some((s) => /INFERRED from the beam grid/.test(s))).toBe(true);
  });
});

describe.skipIf(!HAS_V2)('real DXF V2 — shipped path', () => {
  let doc: ReturnType<typeof parseCadDxf>;
  beforeAll(() => { doc = parseCadDxf(readFileSync(V2_PATH, 'utf8'), 'V2.dxf'); });

  it('auto path → diagnostics catch the degenerate/empty model', () => {
    const unit: CadUnit = doc.suggestedUnit ?? 'mm';
    const mappings = suggestLayerMappings(doc, unit);
    const plan = extractArchPlan(doc, mappings, unit);
    const draft = buildDraft({ plan, assumptions: assumptions(), source: { fileName: 'V2.dxf', importedAtIso: '2026-06-14T00:00:00Z' } });
    const d = diagnoseDraft(draft);
    expect(d.solvableShape).toBe(false);
  });
});
