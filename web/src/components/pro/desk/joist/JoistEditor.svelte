<script lang="ts">
  /**
   * Joist-and-block floors: the level's joist panels in plan (joists at their spacing, doubled or
   * tripled, the site negatives over the supports with their bars and length, the distribution mat
   * in the topping, each panel labelled with its type); the selected panel's system edited and its
   * design against the joist's sheet shown at once, with each error's cause and remedy; equalizing
   * the level within a tolerance.
   */
  import { untrack } from 'svelte';
  import { t, tp, inSentence } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { equalizeJoists, joistLibrary, joistPanels, setJoistSystem } from '../../../../lib/store/joist-store';
  import { designJoistPanel, type JoistSystem } from '../../../../lib/engine/joists/joist-design';
  import { BLOCK_DEFAULTS, type BlockKind } from '../../../../lib/engine/joists/library';

  const panels = $derived.by(() => { void modelStore.designDecisions; void modelStore.model.loads; return joistPanels(); });
  const levels = $derived([...new Set(panels.map((p) => p.level ?? ''))]);
  let level = $state('');
  $effect(() => { if (!levels.includes(level) && levels[0] !== undefined) level = levels[0]; });
  const here = $derived(panels.filter((p) => (p.level ?? '') === level));
  let sel = $state<string | null>(null);
  $effect(() => { if (!here.some((p) => p.key === sel)) sel = here[0]?.key ?? null; });
  const panel = $derived(here.find((p) => p.key === sel) ?? null);
  const lib = $derived(joistLibrary());
  let draft = $state<JoistSystem | null>(null);
  $effect(() => { void sel; untrack(() => { draft = panel ? JSON.parse(JSON.stringify(panel.system)) : null; }); });
  const result = $derived(panel && draft ? designJoistPanel(panel.input, draft, lib.find((x) => x.id === draft!.typeId)?.sheet) : null);
  let tol = $state(10);
  let note = $state<string | null>(null);

  // ── Plan ──
  const bounds = $derived.by(() => {
    if (!here.length) return null;
    return { x0: Math.min(...here.map((p) => p.box.x0)), x1: Math.max(...here.map((p) => p.box.x1)), y0: Math.min(...here.map((p) => p.box.y0)), y1: Math.max(...here.map((p) => p.box.y1)) };
  });
  const W = 560;
  const sc = $derived(bounds ? Math.min((W - 40) / (bounds.x1 - bounds.x0), 380 / (bounds.y1 - bounds.y0)) : 1);
  const X = (x: number) => 20 + (x - (bounds?.x0 ?? 0)) * sc;
  const Y = (y: number) => 20 + ((bounds?.y1 ?? 0) - y) * sc;
  const lines = (p: (typeof here)[number]) => {
    const s = p.key === sel && draft ? draft : p.system;
    const across = s.direction === 'x' ? [p.box.y0, p.box.y1] : [p.box.x0, p.box.x1];
    const out: number[] = [];
    for (let c = across[0]! + s.spacing / 2; c < across[1]! - 1e-6; c += s.spacing) out.push(c);
    return { s, out };
  };
  const nameOf = (id: string) => lib.find((x) => x.id === id)?.name ?? id;
  const KINDS: BlockKind[] = ['ceramic', 'concrete', 'eps'];
</script>

