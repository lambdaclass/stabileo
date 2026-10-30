<script lang="ts">
  import { snapshots } from './reference-fields';
  import { rs } from '../i18n';
  import { compareReference } from './comparison';
  import LineChart from './LineChart.svelte';
  import IterationsChart from './IterationsChart.svelte';
  import type { Series } from './protocol';
  import type { Frame } from './simulation.svelte';

  const STABILEO = 'var(--rs-plot-ours)';
  const REFERENCE = 'var(--rs-plot-ref)';
  const REF_TOP_DISPLACEMENT = 0.01;

  type Ref = { step: number; pseudotime: number; reaction: number; iterations: number; damageMax: number };

  let {
    tab,
    forceH = $bindable(400),
    convH = $bindable(600),
    frame = null,
    frames = [],
    source = 'replay',
    showsReference = false,
    reference = [],
    refPeak,
    nodes = null,
    elements = null,
    run = null,
    referenceKey,
  }: {
    tab: string;
    forceH?: number;
    convH?: number;
    frame: Frame | null;
    frames: Frame[];
    source: string;
    showsReference: boolean;
    reference: Ref[];
    refPeak: Ref;
    nodes: Float64Array | null;
    elements: Uint32Array | null;
    run: unknown;
    referenceKey: string;
  } = $props();

  const strings = $derived(rs());

  const forceSeries = $derived.by<Series[]>(() => {
    const out: Series[] = [];
    if (frames.length) {
      out.push({
        name: source === 'replay' ? strings.precomputedSeries : strings.browserSeries,
        color: STABILEO,
        points: frames.map((f) => [f.step.displacement, f.step.reaction]),
      });
    }
    if (showsReference) {
      out.push({
        name: strings.referenceSeries,
        color: REFERENCE,
        dashed: true,
        points: reference.map((r) => [r.pseudotime * REF_TOP_DISPLACEMENT, r.reaction]),
      });
    }
    return out;
  });

  const peakFrame = $derived(
    frames.length ? frames.reduce((a, f) => (f.step.reaction > a.step.reaction ? f : a), frames[0]) : null,
  );

  const forceLabels = $derived(
    peakFrame
      ? [
          {
            x: peakFrame.step.displacement,
            y: peakFrame.step.reaction,
            anchor: 'end' as const,
            text: showsReference
              ? `${strings.peakReferenceLabel} ${peakFrame.step.reaction.toFixed(4)} kN`
              : `${strings.peakLabel} ${peakFrame.step.reaction.toFixed(4)} kN`,
          },
        ]
      : [],
  );

  const residualSeries = $derived.by<Series[]>(() => {
    if (!showsReference || !frames.length) return [];
    return [
      {
        name: strings.referenceDifference,
        color: STABILEO,
        points: frames.map((f, i) => [
          f.step.displacement,
          Math.max(1e-16, Math.abs(f.step.reaction - (reference[i]?.reaction ?? f.step.reaction))),
        ]),
      },
    ];
  });

  const energyLabels = $derived.by(() => {
    if (!frames.length) return [];
    const last = frames[frames.length - 1].step;
    const peak = frames.reduce((a, f) => (f.step.elastic_energy > a.step.elastic_energy ? f : a), frames[0]).step;
    return [
      { x: peak.displacement, y: peak.elastic_energy, anchor: 'end' as const, text: strings.elasticLabel },
      { x: last.displacement, y: last.fracture_energy, anchor: 'end' as const, text: strings.fractureLabel },
    ];
  });

  const energySeries = $derived.by<Series[]>(() =>
    frames.length
      ? [
          { name: strings.elasticEnergy, color: STABILEO, points: frames.map((f) => [f.step.displacement, f.step.elastic_energy]) },
          { name: strings.fractureEnergy, color: REFERENCE, points: frames.map((f) => [f.step.displacement, f.step.fracture_energy]) },
        ]
      : [],
  );

  const comparison = $derived(
    showsReference &&
      frames.length &&
      (!run || (run as { status?: string }).status !== 'running') &&
      nodes &&
      elements
      ? compareReference(frames, reference, {
          nodes,
          elements,
          snapshots,
          material: JSON.parse(referenceKey).material,
          replay: !run,
        })
      : null,
  );
