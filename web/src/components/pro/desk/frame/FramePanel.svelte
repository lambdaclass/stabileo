<script lang="ts">
  /**
   * The frame editor's tools: the selected bar (its face, row, bars, diameter, ends and hooks; cut,
   * lap with a second bar, join, delete), a new bar, the selected stirrup zone (edit, split,
   * equalize, delete) and the spans reinforced as one. Every tool returns a new draft through
   * `apply`; nothing is written until the editor saves.
   */
  import type { BeamLineReinforcement, BeamBarFace, BeamBarRole } from '../../../../lib/design-contract/beam-line';
  import {
    addBar, changeRow, cutBar, deleteZone, equalizeZones, joinBars, lapBars, removeBar, setHook, splitSpans, splitZone,
    stretchBar, uniteSpans, updateBar, updateZone,
  } from '../../../../lib/engine/design/beam-line';
  import { t, tp } from '../../../../lib/i18n';

  interface Props {
    line: BeamLineReinforcement;
    selectedBar: string | null;
    secondBar: string | null;
    selectedZone: string | null;
    /** Class B lap length for a bar diameter, m (1,3·ld, §25.5.2). */
    lapOf: (diameterMm: number) => number;
    apply: (next: BeamLineReinforcement) => void;
    clearSelection: () => void;
  }
  let { line, selectedBar, secondBar, selectedZone, lapOf, apply, clearSelection }: Props = $props();

  const DIAS = [6, 8, 10, 12, 16, 20, 25, 32];
  const bar = $derived(line.bars.find((b) => b.id === selectedBar) ?? null);
  const second = $derived(line.bars.find((b) => b.id === secondBar) ?? null);
  const zone = $derived(line.stirrups.find((z) => z.id === selectedZone) ?? null);
  const total = $derived(line.lengths.reduce((s, l) => s + l, 0));
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);

  let cutAt = $state(0), lap = $state(0);
  $effect(() => { if (bar) { cutAt = +(((bar.from + bar.to) / 2).toFixed(2)); lap = +lapOf(bar.diameter).toFixed(2); } });
  let splitAt = $state(0);
  $effect(() => { if (zone) splitAt = +(((zone.from + zone.to) / 2).toFixed(2)); });

  // A new bar
  let nFace = $state<BeamBarFace>('bottom'), nRow = $state(1), nCount = $state(2), nDia = $state(12), nFrom = $state(0), nTo = $state(1), nRole = $state<BeamBarRole>('extra');
  /** How the new bar ends at each side: straight, or with a hook. */
  let nEnd0 = $state<'straight' | 'hook'>('straight'), nEnd1 = $state<'straight' | 'hook'>('straight');
  $effect(() => { if (nTo <= 0 && total > 0) nTo = +total.toFixed(2); });

  // Spans as one
  let s0 = $state(0), s1 = $state(1);
</script>

