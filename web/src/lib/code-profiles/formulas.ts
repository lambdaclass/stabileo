/**
 * The closed catalog of formula forms a profile may name. A profile gives the coefficients by
 * name; the code that evaluates the form reads them by the same names.
 */
export interface FormulaForm { expression: string; coefficients: readonly string[] }

export const FORMULAS: Readonly<Record<string, FormulaForm>> = {
  'shear.variableStrut': {
    expression: 'VRd,c = (crdc/γc)·k·(100·ρl·fck)^(1/3) + k1·σcp ≥ (vmin·k^1.5·fck^0.5 + k1·σcp)·bw·d; cotMin ≤ cotθ ≤ cotMax; ν1 = ν·nu1',
    coefficients: ['crdc', 'k1', 'vmin', 'cotMin', 'cotMax', 'nu1'],
  },
  'minSteel.tensileRatio': { expression: 'As,min = max(c·fctm/fyk; floor)·bt·d', coefficients: ['c', 'floor'] },
  'minLinks.sqrtFc': { expression: 'ρw,min = c·√fck/fyk', coefficients: ['c'] },
  'columnSteel.axialOrArea': { expression: 'As,min = max(axial·NEd/fyd; floor·Ac)', coefficients: ['axial', 'floor'] },
  'slenderness.limitABC': { expression: 'λlim = c·A·B·C/√n', coefficients: ['c'] },
  'punching.vmax': { expression: 'vRd,max = c·ν·fcd', coefficients: ['c'] },
};
