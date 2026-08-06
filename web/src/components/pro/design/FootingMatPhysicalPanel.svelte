<script lang="ts">
  /**
   * The PHYSICAL bottom mat of one footing: order, elevations, bars, schedule, anchorage.
   *
   * Split out of `FootingMatPanel` rather than added to it, for the reason `web/CLAUDE.md`
   * states — a panel with several independent sections becomes several components, and the
   * design-tab ceiling is 600 lines. That panel owns the per-direction DESIGN; this owns what
   * was made of it.
   *
   * It computes NOTHING. Every number is read off `matGeometry`, `matAnchorage`, the layer-order
   * resolution and the punching check. A panel that derived a spacing or a mass would be a
   * second engine, and the figure on screen could then disagree with the certificate for the
   * same footing.
   *
   * ── What this component is FOR ─────────────────────────────────
   *
   * Not "showing the bars". A reader arriving at a mat that says MODELED has to be able to see,
   * without opening a record, exactly which claims are backed and which are not: the order that
   * was resolved and WHY, the two real elevations, the regions and their marks, the development
   * that was measured, and — as prominently — the punching moment transfer that was not
   * evaluated and the top steel that was never considered. One green badge must not be able to
   * read as a verified footing.
   */
  import { t, tp } from '../../../lib/i18n';
  import { identifyMessages } from '../../../lib/codes/message';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import type { FootingDesignOutcome } from '../../../lib/engine/detailing/run-footing-design';
  import type { FootingDirectionAnchorage } from '../../../lib/engine/detailing/footing-mat-anchorage';

  let { outcome }: { outcome: FootingDesignOutcome } = $props();

  const mm = (m: number) => (m * 1000).toFixed(0);
  const mm1 = (m: number) => (m * 1000).toFixed(1);
  const cm2 = (m2: number) => (m2 * 1e4).toFixed(2);

  const geometry = $derived(outcome.matGeometry);
  const anchorage = $derived(outcome.matAnchorage);
  const order = $derived(outcome.mat?.layerOrder ?? null);
  const punching = $derived(outcome.check?.punching ?? null);

  /**
   * Physical conflicts involving THIS footing's mat bars.
   *
   * Filtered from the assemblies rather than recomputed: the collision pass is the authority
   * and it ran over the whole floor, which is the only scope at which a mat-versus-dowel clash
   * is even visible. Matching on the generated bar ids — the ones the provenance carries — so a
   * conflict shown here is a conflict the assembly holds.
   */
  const matConflicts = $derived.by(() => {
    const ids = new Set((geometry?.provenance ?? []).map((p) => p.id));
    if (ids.size === 0) return [];
    return detailingStore.assemblies
      .flatMap((a) => a.conflicts)
      .filter((c) => ids.has(c.barA) || ids.has(c.barB));
  });

  function anchorageRows(a: FootingDirectionAnchorage): Array<[string, string]> {
    return [
      [t('footing.ui.matLdRequired'), mm(a.requiredLd)],
      [t('footing.ui.matLdAvailable'), tp('footing.ui.matLdAvailableValue', {
        available: mm(a.available), side: a.controllingSide ?? '—',
      })],
      [t('footing.ui.matLdMargin'), mm(a.margin)],
      [t('footing.ui.matLdSides'), tp('footing.ui.matLdSidesValue', {
        low: mm(a.sides[0].available), high: mm(a.sides[1].available),
      })],
      [t('footing.ui.matLdRow'), a.tableRow === 'other'
        ? t('footing.ui.matLdRowOther') : t('footing.ui.matLdRowFavourable')],
      [t('footing.ui.matLdMeasured'), tp('footing.ui.matLdMeasuredValue', {
        spacing: mm1(a.measuredClearSpacing), cover: mm1(a.measuredClearCover),
        diameter: a.diameterMm,
      })],
    ];
  }
</script>

