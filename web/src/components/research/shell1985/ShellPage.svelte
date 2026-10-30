<script lang="ts">
  import { articleStrings } from './article';
  const copy = $derived(articleStrings(publicI18n.locale));
  import { onMount } from 'svelte';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
  import ScalarFieldViewer from '../../viewport/ScalarFieldViewer.svelte';
  import ConvergencePlot from './ConvergencePlot.svelte';
  import { cases, nativeOnly, runCases, finest, groups, viewerData, type Result } from './cases';
  import { editorURL } from './editor';
  import { strings } from './i18n';

  let rows = $state<Result[]>([]);
  let busy = $state(false);
  let failure = $state('');
  let selected = $state('roof');
  let meshIndex = $state(0);
  let tab = $state('viewer');
  let scale = $state(1);
  let showMesh = $state(true);
  const s = $derived(strings[publicI18n.locale as keyof typeof strings] ?? strings.en);
  const meshes = $derived(cases.filter(c => c.group === selected));
  const current = $derived(meshes[Math.min(meshIndex, meshes.length - 1)]);
  const result = $derived(rows.find(r => r.id === current.id));
  const view = $derived(viewerData(current, result));
  const passed = $derived(finest.filter(c => rows.find(r => r.id === c.id)?.pass).length);
  const label = (group: string) => s[group as 'roof' | 'cylinder' | 'hemisphere'];
  const fmt = (v: number | null | undefined) => v == null ? '—' : new Intl.NumberFormat(publicI18n.locale, { maximumSignificantDigits: 7 }).format(v);
  const deformation = $derived(scale * Math.max(...Object.values(current.input.nodes).map(n => Math.hypot(n.x, n.y, n.z))) * .03 / view.range.max);
  async function run() {
    if (busy) return;
    busy = true; failure = ''; rows = [];
    try { await runCases(row => { rows = [...rows, row]; }); }
    catch (e) {
      failure = String(e);
      rows = cases.map(c => ({ id: c.id, value: null, error: null, pass: false, failure }));
    }
    finally { busy = false; }
  }
  function open() { window.open(editorURL(current, new URL(`${import.meta.env.BASE_URL}app`, location.origin).href), '_blank', 'noopener'); }
  onMount(() => { showMesh = !window.matchMedia('(max-width: 640px)').matches; void run(); });
</script>

