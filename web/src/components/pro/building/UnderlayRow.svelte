<script lang="ts">
  /**
   * One template (`store/underlays.ts`): seen or not, its level, lock and strength, and, open,
   * what it is (file, unit, region, the point it was laid by), its placement, its alignment by two
   * pairs of points, its layers (drawn, captured by the snaps), a new file in its place, and the
   * way to convert part of it. Nothing here moves the structure modelled on it.
   */
  import { t, tp } from '../../../lib/i18n';
  import { alignByPoints, editUnderlay, removeUnderlay, replaceUnderlayDrawing } from '../../../lib/store/underlays';
  import { parseCadDxf, cadImportProblem } from '../../../lib/cad/parse';
  import type { Underlay } from '../../../lib/model/underlay';
  import type { Level } from '../../../lib/model/grid';
  import UnderlayConvertDialog from './UnderlayConvertDialog.svelte';

  let { u, levels }: { u: Underlay; levels: Level[] } = $props();
  let open = $state(false);
  let convertOpen = $state(false);
  let message = $state<string | null>(null);
  let pairs = $state([{ fx: '', fy: '', tx: '', ty: '' }, { fx: '', fy: '', tx: '', ty: '' }]);

  const edit = (patch: Partial<Underlay>) => { if (!editUnderlay(u.id, patch)) message = t('underlay.lockedRefused'); };
  const atLevel = (id: string) => { const lv = levels.find((l) => l.id === id); if (lv) edit({ levelId: lv.id, z: lv.z }); };
  const num = (s: string) => Number(s.trim().replace(',', '.'));
  function align() {
    // The pairs filled in, in drawing metres → model metres.
    const used = pairs.filter((p) => [p.fx, p.fy, p.tx, p.ty].every((v) => v.trim() !== '' && Number.isFinite(num(v))))
      .map((p) => ({ from: { x: num(p.fx), y: num(p.fy) }, to: { x: num(p.tx), y: num(p.ty) } }));
    if (!used.length) return;
    const r = alignByPoints(u, used);
    edit({ dx: r.dx, dy: r.dy, rotationDeg: r.rotationDeg });
    message = r.scaleMismatch !== null && Math.abs(r.scaleMismatch) > 0.002
      ? tp('underlay.scaleMismatch', { pct: (r.scaleMismatch * 100).toFixed(1) })
      : t('underlay.aligned');
  }
  async function replace(f: File) {
    const d = parseCadDxf(await f.text(), f.name);
    if (cadImportProblem(d)) { message = t('cad.parseError'); return; }
    const layers = d.layers.filter((l) => !l.hidden && l.total > 0).map((l) => l.name);
    message = replaceUnderlayDrawing(u.id, d, { unit: u.unit ?? 'm', layers, source: f.name }) ? t('underlay.replaced') : t('underlay.lockedRefused');
  }
  const toggle = (list: string[] | undefined, name: string) => ((list ?? []).includes(name) ? (list ?? []).filter((x) => x !== name) : [...(list ?? []), name]);
  const f2 = (v: number) => v.toFixed(2);
</script>

