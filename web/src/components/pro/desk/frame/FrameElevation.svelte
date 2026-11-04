<script lang="ts">
  /**
   * The elevation of a beam line in the frame editor: the spans between the columns, the bars on
   * each face by row with their marks and hooks, the stirrup zones, each span's length, and under
   * it the steel the moments ask for against the steel the bars give, face by face. Clicking a bar
   * or a zone selects it; clicking elsewhere sets the point the check reads.
   *
   * The moment diagram goes on the beam or in a band below it, the envelope or one combination,
   * and optionally shifted by d (§9.7.3.3), drawn under the plain one so the shift reads as the
   * reason a bar runs on. The last band is the stirrups: the Av/s the shear, the torsion or both
   * ask (with or without the minimum) against the Av/s the zones give.
   */
  import type { BeamLineReinforcement } from '../../../../lib/design-contract/beam-line';
  import { areaAt, memberOffsets } from '../../../../lib/engine/design/beam-line';
  import { transverseAt, type DemandPoint, type TransversePoint } from '../../../../lib/engine/design/beam-line-demand';
  import type { LineOpening } from '../../../../lib/store/line-openings';
  import { t } from '../../../../lib/i18n';

  interface Props {
    line: BeamLineReinforcement;
    faces: Array<{ start: number; end: number }>;
    demand: DemandPoint[];
    selectedBar: string | null;
    secondBar: string | null;
    selectedZone: string | null;
    pointX: number | null;
    failing: Set<number>;
    onBar: (id: string, additive: boolean) => void;
    onZone: (id: string) => void;
    onPoint: (x: number) => void;
    /** The demand shifted by d, drawn with the plain one when given. */
    shifted?: DemandPoint[] | null;
    /** Where the moment diagram goes: on the beam or in its own band below. */
    lawOn?: 'beam' | 'below';
    transverse?: TransversePoint[];
    tMode?: 'shear' | 'torsion' | 'both';
    tMin?: boolean;
    /** Web openings placed on the line's members. */
    holes?: LineOpening[];
  }
  let { line, faces, demand, selectedBar, secondBar, selectedZone, pointX, failing, onBar, onZone, onPoint,
    shifted = null, lawOn = 'below', transverse = [], tMode = 'both', tMin = true, holes = [] }: Props = $props();

  const W = 960, M = 40, TOP = 40, H = 110;
  const total = $derived(line.lengths.reduce((s, l) => s + l, 0));
  const sx = $derived((W - 2 * M) / Math.max(total, 1e-6));
  const X = (x: number) => M + x * sx;
  const offs = $derived(memberOffsets(line));
  const nodes = $derived([...offs, total]);
  /** Bar marks: top bars then bottom, each face by where it starts, numbered along the line. */
  const marks = $derived(new Map([...line.bars].sort((p, q) => (p.face === q.face ? 0 : p.face === 'top' ? -1 : 1) || p.from - q.from || p.row - q.row).map((b, i) => [b.id, i + 1])));
  const yTop = (row: number) => TOP + 12 + row * 9;
  const yBot = (row: number) => TOP + H - 12 - row * 9;
  const zoneY = TOP + H + 34;
  const dimY = zoneY + 38;
  const diaTop = dimY + 26, diaH = 120;
  const mid = $derived(diaTop + diaH / 2);
  const lawTop = diaTop + diaH + 14, lawH = 110;
  const lawMid = $derived(lawOn === 'beam' ? TOP + H / 2 : lawTop + lawH / 2);
  const lawHalf = $derived(lawOn === 'beam' ? H / 2 - 4 : lawH / 2 - 6);
  const tTop = $derived(lawOn === 'beam' ? diaTop + diaH + 14 : lawTop + lawH + 14), tH = 90;
  const height = $derived(transverse.length ? tTop + tH + 10 : (lawOn === 'beam' ? diaTop + diaH + 10 : lawTop + lawH + 10));

  // ── The moment diagram: sagging below the axis, hogging above, as the tension side reads ──
  const mMax = $derived(Math.max(1e-6, ...[...demand, ...(shifted ?? [])].map((d) => Math.max(d.mPos, d.mNeg))));
  const my = (m: number) => (m / mMax) * lawHalf;
  const law = (pts: readonly DemandPoint[], face: 'pos' | 'neg') =>
    path(pts.map((d) => [X(d.x), lawMid + (face === 'pos' ? my(d.mPos) : -my(d.mNeg))]));
  const lawPos = $derived(law(demand, 'pos')), lawNeg = $derived(law(demand, 'neg'));
  const shPos = $derived(shifted ? law(shifted, 'pos') : ''), shNeg = $derived(shifted ? law(shifted, 'neg') : '');

  // ── Stirrups: asked against given, cm²/m ──
  const tNeed = (p: TransversePoint) => Math.max(tMode === 'shear' ? p.shear : tMode === 'torsion' ? p.torsion : p.shear + p.torsion, tMin ? p.min : 0);
  const tSamples = $derived.by(() => {
    const xs = new Set<number>(transverse.map((p) => p.x));
    for (const z of line.stirrups) { xs.add(z.from); xs.add(z.to); }
    return [...xs].filter((x) => x >= 0 && x <= total).sort((a, b) => a - b);
  });
  const tMax = $derived(Math.max(1e-6, ...transverse.map(tNeed), ...tSamples.map((x) => transverseAt(line.stirrups, x))));
  const ty = (v: number) => tTop + tH - 4 - (v / tMax) * (tH - 14);
  const tNeedPath = $derived(path(transverse.map((p) => [X(p.x), ty(tNeed(p))])));
  const tGivePath = $derived.by(() => {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < tSamples.length - 1; i++) {
      const a = tSamples[i]!, b = tSamples[i + 1]!, v = ty(transverseAt(line.stirrups, (a + b) / 2));
      pts.push([X(a), v], [X(b), v]);
    }
    return path(pts);
  });

  // ── Needed against provided ──
  const samples = $derived.by(() => {
    const xs = new Set<number>(demand.map((d) => d.x));
    for (const b of line.bars) { xs.add(b.from); xs.add(b.to); }
    return [...xs].filter((x) => x >= 0 && x <= total).sort((a, b) => a - b);
  });
  const finite = (v: number) => (Number.isFinite(v) ? v : 0);
  const aMax = $derived(Math.max(1, ...demand.map((d) => Math.max(finite(d.asBottom), finite(d.asTop))), ...samples.map((x) => Math.max(areaAt(line, 'bottom', x), areaAt(line, 'top', x)))));
  const ay = (a: number) => (a / aMax) * (diaH / 2 - 6);
  const path = (pts: Array<[number, number]>) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const needBottom = $derived(path(demand.map((d) => [X(d.x), mid + ay(finite(d.asBottom))])));
  const needTop = $derived(path(demand.map((d) => [X(d.x), mid - ay(finite(d.asTop))])));
  const step = (face: 'top' | 'bottom') => {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i]!, b = samples[i + 1]!, m = (a + b) / 2;
      const v = ay(areaAt(line, face, m)) * (face === 'bottom' ? 1 : -1);
      pts.push([X(a), mid + v], [X(b), mid + v]);
    }
    return path(pts);
  };
  const giveBottom = $derived(step('bottom'));
  const giveTop = $derived(step('top'));

  function background(e: MouseEvent) {
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    onPoint(Math.max(0, Math.min(total, (x - M) / sx)));
  }
