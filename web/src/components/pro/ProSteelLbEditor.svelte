<script lang="ts">
  import { positiveInput } from '../../lib/utils/positive-input';
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
  import { fmtQ, unitQ } from '../../lib/store/display-units.svelte';
  import QuantityInput from './loads/QuantityInput.svelte';

  /** `bare`: inside a card that already names it (Specifications › Members). */
  let { steelIds, bare = false }: { steelIds: ReadonlySet<number>; bare?: boolean } = $props();

  type Field = 'unbracedLength' | 'kStrong' | 'kWeak';

  const selected = $derived([...uiStore.selectedElements].filter((id) => steelIds.has(id)));
  const lengths = $derived(memberLengths(modelStore.model));
  /** What the selection has now, one value or "mixed". */
  function now(read: (id: number) => number | undefined, show: (v: number) => string): string {
    const values = [...new Set(selected.map((id) => { const v = read(id); return v === undefined ? '—' : show(v); }))];
    if (values.length === 0) return '';
    return values.length === 1 ? values[0]! : t('steel.lb.mixed');
  }
  const lbNow = $derived(now((id) => lengths.get(id)?.Lb, (v) => `${fmtQ(v, 'length')} ${unitQ('length')}`));
  const kNow = $derived(`${now((id) => modelStore.elements.get(id)?.kStrong ?? 1, (v) => v.toFixed(2))} / ${now((id) => modelStore.elements.get(id)?.kWeak ?? 1, (v) => v.toFixed(2))}`);

  // Number inputs: bind:value gives a number, or null when empty. Lb in SI, typed in the display units.
  let lb = $state<number | null>(null);
  let kStrong = $state<number | null>(null);
  let kWeak = $state<number | null>(null);

  function write(patch: Partial<Pick<Element, Field>>) {
    modelStore.batch(() => {
      for (const id of selected) modelStore.updateElement(id, patch);
    });
  }

  const positive = positiveInput;

  function declareLb() {
    const v = positive(lb);
    if (v === undefined) return;
    write({ unbracedLength: v });
    lb = null;
  }

  function declareK() {
    const s = positive(kStrong), w = positive(kWeak);
    if (s === undefined && w === undefined) return;
    write({ ...(s !== undefined ? { kStrong: s } : {}), ...(w !== undefined ? { kWeak: w } : {}) });
    kStrong = null; kWeak = null;
  }

  const anyDeclared = (f: Field) => selected.some((id) => modelStore.elements.get(id)?.[f] !== undefined);
</script>

<div class={bare ? 'lb-bare' : 'pk-card lb'} data-testid="steel-lb-editor">
  {#if !bare}<h4 class="pk-heading">{t('steel.lb.title')}</h4>{/if}
  <p class="pk-hint">{t('steel.lb.hint')}</p>
  {#if selected.length === 0}
    <p class="pk-hint" data-testid="steel-lb-none">{t('steel.lb.none')}</p>
  {:else}
    <p class="lb-now" data-testid="steel-lb-now">{tp('steel.lb.selected', { n: selected.length, lb: lbNow })}</p>
    <div class="pk-row">
      <!-- Enter declares. The field is left first, so its own commit does not bring the value back. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span class="lb-field" onkeydown={(e) => { if (e.key === 'Enter') { (e.target as HTMLElement).blur(); declareLb(); } }}>
        <QuantityInput nullable min={0} bind:value={lb} quantity="length" placeholder="Lb" cls="lb-in" wrap="lb-qi" testid="steel-lb-input" />
      </span>
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
  .lb-bare { display: flex; flex-direction: column; gap: 0.45rem; }
  .lb-field { display: flex; flex: 1; min-width: 0; }
  .lb-field :global(.lb-qi) { flex: 1; min-width: 0; }
  .lb-field :global(input.lb-in) { flex: 1; min-width: 0; width: 100%; }
  .lb-now { margin: 0 0 4px; font-size: 0.64rem; color: var(--st-text-2); }
</style>