<tr data-testid="underlay-row-{u.name}">
  <td><input type="checkbox" checked={u.visible} onchange={() => edit({ visible: !u.visible })} aria-label={t('underlay.visible')} /></td>
  <td><button class="ul-link" onclick={() => (open = !open)} aria-expanded={open} data-testid="underlay-open-{u.name}">{open ? '▾' : '▸'} {u.name}</button></td>
  <td>
    <select value={u.levelId ?? ''} disabled={u.locked} onchange={(e) => atLevel(e.currentTarget.value)}>
      {#if !u.levelId}<option value="">z = {u.z}</option>{/if}
      {#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
    </select>
  </td>
  <td><button class="pk-btn" class:on={u.locked} aria-pressed={!!u.locked} title={t(u.locked ? 'underlay.unlock' : 'underlay.lock')} onclick={() => edit({ locked: !u.locked })} data-testid="underlay-lock-{u.name}">{u.locked ? '🔒' : '🔓'}</button></td>
  <td><input class="ul-range" type="range" min="0.1" max="1" step="0.05" value={u.opacity ?? 0.9} oninput={(e) => edit({ opacity: Number(e.currentTarget.value) })} aria-label={t('underlay.opacity')} /></td>
  <td class="ul-act"><button class="pk-btn" title={t('grid.remove')} onclick={() => removeUnderlay(u.id)} data-testid="underlay-remove-{u.name}">×</button></td>
</tr>
{#if open}
  <tr class="ul-detail"><td colspan="6">
    <p class="pk-hint" data-testid="underlay-summary-{u.name}">{tp('underlay.summary', {
      file: u.source ?? u.name, unit: u.unit ?? 'm',
      region: u.region ? `x ${f2(u.region.minX)}–${f2(u.region.maxX)}, y ${f2(u.region.minY)}–${f2(u.region.maxY)} m` : t('underlay.wholeDrawing'),
      ref: u.ref ? `(${f2(u.ref.x)}; ${f2(u.ref.y)})` : '(0; 0)', dx: f2(u.dx), dy: f2(u.dy), rot: u.rotationDeg.toFixed(1),
    })}</p>
    {#if u.leftOut}<p class="pk-hint">{tp('underlay.leftOut', { list: Object.entries(u.leftOut).map(([k, n]) => `${k} ${n}`).join(', ') })}</p>{/if}
    <div class="pk-row">
      <label class="ul-inline">dx <input class="ul-num" type="number" step="0.01" value={u.dx} disabled={u.locked} onchange={(e) => edit({ dx: Number(e.currentTarget.value) || 0 })} /></label>
      <label class="ul-inline">dy <input class="ul-num" type="number" step="0.01" value={u.dy} disabled={u.locked} onchange={(e) => edit({ dy: Number(e.currentTarget.value) || 0 })} /></label>
      <label class="ul-inline">° <input class="ul-num" type="number" step="1" value={u.rotationDeg} disabled={u.locked} onchange={(e) => edit({ rotationDeg: Number(e.currentTarget.value) || 0 })} /></label>
    </div>
    <details class="ul-align">
      <summary>{t('underlay.alignTitle')}</summary>
      <p class="pk-hint">{t('underlay.alignHint')}</p>
      {#each pairs as _p, k (k)}
        <div class="pk-row ul-pair">
          <span>{k + 1}.</span>
          <input class="ul-num" placeholder="x" bind:value={pairs[k]!.fx} aria-label={t('underlay.drawingX')} />
          <input class="ul-num" placeholder="y" bind:value={pairs[k]!.fy} aria-label={t('underlay.drawingY')} />
          <span>→</span>
          <input class="ul-num" placeholder="X" bind:value={pairs[k]!.tx} aria-label={t('underlay.modelX')} />
          <input class="ul-num" placeholder="Y" bind:value={pairs[k]!.ty} aria-label={t('underlay.modelY')} />
        </div>
      {/each}
      <button class="pk-btn" disabled={u.locked} onclick={align} data-testid="underlay-align-{u.name}">{t('underlay.align')}</button>
    </details>
    {#if u.layers?.length}
      <table class="ul-layer-table" data-testid="underlay-layers-{u.name}">
        <thead><tr><th>{t('underlay.layer')}</th><th>{t('underlay.drawn')}</th><th>{t('underlay.snaps')}</th></tr></thead>
        <tbody>
          {#each u.layers as l (l)}
            {@const shown = !(u.hiddenLayers ?? []).includes(l)}
            <tr>
              <td>{l}</td>
              <td><input type="checkbox" checked={shown} onchange={() => edit({ hiddenLayers: toggle(u.hiddenLayers, l) })} /></td>
              <td><input type="checkbox" disabled={!shown} checked={shown && !(u.noSnapLayers ?? []).includes(l)} onchange={() => edit({ noSnapLayers: toggle(u.noSnapLayers, l) })} /></td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="pk-hint">{t('underlay.snapRule')}</p>
    {/if}
    <div class="pk-row">
      <label class="pk-btn ul-file" class:disabled={u.locked}>
        {t('underlay.replace')}
        <input type="file" accept=".dxf" disabled={u.locked} onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void replace(f); e.currentTarget.value = ''; }} />
      </label>
      <button class="pk-btn" disabled={!u.shapes?.length} onclick={() => (convertOpen = true)} data-testid="underlay-convert-{u.name}">{t('underlay.convert')}…</button>
    </div>
    {#if message}<p class="pk-hint" role="status">{message}</p>{/if}
  </td></tr>
  {#if convertOpen}<UnderlayConvertDialog {u} {levels} onclose={() => (convertOpen = false)} />{/if}
{/if}

<style>
  .ul-link { background: none; border: none; color: var(--st-text); font: inherit; cursor: pointer; padding: 0; text-align: left; }
  .ul-detail td { padding: 4px 6px 8px; background: var(--st-surface-2); }
  .ul-inline { display: inline-flex; align-items: center; gap: 4px; font-size: 0.66rem; }
  .ul-num { width: 3.6rem; font-size: 0.66rem; }
  .ul-range { width: 4rem; }
  .ul-act { white-space: nowrap; }
  .ul-align summary { cursor: pointer; font-size: 0.68rem; color: var(--st-text-2); }
  .ul-pair { gap: 4px; align-items: center; font-size: 0.66rem; }
  .ul-layer-table { border-collapse: collapse; font-size: 0.64rem; margin: 4px 0; }
  .ul-layer-table th { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 1px 6px 1px 0; }
  .ul-file { position: relative; display: inline-flex; cursor: pointer; }
  .ul-file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .ul-file.disabled { opacity: 0.5; }
  .pk-btn.on { border-color: var(--st-accent); }
</style>