</script>

<svg class="fe" viewBox="0 0 {W} {height}" role="img" aria-label={t('frameEd.elevation')} data-testid="frame-elevation" onclick={background}>
  <!-- Beam outline and columns -->
  <rect x={X(0)} y={TOP} width={total * sx} height={H} class="fe-beam" />
  {#each line.members as id, i (id)}
    <rect x={X(offs[i]!)} y={TOP} width={line.lengths[i]! * sx} height={H} class="fe-span" class:fe-fail={failing.has(id)} />
  {/each}
  {#each nodes as x, i (i)}
    {@const f = i === 0 ? faces[0]?.start ?? 0 : i === nodes.length - 1 ? faces[faces.length - 1]?.end ?? 0 : Math.max(faces[i - 1]?.end ?? 0, faces[i]?.start ?? 0)}
    <rect x={X(x) - Math.max(f * sx, 3)} y={TOP - 18} width={Math.max(2 * f * sx, 6)} height={H + 36} class="fe-col" />
  {/each}

  <!-- Bars -->
  {#each line.bars as b (b.id)}
    {@const y = b.face === 'top' ? yTop(b.row) : yBot(b.row)}
    {@const sel = b.id === selectedBar || b.id === secondBar}
    <g class="fe-bar" class:sel role="button" tabindex="0" aria-label={`${b.count}Ø${b.diameter}`}
       onclick={(e) => { e.stopPropagation(); onBar(b.id, e.shiftKey); }} onkeydown={(e) => { if (e.key === 'Enter') onBar(b.id, e.shiftKey); }}
       data-testid="frame-bar-{b.id}">
      <line x1={X(b.from)} y1={y} x2={X(b.to)} y2={y} />
      <line x1={X(b.from)} y1={y} x2={X(b.to)} y2={y} class="fe-hit" />
      {#if b.hookStart}<line x1={X(b.from)} y1={y} x2={X(b.from)} y2={y + (b.face === 'top' ? 10 : -10)} />{/if}
      {#if b.hookEnd}<line x1={X(b.to)} y1={y} x2={X(b.to)} y2={y + (b.face === 'top' ? 10 : -10)} />{/if}
      <text x={(X(b.from) + X(b.to)) / 2} y={b.face === 'top' ? y - 3 : y + 11} text-anchor="middle">({marks.get(b.id)}) {b.count}Ø{b.diameter} L={(b.to - b.from).toFixed(2)}</text>
    </g>
  {/each}

  <!-- Stirrup zones -->
  {#each line.stirrups as z (z.id)}
    <g class="fe-zone" class:sel={z.id === selectedZone} role="button" tabindex="0"
       onclick={(e) => { e.stopPropagation(); onZone(z.id); }} onkeydown={(e) => { if (e.key === 'Enter') onZone(z.id); }} data-testid="frame-zone-{z.id}">
      <rect x={X(z.from) + 1} y={zoneY} width={Math.max((z.to - z.from) * sx - 2, 2)} height={16} />
      <text x={(X(z.from) + X(z.to)) / 2} y={zoneY + 11} text-anchor="middle">eØ{z.diameter}{z.legs > 2 ? `×${z.legs}` : ''} c/{(z.spacing * 100).toFixed(1)}</text>
    </g>
  {/each}

  <!-- Span lengths -->
  {#each line.members as id, i (id)}
    <line x1={X(offs[i]!)} y1={dimY} x2={X(offs[i]! + line.lengths[i]!)} y2={dimY} class="fe-dim" />
    <line x1={X(offs[i]!)} y1={dimY - 4} x2={X(offs[i]!)} y2={dimY + 4} class="fe-dim" />
    <text x={X(offs[i]! + line.lengths[i]! / 2)} y={dimY - 3} text-anchor="middle" class="fe-dimt">{line.lengths[i]!.toFixed(2)} m</text>
  {/each}
  <line x1={X(total)} y1={dimY - 4} x2={X(total)} y2={dimY + 4} class="fe-dim" />

  <!-- Needed against provided -->
  <line x1={X(0)} y1={mid} x2={X(total)} y2={mid} class="fe-axis" />
  <text x={4} y={mid - diaH / 2 + 10} class="fe-dimt">{t('frameEd.top')}</text>
  <text x={4} y={mid + diaH / 2 - 2} class="fe-dimt">{t('frameEd.bottom')}</text>
  <path d={giveTop} class="fe-give" /><path d={giveBottom} class="fe-give" />
  <path d={needTop} class="fe-need" /><path d={needBottom} class="fe-need" />

  <!-- Web openings -->
  {#each holes as o (o.entry.id)}
    {@const hh = Math.max(4, o.hShare * H)}
    <rect x={X(o.from)} y={TOP + H / 2 - o.offShare * H - hh / 2} width={Math.max(2, (o.to - o.from) * sx)} height={hh}
      class="fe-hole" class:fe-fail={o.status === 'fail'} data-testid="frame-hole-{o.entry.id}" />
  {/each}

  <!-- Cross-sections placed on the line -->
  {#each line.cuts ?? [] as c (c.id)}
    <g class="fe-cut" data-testid="frame-cut-{c.label}">
      <line x1={X(c.x)} y1={TOP - 12} x2={X(c.x)} y2={TOP + H + 12} />
      <text x={X(c.x)} y={TOP - 14} text-anchor="middle">{c.label}</text>
      <text x={X(c.x)} y={TOP + H + 22} text-anchor="middle">{c.label}</text>
    </g>
  {/each}

  <!-- Moment diagram -->
  <g data-testid="frame-law" data-on={lawOn}>
    {#if lawOn === 'below'}
      <line x1={X(0)} y1={lawMid} x2={X(total)} y2={lawMid} class="fe-axis" />
      <text x={4} y={lawTop + 10} class="fe-dimt">Mu</text>
    {/if}
    {#if shifted}<path d={shPos} class="fe-shift" data-testid="frame-law-shifted" /><path d={shNeg} class="fe-shift" />{/if}
    <path d={lawPos} class="fe-law" /><path d={lawNeg} class="fe-law" />
    <text x={W - 4} y={lawMid - lawHalf + 9} text-anchor="end" class="fe-dimt">{mMax.toFixed(1)} kN·m</text>
  </g>

  <!-- Stirrups: asked against given -->
  {#if transverse.length}
    <g data-testid="frame-transverse" data-mode={tMode}>
      <line x1={X(0)} y1={tTop + tH - 4} x2={X(total)} y2={tTop + tH - 4} class="fe-axis" />
      <text x={4} y={tTop + 10} class="fe-dimt">Av/s</text>
      <text x={W - 4} y={tTop + 10} text-anchor="end" class="fe-dimt">{tMax.toFixed(1)} cm²/m</text>
      <path d={tGivePath} class="fe-give" /><path d={tNeedPath} class="fe-need" />
    </g>
  {/if}

  {#if pointX !== null}
    <line x1={X(pointX)} y1={TOP - 24} x2={X(pointX)} y2={height - 6} class="fe-point" />
  {/if}
</svg>

<style>
  .fe { width: 100%; height: auto; background: var(--st-surface); border: 1px solid var(--st-hair); border-radius: 4px; cursor: crosshair; }
  .fe-beam { fill: var(--st-surface-2); stroke: var(--st-text-3); stroke-width: 1; }
  .fe-span { fill: none; stroke: none; }
  .fe-span.fe-fail { fill: color-mix(in srgb, var(--st-danger) 10%, transparent); }
  .fe-col { fill: var(--st-surface-3); stroke: var(--st-text-3); stroke-width: 0.8; }
  .fe-bar line { stroke: var(--st-value); stroke-width: 2.2; }
  .fe-bar .fe-hit { stroke: transparent; stroke-width: 9; cursor: pointer; }
  .fe-bar text { font-size: 9.5px; fill: var(--st-text-2); pointer-events: none; }
  .fe-bar.sel line:not(.fe-hit) { stroke: var(--st-accent); stroke-width: 3.4; }
  .fe-zone rect { fill: var(--st-surface-2); stroke: var(--st-warn); stroke-width: 0.8; cursor: pointer; }
  .fe-zone.sel rect { stroke: var(--st-accent); stroke-width: 2; }
  .fe-zone text { font-size: 9px; fill: var(--st-text-2); pointer-events: none; }
  .fe-dim { stroke: var(--st-text-3); stroke-width: 0.7; }
  .fe-dimt { font-size: 9px; fill: var(--st-text-3); }
  .fe-axis { stroke: var(--st-hair-strong); stroke-width: 0.7; }
  .fe-need { fill: none; stroke: var(--st-danger); stroke-width: 1.2; stroke-dasharray: 3 2; }
  .fe-give { fill: none; stroke: var(--st-ok); stroke-width: 1.4; }
  .fe-hole { fill: var(--st-surface); stroke: var(--st-text-2); stroke-width: 1; }
  .fe-hole.fe-fail { stroke: var(--st-danger); stroke-width: 1.6; }
  .fe-cut line { stroke: var(--st-text); stroke-width: 1.2; stroke-dasharray: 8 3 2 3; }
  .fe-cut text { font-size: 10px; font-weight: 600; fill: var(--st-text); }
  .fe-law { fill: none; stroke: var(--st-value); stroke-width: 1.3; }
  .fe-shift { fill: none; stroke: var(--st-warn); stroke-width: 1.1; stroke-dasharray: 5 3; }
  .fe-point { stroke: var(--st-accent); stroke-width: 1; stroke-dasharray: 4 3; }
  .fe:focus-visible, .fe-bar:focus-visible, .fe-zone:focus-visible { outline: 2px solid var(--st-value); }
</style>
