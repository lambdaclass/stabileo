<script lang="ts">
  /**
   * The selected part of a drawn section: its dimensions, where it sits, its material, and the
   * attach command that puts it against a side of another part.
   *
   * Lengths are typed in millimetres and stored in metres. An entry that does not parse to a
   * positive length is refused and the field shows the stored value again, so a half-typed number
   * never reaches the analysis.
   */
  import { t } from '../../../lib/i18n';
  import type { DrawnPart, DrawnShape, Side, Align, Pt } from '../../../lib/section/drawn';

  interface Props {
    part: DrawnPart;
    others: DrawnPart[];
    materials: Array<{ id: number; name: string }>;
    refMaterialId: number | null;
    profileNames: string[];
    onChange: (part: DrawnPart) => void;
    onAttach: (target: number, side: Side, align: Align) => void;
    onDuplicate: () => void;
    onDelete: () => void;
  }
  const { part, others, materials, refMaterialId, profileNames, onChange, onAttach, onDuplicate, onDelete }: Props = $props();

  const mm = (m: number) => +(m * 1000).toFixed(3);
  const setShape = (patch: Partial<DrawnShape>) => onChange({ ...part, shape: { ...part.shape, ...patch } as DrawnShape });
  function len(e: Event & { currentTarget: HTMLInputElement }, apply: (m: number) => void, current: number, allowZero = false) {
    const v = Number(e.currentTarget.value.replace(',', '.'));
    if (Number.isFinite(v) && (v > 0 || (allowZero && v === 0))) apply(v / 1000);
    else e.currentTarget.value = String(mm(current));
  }
  function coord(e: Event & { currentTarget: HTMLInputElement }, i: 0 | 1) {
    const v = Number(e.currentTarget.value.replace(',', '.'));
    if (!Number.isFinite(v)) { e.currentTarget.value = String(mm(part.at[i])); return; }
    const at: Pt = [...part.at];
    at[i] = v / 1000;
    onChange({ ...part, at });
  }

  /** Points as "y z; y z; …" in millimetres, the way a coordinate list is usually pasted. */
  const pointsText = (pts: Pt[]) => pts.map(([y, z]) => `${mm(y)} ${mm(z)}`).join('; ');
  let pointsProblem = $state(false);
  function points(e: Event & { currentTarget: HTMLTextAreaElement }, min: number) {
    const pts = e.currentTarget.value.split(/[;\n]/).map((s) => s.trim()).filter(Boolean)
      .map((s) => s.split(/[\s,]+/).map(Number));
    const ok = pts.length >= min && pts.every((p) => p.length === 2 && p.every(Number.isFinite));
    pointsProblem = !ok;
    if (ok) setShape({ points: pts.map(([y, z]) => [y! / 1000, z! / 1000] as Pt) } as Partial<DrawnShape>);
  }

  let target = $state<number | null>(null);
  let side = $state<Side>('top');
  let align = $state<Align>('centre');
  const targetId = $derived(target ?? others[0]?.id ?? null);
</script>