<div class="je" data-testid="joist-editor">
  {#if panels.length === 0}
    <p class="je-hint">{t('joist.none')}</p>
  {:else}
    <header class="je-head">
      <label>{t('desk.level')}<select bind:value={level}>{#each levels as l}<option value={l}>{l || '—'}</option>{/each}</select></label>
      <label>{t('joist.tolerance')}<input type="number" min="0" max="50" bind:value={tol} /> %</label>
      <button class="je-btn" onclick={() => { note = tp('joist.equalized', { n: equalizeJoists(level || undefined, tol / 100) }); }} data-testid="joist-equalize">{t('joist.equalize')}</button>
      {#if note}<span class="je-hint" role="status">{note}</span>{/if}
    </header>
    {#if bounds}
      <svg viewBox="0 0 {W} {(bounds.y1 - bounds.y0) * sc + 40}" class="je-svg" role="img" aria-label={t('joist.plan')} data-testid="joist-plan">
        {#each here as p (p.key)}
          {@const L = lines(p)}
          <rect x={X(p.box.x0)} y={Y(p.box.y1)} width={(p.box.x1 - p.box.x0) * sc} height={(p.box.y1 - p.box.y0) * sc} class="je-panel" class:on={p.key === sel} class:bad={p.design.errors.length > 0} onclick={() => (sel = p.key)} role="button" tabindex="0" onkeydown={() => (sel = p.key)} />
          {#each L.out as c}
            {#each Array.from({ length: L.s.multiplicity }, (_, k) => (k - (L.s.multiplicity - 1) / 2) * 0.03) as off}
              {#if L.s.direction === 'x'}<line x1={X(p.box.x0)} x2={X(p.box.x1)} y1={Y(c + off)} y2={Y(c + off)} class="je-joist" />
              {:else}<line y1={Y(p.box.y0)} y2={Y(p.box.y1)} x1={X(c + off)} x2={X(c + off)} class="je-joist" />{/if}
            {/each}
          {/each}
          {#each (['start', 'end'] as const) as end}
            {@const n = p.design.negatives[end]}
            {#if n}
              {@const at = L.s.direction === 'x' ? (end === 'start' ? p.box.x0 : p.box.x1) : (end === 'start' ? p.box.y0 : p.box.y1)}
              {#if L.s.direction === 'x'}<line x1={X(at)} x2={X(at)} y1={Y(p.box.y0)} y2={Y(p.box.y1)} class="je-neg" /><text x={X(at) + (end === 'start' ? 4 : -4)} y={Y(p.box.y0) - 4} class="je-t" text-anchor={end === 'start' ? 'start' : 'end'}>{n.count}Ø{n.diameter} L={n.length.toFixed(2)}</text>
              {:else}<line y1={Y(at)} y2={Y(at)} x1={X(p.box.x0)} x2={X(p.box.x1)} class="je-neg" /><text x={X(p.box.x0) + 4} y={Y(at) + (end === 'start' ? -4 : 10)} class="je-t">{n.count}Ø{n.diameter} L={n.length.toFixed(2)}</text>{/if}
            {/if}
          {/each}
          <text x={X((p.box.x0 + p.box.x1) / 2)} y={Y((p.box.y0 + p.box.y1) / 2)} class="je-label" text-anchor="middle">{nameOf(L.s.typeId)}{L.s.multiplicity > 1 ? ` ×${L.s.multiplicity}` : ''} c/{(L.s.spacing * 100).toFixed(0)}</text>
          <text x={X((p.box.x0 + p.box.x1) / 2)} y={Y((p.box.y0 + p.box.y1) / 2) + 11} class="je-t" text-anchor="middle">{t('joist.distribution')} Ø{p.design.distribution.diameter} c/{(p.design.distribution.spacing * 100).toFixed(0)}</text>
        {/each}
      </svg>
    {/if}
    {#if panel && draft && result}
      <div class="je-cols">
        <div class="je-form" data-testid="joist-form">
          <h5>{panel.key} · {(panel.input.span).toFixed(2)} m</h5>
          <label>{t('joist.type')}<select bind:value={draft.typeId}>{#each lib as x (x.id)}<option value={x.id}>{x.name}</option>{/each}</select></label>
          <label>{t('joist.multiplicity')}<select bind:value={draft.multiplicity}><option value={1}>{t('joist.single')}</option><option value={2}>{t('joist.double')}</option><option value={3}>{t('joist.triple')}</option></select></label>
          <label>{t('joist.spacing')} (cm)<input type="number" min="30" max="90" step="1" value={draft.spacing * 100} onchange={(e) => (draft!.spacing = Number(e.currentTarget.value) / 100)} data-testid="joist-spacing" /></label>
          <label>{t('joist.direction')}<select bind:value={draft.direction}><option value="x">x</option><option value="y">y</option></select></label>
          <label>{t('joist.block')}<select value={draft.block.kind} onchange={(e) => (draft!.block = { ...BLOCK_DEFAULTS[e.currentTarget.value as BlockKind], height: draft!.block.height })}>{#each KINDS as k}<option value={k}>{t(`joist.blockKind.${k}`)}</option>{/each}</select></label>
          <label>{t('joist.blockHeight')} (cm)<input type="number" min="8" max="35" value={draft.block.height * 100} onchange={(e) => (draft!.block = { ...draft!.block, height: Number(e.currentTarget.value) / 100 })} /></label>
          <label>{t('joist.blockWeight')} (kN/m²)<input type="number" min="0" max="3" step="0.05" bind:value={draft.block.weight} /></label>
          <label>{t('joist.topping')} (cm)<input type="number" min="3" max="10" value={draft.topping * 100} onchange={(e) => (draft!.topping = Number(e.currentTarget.value) / 100)} /></label>
          <label class="je-chk"><input type="checkbox" bind:checked={draft.propped} /> {t('joist.propped')}</label>
          {#each (['start', 'end'] as const) as end}
            <label>{t(`joist.end.${end}`)}<select value={draft.ends[end]} onchange={(e) => (draft!.ends = { ...draft!.ends, [end]: e.currentTarget.value })}><option value="auto">{t('joist.endAuto')}</option><option value="simple">{t('joist.endSimple')}</option><option value="continuous">{t('joist.endContinuous')}</option></select></label>
          {/each}
          {#each (['start', 'end'] as const) as end}
            {@const n = draft.negatives?.[end] ?? result.negatives[end]}
            {#if n}
              <label>{t('joist.negatives')} {inSentence(t(`joist.end.${end}`))}
                <input type="number" min="1" max="4" value={n.count} onchange={(e) => (draft!.negatives = { ...(draft!.negatives ?? {}), [end]: { ...n, count: Number(e.currentTarget.value) } })} data-testid="joist-neg-{end}" />
                Ø<input type="number" min="6" max="20" value={n.diameter} onchange={(e) => (draft!.negatives = { ...(draft!.negatives ?? {}), [end]: { ...n, diameter: Number(e.currentTarget.value) } })} />
                L<input type="number" min="0.3" max="4" step="0.05" value={n.length} onchange={(e) => (draft!.negatives = { ...(draft!.negatives ?? {}), [end]: { ...n, length: Number(e.currentTarget.value) } })} />
              </label>
            {/if}
          {/each}
          <label>{t('joist.positives')}<input type="number" min="0" max="4" value={draft.positives?.count ?? 0} onchange={(e) => { const n = Number(e.currentTarget.value); draft!.positives = n > 0 ? { count: n, diameter: draft!.positives?.diameter ?? 10 } : undefined; }} /></label>
          <div class="je-row">
            <button class="je-btn je-primary" onclick={() => { setJoistSystem(panel.key, draft); note = t('joist.saved'); }} data-testid="joist-save">{t('slabEd.save')}</button>
            {#if panel.saved}<button class="je-btn" onclick={() => setJoistSystem(panel.key, null)}>{t('slabEd.revert')}</button>{/if}
          </div>
        </div>
        <div>
          <table class="je-res" data-testid="joist-results"><tbody>
            <tr class:bad={result.utilization.flexure > 1}><td>{t('joist.flexure')}</td><td class="num">{result.mPos.toFixed(1)} / {result.capacity.muPos.toFixed(1)} kN·m</td><td class="num">{Number.isFinite(result.utilization.flexure) ? result.utilization.flexure.toFixed(2) : '∞'}</td></tr>
            <tr class:bad={result.utilization.shear > 1}><td>{t('joist.shear')}</td><td class="num">{result.vu.toFixed(1)} / {result.capacity.vu.toFixed(1)} kN</td><td class="num">{Number.isFinite(result.utilization.shear) ? result.utilization.shear.toFixed(2) : '∞'}</td></tr>
            <tr class:bad={result.utilization.deflection > 1}><td>{t('joist.deflection')}</td><td class="num">{(result.deflection.total * 1000).toFixed(1)} / {(result.deflection.limit * 1000).toFixed(1)} mm</td><td class="num">{Number.isFinite(result.utilization.deflection) ? result.utilization.deflection.toFixed(2) : '∞'}</td></tr>
          </tbody></table>
          <p class="je-hint">{tp('joist.deflectionParts', { a: (result.deflection.selfOnJoist * 1000).toFixed(1), b: (result.deflection.afterOnFloor * 1000).toFixed(1), c: (result.deflection.longTerm * 1000).toFixed(1) })}</p>
          {#if result.errors.length}
            <ul class="je-err" data-testid="joist-errors">{#each result.errors as e}<li><b>{e}</b> {t(`joist.err.${e}.cause`)} <span class="je-fix">{t(`joist.err.${e}.fix`)}</span></li>{/each}</ul>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .je { padding: 8px; font-size: 0.72rem; display: flex; flex-direction: column; gap: 6px; }
  .je-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .je-head label, .je-form label { display: flex; align-items: center; gap: 4px; color: var(--st-text-2); }
  .je-head input { width: 3.5rem; }
  .je-svg { width: 100%; max-width: 600px; background: var(--st-surface); border: 1px solid var(--st-hair); border-radius: 4px; }
  .je-panel { fill: var(--st-surface-2); stroke: var(--st-text-3); cursor: pointer; }
  .je-panel.on { stroke: var(--st-accent); stroke-width: 2; }
  .je-panel.bad { fill: color-mix(in srgb, var(--st-danger) 10%, var(--st-surface-2)); }
  .je-joist { stroke: var(--st-value); stroke-width: 1; pointer-events: none; }
  .je-neg { stroke: var(--st-warn); stroke-width: 3; pointer-events: none; }
  .je-label { font-size: 9px; fill: var(--st-text); pointer-events: none; }
  .je-t { font-size: 8px; fill: var(--st-text-2); pointer-events: none; }
  .je-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
  .je-form { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 3px 8px; align-content: start; }
  .je-form h5 { grid-column: 1 / -1; margin: 0; font-size: 0.76rem; }
  .je-form input { width: 4rem; font-size: 0.7rem; }
  .je-row { grid-column: 1 / -1; display: flex; gap: 6px; }
  .je-btn { font-size: 0.68rem; padding: 2px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .je-primary { background: var(--st-accent); border-color: var(--st-accent); color: var(--st-on-accent, #fff); }
  .je-res { border-collapse: collapse; width: 100%; }
  .je-res td { padding: 2px 6px; border-top: 1px solid var(--st-hair); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .bad td, tr.bad td { color: var(--st-danger); }
  .je-err { margin: 6px 0; padding-left: 16px; } .je-err li { margin: 2px 0; }
  .je-fix { color: var(--st-text-3); }
  .je-hint { color: var(--st-text-3); }
  @media (max-width: 1000px) { .je-cols { grid-template-columns: 1fr; } }
</style>