<ExperimentShell paperId="shell-obstacle-course" name={copy.shellObstacleCourseBelytschkoEtAl}
  lead={copy.threeCurvedShellBenchmarksSolvedWithThe}
  sourcePath="engine/tests/benchmarks"
  actions={{ goToStep: n => { meshIndex = Math.max(0, Math.min(meshes.length - 1, n)); }, setParams: () => {}, showTab: t => { tab = t; } }}
  verification={{ reference: { kind: 'none', why: 'Production-engine comparisons with existing test references; no independent reference solver.' }, published: { kind: 'none', why: 'Proposed: numerical values and exact paper table/page locators have not been checked against the paper text.' } }}>
  {#snippet article()}
    <h2>{copy.theObstacleCourse}</h2>
    <p>{copy.thisPageRunsExistingStabileoShellTests}</p>
    <h2>{copy.modelsAndMeasurements}</h2>
    <p><strong>{copy.scordelisLoRoof}</strong>{copy.rLThicknessHalfAngleEVertical}</p>
    <p><strong>{copy.pinchedCylinderWithRigidDiaphragms}</strong>{copy.rLThicknessETheOneEighth}</p>
    <p><strong>{copy.hemisphereWithAnHole}</strong>{copy.theNafemsLeLabelledVariantIn}<code>{copy.shellBenchmarkBenchmarkHemisphereHoleConvergence}</code>{copy.rThicknessELatitudeRunsFromThe}<strong>0.185</strong>{copy.theNativeSolidShellTestInsteadApplies}<strong>0.094</strong>{copy.alsoCitingThoseConventionsAreNotInterchangeable}</p>
    <p>{copy.allInputsUseTheTestsConsistentBenchmark}</p>
    <h2>{copy.refinementAndVerdicts}</h2>
    <p>{copy.the}<a href="https://github.com/lambdaclass/stabileo/blob/main/engine/tests/benchmarks/shell_obstacle_course.json">{copy.sharedEngineOwnedCaseFile}</a>{copy.isReadByTheNativeTestsAnd}</p>
    <p>{copy.theHeadlineCountsTheFinestSelectedBrowser}</p>
    <h2 id="limitations">{copy.findingsAndProvenance}</h2>
    <p>{copy.the}<a href="https://github.com/lambdaclass/stabileo/blob/main/engine/tests/benchmarks/KNOWN_ISSUES.md#shell-obstacle-course">{copy.findingsLedger}</a>{copy.recordsAccuracyAndModelLimitationsThe}<a href="https://github.com/lambdaclass/stabileo/blob/main/engine/src/known_issues.rs">{copy.productionRegistry}</a>{copy.hasNoOpenShellEntrySolverOwner}</p>
    <p>{copy.referencesAreInheritedFrom}<code>{copy.shellBenchmarkRs}</code>{copy.and}<code>{copy.solidShellLockingRs}</code>{copy.theRoofAndCylinderValuesAlsoAppear}<code>{copy.scordelisLoRs}</code>{copy.containsFlatPlateChecksDespiteItsFilename}</p>
    <h2>{s.native}</h2>
    <ul>{#each nativeOnly as c}<li><strong>{c.label}</strong>: {c.reason} <code>{c.nativeTest}</code></li>{/each}</ul>
  {/snippet}
  {#snippet app()}
    <div class="benchmark-pane">
      <p role="status" data-testid="shell-summary">{#if busy}{s.running} {rows.length}/{cases.length}{:else if rows.length === cases.length}{s.summary}: {passed}/3{:else}{s.pending}{/if}</p>
      <p>{s.subset}</p>
      <button onclick={run} disabled={busy}>{s.run}</button>
      {#if failure}<p role="alert">{s.failed}: {failure}</p>{/if}
      <PaneTabs tabs={[{ id: 'viewer', label: s.viewer }, { id: 'results', label: s.results }]} bind:active={tab} />
      <div id="rs-panel-viewer" role="tabpanel" aria-labelledby="rs-tab-viewer" hidden={tab !== 'viewer'}>
        <label>{s.select}<select bind:value={selected} onchange={() => { meshIndex = 0; }}>{#each groups as group}<option value={group}>{label(group)}</option>{/each}</select></label>
        <label>{s.mesh}<input data-testid="mesh-slider" type="range" min="0" max={meshes.length - 1} step="1" bind:value={meshIndex} />{current.mesh} × {current.mesh}</label>
        <label>{s.scale}<input type="range" min="0" max="10" step="0.5" bind:value={scale} />×{fmt(deformation)}</label>
        <label><input type="checkbox" bind:checked={showMesh} />{s.mesh}</label>
        <ScalarFieldViewer {...view} cellSize={4} deformScale={deformation} {showMesh} title={label(selected)} unit="" height="23rem" onOpenEditor={open} />
        <p>{s.projection}</p>
        <button onclick={open}>{s.open}</button>
        <p data-testid="selected-result">{current.mesh} × {current.mesh} · {s.reference}: {fmt(current.reference)}{copy.stabileo}{fmt(result?.value)} · {s.error}: {fmt(result?.error == null ? null : result.error * 100)}% · {result ? (result.pass ? s.pass : s.fail) : s.pending}</p>
        <ConvergencePlot cases={meshes} {rows} title={`${label(selected)} — ${s.convergence}`} xLabel={s.mesh} yLabel={s.ratio} locale={publicI18n.locale} />
      </div>
      <div id="rs-panel-results" role="tabpanel" aria-labelledby="rs-tab-results" hidden={tab !== 'results'}>
        <div class="table-scroll" id="checks"><table><thead><tr><th>{s.select}</th><th>{s.reference}</th><th>{copy.stabileo2}</th><th>{s.error} %</th><th></th></tr></thead><tbody>
          {#each cases as c}
            {@const r = rows.find(r => r.id === c.id)}
            <tr data-testid={c.id}><th><button onclick={() => { selected = c.group; meshIndex = cases.filter(x => x.group === c.group).findIndex(x => x.id === c.id); tab = 'viewer'; }}>{label(c.group)} {c.mesh}×{c.mesh}</button></th><td>{fmt(c.reference)}</td><td>{fmt(r?.value)}</td><td>{fmt(r?.error == null ? null : r.error * 100)}</td><td>{#if !r}{s.pending}{:else if r.pass}{s.pass}{:else}<a href={c.knownIssue} title={s.issue}>{s.fail}</a>{#if r.failure}<p>{r.failure}</p>{/if}{/if}</td></tr>
          {/each}
        </tbody></table></div>
        {#each groups as group}<ConvergencePlot cases={cases.filter(c => c.group === group)} {rows} title={label(group)} xLabel={s.mesh} yLabel={s.ratio} locale={publicI18n.locale} />{/each}
      </div>
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .benchmark-pane { height: 100%; overflow: auto; }
  button, select, input { font: inherit; }
  button, select { padding: .45rem; }
  label { display: block; margin: .65rem 0; }
  select { max-width: 100%; }
  p { font-size: .875rem; }
  .table-scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .8rem; }
  th, td { text-align: left; padding: .5rem; border-bottom: 1px solid var(--hair); }
  td { font-variant-numeric: tabular-nums; }
  a { color: inherit; }
</style>
