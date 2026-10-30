<script lang="ts">
  import validation from '../../../../../research/fracture/shauer-2025/VALIDATION.json';
  import { rs } from '../i18n';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import { num } from '../shell/format';
  import Sci from '../shell/Sci.svelte';
  import type { Frame } from './simulation.svelte';

  type Ref = { step: number; pseudotime: number; reaction: number; iterations: number; damageMax: number };

  let {
    frames = [],
    showsReference = false,
    reference = [],
  }: {
    frames: Frame[];
    showsReference: boolean;
    reference: Ref[];
  } = $props();

  const strings = $derived(rs());
</script>

<h2>{strings.paperShows}</h2>
<p>
  {strings.paperOverview}
</p>
<p>
  {strings.replayGrowth} <ExperimentLink tab="force">{strings.theForce}</ExperimentLink> {strings.risesTo}
  <ExperimentLink step={56}>{strings.peakStepLink}</ExperimentLink>{strings.nextIncrement}
  <ExperimentLink step={57}>{strings.crackStepLink}</ExperimentLink>{strings.afterComma} <ExperimentLink tab="convergence">{strings.alternating308}</ExperimentLink>{strings.forceDrops} <ExperimentLink step={78}>{strings.finalState}</ExperimentLink> {strings.openCrack}
</p>

<h2>{strings.modelHeading}</h2>
<p>{strings.displacement} <b>u</b> {strings.bilinearModel}</p>
<ul>
  <li><b>{strings.elasticity}</b> {strings.fixedDamage} <b>C</b> : <b>ε</b>(<b>u</b>{strings.wholeStress}</li>
  <li><b>{strings.damageAT2}</b> {strings.atFixed} <b>u</b>: (G<sub>c</sub>/ℓ + 2H) d − G<sub>c</sub> ℓ Δd = 2H.</li>
  <li><b>{strings.drivingEnergy}</b>: H = ψ<sup>+</sup> = ½ Σ σ<sub>i</sub> ε<sub>i</sub> {strings.positiveStrains}<sub>i</sub> {strings.hybridModel}</li>
  <li><b>{strings.alternatingSolution}</b> {strings.solvePerStep} <b>u</b> {strings.currentDamage} <b>u</b>{strings.residualThreshold}<sup>−5</sup>.</li>
  <li><b>{strings.irreversibility}</b>{strings.noIrreversibility} <ExperimentLink params={{ history: true, run: true }}>{strings.enableHistory}</ExperimentLink> {strings.keepOnUnloading}</li>
</ul>
<p>
  {strings.unitsAndPeak}<sub>c</sub> = √(27 E G<sub>c</sub> {strings.lengthStrength} <ExperimentLink params={{ l0: 0.015, run: true }}>{strings.tryLength}</ExperimentLink> {strings.meshMatters}
  <ExperimentLink params={{ mesh: 'coarse', run: true }}>{strings.tryCoarse}</ExperimentLink>.
</p>

<h2>{strings.reproductionHeading}</h2>
<ol>
  <li>{strings.referenceProcedure}</li>
  <li>{strings.rustProcedure}</li>
  <li>{validation.checks.length} {strings.checksProcedure}</li>
</ol>

<h2 id="checks">{strings.referenceComparison}</h2>
<div class="rs-table-scroll" role="region" aria-label={strings.validationChecks} tabindex="0">
<table class="rs-checks">
  <caption>{validation.checks.length} {strings.checksCaption}</caption>
  <thead><tr><th scope="col">{strings.check}</th><th scope="col" class="num">{strings.observed}</th><th scope="col" class="num">{strings.tolerance}</th><th scope="col">{strings.result}</th></tr></thead>
  <tbody>
    {#each validation.checks as c (c.name)}
      <tr><td>{c.name}</td><td class="num">{#if c.metric === 'exact'}{c.passed ? strings.equal : strings.differs}{:else}<Sci value={c.observed} />{/if}</td><td class="num">{#if c.metric === 'exact'}—{:else}<Sci value={c.tolerance} sig={1} />{/if}</td><td class={c.passed ? 'pass' : 'fail'}>{c.passed ? strings.pass : strings.fail}</td></tr>
    {/each}
  </tbody>
</table>
</div>
<p>
  {strings.symmetryFinding}<sup>−10</sup>{strings.toleranceMeaning}
</p>

{#if frames.length}
  <details class="rs-table">
    <summary>{strings.stepTable}{frames.length} {strings.stepsParen}</summary>
    <table>
      <thead><tr><th>{strings.step}</th><th>u, mm</th><th>F, kN</th><th>{strings.iterations}</th><th>{strings.residual}</th><th>max d</th>{#if showsReference}<th>{strings.referenceForce}</th>{/if}</tr></thead>
      <tbody>
        {#each frames as f, i (i)}
          <tr><td class="num">{f.step.step}</td><td class="num">{num(f.step.displacement, { dp: 5 })}</td><td class="num">{num(f.step.reaction, { sig: 7 })}</td><td class="num">{f.step.iterations}</td><td class="num"><Sci value={f.step.residual} /></td><td class="num">{num(f.step.damage_max, { dp: 4 })}</td>{#if showsReference}<td class="num">{num(reference[i]?.reaction ?? NaN, { sig: 7 })}</td>{/if}</tr>
        {/each}
      </tbody>
    </table>
  </details>
{/if}

<h2>{strings.paperComparison}</h2>
<p>{strings.paperNotCompared}</p>

<h2>{strings.limitations}</h2>
<ul>
  <li>{strings.noCertification}</li>
  <li>{strings.meshLimitation}</li>
  <li>{strings.damageLimitation}</li>
  <li>{strings.iterationLimitation}</li>
  <li>{strings.browserLimitation}</li>
</ul>

<h2>{strings.codeReferences}</h2>
<ul>
  <li>{strings.implementationOutputs} <a href="https://github.com/lambdaclass/stabileo/tree/main/research/fracture/shauer-2025" rel="noreferrer" target="_blank">{"shauer-2025"}</a> {strings.adaptationCredit}</li>
  <li>{strings.referenceCode} <a href="https://github.com/nathanshauer/phasefield-jr-py" rel="noreferrer" target="_blank">{"github.com/nathanshauer/phasefield-jr-py"}</a>{", MIT, © 2025 Nathan Shauer."}</li>
</ul>

<style>
  summary {
    cursor: pointer;
    color: var(--fg);
    font-size: 0.95rem;
  }
  .rs-table {
    overflow-x: auto;
  }
  .rs-table table,
  :global(.rs-checks) {
    border-collapse: collapse;
    font: var(--rs-small) var(--st-sans);
    font-variant-numeric: tabular-nums;
    width: 100%;
  }
  .rs-table th,
  .rs-table td,
  :global(.rs-checks th),
  :global(.rs-checks td) {
    border-bottom: 1px solid var(--hair);
    padding: 0.25rem 0.5rem;
    text-align: left;
  }
  :global(.rs-checks caption) {
    text-align: left;
    color: var(--fg-2);
    font-size: var(--rs-small);
    padding-bottom: 0.4rem;
  }
  :global(.rs-checks td.num),
  :global(.rs-checks th.num),
  .rs-table :global(td.num) {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  :global(.rs-checks td.pass) {
    color: var(--st-ok);
    white-space: nowrap;
  }
  :global(.rs-checks td.fail) {
    color: var(--st-danger);
  }
  :global(.rs-table-scroll) {
    overflow-x: auto;
  }
</style>
