<script lang="ts">
  /**
   * The designed bottom mat of ONE footing.
   *
   * Extracted from `FoundationsPanel` rather than written inside it, for the reason
   * `web/CLAUDE.md` states: a panel with several independent collapsible sections becomes
   * several components. The footing editor owns geometry and the ground; this owns the
   * per-direction design that follows from them, and the split keeps both under the 600-line
   * ceiling the design-tab gate enforces.
   *
   * It reads `detailingStore.lastFootingRun` and computes NOTHING. A panel that ran its own
   * design would be a second engine, and the number on screen could then disagree with the
   * number in the certificate for the same footing.
   *
   * ── What this component may and may not claim ──────────────────
   *
   * It shows the DESIGN: demand, required steel, counts, spacings, distribution. Everything
   * about the physical mat — the resolved layer order, the real elevations, the bars, the
   * schedule, the development and the clashes — belongs to `FootingMatPhysicalPanel`, mounted
   * below. The split matters because the two are separately true: a footing can be perfectly
   * designed and have no geometry, and it can have geometry that fails to develop.
   *
   * Through PR18-A this component also carried four flat sentences saying that the geometry, the
   * layer order and the anchorage did not exist. Three of them are now false and they have been
   * removed rather than reworded: the layer order IS resolved, the mat IS modelled, and the
   * anchorage IS measured — each with its own status next door. The one that survives is the top
   * reinforcement, because nothing has evaluated it.
   */
  import { t, tp } from '../../../lib/i18n';
  import { identifyMessages } from '../../../lib/codes/message';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { formatClause } from '../../../lib/codes/regulation';
  import FootingMatPhysicalPanel from './FootingMatPhysicalPanel.svelte';
  import type {
    FootingDirectionDesign, FootingMatRegion,
  } from '../../../lib/engine/detailing/footing-flexure';

  let { footingId }: { footingId: number } = $props();

  const outcome = $derived(
    detailingStore.lastFootingRun?.outcomes.find((o) => o.footingId === footingId),
  );

  const cm2 = (m2: number) => (m2 * 1e4).toFixed(2);
  const mm = (m: number) => (m * 1000).toFixed(0);

  function regionRow(r: FootingMatRegion, diameterMm: number): string {
    return tp('footing.ui.matRegionRow', {
      region: t(`footing.ui.matRegion${r.kind}`),
      count: r.barCount, diameter: diameterMm,
      width: r.width.toFixed(2), spacing: mm(r.spacingCentre),
      provided: cm2(r.asProvided), required: cm2(r.asRequired),
    });
  }

  /**
   * The rows, shared by both directions so the two tables cannot drift apart.
   *
   * Both As numbers are always shown, not only the governing one: "As = 20,11 cm²" tells a
   * reviewer nothing about whether the footing is minimum-governed or strength-governed, and
   * those are different footings to check.
   */
  function rows(dir: FootingDirectionDesign): Array<[string, string]> {
    return [
      [t('footing.ui.matMu'), dir.Mu.toFixed(1)],
      [t('footing.ui.matCantilever'), tp('footing.ui.matCantileverValue', {
        cantilever: dir.cantilever.toFixed(3), side: dir.governingSide ?? '—',
      })],
      [t('footing.ui.matD'), dir.d.toFixed(4)],
      // Both layer depths, so the conservative envelope is visible as a choice rather than
      // looking like the only depth there is.
      [t('footing.ui.matLayerEnvelope'), tp('footing.ui.matLayerEnvelopeValue', {
        lower: dir.dIfLowerLayer.toFixed(4), upper: dir.dIfUpperLayer.toFixed(4),
      })],
      [t('footing.ui.matBars'), tp('footing.ui.matBarsValue', {
        count: dir.barCount, diameter: dir.diameterMm,
      })],
      [t('footing.ui.matAsFlexural'), cm2(dir.asFlexural)],
      [t('footing.ui.matAsMinimum'), cm2(dir.asMinimum)],
      [t('footing.ui.matAsGoverning'), cm2(dir.asGoverning)],
      [t('footing.ui.matGovernedBy'), dir.governedBy === 'FLEXURE'
        ? t('footing.ui.matGovernedByFlexure')
        : t('footing.ui.matGovernedByMinimum')],
      [t('footing.ui.matGoverningMax'), tp('footing.ui.matGoverningMaxValue', {
        spacing: mm(dir.spacing.governingMax), clause: dir.spacing.governingMaxClause,
      })],
      [t('footing.ui.matMinClear'), mm(dir.spacing.minClear)],
      [t('footing.ui.matDistribution'), dir.distribution === 'UNIFORM_FULL_WIDTH'
        ? t('footing.ui.matDistributionUniform')
        : `${t('footing.ui.matDistributionBanded')} — ${tp('footing.ui.matGamma', {
          beta: (dir.beta ?? 0).toFixed(3), gamma: (dir.gammaS ?? 0).toFixed(4),
        })}`],
    ];
  }
</script>

