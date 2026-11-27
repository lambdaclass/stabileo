const placeholders = { xBar: '{xBar}', length: '{L}', raw: '{raw}', capped: '{U}' };

export function shearLagTrace(decimal: '.' | ',', values = placeholders): string {
  return `1 − x̄/L = 1 − ${values.xBar}/${values.length} = ${values.raw}. U = min(1 − x̄/L, 0${decimal}9) = ${values.capped}  (D.3.2)`;
}
