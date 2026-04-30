/**
 * Unified design-check results normalization layer.
 *
 * Normalizes results from all supported design-code paths (CIRSOC JS, WASM steel,
 * WASM RC, EC2, EC3, etc.) into a single product-facing interface so the Design
 * tab, viewport overlay, and reports can consume one coherent data structure.
 */

// ─── Unified interfaces ──────────────────────────────────────────

export type CheckStatus = 'ok' | 'warn' | 'fail';

/** One individual design check (flexure, shear, interaction, etc.) */
export interface CheckDetail {
  name: string;           // "Flexure", "Shear", "Compression", "Interaction H1-1a", etc.
  demand: number;         // kN or kN·m (demand)
  capacity: number;       // kN or kN·m (design capacity, φ-reduced)
  ratio: number;          // demand / capacity
  unit: string;           // "kN" or "kN·m"
  status: CheckStatus;
  comboName?: string;     // governing combination if known
}

/** Unified per-member design check summary */
export interface MemberDesignResult {
  elementId: number;
  elementType: 'beam' | 'column' | 'wall' | 'brace' | 'other';
  sectionName: string;        // e.g., "IPE 300", "25×50"
  codeId: string;             // 'cirsoc' | 'aci-aisc' | 'eurocode' | etc.
  codeName: string;           // "CIRSOC 201" | "AISC 360" | etc.
  governingCheck: string;     // name of the check with highest ratio
  utilization: number;        // max ratio across all checks (0–∞, ≤1.0 = pass)
  status: CheckStatus;
  comboName?: string;         // governing combo for the governing check
  checks: CheckDetail[];      // all individual checks
}

/** Aggregate summary for the full design check run */
export interface DesignCheckSummary {
  codeId: string;
  codeName: string;
  totalMembers: number;
  pass: number;
  warn: number;
  fail: number;
  results: MemberDesignResult[];
}

// ─── Status helpers ──────────────────────────────────────────────

function ratioToStatus(ratio: number): CheckStatus {
  if (ratio <= 1.0) return 'ok';
  if (ratio <= 1.1) return 'warn';
  return 'fail';
}

function worstStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  return 'ok';
}

// ─── CIRSOC 201 (RC, JS) adapter ─────────────────────────────────

import type { ElementVerification } from './codes/argentina/cirsoc201';

export function normalizeCirsoc201(verifs: ElementVerification[], sectionNames: Map<number, string>): MemberDesignResult[] {
  return verifs.map(v => {
    const checks: CheckDetail[] = [];

    checks.push({
      name: 'Flexure',
      demand: Math.abs(v.Mu),
      capacity: v.flexure.phiMn,
      ratio: v.flexure.ratio,
      unit: 'kN·m',
      status: v.flexure.status as CheckStatus,
      comboName: v.governingCombos?.flexure?.comboName,
    });

    checks.push({
      name: 'Shear',
      demand: Math.abs(v.Vu),
      capacity: v.shear.phiVn,
      ratio: v.shear.ratio,
      unit: 'kN',
      status: v.shear.status as CheckStatus,
      comboName: v.governingCombos?.shear?.comboName,
    });

    if (v.column) {
      checks.push({
        name: 'Axial + Moment',
        demand: Math.abs(v.Nu),
        capacity: v.column.phiPn,
        ratio: v.column.ratio,
        unit: 'kN',
        status: v.column.status as CheckStatus,
        comboName: v.governingCombos?.axial?.comboName,
      });
    }

    if (v.torsion && !v.torsion.neglect) {
      checks.push({
        name: 'Torsion',
        demand: Math.abs(v.torsion.Tu),
        capacity: v.torsion.phiTn,
        ratio: v.torsion.ratio,
        unit: 'kN·m',
        status: v.torsion.status as CheckStatus,
        comboName: v.governingCombos?.torsion?.comboName,
      });
    }

    if (v.biaxial) {
      checks.push({
        name: 'Biaxial (Bresler)',
        demand: Math.abs(v.Nu),
        capacity: v.biaxial.phiPn,
        ratio: v.biaxial.ratio,
        unit: 'kN',
        status: v.biaxial.status as CheckStatus,
        comboName: v.governingCombos?.axial?.comboName,
      });
    }

    const governing = checks.reduce((max, c) => c.ratio > max.ratio ? c : max, checks[0]);

    return {
      elementId: v.elementId,
      elementType: v.elementType,
      sectionName: sectionNames.get(v.elementId) ?? `${(v.b * 100).toFixed(0)}×${(v.h * 100).toFixed(0)}`,
      codeId: 'cirsoc',
      codeName: 'CIRSOC 201',
      governingCheck: governing.name,
      utilization: governing.ratio,
      status: v.overallStatus as CheckStatus,
      comboName: governing.comboName,
      checks,
    };
  });
}

