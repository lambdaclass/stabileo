<script lang="ts">
  import { onMount } from 'svelte';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { holdPrerender } from '../../../lib/prerender-hold';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
  import Sci from '../shell/Sci.svelte';
  import { num, sci } from '../shell/format';
  import ScalarFieldViewer from '../../viewport/ScalarFieldViewer.svelte';
  import ConvergencePlot from './ConvergencePlot.svelte';
  import { cases, nativeOnly, runCases, finest, groups, viewerData, signedReference, shown, compare, inputFor, refusalFor, responseRatio, type Case, type Result } from './cases';
  import { caseFor, MESH_RANGE, type BuiltGroup } from './builders';
  import { editorURL } from './editor';
  import { shellLocale, strings } from './i18n';
  import validation from '../../../../../research/benchmarks/shell-obstacle-course/VALIDATION.json';

  type Group = 'roof' | 'cylinder' | 'hemisphere';
  type Check = { id: string; kind: string; observed: number; tolerance: number; passed: boolean };
  const checks = validation.checks as Check[];
  const lang = $derived(shellLocale(publicI18n.locale));
  const s = $derived(strings[lang]);

  let rows = $state<Result[]>([]);
  let built = $state<Record<string, Result>>({});
  let busy = $state(false);
  let solving = $state(false);
  let failure = $state('');
  let selected = $state<Group>('roof');
  let meshes = $state<Record<Group, number>>({ roof: 16, cylinder: 16, hemisphere: 16 });
  let tab = $state('viewer');
  let scale = $state(1);
  let showMesh = $state(true);
  let token = 0;

  const isBuilt = (g: Group): g is BuiltGroup => g !== 'hemisphere';
  const options = (g: Group) => isBuilt(g)
    ? Array.from({ length: MESH_RANGE.max - MESH_RANGE.min + 1 }, (_, i) => MESH_RANGE.min + i)
    : cases.filter(c => c.group === g).map(c => c.mesh);
  const choices = $derived(options(selected));
  const index = $derived(Math.max(0, choices.indexOf(meshes[selected])));
  const current = $derived<Case & { built?: boolean }>(isBuilt(selected) ? caseFor(selected, meshes[selected]) : cases.find(c => c.group === selected && c.mesh === meshes[selected])!);
  const result = $derived(rows.find(r => r.id === current.id) ?? built[current.id]);
  const view = $derived(viewerData(current, result));
  const passed = $derived(finest.filter(c => rows.find(r => r.id === c.id)?.pass).length);
  const label = (group: string) => s[group as Group];
  const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '−': '⁻' };
  const fmt = (v: number | null | undefined) => {
    if (v == null) return '—';
    if (v === 0 || Math.abs(v) >= 1e-3) return num(v, { sig: 7 });
    const p = sci(v, 7);
    return `${p.mantissa} × 10${[...p.exp].map(c => SUP[c] ?? c).join('')}`;
  };
  const pct = (v: number | null | undefined) => v == null ? '—' : num(v * 100, { sig: 4 });
  const deformation = $derived(scale * Math.max(...Object.values(current.input.nodes).map(n => Math.hypot(n.x, n.y, n.z))) * .03 / view.range.max);
  const checkName = (c: Check) => {
    const roof = /^roof-(\d+)$/.exec(c.id);
    if (roof) return s.checkRoof.replaceAll('{n}', roof[1]);
    return { 'cylinder-32': s.checkCylinder32, 'cylinder-convergence': s.checkConvergence, parity: s.checkParity, 'hemisphere-refusals': s.checkRefusals, builders: s.checkBuilders }[c.id] ?? c.id;
  };
  const plain = (v: number) => v === 0 || (Math.abs(v) >= 1e-3 && Math.abs(v) < 1e6);

  function points(group: Group) {
    const all = new Map<number, number | null>();
    for (const c of cases.filter(c => c.group === group)) {
      const r = rows.find(r => r.id === c.id);
      all.set(c.mesh, r?.value == null ? null : responseRatio(c, r.value));
    }
    if (isBuilt(group)) for (const n of options(group)) {
      const r = built[`${group}-${n}`];
      if (r && !all.has(n)) all.set(n, r.value == null ? null : responseRatio(caseFor(group, n), r.value));
    }
    return [...all].sort((a, b) => a[0] - b[0]).map(([n, ratio]) => ({ n, ratio }));
  }

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

  async function solveBuilt(c: Case) {
    const mine = ++token;
    solving = true;
    await new Promise(resolve => setTimeout(resolve, 120));
    if (mine !== token) return;
    let row: Result;
    try {
      const engine = await import('../../../lib/engine/wasm-solver');
      await engine.initSolver();
      const { knownIssueResultDisposition } = await import('../../../lib/engine/known-issues');
      const solved = engine.solve3D(inputFor(c));
      if (knownIssueResultDisposition(solved).refused) throw new Error(JSON.stringify({ structuredDiagnostics: solved.structuredDiagnostics }));
      row = compare(c, solved.displacements as unknown as Record<string, number>[]);
    } catch (e) {
      row = refusalFor(c, e);
    }
    built = { ...built, [c.id]: row };
    if (mine === token) solving = false;
  }

  $effect(() => {
    const c = current;
    if (c.built && !built[c.id]) void solveBuilt(c);
  });

  function setMesh(group: Group, n: number) {
    selected = group;
    meshes = { ...meshes, [group]: n };
    tab = 'viewer';
  }
  function open() { window.open(editorURL(current, new URL(`${import.meta.env.BASE_URL}app`, location.origin).href, s), '_blank', 'noopener'); }
  onMount(() => { showMesh = !window.matchMedia('(max-width: 640px)').matches; void holdPrerender(run()); });
