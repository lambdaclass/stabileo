<script lang="ts">
  /**
   * Preparing a DXF as templates (`store/underlays.ts`): its unit and layers, and the regions of
   * the drawing that may be separate plans (`model/underlay-regions.ts`), each with the level it
   * goes to and the point of the drawing it is laid by. The preview shows the whole drawing and
   * the regions; a click in a region takes the drawing point nearest to it as that region's point.
   * Nothing is laid until the reader confirms.
   */
  import { untrack } from 'svelte';
  import { t, tp } from '../../../lib/i18n';
  import { parseCadDxf, unsupportedFileKind, suggestUnitFromExtent, cadImportProblem } from '../../../lib/cad/parse';
  import type { CadDocument, CadUnit } from '../../../lib/cad/types';
  import { CAD_UNIT_SCALE } from '../../../lib/cad/types';
  import { cadSegments } from '../../../lib/model/underlay';
  import { drawingRegions, type DrawingRegion } from '../../../lib/model/underlay-regions';
  import { addUnderlays, underlayFromDrawing } from '../../../lib/store/underlays';
  import type { Level } from '../../../lib/model/grid';

  let { levels, onlaid }: { levels: Level[]; onlaid: (note: string) => void } = $props();

  let doc = $state<CadDocument | null>(null);
  let fileName = $state('');
  let error = $state<string | null>(null);
  let unit = $state<CadUnit>('m');
  let chosen = $state<string[]>([]);
  type Row = { region: DrawingRegion; use: boolean; name: string; levelId: string; ref: { x: number; y: number }; target: { x: number; y: number } };
  let rows = $state<Row[]>([]);
  let active = $state(0);

  async function read(f: File) {
    error = null; doc = null; fileName = f.name.replace(/\.dxf$/i, '') || 'DXF';
    const kind = unsupportedFileKind(f.name);
    if (kind) { error = t(`cad.unsupported.${kind}`); return; }
    const d = parseCadDxf(await f.text(), f.name);
    const problem = cadImportProblem(d);
    if (problem) { error = t(problem === 'emptyFile' ? 'cad.emptyFile' : 'cad.parseError'); return; }
    doc = d;
    unit = d.suggestedUnit ?? 'm';
    const sug = suggestUnitFromExtent(d.bbox, unit);
    if (sug) unit = sug.suggested;
    chosen = d.layers.filter((l) => !l.hidden && l.total > 0).map((l) => l.name);
  }

  // The regions, again whenever the unit or the layers change; what was set on a region is kept
  // while its box stays where it was.
  $effect(() => {
    if (!doc) { rows = []; return; }
    const regs = drawingRegions(doc, unit, { layers: new Set(chosen) });
    const old = untrack(() => rows);
    rows = regs.map((r, k) => {
      const same = old.find((o) => Math.abs(o.region.box.minX - r.box.minX) < 1e-6 && Math.abs(o.region.box.minY - r.box.minY) < 1e-6);
      return same ? { ...same, region: r } : {
        region: r, use: k === 0 || r.count >= Math.max(5, (regs[0]?.count ?? 0) * 0.2),
        name: '',
        // One plan keeps the drawing's own coordinates; several are laid by their lower-left corners.
        levelId: levels[Math.min(k, levels.length - 1)]?.id ?? '', ref: regs.length > 1 ? { ...r.ref } : { x: 0, y: 0 }, target: { x: 0, y: 0 },
      };
    });
    active = 0;
  });

  function lay() {
    if (!doc) return;
    const used = rows.filter((r) => r.use);
    const made = used.map((r) => {
      const lv = levels.find((l) => l.id === r.levelId);
      // Unnamed: the file's name, numbered by region when more than one is laid.
      const name = r.name.trim() || (used.length > 1 ? `${fileName} · ${rows.indexOf(r) + 1}` : fileName);
      return underlayFromDrawing(doc!, { name, unit, layers: chosen, region: rows.length > 1 ? r.region : null, ref: r.ref, target: r.target, z: lv?.z ?? 0, ...(lv ? { levelId: lv.id } : {}), source: fileName });
    }).filter((x): x is NonNullable<typeof x> => !!x);
    if (!made.length) { error = t('underlay.empty'); return; }
    addUnderlays(made.map((m) => m.underlay));
    const segs = made.reduce((s, m) => s + m.underlay.segments.length / 4, 0);
    onlaid(made.some((m) => m.truncated) ? t('underlay.truncated') : tp('underlay.laidMany', { n: made.length, segs }));
    doc = null;
  }

  // ── Preview ──
  const W = 320, H = 200, PAD = 6;
  const preview = $derived.by(() => {
    if (!doc) return null;
    const { segments } = cadSegments(doc, unit, new Set(chosen));
    if (segments.length < 4) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < segments.length; i += 2) { minX = Math.min(minX, segments[i]!); maxX = Math.max(maxX, segments[i]!); minY = Math.min(minY, segments[i + 1]!); maxY = Math.max(maxY, segments[i + 1]!); }
    const k = Math.min((W - 2 * PAD) / Math.max(maxX - minX, 1e-9), (H - 2 * PAD) / Math.max(maxY - minY, 1e-9));
    const sx = (x: number) => PAD + (x - minX) * k, sy = (y: number) => H - PAD - (y - minY) * k;
    // At most 20 000 segments drawn: the preview shows the layout, not every hatch line.
    const step = Math.max(1, Math.ceil(segments.length / 4 / 20000));
    let d = '';
    for (let s = 0; s * 4 + 3 < segments.length; s += step) d += `M${sx(segments[s * 4]!).toFixed(1)},${sy(segments[s * 4 + 1]!).toFixed(1)}L${sx(segments[s * 4 + 2]!).toFixed(1)},${sy(segments[s * 4 + 3]!).toFixed(1)}`;
    return { d, sx, sy, k, minX, minY, segments };
  });

  /** A click in the preview: the drawing point nearest to it becomes the active region's point. */
  function pick(e: MouseEvent) {
    if (!preview || !rows[active]) return;
    const svg = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = ((e.clientX - svg.left) / svg.width) * W, py = ((e.clientY - svg.top) / svg.height) * H;
    const x = preview.minX + (px - PAD) / preview.k, y = preview.minY + (H - PAD - py) / preview.k;
    let best: { x: number; y: number } | null = null, bd = Infinity;
    const s = preview.segments;
    for (let i = 0; i + 1 < s.length; i += 2) { const d = Math.hypot(s[i]! - x, s[i + 1]! - y); if (d < bd) { bd = d; best = { x: s[i]!, y: s[i + 1]! }; } }
    if (best && bd * preview.k < 12) rows[active] = { ...rows[active]!, ref: best };
  }
  const fmt = (v: number) => v.toFixed(2);