// ─── CIRSOC 301 (Steel, JS) adapter ─────────────────────────────

import type { SteelVerification } from './codes/argentina/cirsoc301';

export function normalizeCirsoc301(verifs: SteelVerification[], sectionNames: Map<number, string>): MemberDesignResult[] {
  return verifs.map(v => {
    const checks: CheckDetail[] = [];

    checks.push({
      name: 'Flexure (strong)',
      demand: Math.abs(v.Muz),
      capacity: v.flexureZ.phiMn,
      ratio: v.flexureZ.ratio,
      unit: 'kN·m',
      status: v.flexureZ.status as CheckStatus,
      comboName: v.governingCombos?.flexure?.comboName,
    });

    if (v.flexureY) {
      checks.push({
        name: 'Flexure (weak)',
        demand: Math.abs(v.Muy),
        capacity: v.flexureY.phiMn,
        ratio: v.flexureY.ratio,
        unit: 'kN·m',
        status: v.flexureY.status as CheckStatus,
      });
    }

    checks.push({
      name: 'Shear',
      demand: Math.abs(v.Vu),
      capacity: v.shear.phiVn,
      ratio: v.shear.ratio,
      unit: 'kN',
      status: v.shear.status as CheckStatus,
      comboName: v.governingCombos?.shear?.comboName,
    });

    if (v.tension) {
      checks.push({
        name: 'Tension',
        demand: Math.abs(v.Nu),
        capacity: v.tension.phiPn,
        ratio: v.tension.ratio,
        unit: 'kN',
        status: v.tension.status as CheckStatus,
        comboName: v.governingCombos?.axial?.comboName,
      });
    }

    if (v.compression) {
      checks.push({
        name: 'Compression',
        demand: Math.abs(v.Nu),
        capacity: v.compression.phiPn,
        ratio: v.compression.ratio,
        unit: 'kN',
        status: v.compression.status as CheckStatus,
        comboName: v.governingCombos?.axial?.comboName,
      });
    }

    if (v.interaction) {
      checks.push({
        name: `Interaction ${v.interaction.equation}`,
        demand: v.interaction.value,
        capacity: 1.0,
        ratio: v.interaction.ratio,
        unit: '—',
        status: v.interaction.status as CheckStatus,
      });
    }

    const governing = checks.reduce((max, c) => c.ratio > max.ratio ? c : max, checks[0]);

    return {
      elementId: v.elementId,
      elementType: 'other',  // Steel classification not available in CIRSOC 301 results
      sectionName: sectionNames.get(v.elementId) ?? '—',
      codeId: 'cirsoc',
      codeName: 'CIRSOC 301',
      governingCheck: governing.name,
      utilization: governing.ratio,
      status: v.overallStatus as CheckStatus,
      comboName: governing.comboName,
      checks,
    };
  });
}

// ─── WASM steel check adapter (AISC 360 / EC3) ──────────────────

/**
 * Normalize WASM steel check results (AISC 360 or EC3).
 * Both have: element_id, unity_ratio, governing_check, and per-check ratios.
 * Fields use snake_case from Rust serde.
 */