<div class="fp" data-testid="frame-panel">
  {#if bar}
    <section class="fp-card" data-testid="frame-bar-panel">
      <h5>{t('frameEd.bar')} · {bar.count}Ø{bar.diameter}</h5>
      <div class="fp-grid">
        <label>{t('frameEd.face')}<select value={bar.face} onchange={(e) => apply(updateBar(line, bar.id, { face: e.currentTarget.value as BeamBarFace }))}><option value="top">{t('frameEd.top')}</option><option value="bottom">{t('frameEd.bottom')}</option></select></label>
        <label>{t('frameEd.row')}<input type="number" min="0" max="4" value={bar.row} onchange={(e) => apply(changeRow(line, bar.id, num(e)))} data-testid="frame-bar-row" /></label>
        <label>{t('frameEd.count')}<input type="number" min="1" max="20" value={bar.count} onchange={(e) => apply(updateBar(line, bar.id, { count: num(e) }))} data-testid="frame-bar-count" /></label>
        <label>Ø<select value={bar.diameter} onchange={(e) => apply(updateBar(line, bar.id, { diameter: Number(e.currentTarget.value) }))}>{#each DIAS as d}<option value={d}>{d}</option>{/each}</select></label>
        <label>{t('frameEd.from')}<input type="number" step="0.05" value={bar.from.toFixed(2)} onchange={(e) => apply(stretchBar(line, bar.id, 'from', num(e)))} data-testid="frame-bar-from" /></label>
        <label>{t('frameEd.to')}<input type="number" step="0.05" value={bar.to.toFixed(2)} onchange={(e) => apply(stretchBar(line, bar.id, 'to', num(e)))} data-testid="frame-bar-to" /></label>
        <label class="fp-check"><input type="checkbox" checked={!!bar.hookStart} onchange={(e) => apply(setHook(line, bar.id, 'start', e.currentTarget.checked))} /> {t('frameEd.hookStart')}</label>
        <label class="fp-check"><input type="checkbox" checked={!!bar.hookEnd} onchange={(e) => apply(setHook(line, bar.id, 'end', e.currentTarget.checked))} /> {t('frameEd.hookEnd')}</label>
      </div>
      <div class="fp-row">
        <label>{t('frameEd.cutAt')}<input type="number" step="0.05" bind:value={cutAt} /></label>
        <label>{t('frameEd.lap')}<input type="number" step="0.05" min="0" bind:value={lap} /></label>
        <button onclick={() => { apply(cutBar(line, bar.id, cutAt, lap)); clearSelection(); }} data-testid="frame-bar-cut">{t('frameEd.cut')}</button>
      </div>
      {#if second}
        <p class="fp-hint">{tp('frameEd.second', { bar: `${second.count}Ø${second.diameter}` })}</p>
        <div class="fp-row">
          <button onclick={() => apply(lapBars(line, bar.id, second.id, lap))} data-testid="frame-bar-lap">{t('frameEd.lapBars')}</button>
          <button onclick={() => { apply(joinBars(line, bar.id, second.id)); clearSelection(); }} data-testid="frame-bar-join">{t('frameEd.join')}</button>
        </div>
      {:else}
        <p class="fp-hint">{t('frameEd.shiftHint')}</p>
      {/if}
      <button class="fp-danger" onclick={() => { apply(removeBar(line, bar.id)); clearSelection(); }} data-testid="frame-bar-delete">{t('frameEd.delete')}</button>
    </section>
  {/if}

  {#if zone}
    <section class="fp-card" data-testid="frame-zone-panel">
      <h5>{t('frameEd.zone')} · {zone.from.toFixed(2)}–{zone.to.toFixed(2)} m</h5>
      <div class="fp-grid">
        <label>eØ<select value={zone.diameter} onchange={(e) => apply(updateZone(line, zone.id, { diameter: Number(e.currentTarget.value) }))}>{#each DIAS.filter((d) => d <= 12) as d}<option value={d}>{d}</option>{/each}</select></label>
        <label>{t('frameEd.legs')}<input type="number" min="2" max="6" value={zone.legs} onchange={(e) => apply(updateZone(line, zone.id, { legs: num(e) }))} /></label>
        <label>{t('frameEd.spacing')}<input type="number" min="5" max="50" step="2.5" value={(zone.spacing * 100).toFixed(1)} onchange={(e) => apply(updateZone(line, zone.id, { spacing: num(e) / 100 }))} data-testid="frame-zone-spacing" /> cm</label>
      </div>
      <div class="fp-row">
        <label>{t('frameEd.splitAt')}<input type="number" step="0.05" bind:value={splitAt} /></label>
        <button onclick={() => { apply(splitZone(line, zone.id, splitAt)); clearSelection(); }} data-testid="frame-zone-split">{t('frameEd.split')}</button>
        <button onclick={() => apply(equalizeZones(line, line.stirrups.filter((z) => Math.abs((z.to - z.from) - (zone.to - zone.from)) < 0.5 * (zone.to - zone.from)).map((z) => z.id)))} title={t('frameEd.equalizeHint')}>{t('frameEd.equalize')}</button>
        <button class="fp-danger" onclick={() => { apply(deleteZone(line, zone.id)); clearSelection(); }}>{t('frameEd.delete')}</button>
      </div>
    </section>
  {/if}

  <section class="fp-card" data-testid="frame-add-bar">
    <h5>{t('frameEd.addBar')}</h5>
    <div class="fp-grid">
      <label>{t('frameEd.face')}<select bind:value={nFace}><option value="top">{t('frameEd.top')}</option><option value="bottom">{t('frameEd.bottom')}</option></select></label>
      <label>{t('frameEd.role')}<select bind:value={nRole}>{#each ['main', 'support', 'mounting', 'extra'] as r}<option value={r}>{t(`frameEd.role.${r}`)}</option>{/each}</select></label>
      <label>{t('frameEd.row')}<input type="number" min="0" max="4" bind:value={nRow} /></label>
      <label>{t('frameEd.count')}<input type="number" min="1" max="20" bind:value={nCount} /></label>
      <label>Ø<select bind:value={nDia}>{#each DIAS as d}<option value={d}>{d}</option>{/each}</select></label>
      <label>{t('frameEd.from')}<input type="number" step="0.05" bind:value={nFrom} /></label>
      <label>{t('frameEd.to')}<input type="number" step="0.05" bind:value={nTo} /></label>
      <label>{t('frameEd.endStart')}<select bind:value={nEnd0} data-testid="frame-add-end-start"><option value="straight">{t('frameEd.endStraight')}</option><option value="hook">{t('frameEd.endHook')}</option></select></label>
      <label>{t('frameEd.endEnd')}<select bind:value={nEnd1} data-testid="frame-add-end-end"><option value="straight">{t('frameEd.endStraight')}</option><option value="hook">{t('frameEd.endHook')}</option></select></label>
    </div>
    <button onclick={() => apply(addBar(line, { face: nFace, row: nRow, count: nCount, diameter: nDia, from: nFrom, to: nTo, role: nRole, ...(nEnd0 === 'hook' ? { hookStart: true } : {}), ...(nEnd1 === 'hook' ? { hookEnd: true } : {}) }))} data-testid="frame-add-bar-go">{t('frameEd.add')}</button>
  </section>

  {#if line.members.length > 1}
    <section class="fp-card">
      <h5>{t('frameEd.spans')}</h5>
      <p class="fp-hint">{t('frameEd.spansHint')}</p>
      <div class="fp-row">
        <label>{t('frameEd.fromSpan')}<input type="number" min="1" max={line.members.length} value={s0 + 1} onchange={(e) => (s0 = num(e) - 1)} /></label>
        <label>{t('frameEd.toSpan')}<input type="number" min="1" max={line.members.length} value={s1 + 1} onchange={(e) => (s1 = num(e) - 1)} /></label>
        <button onclick={() => apply(uniteSpans(line, s0, s1))} data-testid="frame-unite-spans">{t('frameEd.unite')}</button>
      </div>
      {#each line.spans ?? [] as s, i (i)}
        <div class="fp-row"><span>{tp('frameEd.spanRange', { from: s[0]! + 1, to: s[s.length - 1]! + 1 })}</span><button onclick={() => apply(splitSpans(line, s[0]!))}>×</button></div>
      {/each}
    </section>
  {/if}
</div>

<style>
  .fp { display: flex; flex-direction: column; gap: 6px; font-size: 0.7rem; }
  .fp-card { border: 1px solid var(--st-hair); border-radius: 4px; padding: 6px 8px; background: var(--st-surface-2); }
  .fp-card h5 { margin: 0 0 4px; font-size: 0.74rem; font-weight: 600; }
  .fp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr)); gap: 3px 8px; }
  .fp-grid label, .fp-row label { display: flex; align-items: center; gap: 4px; color: var(--st-text-2); }
  .fp-grid input, .fp-row input { width: 3.8rem; font-size: 0.7rem; }
  .fp-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 4px; }
  .fp-check { gap: 3px; }
  .fp-hint { margin: 3px 0; color: var(--st-text-3); }
  .fp button { font-size: 0.68rem; padding: 2px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .fp .fp-danger { margin-top: 4px; border-color: var(--st-danger); color: var(--st-danger); }
</style>
