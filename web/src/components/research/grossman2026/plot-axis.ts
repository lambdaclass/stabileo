function step(lo: number, hi: number, n = 5): number {
  const raw = (hi - lo) / n || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) ?? raw;
}
export function axis(lo: number, hi: number, fixed: boolean) {
  const s = step(lo, hi);
  const a = fixed ? lo : Math.floor(lo / s + 1e-9) * s;
  const b = fixed ? hi : Math.ceil(hi / s - 1e-9) * s;
  const ticks: number[] = [];
  for (let v = Math.ceil(a / s - 1e-9) * s; v <= b + s * 1e-6; v += s) ticks.push(Number(v.toPrecision(10)));
  let decimals = Math.max(0, -Math.floor(Math.log10(s) + 1e-9));
  if (Math.abs(s * 10 ** decimals - Math.round(s * 10 ** decimals)) > 1e-9) decimals += 1;
  return { domain: [a, b] as [number, number], ticks, decimals };
}