export function normalizeWasmSteel(results: any[], codeId: string, codeName: string, sectionNames: Map<number, string>): MemberDesignResult[] {
  if (!results || !Array.isArray(results)) return [];
  return results.map((r: any) => {
    const checks: CheckDetail[] = [];
    const id = r.element_id ?? r.elementId;

    if (r.tension_ratio != null && r.tension_ratio > 0) {
      checks.push({ name: 'Tension', demand: 0, capacity: r.phi_pn_tension ?? 0, ratio: r.tension_ratio, unit: 'kN', status: ratioToStatus(r.tension_ratio) });
    }
    if (r.compression_ratio != null && r.compression_ratio > 0) {
      checks.push({ name: 'Compression', demand: 0, capacity: r.phi_pn_compression ?? 0, ratio: r.compression_ratio, unit: 'kN', status: ratioToStatus(r.compression_ratio) });
    }
    if (r.flexure_z_ratio != null) {
      checks.push({ name: 'Flexure (strong)', demand: 0, capacity: r.phi_mn_z ?? 0, ratio: r.flexure_z_ratio, unit: 'kN·m', status: ratioToStatus(r.flexure_z_ratio) });
    }
    if (r.flexure_y_ratio != null) {
      checks.push({ name: 'Flexure (weak)', demand: 0, capacity: r.phi_mn_y ?? 0, ratio: r.flexure_y_ratio, unit: 'kN·m', status: ratioToStatus(r.flexure_y_ratio) });
    }
    // EC3 uses flexure_ratio_y and flexure_ratio_z
    if (r.flexure_ratio_y != null) {
      checks.push({ name: 'Flexure (strong)', demand: 0, capacity: 0, ratio: r.flexure_ratio_y, unit: 'kN·m', status: ratioToStatus(r.flexure_ratio_y) });
    }
    if (r.flexure_ratio_z != null) {
      checks.push({ name: 'Flexure (weak)', demand: 0, capacity: 0, ratio: r.flexure_ratio_z, unit: 'kN·m', status: ratioToStatus(r.flexure_ratio_z) });
    }
    if (r.shear_ratio != null) {
      checks.push({ name: 'Shear', demand: 0, capacity: r.phi_vn ?? r.v_pl_rd ?? 0, ratio: r.shear_ratio, unit: 'kN', status: ratioToStatus(r.shear_ratio) });
    }
    if (r.interaction_ratio != null && r.interaction_ratio > 0) {
      checks.push({ name: 'Interaction', demand: r.interaction_ratio, capacity: 1.0, ratio: r.interaction_ratio, unit: '—', status: ratioToStatus(r.interaction_ratio) });
    }

    const unity = r.unity_ratio ?? r.utilization ?? (checks.length > 0 ? Math.max(...checks.map(c => c.ratio)) : 0);
    const govCheck = r.governing_check ?? (checks.length > 0 ? checks.reduce((m, c) => c.ratio > m.ratio ? c : m).name : '—');

    return {
      elementId: id,
      elementType: 'other' as const,
      sectionName: sectionNames.get(id) ?? '—',
      codeId,
      codeName,
      governingCheck: govCheck,
      utilization: unity,
      status: ratioToStatus(unity),
      checks,
    };
  });
}

// ─── WASM RC check adapter (ACI 318 / EC2) ──────────────────────

export function normalizeWasmRC(results: any[], codeId: string, codeName: string, sectionNames: Map<number, string>): MemberDesignResult[] {
  if (!results || !Array.isArray(results)) return [];
  return results.map((r: any) => {
    const checks: CheckDetail[] = [];
    const id = r.element_id ?? r.elementId;

    if (r.flexure_ratio != null) {
      checks.push({ name: 'Flexure', demand: 0, capacity: r.phi_mn ?? r.m_rd ?? 0, ratio: r.flexure_ratio, unit: 'kN·m', status: ratioToStatus(r.flexure_ratio) });
    }
    if (r.shear_ratio != null) {
      checks.push({ name: 'Shear', demand: 0, capacity: r.phi_vn ?? r.v_rd ?? 0, ratio: r.shear_ratio, unit: 'kN', status: ratioToStatus(r.shear_ratio) });
    }

    const unity = r.unity_ratio ?? (checks.length > 0 ? Math.max(...checks.map(c => c.ratio)) : 0);
    const govCheck = r.governing_check ?? (checks.length > 0 ? checks.reduce((m, c) => c.ratio > m.ratio ? c : m).name : '—');

    return {
      elementId: id,
      elementType: 'other' as const,
      sectionName: sectionNames.get(id) ?? '—',
      codeId,
      codeName,
      governingCheck: govCheck,
      utilization: unity,
      status: ratioToStatus(unity),
      checks,
    };
  });
}

// ─── Build summary from normalized results ───────────────────────

export function buildDesignSummary(results: MemberDesignResult[], codeId: string, codeName: string): DesignCheckSummary {
  return {
    codeId,
    codeName,
    totalMembers: results.length,
    pass: results.filter(r => r.status === 'ok').length,
    warn: results.filter(r => r.status === 'warn').length,
    fail: results.filter(r => r.status === 'fail').length,
    results: results.sort((a, b) => b.utilization - a.utilization),
  };
}