</script>

{#snippet value(v: number, kind: string)}
  {#if kind === 'count'}{num(v)}{:else if kind === 'relative'}{#if plain(v * 100)}{num(v * 100, { sig: 3 })}&#8239;%{:else}<Sci value={v * 100} unit="%" />{/if}{:else}{num(v, { sig: 4 })}{/if}
{/snippet}

<ExperimentShell paperId="shell-obstacle-course" name={s.title}
  lead={s.lead}
  locale={lang}
  sourcePath="research/benchmarks/shell-obstacle-course"
  referenceLabel={s.referenceLabel}
  actions={{ goToStep: n => { meshes = { ...meshes, [selected]: choices[Math.max(0, Math.min(choices.length - 1, n))] }; }, setParams: p => { if (typeof p.mesh === 'number' && typeof p.group === 'string') setMesh(p.group as Group, p.mesh); }, showTab: t => { tab = t; } }}
  verification={{ reference: { kind: 'checks', passed: checks.filter(c => c.passed).length, total: checks.length, href: '#validation' }, published: { kind: 'none', why: s.publishedWhy } }}>
  {#snippet article()}
    <h2>{s.obstacleHeading}</h2>
    <p>{s.obstacleText}</p>
    <h2>{s.modelsHeading}</h2>
    <p><strong>{s.roof}:</strong> {s.roofText}</p>
    <p><strong>{s.cylinder}:</strong> {s.cylinderText}</p>
    <p><strong>{s.hemisphere}:</strong> {s.hemisphereBefore}<code>shell_benchmark::benchmark_hemisphere_hole_convergence</code>{s.hemisphereAfter}</p>
    <p>{s.unitsText}</p>
    <h2 id="mesh">{s.meshHeading}</h2>
    <p>{s.meshText}</p>
    <p class="try">{s.try}:
      {#each [['roof', 4], ['roof', 20], ['cylinder', 10], ['cylinder', 20]] as [g, n] (`${g}-${n}`)}
        <button class="link" data-testid="try-{g}-{n}" onclick={() => setMesh(g as Group, n as number)}>{label(g as string)} {n} × {n}</button>
      {/each}
    </p>
    <h2>{s.verdictHeading}</h2>
    <p>{s.verdictText}</p>
    <h2 id="validation">{s.validationHeading}</h2>
    <p>{s.validationText}</p>
    <div class="table-scroll">
      <table data-testid="validation-checks">
        <thead><tr><th scope="col">{s.check}</th><th scope="col">{s.observed}</th><th scope="col">{s.tolerance}</th></tr></thead>
        <tbody>
          {#each checks as c (c.id)}
            <tr><th scope="row">{checkName(c)}</th><td>{@render value(c.observed, c.kind)}</td><td><span class={c.passed ? 'ok' : 'bad'} aria-label={c.passed ? s.pass : s.fail}>{c.passed ? '✓' : '✗'}</span> {@render value(c.tolerance, c.kind)}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    <h2>{s.paperHeading}</h2>
    <p>{s.paperText}</p>
    <h2 id="limitations">{s.findingsHeading}</h2>
    <p><a href="https://github.com/lambdaclass/stabileo/blob/main/docs/audits/810-mitc4-curved-shells.md">{s.auditLink}</a>{s.auditText}</p>
    <p>{s.ledgerBefore}<a href="https://github.com/lambdaclass/stabileo/blob/main/engine/tests/benchmarks/KNOWN_ISSUES.md#shell-obstacle-course">{s.ledgerLink}</a>{s.ledgerMiddle}<a href="https://github.com/lambdaclass/stabileo/blob/main/engine/src/known_issues.rs">{s.registryLink}</a>{s.ledgerAfter}</p>
    <h2>{s.native}</h2>
    <ul>{#each nativeOnly as c, i (c.nativeTest)}<li><strong>{s.nativeOnly[i]?.[0] ?? c.label}</strong>: {s.nativeOnly[i]?.[1] ?? c.reason} <code>{c.nativeTest}</code></li>{/each}</ul>
  {/snippet}
  {#snippet app()}
    <div class="benchmark-pane">
      <div class="head">
        <p role="status" data-testid="shell-summary">{#if busy}{s.running.replace('{k}', String(rows.length)).replace('{n}', String(cases.length))}{:else if rows.length === cases.length}{s.summary}: {passed}/3{:else}{s.pending}{/if}</p>
        <button onclick={run} disabled={busy}>{s.run}</button>
      </div>
      {#if failure}<p role="alert">{s.failed}: {failure}</p>{/if}
      <PaneTabs tabs={[{ id: 'viewer', label: s.viewer }, { id: 'results', label: s.results }]} bind:active={tab} />
      <div id="rs-panel-viewer" role="tabpanel" aria-labelledby="rs-tab-viewer" hidden={tab !== 'viewer'}>
        <ScalarFieldViewer plane="elevation" {...view} cellSize={4} deformScale={deformation} {showMesh} title={label(selected)} unit="" height="23rem" onOpenEditor={open} />
        <label>{s.select}<select bind:value={selected}>{#each groups as group (group)}<option value={group}>{label(group)}</option>{/each}</select></label>
        <label>{s.mesh}: <output>{current.mesh} × {current.mesh}</output>
          <input data-testid="mesh-slider" type="range" min="0" max={choices.length - 1} step="1" value={index} aria-valuetext={`${current.mesh} × ${current.mesh}`}
            oninput={e => { meshes = { ...meshes, [selected]: choices[Number(e.currentTarget.value)] }; }} />
        </label>
        <p class="source" data-testid="mesh-source">{current.built ? s.fromBuilder.replace('{n}', String(current.mesh)) : s.fromFixture}{#if current.built && solving && !result} · {s.solving.replaceAll('{n}', String(current.mesh))}{/if}</p>
        <p data-testid="selected-result">{current.mesh} × {current.mesh} · {s.reference}: {fmt(signedReference(current))} · Stabileo: {fmt(shown(result).value)} · {s.errorPct}: {pct(shown(result).error)} · {result ? (result.refused ? s.withheld : result.pass ? s.pass : s.fail) : s.pending}</p>
        <label>{s.scale}<span class="range"><input type="range" min="0" max="10" step="0.5" bind:value={scale} /><output>×{num(deformation, { sig: 3 })}</output></span></label>
        <label class="check"><input type="checkbox" bind:checked={showMesh} />{s.showMesh}</label>
        <p>{s.subset}</p>
        <p>{s.projection}</p>
        <button onclick={open}>{s.open}</button>
        <ConvergencePlot points={points(selected)} selected={current.mesh} title={`${label(selected)} — ${s.convergence}`} xLabel={s.mesh} yLabel={s.ratio} />
      </div>
      <div id="rs-panel-results" role="tabpanel" aria-labelledby="rs-tab-results" hidden={tab !== 'results'}>
        <div class="table-scroll" id="checks"><table><caption>{s.caption}</caption><thead><tr><th scope="col">{s.select}</th><th scope="col">{s.reference}</th><th scope="col">Stabileo</th><th scope="col">{s.errorPct}</th><th scope="col">{s.verdict}</th></tr></thead><tbody>
          {#each cases as c (c.id)}
            {@const r = rows.find(r => r.id === c.id)}
            <tr data-testid={c.id}><th scope="row"><button class="link" onclick={() => setMesh(c.group as Group, c.mesh)}>{label(c.group)} {c.mesh} × {c.mesh}</button></th><td>{fmt(signedReference(c))}</td><td>{#if r?.refused}{s.withheld}{:else}{fmt(shown(r).value)}{/if}</td><td>{pct(shown(r).error)}</td><td>{#if !r}{s.pending}{:else if r.refused}<a href="https://github.com/lambdaclass/stabileo/issues/798">#798</a>{:else if r.pass}{s.pass}{:else}<a href={c.knownIssue} title={s.issue}>{s.fail}</a>{#if r.failure}<p>{r.failure}</p>{/if}{/if}</td></tr>
          {/each}
        </tbody></table></div>
        {#each groups as group (group)}<ConvergencePlot points={points(group as Group)} title={label(group)} xLabel={s.mesh} yLabel={s.ratio} />{/each}
      </div>
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .benchmark-pane { height: 100%; overflow: auto; }
  .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .25rem .75rem; }
  .head p { margin: 0; }
  button, select, input { font: inherit; }
  button, select { min-height: 44px; padding: 0 .75rem; }
  label { display: block; margin: .65rem 0; }
  select { display: block; max-width: 100%; margin-top: .25rem; }
  input[type='range'] { display: block; width: 100%; min-height: 44px; margin: 0; }
  .range { display: flex; align-items: center; gap: .75rem; }
  .range input { flex: 1; min-width: 0; }
  .check { display: inline-flex; align-items: center; gap: .5rem; min-height: 44px; }
  .check input { width: 1.25rem; height: 1.25rem; margin: 0; }
  .source { color: var(--fg-2); }
  p { font-size: .875rem; }
  .table-scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .8125rem; }
  caption { text-align: left; color: var(--fg-2); padding-bottom: .4rem; }
  th, td { text-align: left; padding: .5rem; border-bottom: 1px solid var(--hair); vertical-align: top; }
  td { font-variant-numeric: tabular-nums; }
  .link { background: none; border: 0; color: inherit; text-decoration: underline; padding: 0 .25rem; cursor: pointer; text-align: left; }
  .try .link { min-height: 44px; }
  .ok { color: var(--st-ok); }
  .bad { color: var(--st-red, #c0392b); }
  a { color: inherit; }
  code { overflow-wrap: anywhere; }
  .benchmark-pane :global(.rs-tabs button) { min-height: 44px; }
  .benchmark-pane :global(:is(.sfv-status, .sfv-status *, .shell-legend, .shell-legend *, .cam-item, .cam-item *)) { font-size: 12px !important; }
</style>
