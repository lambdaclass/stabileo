<script lang="ts">
  /**
   * The declared design lengths of the selected steel members: Lb, and K about each axis.
   *
   * `Element.unbracedLength` replaces `Lb`, never `L` (`engine/steel/unbraced-length.ts`), and is
   * reported as declared. It had an input only in the property panel, which PRO does not mount:
   * the field existed and nobody in PRO could reach it. `kStrong`/`kWeak` are the effective-length
   * factors for flexural buckling; absent, 1,0. Here they sit beside the text that says why they
   * matter. One write for the whole selection is one undo step.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { memberLengths } from '../../lib/engine/steel/unbraced-length';
  import type { Element } from '../../lib/store/model.svelte';

  let { steelIds }: { steelIds: ReadonlySet<number> } = $props();

  type Field = 'unbracedLength' | 'kStrong' | 'kWeak';

  const selected = $derived([...uiStore.selectedElements].filter((id) => steelIds.has(id)));
  const lengths = $derived(memberLengths(modelStore.model));
  /** What the selection has now, one value or "mixed". */
  function now(read: (id: number) => number | undefined, unit: string, digits: number): string {
    const values = [...new Set(selected.map((id) => read(id)?.toFixed(digits) ?? '—'))];
    if (values.length === 0) return '';
    return values.length === 1 ? (values[0] === '—' ? '—' : `${values[0]}${unit}`) : t('steel.lb.mixed');
  }
  const lbNow = $derived(now((id) => lengths.get(id)?.Lb, ' m', 3));
  const kNow = $derived(`${now((id) => modelStore.elements.get(id)?.kStrong ?? 1, '', 2)} / ${now((id) => modelStore.elements.get(id)?.kWeak ?? 1, '', 2)}`);

  let lb = $state('');
  let kStrong = $state('');
  let kWeak = $state('');

  function write(patch: Partial<Pick<Element, Field>>) {
    modelStore.batch(() => {
      for (const id of selected) modelStore.updateElement(id, patch);
    });
  }

  const positive = (s: string) => { const v = parseFloat(s.replace(',', '.')); return v > 0 ? v : undefined; };

  function declareLb() {
    const v = positive(lb);
    if (v === undefined) return;
    write({ unbracedLength: v });
    lb = '';
  }

  function declareK() {
    const s = positive(kStrong), w = positive(kWeak);
    if (s === undefined && w === undefined) return;
    write({ ...(s !== undefined ? { kStrong: s } : {}), ...(w !== undefined ? { kWeak: w } : {}) });
    kStrong = ''; kWeak = '';
  }

  const anyDeclared = (f: Field) => selected.some((id) => modelStore.elements.get(id)?.[f] !== undefined);
</script>

<div class="pk-card lb" data-testid="steel-lb-editor">
  <h4 class="pk-heading">{t('steel.lb.title')}</h4>
  <p class="pk-hint">{t('steel.lb.hint')}</p>
  {#if selected.length === 0}
    <p class="pk-hint" data-testid="steel-lb-none">{t('steel.lb.none')}</p>
  {:else}
    <p class="lb-now" data-testid="steel-lb-now">{tp('steel.lb.selected', { n: selected.length, lb: lbNow })}</p>
    <div class="pk-row">
      <input class="pk-grow" type="number" min="0" step="0.1" placeholder="Lb (m)" bind:value={lb}
        onkeydown={(e) => { if (e.key === 'Enter') declareLb(); }} data-testid="steel-lb-input" />
      <button class="pk-btn pk-btn-primary" onclick={declareLb} disabled={positive(lb) === undefined} data-testid="steel-lb-declare">{t('steel.lb.declare')}</button>
      <button class="pk-btn" onclick={() => write({ unbracedLength: undefined })}
        disabled={!anyDeclared('unbracedLength')} data-testid="steel-lb-clear">{t('steel.lb.clear')}</button>
    </div>

    <p class="lb-now" data-testid="steel-k-now">{tp('steel.k.now', { k: kNow })}</p>
    <p class="pk-hint">{t('steel.k.hint')}</p>
    <div class="pk-row">
      <input class="pk-grow" type="number" min="0" step="0.05" placeholder={t('steel.k.strong')} bind:value={kStrong} data-testid="steel-k-strong" />
      <input class="pk-grow" type="number" min="0" step="0.05" placeholder={t('steel.k.weak')} bind:value={kWeak} data-testid="steel-k-weak" />
      <button class="pk-btn pk-btn-primary" onclick={declareK} disabled={positive(kStrong) === undefined && positive(kWeak) === undefined} data-testid="steel-k-declare">{t('steel.lb.declare')}</button>
      <button class="pk-btn" onclick={() => write({ kStrong: undefined, kWeak: undefined })}
        disabled={!anyDeclared('kStrong') && !anyDeclared('kWeak')} data-testid="steel-k-clear">{t('steel.k.clear')}</button>
    </div>
  {/if}
</div>

<style>
  .lb { margin-top: 6px; }
  .lb-now { margin: 0 0 4px; font-size: 0.64rem; color: var(--st-text-2); }
</style>
