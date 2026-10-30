<script lang="ts">
  /**
   * /research/metamaterials/grossman-2026: spring networks after Grossman & Boudaoud (2026), run in
   * the reader's browser by research/metamaterials/grossman-2026 (WASM), shown in the shared
   * Stabileo viewer, compared with the paper's published numbers.
   *
   * Layout: the article (left) and a sticky app pane (right: viewer, controls, plots). Links in
   * the article call `apply`, which drives the app.
   */
  import { rs } from '../i18n';
  const s = $derived(rs());
  import { onDestroy, onMount, untrack } from 'svelte';
  import { initializePage } from './page-load';
  import { EditorLoad, openEditorWindow } from './editor-load.svelte';
  import { forceScale, forceLegend } from './force-display';
  import { uniaxial } from './moduli';
  import { evidence } from './evidence';
  import { Simulation } from './simulation.svelte';
  import results from '../../../../../research/metamaterials/grossman-2026/results/stabileo_results.json';
  import fig5Csv from '../../../../../research/metamaterials/grossman-2026/reference-results/fig5_simulation_digitized.csv?raw';
  import { REPO_URL } from '../../landing/landing-utils';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { Playback } from '../shell/playback.svelte';
  import PlotXY, { type PlotSeries } from './PlotXY.svelte';
  import { loadSprings, type LatticeKind, type NetworkSpec, type PeriodicResult, type StripResult } from './springs';
  import { embeddedEditorUrl, fullEditorUrl, type StripLabel } from './open-in-stabileo';

  const SOURCE = `${REPO_URL}/tree/main/research/metamaterials/grossman-2026`;
  const DOI = 'https://doi.org/10.1103/17sg-gzhl';
  // Hue is the source (ours blue, the paper orange); dashes mark a variant within a source.
  const OURS = '#3987e5';
  const PAPER = '#d95926';

  type Family = 'foam' | 'ordered' | 'honeycomb' | 'square';
  let family = $state<Family>('foam');
  let eta = $state(0.3);
  let phi = $state(2);
  let psi = $state(0.5);
  let theta = $state(0);
  let ell = $state(0.25);
  let diagonals = $state(false);
  let keep = $state(1);
  let prestress = $state(0);
  let strain = $state(0.01);
  let seed = $state(0);
  let law = $state<'hookean' | 'equal_weight'>('hookean');
  let deform = $state(10);

  const locale = $derived(publicI18n.locale);
  const nf = (v: number | null | undefined, d = 3) =>
    v === null || v === undefined || !Number.isFinite(v) ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);

  const lattice = $derived<LatticeKind>(
    family === 'honeycomb'
      ? { kind: 'honeycomb', l: ell, k_radial: 1e-3 }
      : family === 'square'
        ? { kind: 'square', diagonals }
        : family === 'ordered'
          ? { kind: 'triangular', phi, psi }
          : { kind: 'triangular', phi: 1, psi: 1 },
  );
  const network = $derived<NetworkSpec>({
    lattice,
    eta: family === 'foam' ? eta : 0,
    keep,
    seed,
    spring_law: family === 'ordered' ? law : 'hookean',
    k: 1,
    prestress,
  });
  // The paper pulls along y. The honeycomb's Eq. (23) is for a pull along the 2l axis, so its
  // strip is turned by 90 degrees.
  const stripTheta = $derived(family === 'ordered' ? theta : family === 'honeycomb' ? Math.PI / 2 : 0);
  const cells = $derived(family === 'honeycomb' ? 6 : family === 'foam' ? 26 : 8);

  let glue = $state.raw<Awaited<ReturnType<typeof loadSprings>> | null>(null);
  let loadError = $state<string | null>(null);
  const simulation = new Simulation();
  const strip = $derived(simulation.result?.strip ?? null);
  const cell = $derived(simulation.result?.cell ?? null);
  const ordered = $derived(simulation.result?.ordered ?? null);
  const solved = $derived(simulation.result?.input);
  const solveError = $derived(simulation.error);
  const solveMs = $derived(simulation.ms);

  const playback = new Playback(140, 1800);
  const SWEEP = Array.from({ length: 26 }, (_, i) => i * 0.02);
  const autoplaying = $derived(playback.playing);

  function solve() {
    if (!glue) return;
    simulation.run(glue, {
      network: $state.snapshot(network) as NetworkSpec,
      label: { family, eta, keep, seed, strain },
      theta: stripTheta, cells, phi, psi,
    });
    if (untrack(() => simulation.error)) {
      editor.attempted = false;
      editor.src = null;
      editorStrip = null;
      editor.loading = false;
      editor.error = null;
    }
  }

  $effect(() => {
    // Re-solve whenever an input changes (reads every input through `network`, `strain`, ...).
    void network;
    void strain;
    void stripTheta;
    void cells;
    if (glue) solve();
  });

  $effect(() => {
    if (!autoplaying) return;
    eta = SWEEP[playback.shown];
  });

  let pane: HTMLElement;
  onMount(() => {
    // Deep links: #edit opens the editor tab; ?eta=… (foam) sets the disorder and skips the sweep
    // (also how the gallery thumbnail is rendered: scripts/research-thumbs.mjs with thumbnailQuery).
    const q = new URLSearchParams(window.location.search);
    const qEta = Number(q.get('eta'));
    const deepLinked = q.has('eta') && Number.isFinite(qEta) && qEta >= 0 && qEta <= 0.5;
    if (deepLinked) eta = qEta;
    thumbMode = q.has('thumb');
    const cancelLoad = initializePage(loadSprings(), (g) => {
      glue = g;
      playback.setCount(SWEEP.length);
      if (window.location.hash === '#edit') {
        showTab('edit');
        return;
      }
      if (deepLinked) return;
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const narrow = window.innerWidth < 640;
      if (reducedMotion) return;
      playback.startAutoplay({ reducedMotion, narrow });
    }, (e) => {
      loadError = e instanceof Error ? e.message : String(e);
    });
    const io = new IntersectionObserver((entries) => playback.setVisible(entries.some((x) => x.isIntersecting)));
    if (pane) io.observe(pane);
    return () => {
      cancelLoad();
      io.disconnect();
    };
  });
  onDestroy(() => playback.dispose());

  function touch() {
    playback.pause();
  }

  /** What the article's links ask of the app pane (ExperimentLink). */
  const actions = {
    goToStep(i: number) {
      touch();
      eta = SWEEP[Math.max(0, Math.min(SWEEP.length - 1, i))];
    },
    setParams(p: Record<string, number | string | boolean>) {
      apply(p as Parameters<typeof apply>[0]);
    },
    showTab(t: string) {
      if (t === 'experiment' || t === 'params' || t === 'edit') showTab(t);
    },
  };
  const paperChecks = evidence[0];

  /** Links in the article set the app's state. */
  function apply(p: Partial<{ family: Family; eta: number; phi: number; psi: number; theta: number; ell: number; keep: number; prestress: number; diagonals: boolean; law: 'hookean' | 'equal_weight'; strain: number }>) {
    touch();
    tab = 'experiment';
    tabId = 'experiment';
    if (p.family !== undefined) family = p.family;
    if (p.eta !== undefined) eta = p.eta;
    if (p.phi !== undefined) phi = p.phi;
    if (p.psi !== undefined) psi = p.psi;
    if (p.theta !== undefined) theta = p.theta;
    if (p.ell !== undefined) ell = p.ell;
    if (p.diagonals !== undefined) diagonals = p.diagonals;
    if (p.law !== undefined) law = p.law;
    keep = p.keep ?? 1;
    prestress = p.prestress ?? 0;
    if (p.strain !== undefined) strain = p.strain;
  }

  /** Supplemental Eq. (9) of the paper, as printed. */
  function eq9(f: number, p: number, t: number): number {
    const s3 = Math.sqrt(3);
    const a = f * f - 2 * f;
    const [p2, p4, p6] = [p * p, p ** 4, p ** 6];
    const P =
      Math.cos(4 * t) * (27 * p6 - (f - 2) ** 2 * f * f * (f * f - 2 * f + 4) + 9 * p4 * a - 3 * p2 * (a * (a - 20) - 16)) +
      Math.sin(4 * t) * (2 * s3 * p * (f - 1) * (9 * p4 + 6 * p2 * (a - 2) + a * (a + 8))) -
      48 * p2 +
      (a - 3 * p2) * (9 * p4 + 6 * p2 * a + a * (a + 4));
    const [S, C] = [Math.sin(t), Math.cos(t)];
    const Q =
      36 * p4 * S ** 4 +
      2 * C ** 4 * (6 * p2 * a * a + a * a * (a + 4) + 9 * p4 * (a + 2)) +
      6 * p2 * S * S * C * C * (9 * p4 + f ** 4) +
      3 * p2 * Math.sin(2 * t) ** 2 * (3 * p2 * (a + 2) - 2 * (f - 2) * (f * f - 4 * f + 2)) -
      4 * s3 * p * (f - 1) * S * C ** 3 * (9 * p4 + 6 * p2 * a + a * (a + 8)) -
      48 * s3 * p ** 3 * (f - 1) * S ** 3 * C;
    return -P / (4 * Q);
  }
  const eq23 = (l: number) => (-(2 - 4 * l) * (l + 0.5)) / (3 + 4 * l - 4 * l * l);

  // ---- what the viewer shows -------------------------------------------------------------
  // The strip is drawn lying down (the paper's y axis to the right) so it fills the wide pane:
  // drawn (X, Y) = (y, 13 - x).
  const xy = $derived(strip ? Float64Array.from(strip.nodes.flatMap((p) => [p[1], 13 - p[0]])) : new Float64Array());
  const bars = $derived(strip ? Uint32Array.from(strip.bonds.flat()) : new Uint32Array());
  const disp = $derived(strip ? Float64Array.from(strip.displacement.flatMap((u) => [u[1], -u[0]])) : null);
  const forces = $derived(strip ? strip.force.map((f) => f * forceScale(solved?.label.strain ?? 0)) : null);
  const forceRange = $derived.by(() => {
    if (!forces) return { min: -1, max: 1 };
    const m = Math.max(1e-12, ...forces.map(Math.abs));
    return { min: -m, max: m };
  });
  // Room under the strip for the legend, except when rendering the gallery thumbnail (?thumb).
  let thumbMode = $state(false);
  const VIEW = $derived<[number, number, number, number]>(thumbMode ? [-8, -16, 61, 30] : [-1, -9, 53 * (1 + Math.max(0, deform * strain)) + 1, 14]);
  // The paper's convention for the pulled direction, in the periodic cell's frame.
  const pullAngle = $derived(solved?.label.family === 'honeycomb' ? 0 : Math.PI / 2 - (solved?.theta ?? 0));
  const cellAlong = $derived(cell ? uniaxial(cell.c, pullAngle) : null);

  // ---- plots ---------------------------------------------------------------------------------
  type MS = { mean: number; std: number };
  const foamP = results.foam.periodic as { eta: number; nu: MS; bulk: MS; shear: MS; young_over_young0: MS; nonaffinity_shear: MS }[];
  const foamS = results.foam.strip_13x52 as { eta: number; nu: MS }[];
  const fig5 = fig5Csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(','))
    .map((c) => ({ x: Number(c[0]), y: c[1] === '' ? NaN : Number(c[1]), lo: Number(c[2]), hi: Number(c[3]) }));
  const foamSeries = $derived<PlotSeries[]>([
    { name: s.springsBandSeries.replace('{cells}', String(results.foam.cells)).replace('{seeds}', String(results.foam.seeds)), color: OURS, kind: 'band', points: foamP.map((r) => ({ x: r.eta, y: r.nu.mean, lo: r.nu.mean - r.nu.std, hi: r.nu.mean + r.nu.std })) },
    { name: s.springsMeanSeries.replace('{seeds}', String(results.foam.seeds)), color: OURS, kind: 'line', points: foamP.map((r) => ({ x: r.eta, y: r.nu.mean })) },
    { name: s.springsStripSeries, color: OURS, kind: 'line', dashed: true, points: foamS.map((r) => ({ x: r.eta, y: r.nu.mean })) },
    { name: s.springsFigureSeries, color: PAPER, kind: 'points', shape: 'triangle', points: fig5.filter((p) => Number.isFinite(p.y)) },
    { name: s.springsTextSeries, color: PAPER, kind: 'points', shape: 'square', points: [{ x: 0.46, y: 0 }, { x: 0.5, y: -0.1 }] },
  ]);
  type Dil = { z: number; bulk: number; shear: number };
  const dil = results.dilution as Dil[];
  const dilSeries = $derived<PlotSeries[]>([
    { name: s.springsBulkSeries, color: OURS, kind: 'line', points: dil.map((r) => ({ x: r.z, y: r.bulk })) },
    { name: s.springsShearSeries, color: OURS, kind: 'line', dashed: true, points: dil.map((r) => ({ x: r.z, y: r.shear })) },
  ]);
  type Honey = { l: number; eq23: number; 'nu_k1e-3': number };
  const honeySeries = $derived<PlotSeries[]>([
    { name: s.springsHoneyPaperSeries, color: PAPER, kind: 'line', points: Array.from({ length: 91 }, (_, i) => 0.05 + i * 0.01).map((l) => ({ x: l, y: eq23(l) })) },
    { name: s.springsHoneySeries, color: OURS, kind: 'points', points: (results.honeycomb as Honey[]).map((r) => ({ x: r.l, y: r['nu_k1e-3'] })) },
  ]);
  const orderedSeries = $derived.by<PlotSeries[]>(() => {
    if (!ordered) return [];
    const ts = Array.from({ length: 91 }, (_, i) => (Math.PI * i) / 90);
    const pick = (r: PeriodicResult) => ts.map((t) => ({ x: t, y: uniaxial(r.c, Math.PI / 2 - t)?.[1] ?? NaN }));
    return [
      { name: s.springsOrderedPaperSeries, color: PAPER, kind: 'line', points: ts.map((t) => ({ x: t, y: eq9(solved!.phi, solved!.psi, t) })) },
      { name: s.springsEqualWeightSeries, color: OURS, kind: 'line', dashed: true, points: pick(ordered.eq) },
      { name: s.springsHookeanSeries, color: OURS, kind: 'line', points: pick(ordered.hook) },
    ];
  });

  const fmtSci = (v: number) => (v === 0 ? '0' : Math.abs(v) >= 0.01 && Math.abs(v) < 1000 ? v.toPrecision(3) : v.toExponential(1));

  // ---- the Stabileo editor, embedded (loaded only when its tab is opened) -------------------
  let tab = $state<'experiment' | 'params' | 'edit'>('experiment');
  // PaneTabs binds a plain string; any switch counts as the visitor taking over.
  let tabId = $state<string>('experiment');
  $effect(() => {
    if (tabId !== tab) showTab(tabId === 'edit' ? 'edit' : tabId === 'params' ? 'params' : 'experiment');
  });
  const editor = new EditorLoad();
  let fullEditorError = $state<string | null>(null);
  const exportDisabled = $derived(!strip || (solved?.network.prestress ?? 0) !== 0);
  let editorStrip = $state.raw<StripResult | null>(null);
  const labelParams = (): StripLabel => solved!.label;
  const e2e = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('e2e') === '1';

  async function loadEditor() {
    if (!strip || exportDisabled) return;
    const current = simulation.result;
    const currentStrip = strip;
    const label = labelParams();
    if (await editor.load(() => embeddedEditorUrl(currentStrip, label, e2e), () => simulation.result === current)) {
      editorStrip = currentStrip;
      if (e2e) (window as unknown as { __springsEditorStrip?: StripResult }).__springsEditorStrip = currentStrip;
    }
  }

  function showTab(t: 'experiment' | 'params' | 'edit') {
    touch();
    tab = t;
    tabId = t;
  }
  // The editor loads the first time its tab is shown (once a strip exists).
  $effect(() => {
    if (tab === 'edit' && strip && !editor.attempted) void loadEditor();
  });
  async function openFullEditor() {
    touch();
    if (!strip || exportDisabled) return;
    const currentStrip = strip;
    const label = labelParams();
    fullEditorError = null;
    try {
      await openEditorWindow(() => fullEditorUrl(currentStrip, label), () => window.open('about:blank', '_blank'), (url) => window.location.assign(url));
    } catch (e) {
      fullEditorError = `${s.springsFullEditorError} ${e instanceof Error ? e.message : String(e)}`;
    }
  }