<div class="part-editor" data-testid="drawn-part-editor">
  <div class="row head">
    <strong>#{part.id} · {t(`drawn.shape.${part.shape.kind}`)}</strong>
    <span class="grow"></span>
    <button type="button" onclick={onDuplicate} data-testid="drawn-part-duplicate">{t('drawn.duplicate')}</button>
    <button type="button" onclick={onDelete} data-testid="drawn-part-delete">{t('drawn.delete')}</button>
  </div>

  <div class="grid">
    {#if part.shape.kind === 'rect' || part.shape.kind === 'hollowRect'}
      {@const s = part.shape}
      <label>b<input type="number" value={mm(s.b)} data-testid="drawn-b" onchange={(e) => len(e, (b) => setShape({ b }), s.b)} /></label>
      <label>h<input type="number" value={mm(s.h)} data-testid="drawn-h" onchange={(e) => len(e, (h) => setShape({ h }), s.h)} /></label>
      {#if s.kind === 'hollowRect'}
        <label>t<input type="number" value={mm(s.t)} onchange={(e) => len(e, (tt) => setShape({ t: tt }), s.t)} /></label>
      {/if}
    {:else if part.shape.kind === 'circle' || part.shape.kind === 'tube'}
      {@const s = part.shape}
      <label>d<input type="number" value={mm(s.d)} onchange={(e) => len(e, (d) => setShape({ d }), s.d)} /></label>
      {#if s.kind === 'tube'}
        <label>t<input type="number" value={mm(s.t)} onchange={(e) => len(e, (tt) => setShape({ t: tt }), s.t)} /></label>
      {/if}
    {:else if part.shape.kind === 'profile'}
      {@const s = part.shape}
      <label class="wide">{t('drawn.profile')}
        <input
          type="text" list="drawn-profile-names" value={s.name} data-testid="drawn-profile-name"
          onchange={(e) => setShape({ name: e.currentTarget.value.trim() })}
        />
      </label>
      <datalist id="drawn-profile-names">
        {#each profileNames as n (n)}<option value={n}></option>{/each}
      </datalist>
    {:else}
      {@const s = part.shape}
      <label class="wide">{t(s.kind === 'polyline' ? 'drawn.centreline' : 'drawn.points')}
        <textarea rows="2" data-testid="drawn-points" onchange={(e) => points(e, s.kind === 'polyline' ? 2 : 3)}>{pointsText(s.points)}</textarea>
      </label>
      {#if s.kind === 'polyline'}
        <label>t<input type="number" value={mm(s.t)} data-testid="drawn-t" onchange={(e) => len(e, (tt) => setShape({ t: tt }), s.t)} /></label>
      {/if}
      {#if pointsProblem}<p class="note">{t('drawn.pointsProblem')}</p>{/if}
    {/if}
  </div>

  <div class="grid">
    <label>y<input type="number" value={mm(part.at[0])} data-testid="drawn-y" onchange={(e) => coord(e, 0)} /></label>
    <label>z<input type="number" value={mm(part.at[1])} data-testid="drawn-z" onchange={(e) => coord(e, 1)} /></label>
    <label>{t('drawn.rotation')}
      <input type="number" step="15" value={part.rotationDeg} data-testid="drawn-rot"
        onchange={(e) => { const v = Number(e.currentTarget.value); if (Number.isFinite(v)) onChange({ ...part, rotationDeg: v }); }} />
    </label>
    <label class="check"><input type="checkbox" checked={!!part.mirror} onchange={(e) => onChange({ ...part, mirror: e.currentTarget.checked || undefined })} />{t('drawn.mirror')}</label>
    <label class="check"><input type="checkbox" checked={!!part.void} data-testid="drawn-void" onchange={(e) => onChange({ ...part, void: e.currentTarget.checked || undefined })} />{t('drawn.hole')}</label>
  </div>

  {#if !part.void}
    <label class="wide">{t('drawn.material')}
      <select
        data-testid="drawn-material"
        value={part.materialId == null || part.materialId === refMaterialId ? '' : String(part.materialId)}
        onchange={(e) => {
          const v = e.currentTarget.value;
          const { materialId: _m, ratio: _r, ...rest } = part;
          onChange(v === '' ? rest : { ...rest, materialId: Number(v) });
        }}
      >
        <option value="">{t('drawn.refMaterial')}</option>
        {#each materials.filter((m) => m.id !== refMaterialId) as m (m.id)}
          <option value={String(m.id)}>{m.name}</option>
        {/each}
      </select>
    </label>
  {/if}

  {#if others.length > 0}
    <div class="row attach">
      <span>{t('drawn.attachTo')}</span>
      <select value={String(targetId)} onchange={(e) => (target = Number(e.currentTarget.value))} data-testid="drawn-attach-target">
        {#each others as o (o.id)}<option value={String(o.id)}>#{o.id} {t(`drawn.shape.${o.shape.kind}`)}</option>{/each}
      </select>
      <select bind:value={side} data-testid="drawn-attach-side">
        {#each ['top', 'bottom', 'left', 'right'] as sd (sd)}<option value={sd}>{t(`drawn.side.${sd}`)}</option>{/each}
      </select>
      <select bind:value={align}>
        {#each ['start', 'centre', 'end'] as al (al)}<option value={al}>{t(`drawn.align.${al}`)}</option>{/each}
      </select>
      <button type="button" data-testid="drawn-attach" disabled={targetId == null} onclick={() => targetId != null && onAttach(targetId, side, align)}>{t('drawn.attach')}</button>
    </div>
  {/if}
</div>

<style>
  .part-editor { display: flex; flex-direction: column; gap: 6px; padding: 6px; border: 1px solid var(--st-hair); border-radius: 4px; }
  .row { display: flex; align-items: center; gap: 6px; font-size: 0.7rem; color: var(--st-text-2); flex-wrap: wrap; }
  .head strong { color: var(--st-text); font-size: 0.72rem; }
  .grow { flex: 1; }
  .grid { display: flex; flex-wrap: wrap; gap: 6px 10px; }
  label { display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--st-text-2); }
  label.wide { width: 100%; }
  label.wide input, label.wide textarea, label.wide select { flex: 1; }
  label.check { gap: 3px; }
  input, select, textarea {
    background: var(--st-bg); color: var(--st-text); border: 1px solid var(--st-surface-3);
    border-radius: 3px; padding: 2px 4px; font-size: 0.7rem;
  }
  input[type='number'] { width: 4.6rem; text-align: right; }
  textarea { font-family: var(--st-mono, monospace); resize: vertical; }
  button { padding: 2px 8px; font-size: 0.68rem; background: transparent; color: var(--st-text-2); border: 1px solid var(--st-hair); border-radius: 3px; cursor: pointer; }
  button:hover:not(:disabled) { color: var(--st-text); border-color: var(--st-interactive); }
  .note { margin: 0; font-size: 0.66rem; color: var(--st-warn); }
</style>