<div class="mat-design" data-testid="footing-mat-design">
  <h5>{t('footing.ui.matDesignTitle')}</h5>
  {#if !detailingStore.lastFootingRun}
    <p class="empty" data-testid="footing-mat-no-run">{t('footing.ui.matNoRun')}</p>
  {:else if !outcome?.mat}
    <p class="empty" data-testid="footing-mat-not-designed">{t('footing.ui.matNotDesigned')}</p>
  {:else}
    {@const m = outcome.mat}
    <div class="directions">
      {#each [
        { key: 'X', label: t('footing.ui.matDirectionX'), dir: m.x },
        { key: 'Y', label: t('footing.ui.matDirectionY'), dir: m.y },
      ] as col (col.key)}
        <div class="direction" data-testid={`footing-mat-${col.key}`}>
          <h6>
            {col.label}
            <span class={`badge status-${col.dir.status}`}
                  data-testid={`footing-mat-${col.key}-status`}>
              {t(`footing.ui.matStatus${col.dir.status}`)}
            </span>
          </h6>
          <dl>
            {#each rows(col.dir) as [label, value] (label)}
              <div class="row"><dt>{label}</dt><dd>{value}</dd></div>
            {/each}
          </dl>
          {#if col.dir.regions.length > 0}
            <p class="regions-title">{t('footing.ui.matRegions')}</p>
            <ul class="regions" data-testid={`footing-mat-${col.key}-regions`}>
              {#each col.dir.regions as r, i (`${r.kind}-${i}`)}
                <li>{regionRow(r, col.dir.diameterMm)}</li>
              {/each}
            </ul>
          {/if}
          {#if col.dir.failures.length > 0}
            <!-- A failed direction is never green and is never summarised into a count. -->
            <ul class="issues" data-testid={`footing-mat-${col.key}-failures`}>
              {#each identifyMessages(col.dir.failures) as fl (fl.id)}
                <li class="blocking">{tp(fl.message.key, fl.message.params ?? {})}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    </div>

    <div class="row punching">
      <dt>{t('footing.ui.matPunchingDepth')}</dt>
      <dd data-testid="footing-mat-punching-d">{m.punchingD.toFixed(4)}</dd>
    </div>
    <p class="note">{t('footing.ui.matPunchingDepthNote')}</p>

    <!--
      What DESIGNED does not mean, stated once and then answered by the panel below rather than
      asserted here. The three PR18-A sentences that claimed the layer order, the geometry and
      the anchorage did not exist are gone: all three now do, each with its own status, and
      repeating the old claim beside the new status would be the worse of the two errors.
    -->
    <p class="note" data-testid="footing-mat-designed-means">
      {t('footing.ui.matDesignedMeans')}
    </p>

    {#if m.advisories.length > 0}
      <!-- Policy notes, kept apart from failures: these designs ARE code-compliant. -->
      <details data-testid="footing-mat-advisories">
        <summary>{tp('footing.ui.matAdvisories', { n: m.advisories.length })}</summary>
        <ul class="advisories">
          {#each m.advisories as a (a.key + JSON.stringify(a.params ?? {}))}
            <li>{tp(a.key, a.params ?? {})}</li>
          {/each}
        </ul>
      </details>
    {/if}

    <details data-testid="footing-mat-clauses">
      <summary>{t('footing.ui.matClauses')}</summary>
      <ul class="clauses">
        {#each m.refs as r (`${r.regulation}/${r.edition}/${r.clause}`)}
          <li>{formatClause(r)}</li>
        {/each}
      </ul>
    </details>

    <!-- The physical mat that came out of the design above. -->
    <FootingMatPhysicalPanel {outcome} />
  {/if}
</div>

<style>
  .mat-design {
    margin-top: 0.6rem; border-top: 1px solid rgba(143, 163, 179,0.3); padding-top: 0.5rem;
    font-size: 0.82rem;
  }
  h5 { margin: 0 0 0.3rem; font-size: 0.8rem; }
  h6 { margin: 0 0 0.3rem; font-size: 0.76rem; display: flex; align-items: center; gap: 0.4rem; }
  .empty { opacity: 0.75; font-style: italic; }
  .note { margin: 0.2rem 0 0.4rem; font-size: 0.75rem; opacity: 0.85; }
  .directions { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 0.6rem; }
  .direction { border: 1px solid rgba(143, 163, 179,0.25); border-radius: 4px; padding: 0.45rem; }
  dl { margin: 0; }
  .row { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.74rem; padding: 0.08rem 0; }
  dt { opacity: 0.85; }
  dd { margin: 0; font-variant-numeric: tabular-nums; text-align: right; }
  .row.punching { margin-top: 0.5rem; font-weight: 600; }
  .regions-title { margin: 0.4rem 0 0.15rem; font-size: 0.74rem; opacity: 0.85; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.15rem; }
  .regions li, .clauses li { font-size: 0.72rem; font-variant-numeric: tabular-nums; }
  .issues { margin-top: 0.4rem; }
  .issues li { font-size: 0.74rem; padding: 0.15rem 0.4rem; border-radius: 3px; }
  /* Blocking is never green. */
  .issues li.blocking { background: var(--st-surface-2); color: var(--st-text); }
  /* Designed-but-not-drawn is never green either: it is the state a reader is most likely to
     mistake for done. */
  .pending {
    margin: 0.4rem 0 0; font-size: 0.74rem; padding: 0.25rem 0.4rem; border-radius: 3px;
    background: var(--st-surface-3); color: var(--st-text);
  }
  .badge { font-size: 0.68rem; font-weight: 600; padding: 0.05rem 0.3rem; border-radius: 3px; }
  .badge.status-DESIGNED { background: rgba(143, 163, 179,0.3); }
  .badge.status-DESIGN_FAILED { background: var(--st-surface-2); color: var(--st-text); }
  .badge.status-NOT_EVALUATED { background: var(--st-surface-3); color: var(--st-text); }
  summary { cursor: pointer; font-size: 0.78rem; }
</style>
