<script lang="ts">
  import { cases, type Result } from './cases';
  let { rows, referenceLabel, locale }: { rows: Result[]; referenceLabel: string; locale: string } = $props();
  const force = cases.filter(c => c.kind === 'force');
  const fmt = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(v);
  const bounds = $derived.by(() => {
    const values = rows.filter(r => force.some(c => c.id === r.id)).flatMap(r => [r.u, r.v]).filter((v): v is number => v !== null && Number.isFinite(v));
    values.push(0, ...force.flatMap(c => c.reference ?? []));
    return { min: Math.min(...values), max: Math.max(...values, .01) };
  });
  const x = (a: number) => 50 + a * 30;
  const y = (v: number) => 200 - (v - bounds.min) / (bounds.max - bounds.min) * 165;
  function segments(key: 'u' | 'v') {
    const paths: string[] = []; let segment: string[] = [];
    for (const c of force) {
      const value = rows.find(r => r.id === c.id)?.[key];
      if (value == null) { if (segment.length) paths.push(segment.join(' ')); segment = []; }
      else segment.push(`${x(c.parameter)},${y(value)}`);
    }
    if (segment.length) paths.push(segment.join(' '));
    return paths;
  }
</script>
<svg viewBox="0 0 390 245" role="img" aria-label="u/L, v/L — PL²/EI">
  <path d="M50 30V200H355" fill="none" stroke="currentColor" />
  <text x="5" y="40">{fmt(bounds.max)}</text><text x="5" y="200">{fmt(bounds.min)}</text>
  {#each [0, 2, 5, 10] as a}<text x={x(a)} y="220" text-anchor="middle">{fmt(a)}</text>{/each}
  <text x="180" y="240">PL²/EI</text><text x="55" y="20">u/L, v/L</text>
  {#each ['u', 'v'] as key, i}
    {#each segments(key as 'u' | 'v') as points}<polyline {points} fill="none" stroke={i === 0 ? '#d97706' : '#2563eb'} stroke-width="2" />{/each}
    {#each force.filter(c => c.reference) as c}<circle cx={x(c.parameter)} cy={y(c.reference![i])} r="4" fill="none" stroke={i === 0 ? '#d97706' : '#2563eb'} stroke-width="2" />{/each}
  {/each}
</svg>
<p><span class="u">━ u/L</span> · <span class="v">━ v/L</span> Stabileo · ○ {referenceLabel}</p>
<style>svg { width: 100%; max-height: 19rem; } text { fill: currentColor; font-size: 11px; } p { font-size: .8rem; } .u { color: #d97706; } .v { color: #2563eb; }</style>
