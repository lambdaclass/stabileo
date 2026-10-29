<script lang="ts">
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

<ExperimentShell paperId="shell-obstacle-course" name="Shell obstacle course — Belytschko et al. (1985)"
  lead="Three curved-shell benchmarks, solved with the production MITC4 engine. Refine each mesh and inspect its measured response; every failure stays visible."
  sourcePath="engine/tests/benchmarks"
  actions={{ goToStep: n => { meshIndex = Math.max(0, Math.min(meshes.length - 1, n)); }, setParams: () => {}, showTab: t => { tab = t; } }}
  verification={{ reference: { kind: 'none', why: 'Production-engine comparisons with existing test references; no independent reference solver.' }, published: { kind: 'none', why: 'Proposed: numerical values and exact paper table/page locators have not been checked against the paper text.' } }}>
  {#snippet article()}
    <h2>The obstacle course</h2>
    <p>This page runs existing Stabileo shell tests in the browser. It is a benchmark companion to Belytschko, Stolarski, Liu, Carpenter and Ong (CMAME 51, 1985), not an implementation of their stress-projection element. The production element here is MITC4 with its existing membrane and shear treatment. No solver equations or tolerances were changed for this page.</p>
    <h2>Models and measurements</h2>
    <p><strong>Scordelis–Lo roof:</strong> R = 25, L = 50, thickness 0.25, 40° half-angle, E = 4.32 × 10⁸, ν = 0, vertical gravity load 90 per area. A quarter model measures |u_z| at the midspan free edge against 0.3024. The existing test's crown pin and corner restraint precedence are retained, including omission of loads at vertically restrained nodes.</p>
    <p><strong>Pinched cylinder with rigid diaphragms:</strong> R = 300, L = 600, thickness 3, E = 3 × 10⁶, ν = 0.3. The one-eighth geometry carries a 0.25 inward load at midspan. The test calls this a quarter model in its comments. We retain its exact restraints, including corner precedence, and measure |u_y| at the loaded node against 1.8248 × 10⁻⁵.</p>
    <p><strong>Hemisphere with an 18° hole:</strong> the NAFEMS LE3-labelled variant in <code>shell_benchmark::benchmark_hemisphere_hole_convergence</code>. R = 10, thickness 0.04, E = 6.825 × 10⁷, ν = 0.3; latitude runs from the equator to 72°. The quarter model applies +2 in x and −2 in y and measures |u_x| at the equator against <strong>0.185</strong>. The native solid-shell test instead applies ±1 after symmetry reduction and compares with <strong>0.094</strong> (also citing 0.0924). Those conventions are not interchangeable. The unperforated hemisphere is not this case.</p>
    <p>All inputs use the tests' consistent benchmark units. The engine input modulus is E/1000. Viewer numbers use those same length units; magnification is visual only. The editor handoff preserves geometry, nodal loads and each constrained degree of freedom.</p>
    <h2>Refinement and verdicts</h2>
    <p>The <a href="https://github.com/lambdaclass/stabileo/blob/main/engine/tests/benchmarks/shell_obstacle_course.json">shared engine-owned case file</a> is read by the native tests and this page. Curves show computed/reference versus mesh divisions; the dashed line is 1. Failures or missing results are never interpolated. Refinement need not be monotone and is not a promise of convergence.</p>
    <p>The headline counts the finest selected browser meshes only: roof 16×16, cylinder 16×16, hemisphere 16×16. The 16×16 cap bounds each model to 289 nodes. Cylinder 12×12 and 16×16 extend the existing test geometry and restraints; they have no historical regression assertion. This is a conservative workload cap, not a measured browser capacity limit. Every row uses the existing benchmark-page accuracy policy of relative error strictly below 2%; this is not a tolerance attributed to the paper. Native tests retain all their original assertions and much broader regression bounds. Passing those bounds does not mean passing this accuracy target.</p>
    <h2 id="limitations">Findings and provenance</h2>
    <p>The <a href="https://github.com/lambdaclass/stabileo/blob/main/engine/tests/benchmarks/KNOWN_ISSUES.md#shell-obstacle-course">findings ledger</a> records accuracy and model limitations. The <a href="https://github.com/lambdaclass/stabileo/blob/main/engine/src/known_issues.rs">production registry</a> has no open shell entry; solver-owner triage is still needed. The page cannot establish that a mismatch is solely locking rather than a boundary-condition or reference convention issue.</p>
    <p>References are inherited from <code>shell_benchmark.rs</code> and <code>solid_shell_locking.rs</code>; the roof and cylinder values also appear in the shared MacNeal–Harder data. <code>scordelis_lo.rs</code> contains flat plate checks, despite its filename. Crossref verifies the Belytschko citation, not these numerical transcriptions. Published table/page provenance is unresolved, so catalogue status remains proposed. Research, not a design tool.</p>
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
        <p data-testid="selected-result">{current.mesh} × {current.mesh} · {s.reference}: {fmt(current.reference)} · Stabileo: {fmt(result?.value)} · {s.error}: {fmt(result?.error == null ? null : result.error * 100)}% · {result ? (result.pass ? s.pass : s.fail) : s.pending}</p>
        <ConvergencePlot cases={meshes} {rows} title={`${label(selected)} — ${s.convergence}`} xLabel={s.mesh} yLabel={s.ratio} locale={publicI18n.locale} />
      </div>
      <div id="rs-panel-results" role="tabpanel" aria-labelledby="rs-tab-results" hidden={tab !== 'results'}>
        <div class="table-scroll" id="checks"><table><thead><tr><th>{s.select}</th><th>{s.reference}</th><th>Stabileo</th><th>{s.error} %</th><th></th></tr></thead><tbody>
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
