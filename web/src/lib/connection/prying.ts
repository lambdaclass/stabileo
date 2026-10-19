/**
 * Prying on a bolted T-stub or end plate in tension: the plate bends and its edge bears, adding a
 * prying force to each bolt. The bolt's design tension B, the plate t, the pitch p per bolt, the
 * bolt-to-web distance b and the bolt-to-edge distance a (mm, MPa, kN):
 *
 *   b' = b − db/2, a' = min(a, 1,25b) + db/2, ρ = b'/a', δ = 1 − d'/p;
 *   tc = √(4·B·b'/(φ·p·Fu)), φ = 0,90 (the plate thick enough for no prying);
 *   α' = [(tc/t)² − 1]/(δ(1 + ρ)), within 0 and 1;
 *   available tension per bolt T = B·(t/tc)²·(1 + δ·α'), not more than B.
 */
export function pryingCapacity(i: { B: number; t: number; p: number; b: number; a: number; db: number; dh: number; Fu: number }): { tc: number; perBolt: number; alpha: number } {
  const bp = i.b - i.db / 2, ap = Math.min(i.a, 1.25 * i.b) + i.db / 2, rho = bp / ap, delta = 1 - i.dh / i.p;
  const tc = Math.sqrt((4 * i.B * 1000 * bp) / (0.9 * i.p * i.Fu));
  const alpha = Math.max(0, Math.min(1, ((tc / i.t) ** 2 - 1) / (delta * (1 + rho))));
  const perBolt = i.t >= tc ? i.B : Math.min(i.B, i.B * (i.t / tc) ** 2 * (1 + delta * alpha));
  return { tc, perBolt, alpha };
}
