/**
 * Convention regression gates.
 *
 * These tests guard the semantic seams where axis conventions, mode handling,
 * and moment identity rules must be consistent across the codebase.
 * The bugs they prevent were NOT solver math errors -- they were seam bugs
 * where different parts of the codebase used different conventions for the
 * same concept.
 *
 * CONTRACT TESTS: Seams 1, 3, 4, and 6 are stability contracts.
 * Changing their assertions requires explicit justification — they encode
 * invariants that prevented real production bugs (Z-up drift, My/Mz swap,
 * missing PRO fields in share links). Do not weaken tolerances or remove
 * assertions without updating the trust baseline in SOLVER_ROADMAP.md.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve, solve3D } from '../wasm-solver';
import type { SolverInput, SolverLoad } from '../types';
import type {
  SolverInput3D, SolverSection3D, ElementForces3D,
} from '../types-3d';
import type { SolverMaterial } from '../types';
import {
  VERTICAL_AXIS, UP_VECTOR, GRAVITY_VECTOR_3D, GLOBAL_Z,
  projectNodeToScene, shouldProjectModelToXZ,
} from '../../geometry/coordinate-system';

// ─── Helpers ──────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf8');
}

// ─── SEAM 1: Allowed field names by mode ──────────────────────────

const BANNED_2D_FIELDS = ['uy', 'rz', 'fy', 'mz'];

describe('SEAM 1: Allowed field names by mode', () => {
  it('2D solver output does NOT use banned Y-up displacement fields', () => {
    const input: SolverInput = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 5, z: 0 }]]),
      materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
      elements: new Map([[1, {
        id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2,
        materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false,
      }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as any }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }] as SolverLoad[],
    };
    const results = solve(input);
    const tipDisp = results.displacements.find(d => d.nodeId === 2)!;

    // Banned old Y-up fields must NOT exist as primary keys
    for (const field of BANNED_2D_FIELDS) {
      expect(tipDisp, `2D displacement must not have banned field '${field}'`).not.toHaveProperty(field);
    }
    // Canonical Z-up fields MUST exist
    expect(tipDisp).toHaveProperty('ux');
    expect(tipDisp).toHaveProperty('uz');
    expect(tipDisp).toHaveProperty('ry');
    expect(Math.abs(tipDisp.uz)).toBeGreaterThan(1e-10);
  });

  it('3D solver element forces have canonical 3D field names', () => {
    const steelMat: SolverMaterial = { id: 1, e: 200_000, nu: 0.3 };
    const section: SolverSection3D = { id: 1, a: 0.01, iz: 8.33e-6, iy: 4.16e-6, j: 1e-5 };
    const input: SolverInput3D = {
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: 5, y: 0, z: 0 }],
      ]),
      materials: new Map([[1, steelMat]]),
      sections: new Map([[1, section]]),
      elements: new Map([[1, {
        id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2,
        materialId: 1, sectionId: 1, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
      }]]),
      supports: new Map([[0, {
        nodeId: 1,
        rx: true, ry: true, rz: true,
        rrx: true, rry: true, rrz: true,
      }]]),
      loads: [
        { type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } },
      ],
    };
    const result = solve3D(input);
    if (typeof result === 'string') throw new Error(result);

    const ef = result.elementForces[0];
    // Canonical 3D element force fields
    expect(ef).toHaveProperty('nStart');
    expect(ef).toHaveProperty('vyStart');
    expect(ef).toHaveProperty('vzStart');
    expect(ef).toHaveProperty('mxStart');
    expect(ef).toHaveProperty('myStart');
    expect(ef).toHaveProperty('mzStart');
  });

  it('backend AddNodalLoad uses fz/my as primary serde fields (not fy/mz)', () => {
    const actionsRs = readFileSync(resolve(__dirname, '../../../../../backend/src/capabilities/actions.rs'), 'utf8');
    // fz is the primary field with fy as alias
    expect(actionsRs).toMatch(/#\[serde\(alias = "fy"\)\]\s*\n\s*fz:/);
    // my is the primary field with mz as alias
    expect(actionsRs).toMatch(/#\[serde\(alias = "mz"\)\]\s*\n\s*my:/);
  });

  it('backend add_nodal_load_2d emits fz and my', () => {
    const generatorsRs = readFileSync(resolve(__dirname, '../../../../../backend/src/capabilities/generators.rs'), 'utf8');
    // The function signature
    expect(generatorsRs).toContain('fn add_nodal_load_2d');
    // The emitted JSON must use "fz" and "my"
    expect(generatorsRs).toMatch(/"fz":/);
    expect(generatorsRs).toMatch(/"my":/);
  });
});

// ─── SEAM 2: Permitted analysis modes and PRO handling ────────────

const MODES_TREATED_AS_3D = ['3d', 'pro'] as const;
const MODES_TREATED_AS_2D = ['2d', 'edu'] as const;

describe('SEAM 2: Permitted analysis modes and PRO handling', () => {
  it('3D modes must NOT be auto-projected to XZ', () => {
    const dummyNodes = [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
    ];
    for (const mode of MODES_TREATED_AS_3D) {
      const result = shouldProjectModelToXZ({ nodes: dummyNodes, analysisMode: mode });
      expect(result, `mode '${mode}' must not be projected to XZ`).toBe(false);
    }
  });

  it('2D modes with z=0 nodes should be projected to XZ', () => {
    const dummyNodes = [
      { x: 0, y: 3 },
      { x: 5, y: 0 },
    ];
    for (const mode of MODES_TREATED_AS_2D) {
      const result = shouldProjectModelToXZ({ nodes: dummyNodes, analysisMode: mode });
      expect(result, `mode '${mode}' with flat nodes should project to XZ`).toBe(true);
    }
  });

  it('isMode3D function body contains both 3d and pro', () => {
    const fileTs = readSource('../../store/file.ts');
    // Extract the isMode3D function body
    const funcMatch = fileTs.match(/function isMode3D\([^)]*\)[^{]*\{([^}]+)\}/);
    expect(funcMatch, 'isMode3D function must exist in file.ts').toBeTruthy();
    const funcBody = funcMatch![1];
    expect(funcBody).toContain("'3d'");
    expect(funcBody).toContain("'pro'");
  });

  it('no raw analysisMode === \'3d\' checks outside isMode3D definition', () => {
    const fileTs = readSource('../../store/file.ts');
    // Remove the isMode3D function definition and comments before checking
    const withoutIsMode3D = fileTs
      .replace(/\/\*\*[^*]*\*\//g, '')             // block comments
      .replace(/\/\/.*$/gm, '')                      // line comments
      .replace(/function isMode3D\([^)]*\)[^{]*\{[^}]+\}/g, ''); // isMode3D body
    const rawChecks = withoutIsMode3D.match(/analysisMode === '3d'/g) || [];
    expect(rawChecks.length, 'file.ts should use isMode3D() helper instead of raw 3d checks').toBe(0);
  });

  it('excel.ts uses isMode3D, not raw analysisMode === \'3d\'', () => {
    const excelTs = readSource('../../export/excel.ts');
    expect(excelTs).toContain('isMode3D');
    expect(excelTs).not.toMatch(/analysisMode === '3d'/);
  });
});

// ─── SEAM 3: My/Mz axis identity preservation ────────────────────

describe('SEAM 3: My/Mz axis identity preservation', () => {
  it('auto-verify.ts preserves Mz as Mu (strong) and My as Muy (weak)', () => {
    const src = readSource('../auto-verify.ts');
    expect(src, 'Mu = strong axis = Mz').toContain('const MuMax = MzMax;');
    expect(src, 'Muy = weak axis = My').toContain('const MuyMax = MyMax;');
    // Must NOT sort by magnitude
    expect(src).not.toContain('Math.max(MzMax, MyMax)');
    expect(src).not.toContain('Math.min(MzMax, MyMax)');
  });

  it('ProVerificationTab.svelte preserves axis identity', () => {
    const src = readSource('../../../components/pro/ProVerificationTab.svelte');
    expect(src, 'MuMax = _mzMax').toContain('MuMax = _mzMax');
    expect(src, 'MuyMax = _myMax').toContain('MuyMax = _myMax');
    // Must NOT sort by magnitude
    expect(src).not.toContain('MuMax = Math.max(_mzMax, _myMax)');
    expect(src).not.toContain('MuzMax = Math.max(_mzM, _myM)');
  });

  it('ProPanel.svelte Mu computation uses only mzStart/mzEnd', () => {
    const src = readSource('../../../components/pro/ProPanel.svelte');
    // Mu should reference mzStart and mzEnd only
    expect(src).toContain('Mu: Math.max(Math.abs(ef.mzStart), Math.abs(ef.mzEnd))');
  });

  it('section-stress-3d.ts Navier formula uses correct axis pairing', () => {
    const src = readSource('../section-stress-3d.ts');
    // Correct formula: sigma += Mz * y / Iz  and  sigma -= My * z / Iy
    expect(src, 'Mz pairs with y/Iz').toContain('sigma += Mz * y / Iz');
    expect(src, 'My pairs with z/Iy').toContain('sigma -= My * z / Iy');
    // Old swapped formula must NOT exist
    expect(src, 'old swapped formula must not exist').not.toContain('sigma -= My * y / Iz');
  });

  it('stress-heatmap.ts Math.max(my, mz) is intentional for visualization', () => {
    const src = readSource('../../three/stress-heatmap.ts');
    // Find the Math.max(my, mz) usage
    expect(src).toMatch(/Math\.max\(my, mz\)/);
    // It must have a comment confirming it is for visualization, not axis assignment
    const momentBlock = src.match(/(?:\/\/.*(?:envelope|intensity|visualization).*\n.*)?Math\.max\(my, mz\)/i)
      || src.match(/Math\.max\(my, mz\)[\s\S]{0,200}/);
    const contextLines = src.split('\n');
    const maxLine = contextLines.findIndex(l => l.includes('Math.max(my, mz)'));
    expect(maxLine).toBeGreaterThan(-1);
    // Check surrounding lines for the intentionality comment
    const surrounding = contextLines.slice(Math.max(0, maxLine - 5), maxLine + 3).join('\n');
    expect(
      surrounding,
      'Math.max(my, mz) in stress-heatmap.ts must be annotated as intentional for visualization',
    ).toMatch(/envelope|intensity|visualization/i);
  });
});

// ─── SEAM 4: File persistence and share link contracts ────────────

describe('SEAM 4: File persistence and share link contracts', () => {
  it('serializeProject writes analysisMode and axisConvention3D', () => {
    const fileTs = readSource('../../store/file.ts');
    // The serializeProject function must include these fields
    const serializeBlock = fileTs.match(/function serializeProject[\s\S]*?return JSON\.stringify/);
    expect(serializeBlock, 'serializeProject must exist').toBeTruthy();
    expect(serializeBlock![0]).toContain('analysisMode');
    expect(serializeBlock![0]).toContain('axisConvention3D');
  });

  it('loadProject reads analysisMode and axisConvention3D', () => {
    const fileTs = readSource('../../store/file.ts');
    // loadProject or loadFile must restore these fields
    expect(fileTs).toContain('data.analysisMode');
    expect(fileTs).toContain('data.axisConvention3D');
  });

  it('url-sharing toCompact serializes plates, quads, and constraints', () => {
    const urlTs = readSource('../../utils/url-sharing.ts');
    // toCompact writes pl, qu, cn
    const toCompactBlock = urlTs.match(/function toCompact[\s\S]*?^}/m);
    expect(toCompactBlock, 'toCompact must exist').toBeTruthy();
    expect(toCompactBlock![0]).toContain('c.pl');
    expect(toCompactBlock![0]).toContain('c.qu');
    expect(toCompactBlock![0]).toContain('c.cn');
  });

  it('url-sharing fromCompact handles plates, quads, and constraints', () => {
    const urlTs = readSource('../../utils/url-sharing.ts');
    // fromCompact reads pl, qu, cn
    const fromCompactBlock = urlTs.match(/function fromCompact[\s\S]*?^}/m);
    expect(fromCompactBlock, 'fromCompact must exist').toBeTruthy();
    expect(fromCompactBlock![0]).toContain('c.pl');
    expect(fromCompactBlock![0]).toContain('c.qu');
    expect(fromCompactBlock![0]).toContain('c.cn');
  });
});

// ─── SEAM 5: Locale wording matches code convention ───────────────

describe('SEAM 5: Locale wording matches code convention', () => {
  it('EN rotMomentHelp: Mz = M*cos (strong axis first)', () => {
    const en = readSource('../../i18n/locales/en.ts');
    const match = en.match(/rotMomentHelp.*?['"`]/s);
    expect(match).toBeTruthy();
    // Find the actual value
    const rotMomentLine = en.match(/rotMomentHelp['"]?\s*[:=]\s*['"`]([\s\S]*?)['"`]/);
    expect(rotMomentLine).toBeTruthy();
    const value = rotMomentLine![1];
    // Mz = M*cos must come before My = M*sin
    const mzCosIdx = value.indexOf('Mz');
    const mySinIdx = value.indexOf('My');
    expect(mzCosIdx, 'Mz must appear before My in rotMomentHelp').toBeLessThan(mySinIdx);
    expect(value).toMatch(/Mz.*cos/);
  });

  it('EN moments3dHelp: My near weak, Mz near strong', () => {
    const en = readSource('../../i18n/locales/en.ts');
    const moments3dMatch = en.match(/moments3dHelp['"]?\s*[:=]\s*['"`]([\s\S]*?)['"`]/);
    expect(moments3dMatch).toBeTruthy();
    const value = moments3dMatch![1];
    // My should be near "weak"
    expect(value).toMatch(/My.*weak/is);
    // Mz should be near "strong"
    expect(value).toMatch(/Mz.*strong/is);
  });

  it('ES rotMomentHelp: Mz = M*cos (strong axis first)', () => {
    const es = readSource('../../i18n/locales/es.ts');
    const rotMomentLine = es.match(/rotMomentHelp['"]?\s*[:=]\s*['"`]([\s\S]*?)['"`]/);
    expect(rotMomentLine).toBeTruthy();
    const value = rotMomentLine![1];
    expect(value).toMatch(/Mz.*cos/);
  });

  it('ES moments3dHelp: My near debil, Mz near fuerte', () => {
    const es = readSource('../../i18n/locales/es.ts');
    const moments3dMatch = es.match(/moments3dHelp['"]?\s*[:=]\s*['"`]([\s\S]*?)['"`]/);
    expect(moments3dMatch).toBeTruthy();
    const value = moments3dMatch![1];
    // My near "debil" (with or without accent)
    expect(value).toMatch(/My.*d[eé]bil/is);
    // Mz near "fuerte"
    expect(value).toMatch(/Mz.*fuerte/is);
  });
});

// ─── SEAM 6: Z-up coordinate constants ───────────────────────────

describe('SEAM 6: Z-up coordinate constants', () => {
  it('VERTICAL_AXIS === z', () => {
    expect(VERTICAL_AXIS).toBe('z');
  });

  it('UP_VECTOR equals GLOBAL_Z (0,0,1)', () => {
    expect(UP_VECTOR.x).toBe(GLOBAL_Z.x);
    expect(UP_VECTOR.y).toBe(GLOBAL_Z.y);
    expect(UP_VECTOR.z).toBe(GLOBAL_Z.z);
    expect(UP_VECTOR.x).toBe(0);
    expect(UP_VECTOR.y).toBe(0);
    expect(UP_VECTOR.z).toBe(1);
  });

  it('GRAVITY_VECTOR_3D is (0,0,-1)', () => {
    expect(GRAVITY_VECTOR_3D.x).toBe(0);
    expect(GRAVITY_VECTOR_3D.y).toBe(0);
    expect(GRAVITY_VECTOR_3D.z).toBe(-1);
  });

  it('projectNodeToScene maps 2D Y to scene Z when project2DToXZ=true', () => {
    const result = projectNodeToScene({ x: 3, y: 5 }, true);
    expect(result).toEqual({ x: 3, y: 0, z: 5 });
  });

  it('projectNodeToScene passes 3D nodes through when project2DToXZ=false', () => {
    const result = projectNodeToScene({ x: 3, y: 5, z: 7 }, false);
    expect(result).toEqual({ x: 3, y: 5, z: 7 });
  });
});