</script>

<label class="pk-btn ul-file">
  {t('underlay.load')}
  <input type="file" accept=".dxf,.dwg" onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void read(f); e.currentTarget.value = ''; }} data-testid="underlay-file" />
</label>
{#if error}<p class="pk-hint ul-warn" role="alert">{error}</p>{/if}

{#if doc}
  <div class="ul-setup" data-testid="underlay-setup">
    <div class="pk-row">
      <label class="ul-inline">{t('underlay.unit')}
        <select bind:value={unit} data-testid="underlay-unit"><option value="m">m</option><option value="cm">cm</option><option value="mm">mm</option></select>
      </label>
      <span class="pk-hint">{tp('underlay.unitScale', { k: CAD_UNIT_SCALE[unit] })}</span>
    </div>
    <div class="ul-layers" role="group" aria-label={t('underlay.layers')}>
      {#each doc.layers.filter((l) => l.total > 0) as l (l.name)}
        <label class:off={!!l.hidden}>
          <input type="checkbox" checked={chosen.includes(l.name)} onchange={() => (chosen = chosen.includes(l.name) ? chosen.filter((x) => x !== l.name) : [...chosen, l.name])} />
          {l.name} <span class="ul-n">({l.total})</span>
        </label>
      {/each}
    </div>

    {#if preview}
      <svg class="ul-preview" viewBox="0 0 {W} {H}" onclick={pick} role="img" aria-label={t('underlay.previewLabel')} data-testid="underlay-preview">
        <path d={preview.d} />
        {#each rows as r, k (k)}
          {@const x0 = preview.sx(r.region.box.minX)}
          <rect class:on={k === active} class:off={!r.use} x={preview.sx(r.region.box.minX)} y={preview.sy(r.region.box.maxY)}
            width={(r.region.box.maxX - r.region.box.minX) * preview.k} height={(r.region.box.maxY - r.region.box.minY) * preview.k} />
          <text x={x0 + 3} y={preview.sy(r.region.box.maxY) + 10}>{k + 1}</text>
          <circle class="ref" cx={preview.sx(r.ref.x)} cy={preview.sy(r.ref.y)} r="3" />
        {/each}
      </svg>
      <p class="pk-hint">{rows.length > 1 ? t('underlay.regionsHint') : t('underlay.refHint')}</p>
    {/if}

    <table class="ul-regions" data-testid="underlay-regions">
      <thead><tr><th></th><th>#</th><th>{t('underlay.name')}</th><th>{t('underlay.level')}</th><th>{t('underlay.refPoint')}</th><th>{t('underlay.targetPoint')}</th></tr></thead>
      <tbody>
        {#each rows as r, k (k)}
          <tr class:on={k === active} onclick={() => (active = k)}>
            <td><input type="checkbox" bind:checked={rows[k]!.use} aria-label={t('underlay.useRegion')} data-testid="underlay-region-use-{k}" /></td>
            <td title={tp('underlay.regionSize', { w: fmt(r.region.box.maxX - r.region.box.minX), h: fmt(r.region.box.maxY - r.region.box.minY), n: r.region.count })}>{k + 1}</td>
            <td><input class="ul-name" bind:value={rows[k]!.name} placeholder={rows.filter((x) => x.use).length > 1 ? `${fileName} · ${k + 1}` : fileName} /></td>
            <td>
              <select bind:value={rows[k]!.levelId} data-testid={k === 0 ? 'underlay-level' : `underlay-level-${k}`}>
                {#if levels.length === 0}<option value="">z = 0</option>{/if}
                {#each levels as l (l.id)}<option value={l.id} label={l.name}>{l.name}</option>{/each}
              </select>
            </td>
            <td class="ul-mono">({fmt(r.ref.x)}; {fmt(r.ref.y)})</td>
            <td>
              <input class="ul-num" type="number" step="0.01" value={r.target.x} onchange={(e) => (rows[k] = { ...rows[k]!, target: { ...rows[k]!.target, x: Number(e.currentTarget.value) || 0 } })} aria-label="x" />
              <input class="ul-num" type="number" step="0.01" value={r.target.y} onchange={(e) => (rows[k] = { ...rows[k]!, target: { ...rows[k]!.target, y: Number(e.currentTarget.value) || 0 } })} aria-label="y" />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <button class="pk-btn pk-btn-primary" disabled={chosen.length === 0 || !rows.some((r) => r.use)} onclick={lay} data-testid="underlay-lay">
      {rows.filter((r) => r.use).length > 1 ? tp('underlay.layMany', { n: rows.filter((r) => r.use).length }) : t('underlay.lay')}
    </button>
  </div>
{/if}

<style>
  .ul-file { position: relative; display: inline-flex; cursor: pointer; }
  .ul-file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .ul-warn { color: var(--st-warn); }
  .ul-setup { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
  .ul-inline { display: flex; align-items: center; gap: 4px; font-size: 0.66rem; color: var(--st-text-2); }
  .ul-layers { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 0.66rem; max-height: 9rem; overflow: auto; }
  .ul-layers .off { opacity: 0.6; }
  .ul-n { color: var(--st-text-3); }
  .ul-preview { width: 100%; max-width: 320px; background: var(--st-ink); border: 1px solid var(--st-hair); border-radius: var(--st-radius); cursor: crosshair; }
  .ul-preview path { fill: none; stroke: #9a8f7a; stroke-width: 0.5; }
  .ul-preview rect { fill: none; stroke: var(--st-text-3); stroke-dasharray: 3 2; }
  .ul-preview rect.on { stroke: var(--st-accent); stroke-dasharray: none; }
  .ul-preview rect.off { opacity: 0.35; }
  .ul-preview text { fill: var(--st-text-2); font-size: 9px; }
  .ul-preview .ref { fill: var(--st-accent); }
  .ul-regions { width: 100%; border-collapse: collapse; font-size: 0.64rem; }
  .ul-regions th { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 1px 3px; }
  .ul-regions td { padding: 1px 3px; }
  .ul-regions tr.on td { background: var(--st-surface-3); }
  .ul-name { width: 6.5rem; font-size: 0.64rem; }
  .ul-num { width: 3.2rem; font-size: 0.64rem; }
  .ul-mono { font-family: var(--st-font-mono, monospace); white-space: nowrap; }
</style>
