/**
 * Tests for the unified design-check normalization layer.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeCirsoc201,
  normalizeCirsoc301,
  normalizeWasmSteel,
  normalizeWasmRC,
  buildDesignSummary,
  type MemberDesignResult,
  type CheckStatus,
} from '../design-check-results';
import type { ElementVerification } from '../codes/argentina/cirsoc201';
import type { SteelVerification } from '../codes/argentina/cirsoc301';

// ─── CIRSOC 201 (RC) normalization ──────────────────────────────

describe('normalizeCirsoc201', () => {
  const sectionNames = new Map([[1, '25×50']]);

  const mockVerif: ElementVerification = {
    elementId: 1,
    elementType: 'beam',
    Mu: 120, Vu: 80, Nu: 0,
    b: 0.25, h: 0.50, fc: 25, fy: 420, cover: 0.025,
    flexure: { Mu: 120, AsReq: 8.5, AsMin: 2.5, AsProv: 10, phiMn: 150, ratio: 0.80, status: 'ok', steps: [] },
    shear: { Vu: 80, phiVc: 50, phiVn: 120, ratio: 0.67, status: 'ok', steps: [], AvPerS: 0, spacing: 0.15 },
    overallStatus: 'ok',
    governingCombos: {
      flexure: { comboId: 1, comboName: '1.2D+1.6L' },
      shear: { comboId: 2, comboName: '1.4D' },
    },
  } as any;

  it('normalizes a beam with flexure + shear', () => {
    const results = normalizeCirsoc201([mockVerif], sectionNames);
    expect(results).toHaveLength(1);

    const r = results[0];
    expect(r.elementId).toBe(1);
    expect(r.elementType).toBe('beam');
    expect(r.sectionName).toBe('25×50');
    expect(r.codeId).toBe('cirsoc');
    expect(r.codeName).toBe('CIRSOC 201');
    expect(r.governingCheck).toBe('Flexure');
    expect(r.utilization).toBe(0.80);
    expect(r.status).toBe('ok');
    expect(r.comboName).toBe('1.2D+1.6L');
    expect(r.checks).toHaveLength(2);
    expect(r.checks[0].name).toBe('Flexure');
    expect(r.checks[0].ratio).toBe(0.80);
    expect(r.checks[1].name).toBe('Shear');
    expect(r.checks[1].ratio).toBe(0.67);
  });

  it('normalizes a column with axial + moment', () => {
    const colVerif: ElementVerification = {
      ...mockVerif,
      elementId: 2,
      elementType: 'column',
      Nu: 500,
      column: { Nu: 500, Mu: 80, phiPn: 600, phiMn: 100, ratio: 0.95, status: 'ok', AsProv: 12, steps: [], spacing: 0.15, bars: '4φ16' },
    } as any;
    const results = normalizeCirsoc201([colVerif], sectionNames);
    expect(results[0].checks).toHaveLength(3); // flexure + shear + axial
    expect(results[0].governingCheck).toBe('Axial + Moment');
    expect(results[0].utilization).toBe(0.95);
  });
});

// ─── CIRSOC 301 (Steel) normalization ───────────────────────────

describe('normalizeCirsoc301', () => {
  const sectionNames = new Map([[10, 'IPE 300']]);

  const mockSteelVerif: SteelVerification = {
    elementId: 10,
    Nu: -200, Muy: 0, Muz: 150, Vu: 60,
    flexureZ: { Mu: 150, Mp: 200, Mn: 190, phiMn: 171, Lp: 2, Lr: 5, ratio: 0.88, status: 'ok', steps: [] },
    shear: { Vu: 60, phiVn: 300, Cv: 1.0, ratio: 0.20, status: 'ok', steps: [] },
    compression: { Pu: 200, KLr: 45, Fcr: 250, phiPn: 1200, ratio: 0.17, status: 'ok', steps: [] },
    interaction: { equation: 'H1-1b', value: 0.61, ratio: 0.61, status: 'ok', steps: [] },
    overallStatus: 'ok',
    steps: [],
    governingCombos: { flexure: { comboId: 1, comboName: '1.2D+1.6L' } },
  } as any;

  it('normalizes a steel member with flexure + shear + compression + interaction', () => {
    const results = normalizeCirsoc301([mockSteelVerif], sectionNames);
    expect(results).toHaveLength(1);

    const r = results[0];
    expect(r.elementId).toBe(10);
    expect(r.sectionName).toBe('IPE 300');
    expect(r.codeId).toBe('cirsoc');
    expect(r.codeName).toBe('CIRSOC 301');
    expect(r.checks.length).toBeGreaterThanOrEqual(4);
    expect(r.utilization).toBe(0.88); // flexure governs over interaction (0.61)
    expect(r.governingCheck).toBe('Flexure (strong)');
    expect(r.status).toBe('ok');
  });
});

// ─── WASM steel (AISC 360) normalization ────────────────────────

describe('normalizeWasmSteel', () => {
  it('normalizes AISC-style results with unity_ratio and governing_check', () => {
    const wasmResults = [{
      element_id: 5,
      unity_ratio: 0.92,
      governing_check: 'Interaction H1-1a',
      tension_ratio: 0.0,
      compression_ratio: 0.45,
      flexure_y_ratio: 0.12,
      flexure_z_ratio: 0.78,
      interaction_ratio: 0.92,
      shear_ratio: 0.15,
      phi_pn_compression: 1500,
      phi_mn_z: 200,
      phi_mn_y: 80,
      phi_vn: 400,
    }];

    const results = normalizeWasmSteel(wasmResults, 'aci-aisc', 'AISC 360', new Map([[5, 'W14×22']]));
    expect(results).toHaveLength(1);

    const r = results[0];
    expect(r.elementId).toBe(5);
    expect(r.codeId).toBe('aci-aisc');
    expect(r.codeName).toBe('AISC 360');
    expect(r.utilization).toBe(0.92);
    expect(r.governingCheck).toBe('Interaction H1-1a');
    expect(r.status).toBe('ok');
    expect(r.sectionName).toBe('W14×22');

    // Should have: compression, flexure strong, flexure weak, shear, interaction
    expect(r.checks.length).toBeGreaterThanOrEqual(4);
    const interaction = r.checks.find(c => c.name === 'Interaction');
    expect(interaction).toBeDefined();
    expect(interaction!.ratio).toBe(0.92);
  });

  it('normalizes EC3-style results with flexure_ratio_y/z fields', () => {
    const ec3Results = [{
      element_id: 7,
      compression_ratio: 0.30,
      tension_ratio: 0.0,
      flexure_ratio_y: 0.65,
      flexure_ratio_z: 0.10,
      shear_ratio: 0.22,
      interaction_ratio: 0.72,
      chi_y: 0.8, chi_z: 0.7, chi_lt: 0.9,
    }];

    const results = normalizeWasmSteel(ec3Results, 'eurocode', 'Eurocode 3', new Map());
    expect(results).toHaveLength(1);
    expect(results[0].codeId).toBe('eurocode');
    expect(results[0].utilization).toBe(0.72); // interaction governs
    expect(results[0].checks.find(c => c.name === 'Flexure (strong)')?.ratio).toBe(0.65);
  });
});

// ─── WASM RC (ACI 318 / EC2) normalization ──────────────────────

describe('normalizeWasmRC', () => {
  it('normalizes ACI-style results', () => {
    const aciResults = [{
      element_id: 3,
      unity_ratio: 0.75,
      governing_check: 'Flexure',
      flexure_ratio: 0.75,
      shear_ratio: 0.40,
      phi_mn: 180000,  // N·m from Rust
      phi_vn: 250000,  // N from Rust
    }];

    const results = normalizeWasmRC(aciResults, 'aci-aisc', 'ACI 318', new Map());
    expect(results).toHaveLength(1);
    expect(results[0].utilization).toBe(0.75);
    expect(results[0].governingCheck).toBe('Flexure');
    expect(results[0].checks).toHaveLength(2);
  });

  it('normalizes EC2-style results', () => {
    const ec2Results = [{
      element_id: 4,
      flexure_ratio: 0.88,
      shear_ratio: 0.55,
      m_rd: 150000,
      v_rd: 200000,
    }];

    const results = normalizeWasmRC(ec2Results, 'eurocode', 'Eurocode 2', new Map());
    expect(results).toHaveLength(1);
    expect(results[0].utilization).toBe(0.88);
    expect(results[0].codeName).toBe('Eurocode 2');
    expect(results[0].checks).toHaveLength(2);
  });
});

// ─── Summary builder ────────────────────────────────────────────

describe('buildDesignSummary', () => {
  it('computes pass/warn/fail counts and sorts by utilization', () => {
    const results: MemberDesignResult[] = [
      { elementId: 1, elementType: 'beam', sectionName: '', codeId: 'test', codeName: 'Test', governingCheck: 'Flexure', utilization: 0.5, status: 'ok', checks: [] },
      { elementId: 2, elementType: 'column', sectionName: '', codeId: 'test', codeName: 'Test', governingCheck: 'Axial', utilization: 1.2, status: 'fail', checks: [] },
      { elementId: 3, elementType: 'beam', sectionName: '', codeId: 'test', codeName: 'Test', governingCheck: 'Shear', utilization: 1.05, status: 'warn', checks: [] },
    ];

    const summary = buildDesignSummary(results, 'test', 'Test Code');
    expect(summary.totalMembers).toBe(3);
    expect(summary.pass).toBe(1);
    expect(summary.warn).toBe(1);
    expect(summary.fail).toBe(1);
    // Sorted worst-first
    expect(summary.results[0].utilization).toBe(1.2);
    expect(summary.results[1].utilization).toBe(1.05);
    expect(summary.results[2].utilization).toBe(0.5);
  });
});