</script>

<div class="rs-panel" id="rs-panel-force" role="tabpanel" aria-labelledby="rs-tab-force" hidden={tab !== 'force'} bind:clientHeight={forceH}>
  <figure>
    <figcaption>{strings.reactionCaption}</figcaption>
    <LineChart
      series={forceSeries}
      xLabel={strings.topDisplacementAxis}
      yLabel="F (kN)"
      marker={frame ? frame.step.displacement : null}
      markerLabel={frame ? `${strings.step} ${frame.step.step}` : ''}
      labels={forceLabels}
      height={Math.max(170, forceH - 190)}
    />
    {#if residualSeries.length}
      <LineChart
        series={residualSeries}
        xLabel={strings.topDisplacementAxis}
        yLabel="|F − F_ref| (kN)"
        log
        rules={[{ y: 1e-5, text: strings.forceComparisonTolerance }]}
        marker={frame ? frame.step.displacement : null}
        height={110}
      />
    {/if}
    {#if !showsReference}<p class="rs-note">{strings.referenceCurveNote}</p>{/if}
  </figure>
</div>

<div class="rs-panel" id="rs-panel-convergence" role="tabpanel" aria-labelledby="rs-tab-convergence" hidden={tab !== 'convergence'} bind:clientHeight={convH}>
  {#if comparison}
    <div class="rs-compare" id="rs-compare-detail">
      <h3>{source === 'replay' ? strings.thisReplay : strings.thisRun} {strings.againstReferenceCode}</h3>
      <ul>
        <li>{strings.peakForce} {comparison.peak.step.reaction.toFixed(6)} {strings.knAtStep} {comparison.peak.step.step}{strings.referenceSemicolon} {refPeak.reaction.toFixed(6)} {strings.knAtStep} {refPeak.step}.</li>
        <li>{strings.relativeForceDifference} {comparison.worstPre.toExponential(1)} {strings.relativeTestTolerance}</li>
        <li>{strings.absoluteForceDifference} {comparison.worstAll.toExponential(1)} {strings.absoluteTestTolerance}</li>
        <li>{strings.identicalIterations} {comparison.sameIterations} {strings.of} {reference.length} {strings.stepsPeriod}</li>
      </ul>
    </div>
  {/if}
  {#if frames.length}
    <figure>
      <figcaption>{strings.iterationsCaption}{showsReference ? strings.referenceDots : ''}</figcaption>
      <IterationsChart steps={frames.map((f) => f.step)} reference={showsReference ? reference.map((r) => r.iterations) : null} height={130} />
    </figure>
    <figure>
      <figcaption>{strings.energies}</figcaption>
      <LineChart series={energySeries} xLabel={strings.topDisplacementAxis} yLabel={strings.energyAxis} marker={frame ? frame.step.displacement : null} labels={energyLabels} height={Math.max(150, convH - (comparison ? 420 : 260))} />
    </figure>
  {/if}
</div>

<style>
  .rs-panel {
    min-width: 0;
  }
  .rs-panel[hidden] {
    display: none;
  }
  figure {
    margin: 0;
  }
  figcaption {
    color: var(--fg);
    font-size: 0.92rem;
    margin-bottom: 0.4rem;
  }
  .rs-note {
    font-size: 0.82rem;
    color: var(--fg-2);
    margin: 0.4rem 0;
  }
  .rs-compare {
    border: 1px solid var(--ok);
    border-radius: 3px;
    padding: 0.6rem 0.9rem;
    font-size: 0.88rem;
  }
  .rs-compare h3 {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
  }
  .rs-compare ul {
    margin: 0;
    padding-left: 1.1rem;
  }
  @media (min-width: 70rem) {
    .rs-panel {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: auto;
      scrollbar-gutter: stable;
      scrollbar-color: var(--fg-2) var(--hair);
    }
    .rs-panel::-webkit-scrollbar { width: 10px; }
    .rs-panel::-webkit-scrollbar-track { background: var(--hair); }
    .rs-panel::-webkit-scrollbar-thumb { background: var(--fg-2); border-radius: 5px; }
  }
</style>