<div class="mat-physical" data-testid="footing-mat-physical">
  <h5>{t('footing.ui.matPhysicalTitle')}</h5>

  <!--
    Supersession first, and it suppresses everything below it.

    A superseded mat must not be readable as the current one. The remedy is stated — re-run the
    detailing command — because regeneration is deliberately NOT automatic: a panel that
    redesigned a footing on every keystroke would be making the engineer's decision for them.
  -->
  {#if detailingStore.footingRunStale}
    <p class="stale" data-testid="footing-mat-superseded">
      {t('footing.ui.matSuperseded')}
    </p>
  {:else if !geometry}
    <p class="empty" data-testid="footing-mat-physical-none">
      {t('footing.ui.matPhysicalNone')}
    </p>
  {:else}
    <!-- ── Layer order ────────────────────────────────────────── -->
    {#if order}
      <div class="block" data-testid="footing-mat-layer-order-block">
        <p class="row">
          <span>{t('footing.ui.matLayerOrderResolved')}</span>
          <strong data-testid="footing-mat-layer-order-resolved">
            {order.resolved === null
              ? t('footing.ui.matLayerOrderNone')
              : tp('footing.ui.matLayerOrderResolvedValue', {
                order: t(`footing.ui.matLayerOrder.${order.resolved}`),
                lower: order.lowerLayerAxis ?? '—',
              })}
          </strong>
        </p>
        <p class="row">
          <span>{t('footing.ui.matLayerOrderPreference')}</span>
          <span>{t(`footing.ui.matLayerOrder.${order.preference}`)}</span>
        </p>
        <!--
          WHY, not just what. An automatic selection whose reason is invisible is a decision
          nobody can review, and the four AUTO reasons are four different situations: only one
          arrangement was feasible, one needs less steel, one leaves more flexural margin, or
          the two are genuinely indistinguishable and a fixed rule keeps the answer stable.
        -->
        <p class="row">
          <span>{t('footing.ui.matLayerOrderReason')}</span>
          <span data-testid="footing-mat-layer-order-reason">
            {t(`footing.ui.matLayerRationale.${order.rationale}`)}
          </span>
        </p>
        {#if order.evaluated.length > 0}
          <!--
            Both arrangements, ALWAYS — including under a manual override. An engineer who
            fixes the order is entitled to see what the other one would have cost.
          -->
          <table data-testid="footing-mat-arrangements">
            <thead>
              <tr>
                <th>{t('footing.ui.matArrangement')}</th>
                <th>{t('footing.ui.matArrangementFeasible')}</th>
                <th>{t('footing.ui.matArrangementMass')}</th>
                <th>{t('footing.ui.matArrangementUtil')}</th>
                <th>dX</th>
                <th>dY</th>
              </tr>
            </thead>
            <tbody>
              {#each order.evaluated as e (e.order)}
                <tr class:chosen={e.order === order.resolved}>
                  <td>{t(`footing.ui.matLayerOrder.${e.order}`)}</td>
                  <td class={e.feasible ? 'ok' : 'bad'}>
                    {e.feasible ? t('footing.ui.yes') : t('footing.ui.no')}
                  </td>
                  <td>{e.feasible ? e.providedSteelMassKg.toFixed(1) : '—'}</td>
                  <td>{Number.isFinite(e.worstFlexuralUtilization)
                    ? e.worstFlexuralUtilization.toFixed(3) : '—'}</td>
                  <td>{e.dX.toFixed(4)}</td>
                  <td>{e.dY.toFixed(4)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    {/if}

    <!-- ── Geometry status ────────────────────────────────────── -->
    <p class="row">
      <span>{t('footing.ui.matGeometryStatus')}</span>
      <span class={`badge geom-${geometry.status}`} data-testid="footing-mat-geometry-status">
        {t(`footing.ui.matGeometryStatus.${geometry.status}`)}
      </span>
    </p>

    {#if geometry.notModeled.length > 0}
      <ul class="issues" data-testid="footing-mat-not-modeled">
        {#each identifyMessages(geometry.notModeled) as m (m.id)}
          <li class="blocking">{tp(m.message.key, m.message.params ?? {})}</li>
        {/each}
      </ul>
    {/if}

    {#if geometry.status === 'MODELED'}
      <!-- ── Real elevations ─────────────────────────────────── -->
      <table data-testid="footing-mat-elevations">
        <thead>
          <tr>
            <th>{t('footing.ui.matDirection')}</th>
            <th>{t('footing.ui.matLayer')}</th>
            <th>{t('footing.ui.matCentreElevation')}</th>
            <th>{t('footing.ui.matClearCover')}</th>
            <th>{t('footing.ui.matD')}</th>
          </tr>
        </thead>
        <tbody>
          {#each [outcome.mat!.x, outcome.mat!.y] as dir (dir.axis)}
            <tr>
              <td>{dir.axis} — ∥ {dir.barsParallelTo}, Ø{dir.diameterMm}</td>
              <td>{dir.axis === geometry.lowerLayerAxis
                ? t('footing.ui.matLayerLower') : t('footing.ui.matLayerUpper')}</td>
              <td>{mm1(dir.centreElevation)}</td>
              <td>{mm1(dir.clearCoverToSoffit)}</td>
              <td>{dir.d.toFixed(4)}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      <!-- ── The schedule ────────────────────────────────────── -->
      <p class="section-title">{t('footing.ui.matSchedule')}</p>
      <div class="scroll">
        <table data-testid="footing-mat-schedule">
          <thead>
            <tr>
              <th>{t('footing.ui.matDirection')}</th>
              <th>{t('footing.ui.matRegion')}</th>
              <th>{t('footing.ui.matLayer')}</th>
              <th>Ø</th>
              <th>n</th>
              <th>{t('footing.ui.matSpacingCentre')}</th>
              <th>{t('footing.ui.matSpacingClear')}</th>
              <th>{t('footing.ui.matCuttingLength')}</th>
              <th>{t('footing.ui.matTotalLength')}</th>
              <th>{t('footing.ui.matMass')}</th>
              <th>{t('footing.ui.matAsRequiredShort')}</th>
              <th>{t('footing.ui.matAsProvidedShort')}</th>
              <th>{t('footing.ui.matMark')}</th>
            </tr>
          </thead>
          <tbody>
            {#each geometry.schedule as row (`${row.axis}-${row.regionIndex}`)}
              <tr>
                <td>{row.axis}</td>
                <td>{t(`footing.ui.matRegion${row.region}`)}</td>
                <td>{row.layer === 'LOWER'
                  ? t('footing.ui.matLayerLower') : t('footing.ui.matLayerUpper')}</td>
                <td>{row.diameterMm}</td>
                <td>{row.barCount}</td>
                <td>{mm(row.spacingCentre)}</td>
                <td>{mm(row.spacingClear)}</td>
                <td>{row.cuttingLength.toFixed(3)}</td>
                <td>{row.totalLength.toFixed(2)}</td>
                <td>{row.totalMassKg.toFixed(1)}</td>
                <td>{cm2(row.asRequired)}</td>
                <td>{cm2(row.asProvided)}</td>
                <td>{row.marks.join(', ') || '—'}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4">{t('footing.ui.matTotals')}</td>
              <td data-testid="footing-mat-total-bars">
                {geometry.schedule.reduce((n, r) => n + r.barCount, 0)}
              </td>
              <td colspan="3"></td>
              <td>{geometry.schedule.reduce((n, r) => n + r.totalLength, 0).toFixed(2)}</td>
              <td>{geometry.schedule.reduce((n, r) => n + r.totalMassKg, 0).toFixed(1)}</td>
              <td colspan="3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <!-- The reconciliation, said out loud: the totals above ARE the bars in the model. -->
      <p class="note" data-testid="footing-mat-reconciliation">
        {tp('footing.ui.matReconciled', {
          scheduled: geometry.schedule.reduce((n, r) => n + r.barCount, 0),
          generated: geometry.provenance.length,
          crossings: geometry.intendedCrossings,
        })}
      </p>
    {/if}

    <!-- ── Anchorage ──────────────────────────────────────────── -->
    {#if anchorage}
      <p class="row">
        <span>{t('footing.ui.matAnchorageStatus')}</span>
        <span class={`badge anch-${anchorage.outcome}`} data-testid="footing-mat-anchorage-status">
          {t(`footing.ui.matAnchorage.${anchorage.outcome}`)}
        </span>
      </p>
      {#if anchorage.x && anchorage.y}
        <div class="directions">
          {#each [anchorage.x, anchorage.y] as a (a.axis)}
            <div class="direction" data-testid={`footing-mat-anchorage-${a.axis}`}>
              <h6>{a.axis} — Ø{a.diameterMm}
                <span class={`badge anch-${a.outcome}`}>
                  {t(`footing.ui.matAnchorage.${a.outcome}`)}
                </span>
              </h6>
              <dl>
                {#each anchorageRows(a) as [label, value] (label)}
                  <div class="row"><dt>{label}</dt><dd>{value}</dd></div>
                {/each}
              </dl>
            </div>
          {/each}
        </div>
      {/if}
      {#if anchorage.failures.length > 0}
        <ul class="issues" data-testid="footing-mat-anchorage-failures">
          {#each anchorage.failures as f (f.key + JSON.stringify(f.params ?? {}))}
            <li class="blocking">{tp(f.key, f.params ?? {})}</li>
          {/each}
        </ul>
      {/if}
    {/if}

    <!-- ── Cover and reconciliation findings ──────────────────── -->
    {#if geometry.findings.length > 0}
      <p class="section-title">{t('footing.ui.matFindings')}</p>
      <ul class="issues" data-testid="footing-mat-findings">
        {#each geometry.findings as f, i (`${f.kind}-${i}`)}
          <li class={f.blocking ? 'blocking' : 'advisory'}>
            <strong>{t(`footing.ui.matFinding.${f.kind}`)}</strong>
            — {tp(f.message.key, f.message.params ?? {})}
          </li>
        {/each}
      </ul>
    {/if}

    <!-- ── Physical conflicts from the whole-floor collision pass ── -->
    {#if matConflicts.length > 0}
      <p class="section-title">{t('footing.ui.matConflicts')}</p>
      <ul class="issues" data-testid="footing-mat-conflicts">
        {#each matConflicts as c, i (`${c.barA}-${c.barB}-${i}`)}
          <li class={c.pairClass === 'prohibitedOverlap' ? 'blocking' : 'advisory'}>
            {tp('footing.ui.matConflictRow', {
              a: c.barA, b: c.barB,
              cls: c.classLabelKey ? t(c.classLabelKey) : c.pairClass ?? '—',
              measured: mm1(c.clearance), required: mm1(c.required),
            })}
          </li>
        {/each}
      </ul>
    {:else if geometry.status === 'MODELED'}
      <!--
        The crossings are contacts BY DESIGN and are stated as such, so their absence from the
        conflict list reads as a classification rather than as an omission. §25.2.1 and §25.2.2
        set clear distances between PARALLEL bars — in a layer, and between parallel layers —
        and an orthogonal grid is neither case.
      -->
      <p class="note" data-testid="footing-mat-no-conflicts">
        {tp('footing.ui.matNoConflicts', { crossings: geometry.intendedCrossings })}
      </p>
    {/if}

    <!-- ── What is STILL not verified ─────────────────────────── -->
    {#if punching?.momentTransfer && punching.momentTransfer.status !== 'NONE'}
      <p class={punching.momentTransfer.status.startsWith('UNSUPPORTED') ? 'pending' : 'note'}
         data-testid="footing-mat-punching-moment">
        {tp(`footing.ui.matPunchingMoment.${punching.momentTransfer.status}`, {
          msc: punching.momentTransfer.Msc.toFixed(1),
          x: punching.momentTransfer.MscX.toFixed(1),
          y: punching.momentTransfer.MscY.toFixed(1),
          threshold: punching.momentTransfer.threshold.toFixed(1),
        })}
      </p>
    {/if}
    <p class="pending" data-testid="footing-mat-top-not-evaluated-physical">
      {t('footing.ui.matTopNotEvaluated')}
    </p>

    {#if geometry.steps.length > 0}
      <details data-testid="footing-mat-geometry-steps">
        <summary>{t('footing.ui.matGeometrySteps')}</summary>
        <ul class="steps">
          {#each geometry.steps as s, i (i)}<li>{s}</li>{/each}
        </ul>
      </details>
    {/if}
    {#if anchorage?.x && anchorage.y}
      <details data-testid="footing-mat-anchorage-steps">
        <summary>{t('footing.ui.matAnchorageSteps')}</summary>
        <ul class="steps">
          {#each [...anchorage.x.steps, ...anchorage.y.steps] as s, i (i)}<li>{s}</li>{/each}
        </ul>
      </details>
    {/if}
  {/if}
</div>

<style>
  .mat-physical {
    margin-top: 0.6rem; border-top: 1px solid rgba(128,128,128,0.3); padding-top: 0.5rem;
    font-size: 0.82rem;
  }
  h5 { margin: 0 0 0.3rem; font-size: 0.8rem; }
  h6 { margin: 0 0 0.3rem; font-size: 0.76rem; display: flex; align-items: center; gap: 0.4rem; }
  .empty { opacity: 0.75; font-style: italic; }
  .note { margin: 0.3rem 0; font-size: 0.74rem; opacity: 0.85; }
  .section-title { margin: 0.5rem 0 0.15rem; font-size: 0.75rem; font-weight: 600; }
  .block { margin-bottom: 0.4rem; }
  .row { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.74rem; margin: 0.1rem 0; }
  dl { margin: 0; }
  dt { opacity: 0.85; }
  dd { margin: 0; font-variant-numeric: tabular-nums; text-align: right; }
  .directions { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 0.6rem; }
  .direction { border: 1px solid rgba(128,128,128,0.25); border-radius: 4px; padding: 0.45rem; }
  /* Wide content scrolls inside its own box; the panel itself never scrolls sideways. */
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; margin: 0.2rem 0 0.35rem; font-size: 0.7rem; }
  th, td { border: 1px solid rgba(128,128,128,0.3); padding: 0.12rem 0.3rem; text-align: left; font-variant-numeric: tabular-nums; }
  th { background: rgba(128,128,128,0.15); font-weight: 600; }
  tfoot td { font-weight: 600; }
  tr.chosen { background: rgba(128,128,128,0.18); font-weight: 600; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.15rem; }
  .issues li { font-size: 0.72rem; padding: 0.15rem 0.4rem; border-radius: 3px; }
  /* Blocking is never green; a policy note is never red. */
  .issues li.blocking { background: #5c1a1a; color: #ffe4e4; }
  .issues li.advisory { background: #7a5b00; color: #fff6dd; }
  .steps li { font-size: 0.7rem; margin-bottom: 0.15rem; }
  /* Not-verified is never green: it is the state a reader is most likely to mistake for done. */
  .pending, .stale {
    margin: 0.4rem 0 0; font-size: 0.74rem; padding: 0.25rem 0.4rem; border-radius: 3px;
    background: #7a5b00; color: #fff6dd;
  }
  .stale { background: #5c1a1a; color: #ffe4e4; font-weight: 600; }
  .badge { font-size: 0.68rem; font-weight: 600; padding: 0.05rem 0.3rem; border-radius: 3px; }
  .badge.geom-MODELED, .badge.anch-VERIFIED { background: rgba(128,128,128,0.3); }
  .badge.geom-RECONCILIATION_FAILED, .badge.anch-FAILED { background: #5c1a1a; color: #ffe4e4; }
  .badge.geom-NOT_MODELED, .badge.anch-NOT_EVALUATED { background: #7a5b00; color: #fff6dd; }
  td.ok { color: inherit; }
  td.bad { background: #5c1a1a; color: #ffe4e4; }
  summary { cursor: pointer; font-size: 0.78rem; }
</style>
