/** Directional compliance, allowing null modes only when neither measured strain uses them. */
export function uniaxial(c: number[][], angle: number): [number, number] | null {
  const co = Math.cos(angle), si = Math.sin(angle);
  const along = [co * co, si * si, 2 * co * si];
  const across = [si * si, co * co, -2 * co * si];
  const scale = Math.max(...c.flat().map(Math.abs));
  if (!Number.isFinite(scale) || scale === 0) return null;
  const a = c.map((row, i) => [...row.map(v => v / scale), along[i]]);
  const pivots: number[] = [];
  for (let col = 0; col < 3; col++) {
    const row = pivots.length;
    let best = row;
    for (let i = row + 1; i < 3; i++) if (Math.abs(a[i][col]) > Math.abs(a[best][col])) best = i;
    if (Math.abs(a[best][col]) <= 1e-12) continue;
    [a[row], a[best]] = [a[best], a[row]];
    const pivot = a[row][col];
    a[row] = a[row].map(v => v / pivot);
    for (let i = 0; i < 3; i++) {
      if (i === row) continue;
      const factor = a[i][col];
      a[i] = a[i].map((v, j) => v - factor * a[row][j]);
    }
    pivots.push(col);
  }
  if (a.slice(pivots.length).some(row => Math.abs(row[3]) > 1e-12)) return null;
  const dot = (u: number[], v: number[]) => u.reduce((sum, x, i) => sum + x * v[i], 0);
  for (let free = 0; free < 3; free++) {
    if (pivots.includes(free)) continue;
    const nullMode = [0, 0, 0];
    nullMode[free] = 1;
    pivots.forEach((col, row) => { nullMode[col] = -a[row][free]; });
    if (Math.abs(dot(along, nullMode)) > 1e-12 || Math.abs(dot(across, nullMode)) > 1e-12) return null;
  }
  const e = [0, 0, 0];
  pivots.forEach((col, row) => { e[col] = a[row][3]; });
  const enn = dot(along, e);
  return enn > 0 ? [scale / enn, -dot(across, e) / enn] : null;
}
