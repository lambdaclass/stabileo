<script lang="ts">
  import ScalarFieldViewer from '../viewport/ScalarFieldViewer.svelte';
  import PaneTabs from '../research/shell/PaneTabs.svelte';
  import LineChart from '../research/shauer2025/LineChart.svelte';
  import ToolPreview from './ToolPreview.svelte';
  import { tPublic as t, publicI18n } from '../../lib/i18n/store.svelte';
  import type { Parameters, ToolId } from './calculators';
  import type { calculate } from './solve';
  let { id, p, result }: { id: ToolId; p: Parameters; result: Awaited<ReturnType<typeof calculate>> | null } = $props();
  let active = $state('deflection');
  const metric = $derived(active as 'deflection' | 'shear' | 'moment');
  const column = $derived(id === 'column-buckling');
  const number = (n: number) => new Intl.NumberFormat(publicI18n.locale, { maximumSignificantDigits: 5 }).format(n);
  const unit = $derived(metric === 'moment' ? 'kN·m' : metric === 'shear' ? 'kN' : 'm');
  // Diagram samples come from the same computeElementDiagram / computeDeformedShape
  // functions as the editor. The column uses the solver's first eigenvector, never unit-load deflection.
  const mode = $derived.by((): [number, number][] => {
    if (!result?.buckling) return [];
    return (result.buckling.modes[0].displacements as { nodeId: number; uz: number }[]).map(d => [result.model.nodes.get(d.nodeId)!.x, d.uz]);
  });
  const mesh = $derived.by(() => {
    const xy: number[] = [], cells: number[] = [], values: number[] = [];
    let category = 0;
    const L = p.length, h = L * .035;
    function line(a: number, b: number, c: number, d: number) {
      const n = xy.length / 2; xy.push(a, b, c, d); cells.push(n, n + 1); values.push(category);
    }
    line(0, 0, L, 0);
    if (!result) return { xy, cells, values };
    for (const support of result.model.supports.values()) {
      const x = result.model.nodes.get(support.nodeId)!.x;
      if (support.type === 'fixed' || String(support.type) === 'guidedX') {
        line(x, -h, x, h);
        for (const z of [-h, 0, h]) line(x, z, x - h * .6, z - h * .6);
      } else {
        line(x, 0, x - h, -h); line(x - h, -h, x + h, -h); line(x + h, -h, x, 0);
        if (support.type === 'rollerX') line(x - h, -1.3 * h, x + h, -1.3 * h);
      }
    }
    function arrow(x: number, y: number, dx: number, dy: number) {
      line(x, y, x + dx, y + dy);
      line(x + dx, y + dy, x + dx - dx * .2 + dy * .15, y + dy - dy * .2 - dx * .15);
      line(x + dx, y + dy, x + dx - dx * .2 - dy * .15, y + dy - dy * .2 + dx * .15);
    }
    if (column) arrow(L + h * 4, 0, -h * 3, 0);
    else if (p.load > 0) for (const x of p.uniform ? Array.from({ length: 9 }, (_, i) => L * i / 8) : [p.position]) arrow(x, h * 4, 0, -h * 3.5);
    category = 1;
    const shape = column ? mode : result.charts.deflection;
    const scale = L * .12 / Math.max(...shape.map(v => Math.abs(v[1])), 1e-20);
    for (let j = 1; j < shape.length; j++) line(shape[j - 1][0], shape[j - 1][1] * scale, shape[j][0], shape[j][1] * scale);
    return { xy, cells, values };
  });
</script>

<div class="viewer-heading"><span>{t(column ? 'tools.mode' : 'tools.structure')}</span><span>L = {number(p.length)} m</span></div>
{#if result}
  <ScalarFieldViewer xy={mesh.xy} cells={mesh.cells} cellSize={2} lineWidth={3} values={mesh.values} perCell={true} colourMap="diverging" geometryOnly={true} range={{ min: -1, max: 1 }} title={t(column ? 'tools.mode' : 'tools.structure')} view={[-p.length * .12, -p.length * .25, p.length * 1.2, p.length * .25]} height="clamp(15rem, 32vh, 24rem)" editorButton={false} />
  <p class="note">{t(column ? 'tools.modeNote' : 'tools.deformedNote')} · {column ? `KL = ${number(p.k * p.length)} m` : `${t('tools.load')}: ${number(p.load)} ${p.uniform ? 'kN/m' : 'kN'}`}</p>
  {#if !column}
    <PaneTabs tabs={['deflection', 'shear', 'moment'].map(id => ({ id, label: t(`tools.${id}`) }))} bind:active />
    {#each ['deflection', 'shear', 'moment'] as tab}
      {#if active === tab}
        <div role="tabpanel" id={`rs-panel-${tab}`} aria-labelledby={`rs-tab-${tab}`} tabindex="0" class="chart">
          <p>|max| = {number(Math.abs(result.maxima[metric][1]))} {unit} · {t('tools.at')} x = {number(result.maxima[metric][0])} m</p>
          <LineChart series={[{ name: t(`tools.${metric}`), color: 'var(--lp-accent)', points: result.charts[metric] }]} xLabel="x (m)" yLabel={`${t(`tools.${metric}`)} (${unit})`} height={220} marker={result.maxima[metric][0]} markerLabel={number(Math.abs(result.maxima[metric][1]))} />
        </div>
      {/if}
    {/each}
  {/if}
{:else}
  <ToolPreview {id} />
{/if}
<style>
  .viewer-heading { display: flex; justify-content: space-between; gap: 1rem; padding: 1rem; font: .875rem var(--lp-mono); color: var(--fg); border-bottom: 1px solid var(--hair); }
  .note { padding: .75rem 1rem; color: var(--fg-2); font-size: .8125rem; line-height: 1.5; }
  .chart { padding: .75rem; }
  .chart p { font: .8125rem var(--lp-mono); color: var(--fg-2); }
  :global(.tools .sfv-wrap button) { min-height: 44px; min-width: 44px; font-size: 12px; }
  :global(.tools .sfv-mark), :global(.tools .sfv-status) { font-size: 12px; }
  :global(.tools .rs-tabs) { flex-wrap: wrap; }
</style>
