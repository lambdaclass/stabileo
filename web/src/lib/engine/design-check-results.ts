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

/**
 * Above 1,0 is a failure, never a warning: no code these checkers implement grants an
 * overstress band. This read 1,0 < ratio ≤ 1,1 as 'warn', which put a member 10 % over its
 * design strength in amber next to CIRSOC 201's 'warn', a pass between 0,9 and 1,0. A ratio
 * that is not a number is not a pass either.
 */
export function ratioToStatus(ratio: number): CheckStatus {
  return ratio <= 1.0 ? 'ok' : 'fail';
}

/** The engine's own verdict: an explicit `pass: false` or an unevaluated check is a failure. */
function engineRefused(r: any): boolean {
  return r.pass === false || (Array.isArray(r.unevaluated) && r.unevaluated.length > 0);
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
 * The engine's results are camelCase (serde `rename_all = "camelCase"`). These normalisers read
 * snake_case, so a real engine result had no ratio they could see and every member came out as
 * "not checked". Both spellings are accepted; camelCase is what the engine sends.
 */
function camelKeys(r: any): any {
  if (!r || typeof r !== 'object') return r;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  return out;
}

/**
 * Normalize WASM steel check results (AISC 360 or EC3).
 * Both have: element_id, unity_ratio, governing_check, and per-check ratios.
 * Fields use snake_case from Rust serde.
 */
export function normalizeWasmSteel(results: any[], codeId: string, codeName: string, sectionNames: Map<number, string>): MemberDesignResult[] {
  if (!results || !Array.isArray(results)) return [];
  return results.map((raw: any) => {
    const r = camelKeys(raw);
    const checks: CheckDetail[] = [];
    const id = r.elementId ?? r.elementId;

    if (r.tensionRatio != null && r.tensionRatio > 0) {
      checks.push({ name: 'Tension', demand: 0, capacity: r.phiPnTension ?? 0, ratio: r.tensionRatio, unit: 'kN', status: ratioToStatus(r.tensionRatio) });
    }
    if (r.compressionRatio != null && r.compressionRatio > 0) {
      checks.push({ name: 'Compression', demand: 0, capacity: r.phiPnCompression ?? 0, ratio: r.compressionRatio, unit: 'kN', status: ratioToStatus(r.compressionRatio) });
    }
    if (r.flexureZRatio != null) {
      checks.push({ name: 'Flexure (strong)', demand: 0, capacity: r.phiMnZ ?? 0, ratio: r.flexureZRatio, unit: 'kN·m', status: ratioToStatus(r.flexureZRatio) });
    }
    if (r.flexureYRatio != null) {
      checks.push({ name: 'Flexure (weak)', demand: 0, capacity: r.phiMnY ?? 0, ratio: r.flexureYRatio, unit: 'kN·m', status: ratioToStatus(r.flexureYRatio) });
    }
    // EC3 uses flexure_ratio_y and flexure_ratio_z
    if (r.flexureRatioY != null) {
      checks.push({ name: 'Flexure (strong)', demand: 0, capacity: 0, ratio: r.flexureRatioY, unit: 'kN·m', status: ratioToStatus(r.flexureRatioY) });
    }
    if (r.flexureRatioZ != null) {
      checks.push({ name: 'Flexure (weak)', demand: 0, capacity: 0, ratio: r.flexureRatioZ, unit: 'kN·m', status: ratioToStatus(r.flexureRatioZ) });
    }
    if (r.shearRatio != null) {
      checks.push({ name: 'Shear', demand: 0, capacity: r.phiVn ?? r.vPlRd ?? 0, ratio: r.shearRatio, unit: 'kN', status: ratioToStatus(r.shearRatio) });
    }
    if (r.interactionRatio != null && r.interactionRatio > 0) {
      checks.push({ name: 'Interaction', demand: r.interactionRatio, capacity: 1.0, ratio: r.interactionRatio, unit: '—', status: ratioToStatus(r.interactionRatio) });
    }

    // A member that produced no individual checks AND carries no explicit
    // unity ratio was never actually verified (solver skipped it, or a serde
    // field rename dropped every ratio). Treat it as unverified rather than
    // letting unity default to 0 → a falsely-green "ok".
    const verifiable = checks.length > 0 || r.unityRatio != null || r.utilization != null;
    const unity = r.unityRatio ?? r.utilization ?? (checks.length > 0 ? Math.max(...checks.map(c => c.ratio)) : 0);
    const govCheck = r.governingCheck ?? (checks.length > 0 ? checks.reduce((m, c) => c.ratio > m.ratio ? c : m).name : (verifiable ? '—' : 'Not checked'));

    return {
      elementId: id,
      elementType: 'other' as const,
      sectionName: sectionNames.get(id) ?? '—',
      codeId,
      codeName,
      governingCheck: govCheck,
      utilization: unity,
      status: verifiable && !engineRefused(r) ? ratioToStatus(unity) : 'fail',
      checks,
    };
  });
}

// ─── WASM RC check adapter (ACI 318 / EC2) ──────────────────────

export function normalizeWasmRC(results: any[], codeId: string, codeName: string, sectionNames: Map<number, string>): MemberDesignResult[] {
  if (!results || !Array.isArray(results)) return [];
  return results.map((raw: any) => {
    const r = camelKeys(raw);
    const checks: CheckDetail[] = [];
    const id = r.elementId ?? r.elementId;

    if (r.flexureRatio != null) {
      checks.push({ name: 'Flexure', demand: 0, capacity: r.phiMn ?? r.mRd ?? 0, ratio: r.flexureRatio, unit: 'kN·m', status: ratioToStatus(r.flexureRatio) });
    }
    if (r.shearRatio != null) {
      checks.push({ name: 'Shear', demand: 0, capacity: r.phiVn ?? r.vRd ?? 0, ratio: r.shearRatio, unit: 'kN', status: ratioToStatus(r.shearRatio) });
    }

    // See normalizeWasmSteel: an empty result with no explicit unity ratio is
    // "not checked", not a pass.
    const verifiable = checks.length > 0 || r.unityRatio != null || r.utilization != null;
    const unity = r.unityRatio ?? r.utilization ?? (checks.length > 0 ? Math.max(...checks.map(c => c.ratio)) : 0);
    const govCheck = r.governingCheck ?? (checks.length > 0 ? checks.reduce((m, c) => c.ratio > m.ratio ? c : m).name : (verifiable ? '—' : 'Not checked'));

    return {
      elementId: id,
      elementType: 'other' as const,
      sectionName: sectionNames.get(id) ?? '—',
      codeId,
      codeName,
      governingCheck: govCheck,
      utilization: unity,
      status: verifiable && !engineRefused(r) ? ratioToStatus(unity) : 'fail',
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
