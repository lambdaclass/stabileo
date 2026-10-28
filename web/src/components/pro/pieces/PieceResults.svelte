<script lang="ts">
  /**
   * The internal forces along the member selected whole (`model/curve-entity.ts`), against the
   * length along it: the segments' own diagrams side by side, a jump at a joint kept as a jump.
   * The largest and smallest value, where they are, and the whole piece as CSV.
   */
  import { modelStore, resultsStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { selectedPiece } from '../../../lib/store/curved-members';
  import { pieceDiagram, pieceExtremes } from '../../../lib/model/curve-entity';
  import { PIECE_KINDS, PIECE_UNIT, pieceCsv } from '../../../lib/model/piece-csv';
  import { downloadBlob } from '../../../lib/store/document-exports';
  import { currentResultProvenance } from '../../../lib/store/result-provenance';
  import type { Diagram3DKind } from '../../../lib/engine/diagrams-3d';

  const p = $derived.by(() => { void modelStore.modelVersion; void uiStore.selectedElements; return selectedPiece(); });
  const forces = $derived(new Map((resultsStore.results3D?.elementForces ?? []).map((f) => [f.elementId, f])));
  let kind = $state<Diagram3DKind>('momentZ');
  const stations = $derived(p && forces.size ? pieceDiagram(p, forces, kind) : null);
  const ext = $derived(stations ? pieceExtremes(stations) : null);
  const name = $derived.by(() => {
    if (!p) return '';
    const e = modelStore.elements.get(p.segments[0]!.elementId);
    return e?.arc ? tp('pieces.arcTitle', { id: e.arc.id }) : t('pieces.chainTitle');
  });
  const LABEL: Record<Diagram3DKind, string> = { axial: 'N', shearY: 'Vy', shearZ: 'Vz', torsion: 'T', momentY: 'My', momentZ: 'Mz' };

  const W = 320, H = 140, PAD = 18;
  const plot = $derived.by(() => {
    if (!p || !stations?.length) return null;
    const vs = stations.map((s) => s.value);
    const lo = Math.min(0, ...vs), hi = Math.max(0, ...vs);
    const span = hi - lo || 1;
    const sx = (s: number) => PAD + (s / (p.length || 1)) * (W - 2 * PAD);
    const sy = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
    // One path per segment: the joints are not bridged.
    const paths = p.segments.map((seg) => stations.filter((s) => s.elementId === seg.elementId).map((s, i) => `${i ? 'L' : 'M'}${sx(s.s).toFixed(1)},${sy(s.value).toFixed(1)}`).join(''));
    const joints = p.segments.slice(1).map((seg) => sx(seg.s0));
    return { paths, joints, zero: sy(0) };
  });

  function exportCsv() {
    if (!p) return;
    const prov = currentResultProvenance();
    const csv = pieceCsv({
      piece: p, name, source: prov.scope, forces,
      header: [
        `Stabileo ${prov.appVersion} · ${name}`,
        `${t('pieces.csvCoordinate')}`,
        `${t('pieces.csvAxes')}`,
        `results ${prov.resultsHash ?? '-'} · model ${prov.modelHash}`,
      ],
    });
    downloadBlob(`${name.replace(/\s+/g, '-')}.csv`, 'text/csv', csv);
  }
</script>

{#if p}
  <section class="prs" data-testid="piece-results">
    <header>
      <strong>{name}</strong>
      <div class="prs-kinds" role="group">
        {#each PIECE_KINDS as k (k)}<button class:on={kind === k} onclick={() => (kind = k)} data-testid="piece-kind-{k}">{LABEL[k]}</button>{/each}
      </div>
    </header>
    {#if !stations}
      <p class="prs-dim">{t('pieces.noResults')}</p>
    {:else if plot && ext}
      <svg viewBox="0 0 {W} {H}" width={W} height={H} aria-label={t('pieces.diagramLabel')} data-testid="piece-diagram">
        <line x1={PAD} x2={W - PAD} y1={plot.zero} y2={plot.zero} class="axis" />
        {#each plot.joints as x (x)}<line x1={x} x2={x} y1={PAD / 2} y2={H - PAD / 2} class="joint" />{/each}
        {#each plot.paths as d, i (i)}<path {d} />{/each}
      </svg>
      <p class="prs-line" data-testid="piece-extremes">
        {tp('pieces.extremes', { max: ext.max.value.toPrecision(4), smax: ext.max.s.toFixed(2), min: ext.min.value.toPrecision(4), smin: ext.min.s.toFixed(2), unit: PIECE_UNIT[kind] })}
      </p>
      <p class="prs-dim">{tp('pieces.diagramNote', { n: p.segments.length })}</p>
      <button class="prs-btn" onclick={exportCsv} data-testid="piece-csv">{t('pieces.exportCsv')}</button>
    {/if}
  </section>
{/if}

<style>
  .prs { margin: 6px 0 10px; padding: 8px; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); background: var(--st-surface-2); font-size: 0.72rem; color: var(--st-text-2); display: flex; flex-direction: column; gap: 4px; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap; }
  header strong { color: var(--st-text); }
  .prs-kinds { display: inline-flex; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); overflow: hidden; }
  .prs-kinds button { padding: 1px 7px; background: none; border: none; color: var(--st-text-2); font: inherit; cursor: pointer; }
  .prs-kinds button.on { background: var(--st-accent); color: #fff; }
  svg { background: var(--st-ink); border: 1px solid var(--st-hair); border-radius: var(--st-radius); }
  path { fill: none; stroke: var(--st-accent); stroke-width: 1.4; }
  .axis { stroke: var(--st-hair-strong); }
  .joint { stroke: var(--st-hair); stroke-dasharray: 2 3; }
  .prs-dim { color: var(--st-text-3); margin: 0; }
  .prs-line { margin: 0; color: var(--st-text); font-family: var(--st-font-mono, monospace); }
  .prs-btn { align-self: flex-start; padding: 3px 9px; background: var(--st-surface-3); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; cursor: pointer; }
</style>
