<script lang="ts">
  /**
   * "Ver matriz" for the force method: the whole method on one screen,
   * matrices first.
   *
   *   [δ]  every coefficient clickable — it opens into the two unit diagrams
   *        whose product it is, bar by bar, beside its check as a displacement
   *   {δ₀} and {Δ}
   *   {X} = [δ]⁻¹ ({Δ} − {δ₀})
   *
   * The nine steps explain each of these in turn; this is the short route for
   * a reader who already knows the method and wants to see its numbers, or to
   * check one coefficient against a hand calculation.
   */
  import { t } from '../../lib/i18n';
  import { fmStepsStore } from '../../lib/store';
  import type { ForceMethodResult } from '../../lib/engine/force-method/solve';
  import FmSketch from './FmSketch.svelte';
  import FmDiagramPicker from './FmDiagramPicker.svelte';
  import { xName, num, sub, redundantText, redundantUnit } from './fm-text';

  let { r }: { r: ForceMethodResult } = $props();
  const n = $derived(r.redundants.length);
  const is3D = $derived(!!r.is3D);
  const i = $derived(Math.min(fmStepsStore.selectedI, n - 1));
  const j = $derived(Math.min(fmStepsStore.selectedJ, n - 1));
  const comp = $derived(fmStepsStore.diagramComponent);

  const rows = $derived(r.deltaTerms[i]?.[j] ?? []);
  const perBar = $derived.by(() => {
    const m = new Map<number, { bending: number; axial: number; torsion: number }>();
    for (const row of rows) {
      if (row.elementId === null || !(row.source === 'bending' || row.source === 'axial' || row.source === 'torsion')) continue;
      const cur = m.get(row.elementId) ?? { bending: 0, axial: 0, torsion: 0 };
      cur[row.source] += row.value;
      m.set(row.elementId, cur);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  });
  const others = $derived(rows.filter((x) => x.elementId === null || x.source === 'bar'));

  /** What the hinges and truss bars of this model do to [δ] — said once, where it applies. */
  const hasHinges = $derived(r.original.elements.some((e) => e.type === 'frame' && (e.hingeStart || e.hingeEnd)));
  const hasTruss = $derived(r.original.elements.some((e) => e.type === 'truss'));
  const barRedundant = $derived(r.redundants.some((x) => x.kind === 'barForce'));
</script>

<div class="fmx" data-testid="fm-matrix-view">
  <p class="fmx-exp">{t('fm.mx.explanation')}</p>

  <h5 class="fmx-h">[δ] — {t('fm.mx.clickCell')}</h5>
  <div class="fmx-scroll">
    <table class="fmx-grid" data-testid="fm-matrix-grid">
      <thead><tr><th></th>{#each r.redundants as x (x.index)}<th>{xName(x.index)}</th>{/each}</tr></thead>
      <tbody>
        {#each r.redundants as a, p (a.index)}
          <tr>
            <th>{xName(a.index)}</th>
            {#each r.redundants as b, q (b.index)}
              <td>
                <button class="fmx-cell" class:on={p === i && q === j} class:diag={p === q}
                  onclick={() => fmStepsStore.selectCoefficient(p, q)} data-testid="fm-cell-{p + 1}-{q + 1}">
                  {num(r.delta[p][q], 3)}
                </button>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <h5 class="fmx-h">δ{sub(i + 1)}{sub(j + 1)} = Σ ∫ m{sub(i + 1)}·m{sub(j + 1)} / EI dx + …</h5>
  <FmDiagramPicker {is3D} />
  <div class="fmx-pair">
    <div>
      <span class="fmx-cap">m{sub(i + 1)} — {redundantText(r.redundants[i], r.original)}</span>
      <FmSketch geometry={r.primary} redundants={r.redundants} focus={i + 1} state={r.states[i + 1]} component={comp} stateLabel="m{sub(i + 1)}" testId="fm-mx-mi" />
    </div>
    <div>
      <span class="fmx-cap">m{sub(j + 1)} — {redundantText(r.redundants[j], r.original)}</span>
      <FmSketch geometry={r.primary} redundants={r.redundants} focus={j + 1} state={r.states[j + 1]} component={comp} stateLabel="m{sub(j + 1)}" testId="fm-mx-mj" />
    </div>
  </div>
  <table class="fmx-table" data-testid="fm-mx-terms">
    <thead><tr><th>{t('fm.s3.bar')}</th><th>{t('fm.src.bending')}</th><th>{t('fm.src.axial')}</th>{#if is3D}<th>{t('fm.src.torsion')}</th>{/if}</tr></thead>
    <tbody>
      {#each perBar as [id, v] (id)}
        <tr><td>{id}</td><td>{num(v.bending, 4)}</td><td>{num(v.axial, 4)}</td>{#if is3D}<td>{num(v.torsion, 4)}</td>{/if}</tr>
      {/each}
      {#each others as o, k (k)}
        <tr><td colspan={is3D ? 3 : 2}>{t(`fm.src.${o.source}`)}</td><td>{num(o.value, 4)}</td></tr>
      {/each}
      <tr class="fmx-sum"><td colspan={is3D ? 3 : 2}>δ{sub(i + 1)}{sub(j + 1)}</td><td>{num(r.delta[i][j], 5)}</td></tr>
    </tbody>
  </table>
  <p class="fmx-note">{t('fm.s5.check').replace('{v}', num(r.deltaCheck[i][j], 5))}</p>

  {#if hasHinges || hasTruss}
    <div class="fmx-analysis" data-testid="fm-mx-analysis">
      {#if hasHinges}<p>{t('fm.mx.hinges')}</p>{/if}
      {#if hasTruss}<p>{t('fm.mx.truss')}</p>{/if}
      {#if barRedundant}<p>{t('fm.mx.barRedundant')}</p>{/if}
    </div>
  {/if}

  <h5 class="fmx-h">{'{δ₀}'} · {'{Δ}'} · {'{X}'} = [δ]⁻¹({'{Δ}'} − {'{δ₀}'})</h5>
  <table class="fmx-table" data-testid="fm-mx-solution">
    <thead><tr><th></th><th>δᵢ₀</th><th>Δᵢ</th><th>Xᵢ</th></tr></thead>
    <tbody>
      {#each r.redundants as x, p (x.index)}
        <tr><td>{xName(x.index)}</td><td>{num(r.delta0[p], 4)}</td><td>{num(r.prescribed[p], 4)}</td><td>{num(r.X[p], 4)} {redundantUnit(x, is3D)}</td></tr>
      {/each}
    </tbody>
  </table>
  <p class="fmx-note" class:bad={!r.verification.ok}>
    {r.verification.ok ? t('fm.mx.agrees') : t('fm.s9.bad').replace('{d}', num(Math.max(r.verification.maxForceDiff, r.verification.maxReactionDiff), 3))}
  </p>
</div>

<style>
  .fmx { display: flex; flex-direction: column; gap: 6px; }
  .fmx-exp { font-size: 0.72rem; line-height: 1.5; color: var(--st-text-2); margin: 0; }
  .fmx-h { margin: 8px 0 2px; font-size: 0.62rem; font-weight: 600; letter-spacing: 0.04em; color: var(--st-text-3); }
  .fmx-scroll { overflow-x: auto; }
  .fmx-grid { border-collapse: collapse; font-size: 0.64rem; font-variant-numeric: tabular-nums; }
  .fmx-grid th { color: var(--st-text-3); font-weight: 500; padding: 2px 4px; }
  .fmx-cell {
    width: 100%; min-width: 4.5rem; padding: 3px 4px; border: 1px solid var(--st-hair); background: var(--st-surface-2);
    color: var(--st-text); font-family: var(--st-mono); font-size: 0.62rem; cursor: pointer; text-align: right;
  }
  .fmx-cell.diag { background: var(--st-surface-3); }
  .fmx-cell.on { border-color: var(--st-accent); color: var(--st-accent); }
  .fmx-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .fmx-cap { font-size: 0.6rem; color: var(--st-text-3); display: block; line-height: 1.3; min-height: 2.6em; }
  .fmx-table { width: 100%; border-collapse: collapse; font-size: 0.66rem; font-variant-numeric: tabular-nums; }
  .fmx-table th { font-weight: 400; color: var(--st-text-3); text-align: right; padding: 2px 0 2px 8px; font-size: 0.6rem; }
  .fmx-table th:first-child, .fmx-table td:first-child { text-align: left; padding-left: 0; }
  .fmx-table td { text-align: right; padding: 2px 0 2px 8px; white-space: nowrap; }
  .fmx-sum td { border-top: 1px solid var(--st-hair); font-weight: 600; }
  .fmx-note { font-size: 0.64rem; color: var(--st-text-3); margin: 2px 0; line-height: 1.45; }
  .fmx-note.bad { color: var(--st-danger); }
  .fmx-analysis {
    font-size: 0.66rem; line-height: 1.5; color: var(--st-text-2);
    border-left: 2px solid var(--st-accent); padding-left: 8px; margin: 4px 0;
  }
  .fmx-analysis p { margin: 0 0 4px; }
</style>