</script>
<ExperimentShell
  paperId="grossman-2026"
  name={s.springsTitle}
  lead={s.springsLead}
  verification={{
    reference: { kind: 'none', why: s.springsReferenceUnavailable },
    published: { kind: 'checks', passed: paperChecks.passed, total: paperChecks.total, href: '#checks' },
  }}
  {actions}
  sourcePath="research/metamaterials/grossman-2026"
  wide={tab === 'edit'}
>
  {#snippet article()}
      <h2>{s.springsPaperShows}</h2>
      <p> {s.springsOverview} <em>{s.springsNonaffine}</em> {s.springsOverviewRelaxation} <strong>{s.springsAuxetic}</strong> {s.springsOverviewAuxetic} </p>
      <p class="sp-try"> {s.springsTry} <ExperimentLink params={{ family: 'foam', eta: 0 }}>{s.springsPerfect}</ExperimentLink> ·
        <ExperimentLink params={{ family: 'foam', eta: 0.3 }}>η = 0.3</ExperimentLink> ·
        <ExperimentLink params={{ family: 'foam', eta: 0.5 }}>{s.springsTryAuxetic}</ExperimentLink>
      </p>

      <h2>{s.springsModel}</h2>
      <p> {s.springsSprings} <i>e</i> {s.springsJoin} <i>k<sub>e</sub></i>{s.springsRestLength}<sub>e</sub> {s.springsCurrentLength}<sub>e</sub>{s.springsEnergy} <span class="eq"><var>E</var> = ½ Σ<sub>e</sub> <var>k</var><sub>e</sub> (<var>ℓ</var><sub>e</sub> − <var>ℓ̄</var><sub>e</sub>)²</span> {s.springsModelViewer} </p>
      <ul>
        <li>
          <b>{s.springsStripTest}</b> {s.springsStripMethod} </li>
        <li>
          <b>{s.springsExactModuli}</b> {s.springsPeriodicMethod} </li>
        <li>
          <b>{s.springsPrestress}</b> {s.springsPrestressMethod} </li>
      </ul>

      <h2>{s.springsComparison}</h2>
      <h3>{s.springsFoamHeading}</h3>
      <p> {s.springsFoamComparison} </p>
      <PlotXY series={foamSeries} xLabel={s.springsDisorderAxis} yLabel={s.springsPoissonAxis} xDomain={[0, 0.5]} current={family === 'foam' && cell ? { x: eta, y: cell.isotropic.poisson, label: s.springsThisPeriodic } : null} ariaLabel={s.springsFoamPlot} />
      <p class="sp-note"> {s.springsStripBias} </p>

      <h3>{s.springsHoneyHeading}</h3>
      <p> {s.springsHoneyComparison} <ExperimentLink params={{ family: 'honeycomb', ell: 0.25 }}>{s.springsTryHoney}</ExperimentLink> ·
        <ExperimentLink params={{ family: 'honeycomb', ell: 0.9 }}>ℓ = 0.9</ExperimentLink>
      </p>
      <PlotXY series={honeySeries} xLabel="ℓ" yLabel={s.springsPoissonAxis} xDomain={[0, 1]} current={family === 'honeycomb' && cellAlong ? { x: ell, y: cellAlong[1], label: s.springsThisNetwork } : null} ariaLabel={s.springsHoneyPlot} />

      <h3>{s.springsOrderedHeading}</h3>
      <p> {s.springsOrderedComparison}<sub>e</sub> ∝ 1/ℓ̄<sub>e</sub>{s.springsOrderedConvention} <ExperimentLink params={{ family: 'ordered', phi: 1, psi: 0.5, theta: 0, law: 'hookean' }}>{s.springsTryOrdered}</ExperimentLink> ·
        <ExperimentLink params={{ family: 'ordered', phi: 2, psi: 0.5, theta: 0.7, law: 'equal_weight' }}>{s.springsTryEqualWeight}</ExperimentLink>
      </p>
      {#if family === 'ordered' && orderedSeries.length}
        <PlotXY series={orderedSeries} xLabel={s.springsOrientationAxis} yLabel={s.springsPoissonAxis} xDomain={[0, Math.PI]} current={cellAlong ? { x: theta, y: cellAlong[1], label: s.springsThisNetwork } : null} ariaLabel={s.springsOrderedPlot} />
      {:else}
        <p class="sp-note">{s.springsSelectOrdered}</p>
      {/if}
      <p> {s.springsUnreproduced} </p>

      <h3>{s.springsRigidityHeading}</h3>
      <p> {s.springsRigidity} <a href="https://doi.org/10.1103/PhysRevLett.75.4051" rel="noreferrer" target="_blank">{"PRL 75, 4051, 1995"}</a>).
        <ExperimentLink params={{ family: 'foam', eta: 0, keep: 0.62 }}>{s.springsTryDilute}</ExperimentLink> ·
        <ExperimentLink params={{ family: 'foam', eta: 0, keep: 0.62, prestress: 0.03 }}>{s.springsTryTension}</ExperimentLink>
      </p>
      <PlotXY series={dilSeries} xLabel={s.springsCoordinationAxis} yLabel={s.springsModulusAxis} xDomain={[2.4, 6]} rules={[{ x: 4, label: 'z = 4' }]} current={family === 'foam' && eta === 0 && cell ? { x: cell.coordination, y: cell.isotropic.shear, label: s.springsThisShear } : null} ariaLabel={s.springsModuliPlot} />

      <h3>{s.springsAllChecks}</h3>
      <div id="checks"></div>
      {#each evidence as group (group.category)}
      <table class="sp-checks">
        <caption>{group.total} {group.category === 'paper' ? s.springsPaperChecks : s.springsIndependentChecks} {s.springsChecksRun}</caption>
        <thead><tr><th scope="col">{s.springsCheck}</th><th scope="col">{s.springsObserved}</th><th scope="col">{s.springsTolerance}</th><th scope="col">{s.springsResult}</th></tr></thead>
        <tbody>
          {#each group.checks as c (c.name)}
            <tr><td>{c.name}<br /><span class="m">{c.metric}</span></td><td>{fmtSci(c.observed)}</td><td>{fmtSci(c.tolerance)}</td><td>{c.passed ? s.pass : s.fail}</td></tr>
          {/each}
        </tbody>
      </table>
      {/each}

      <h2>{s.springsLimitations}</h2>
      <ul>
        <li>{s.springsNoReference}</li>
        <li>{s.springsNotImplemented}</li>
        <li>{s.springsLinearOnly}</li>
        <li>{s.springsSynchronous}</li>
        <li>{s.springsFreeEdges}</li>
        <li>{s.springsEnsemble}</li>
        <li>{s.springsNotDesign}</li>
      </ul>

      <h2>{s.springsCodeReferences}</h2>
      <ul>
        <li>{s.springsImplementation} <a href={SOURCE} rel="noreferrer" target="_blank">{SOURCE.replace(`${REPO_URL}/tree/main/`, '')}</a> {"(AGPL-3.0)."}</li>
        <li>{s.springsArticleSupplement} <a href={DOI} rel="noreferrer" target="_blank">{"doi:10.1103/17sg-gzhl"}</a>{s.springsFiguresCredit}</li>
        <li>{s.springsFoamCredit} <a href="https://doi.org/10.1103/PhysRevMaterials.3.055607" rel="noreferrer" target="_blank">{"Phys. Rev. Materials 3, 055607 (2019)"}</a>{s.springsPaperReference}</li>
      </ul>
      {/snippet}

  {#snippet app()}
      <div class="sp-app" bind:this={pane}>
        <div class="sp-tabbar">
          <PaneTabs tabs={[{ id: 'experiment', label: s.springsNetwork }, { id: 'params', label: s.parameters }, { id: 'edit', label: s.editInStabileo }]} bind:active={tabId} />
          <button class="sp-full" type="button" onclick={openFullEditor} disabled={exportDisabled}>{s.springsOpenFull}</button>
        </div>
          {#if solved?.network.prestress}<p class="warnt">{s.springsExportDisabled}</p>{/if}
          {#if fullEditorError}<p class="warnt" role="alert">{fullEditorError} <button type="button" onclick={openFullEditor} disabled={exportDisabled}>{s.springsRetryFull}</button></p>{/if}
          <div class="sp-editor" role="tabpanel" id="rs-panel-edit" aria-labelledby="rs-tab-edit" hidden={tab !== 'edit'}>
            <p class="sp-source"> {s.springsEditorDescription} {#if strip && editor.attempted && strip !== editorStrip && !exportDisabled}<button class="link" type="button" onclick={loadEditor}>{s.springsLoadCurrent}</button>{/if}
            </p>
            {#if editor.error}<p class="warnt" role="alert">{editor.error} <button type="button" onclick={loadEditor} disabled={exportDisabled}>{s.springsRetryEditor}</button></p>{/if}
            <div class="sp-frame">
              {#if editor.loading}<div class="sp-frame-loading">{s.springsLoadingEditor}</div>{/if}
              {#if editor.src && !exportDisabled}
                {#key editor.src}{@const loadedSrc = editor.src}
                <iframe src={loadedSrc} title={s.springsEditorTitle} onload={() => editor.loaded(loadedSrc)}></iframe>
                {/key}
              {/if}
            </div>
          </div>
        <div role="tabpanel" id="rs-panel-experiment" aria-labelledby="rs-tab-experiment" hidden={tab !== 'experiment'}>
        <p class="sp-source" aria-live="polite">
          {#if loadError}
            <span class="warnt">{s.springsBundleMissing}{loadError}{s.springsBuildBundle}</span>
          {:else if !glue} {s.springsLoadingSolver} {:else if autoplaying} {s.springsLiveSweep} <button class="sp-pause" type="button" onclick={touch}>{s.springsPauseSweep}</button>
          {:else}
            {s.liveSource} · {nf(solveMs, 0)} ms
          {/if}
        </p>
        <div class="sp-viewer" data-nodes={strip?.nodes.length ?? 0}>
          {#if strip}
                          <StabileoViewer
                oninteract={touch}
                xy={xy}
                cells={bars}
                cellSize={2}
                lineWidth={2}
                values={forces}
                colourMap="diverging"
                perCell={true}
                range={forceRange}
                title={Math.abs(solved?.label.strain ?? 0) > 0 ? s.springsAxialNormalized : s.springsAxial}
                unit=""
                legendFooter={forceLegend(solved?.label.strain ?? 0)}
                view={VIEW}
                displacement={disp}
                deformScale={deform}
                showMesh={false}
                height="clamp(16rem, 46dvh, 26rem)"
                ariaLabel={s.springsViewerLabel}
                status={[{ label: s.springsNodes, value: String(strip.nodes.length) }, { label: s.springsBars, value: String(strip.bonds.length) }]}
                editorButton={false}
              />
            
          {:else}
            <div class="sp-placeholder">{s.springsPlaceholder}</div>
          {/if}
        </div>
        {#if solveError}<p class="warnt">{s.springsSolverRefused} {solveError}</p>{/if}
        <dl class="sp-readout">
          <div><dt>{s.springsStripReadout}</dt><dd>{strip?.poisson === null ? s.springsIndeterminate : nf(strip?.poisson)}</dd></div>
          <div><dt>{s.springsPeriodicReadout}</dt><dd>{nf(cellAlong?.[1])}</dd></div>
          <div><dt>{s.springsAffineReadout}</dt><dd>{nf(cell?.isotropic.bulk)} · {nf(cell?.isotropic.shear)} <span class="m">({nf(cell?.isotropic_affine.bulk)} · {nf(cell?.isotropic_affine.shear)})</span></dd></div>
          <div><dt>{s.springsCoordinationReadout}</dt><dd>{nf(cell?.coordination, 2)} · {nf(cell?.nonaffinity_shear, 4)}</dd></div>
        </dl>
        </div>
        <div role="tabpanel" id="rs-panel-params" aria-labelledby="rs-tab-params" hidden={tab !== 'params'}>
        <form class="sp-controls" oninput={touch} onsubmit={(e) => e.preventDefault()}>
          <label>{s.springsNetwork} <select bind:value={family} aria-label={s.springsNetwork}>
              <option value="foam">{s.springsFoamOption}</option>
              <option value="ordered">{s.springsOrderedOption}</option>
              <option value="honeycomb">{s.springsHoneyOption}</option>
              <option value="square">{s.springsSquareOption}</option>
            </select>
          </label>
          {#if family === 'foam'}
            <label>{s.springsDisorder} <input type="range" min="0" max="0.5" step="0.01" bind:value={eta} aria-label={s.springsDisorderLabel} /><span class="v">{nf(eta, 2)}</span></label>
          {:else if family === 'ordered'}
            <label>{s.springsShear} <input type="range" min="0.5" max="3" step="0.05" bind:value={phi} aria-label={s.springsPhi} /><span class="v">{nf(phi, 2)}</span></label>
            <label>{s.springsElongation} <input type="range" min="0.4" max="2" step="0.05" bind:value={psi} aria-label={s.springsPsi} /><span class="v">{nf(psi, 2)}</span></label>
            <label>{s.springsOrientation} <input type="range" min="0" max="3.14" step="0.02" bind:value={theta} aria-label={s.springsTheta} /><span class="v">{nf(theta, 2)}</span></label>
            <label>{s.springsSprings} <select bind:value={law} aria-label={s.springsLaw}><option value="hookean">{s.springsEqualK}</option><option value="equal_weight">{s.springsEqualWeight}</option></select>
            </label>
          {:else if family === 'honeycomb'}
            <label>{s.springsCornerDistance} <input type="range" min="0.05" max="0.95" step="0.01" bind:value={ell} aria-label={s.springsEll} /><span class="v">{nf(ell, 2)}</span></label>
          {:else}
            <label class="chk"><input type="checkbox" bind:checked={diagonals} /> {s.springsDiagonals}</label>
          {/if}
          <label>{s.springsBondsKept} <input type="range" min="0.4" max="1" step="0.01" bind:value={keep} aria-label={s.springsBondsFraction} /><span class="v">{nf(keep, 2)}</span></label>
          <label>{s.springsPrestressControl} <input type="range" min="0" max="0.1" step="0.005" bind:value={prestress} aria-label={s.springsPrestressLabel} /><span class="v">{nf(prestress * 100, 1)} %</span></label>
          <label>{s.springsStrain} <input type="range" min="-0.05" max="0.05" step="0.005" bind:value={strain} aria-label={s.springsStrain} /><span class="v">{nf(strain * 100, 1)} %</span></label>
          <label>{s.springsDeformation} <input type="range" min="0" max="60" step="1" bind:value={deform} aria-label={s.springsDeformationScale} /><span class="v">{deform}</span></label>
          <label>{s.springsSeed} <input class="seed" type="number" min="0" max="999" step="1" bind:value={seed} aria-label={s.springsSeedLabel} /></label>
        </form>
          <p class="sp-note">{s.springsResolveNote}{nf(solveMs, 0)} {s.springsResolveTime}</p>
        </div>
      </div>
      {/snippet}
</ExperimentShell>

<style>
  .eq {
    white-space: nowrap;
  }
  .eq var {
    font-style: italic;
  }
  button.link {
    background: none;
    border: none;
    padding: 0;
    color: var(--rs-link, #ff7a55);
    text-decoration: underline dotted;
    text-underline-offset: 3px;
    cursor: pointer;
    font: inherit;
  }
  .sp-try {
    font-size: 0.95rem;
  }
  .sp-note {
    font-size: 0.9375rem;
    color: var(--fg-2);
  }
  .warnt {
    color: #e0b341;
  }
  .m {
    color: var(--fg-2);
    font-size: 0.8rem;
  }
  .sp-checks {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }
  .sp-checks td,
  .sp-checks th {
    border-bottom: 1px solid var(--hair);
    padding: 0.35rem 0.4rem;
    text-align: left;
    vertical-align: top;
  }
  .sp-checks td:nth-child(2),
  .sp-checks td:nth-child(3) {
    font-family: var(--lp-mono);
    white-space: nowrap;
  }
  .sp-source {
    font: 12px var(--lp-mono);
    color: var(--fg-2);
    margin: 0 0 0.5rem;
  }
  .sp-viewer {
    min-height: 12rem;
  }
  .sp-placeholder {
    border: 1px dashed var(--hair);
    border-radius: 3px;
    padding: 4rem 1rem;
    text-align: center;
    color: var(--fg-2);
  }
  .sp-readout {
    min-height: 5.5rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem 1rem;
    margin: 0.75rem 0;
    font-size: 0.85rem;
  }
  .sp-readout dt {
    color: var(--fg-2);
    font-size: 0.75rem;
  }
  .sp-readout dd {
    margin: 0;
    font-family: var(--lp-mono);
    color: var(--fg);
  }
  .sp-controls label {
    display: grid;
    grid-template-columns: 9rem 1fr 3.5rem;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--fg);
    margin: 0.3rem 0;
  }
  .sp-controls label.chk {
    display: flex;
  }
  .sp-controls select,
  .sp-controls input[type='number'] {
    grid-column: 2 / 4;
    background: var(--card);
    color: var(--fg);
    border: 1px solid var(--hair);
    border-radius: 3px;
    padding: 0.25rem 0.4rem;
    font: 13px var(--lp-mono);
    min-width: 0;
  }
  .sp-controls input[type='range'] {
    accent-color: var(--lp-accent, #e5482a);
    height: 24px;
    min-width: 0;
  }
  .sp-controls input.seed {
    grid-column: 2 / 3;
    width: 6rem;
  }
  .sp-pause {
    margin-left: 0.5rem;
    background: none;
    border: 1px solid var(--fg-2);
    border-radius: 3px;
    color: var(--fg);
    padding: 0.15rem 0.5rem;
    font: 12px var(--lp-sans, sans-serif);
    cursor: pointer;
    min-height: 24px;
  }
  .sp-tabbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-bottom: 1px solid var(--hair);
    margin-bottom: 0.6rem;
  }
  .sp-checks caption {
    text-align: left;
    color: var(--fg-2);
    padding-bottom: 0.4rem;
  }
  .sp-controls .v {
    font: 12px var(--lp-mono);
    color: var(--fg-2);
    text-align: right;
  }
  .sp-full {
    margin-left: auto;
    background: none;
    border: 1px solid var(--hair);
    border-radius: 3px;
    color: var(--fg);
    padding: 0.3rem 0.6rem;
    font-size: 0.82rem;
    cursor: pointer;
  }
  .sp-full:hover {
    border-color: var(--fg-2);
  }
  .sp-frame {
    position: relative;
    height: min(46rem, 80vh);
    border: 1px solid var(--hair);
    border-radius: 3px;
    overflow: hidden;
  }
  .sp-frame iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }
  .sp-frame-loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--fg-2);
    font: 13px var(--lp-mono);
  }
</style>
