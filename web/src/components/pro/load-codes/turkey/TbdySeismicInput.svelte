<script lang="ts">
  import { t, tp } from '../../../../lib/i18n';
  import type { CodeInputProps } from '../registry';
  import Hint from '../../Hint.svelte';
  import { DEFAULT_TBDY, type MassUse, type SoilClass, type TbdyInput } from '../../../../lib/codes/turkey/inputs';
  import { designClass, designSpectrum, IMPORTANCE, SYSTEMS } from '../../../../lib/codes/turkey/tbdy-spectrum';

  let { value, onchange }: CodeInputProps<TbdyInput> = $props();

  const v = $derived({ ...DEFAULT_TBDY, ...(value ?? {}) });
  const set = (patch: Partial<TbdyInput>) => onchange({ ...(value ?? {}), ...patch });
  const num = (e: Event): number | undefined => {
    const s = (e.currentTarget as HTMLInputElement).value.trim().replace(',', '.');
    const n = Number(s);
    return s === '' || !Number.isFinite(n) ? undefined : n;
  };
  const dirs = $derived(v.directions ?? { x: true, y: true });
  const SOILS: SoilClass[] = ['ZA', 'ZB', 'ZC', 'ZD', 'ZE', 'ZF'];
  const USES: MassUse[] = ['residential', 'assembly', 'storage'];
  const ready = $derived(v.ss !== undefined && v.ss > 0 && v.s1 !== undefined && v.s1 > 0);
  const preview = $derived(ready && v.soil !== 'ZF' ? designSpectrum(v.soil as Exclude<SoilClass, 'ZF'>, v.ss!, v.s1!) : null);
</script>

<div class="al-sub" data-testid="tr-seismic-input">
  <span class="al-sub-title">{t('loads.tr.seismic.siteTitle')}</span>
  <div class="al-grid">
    <label class="al-field"><span class="al-label">S<sub>S</sub></span>
      <input type="number" min="0" step="0.01" value={v.ss ?? ''} oninput={(e) => set({ ss: num(e) })} data-testid="tr-ss" /></label>
    <label class="al-field"><span class="al-label">S<sub>1</sub></span>
      <input type="number" min="0" step="0.01" value={v.s1 ?? ''} oninput={(e) => set({ s1: num(e) })} data-testid="tr-s1" /></label>
    <label class="al-field"><span class="al-label">{t('loads.tr.seismic.soil')}</span>
      <select value={v.soil} onchange={(e) => set({ soil: e.currentTarget.value as SoilClass })} data-testid="tr-soil">
        {#each SOILS as s (s)}<option value={s}>{s}</option>{/each}
      </select></label>
    <label class="al-field"><span class="al-label">{t('loads.tr.seismic.bks')}</span>
      <select value={v.bks} onchange={(e) => set({ bks: Number(e.currentTarget.value) as 1 | 2 | 3 })} data-testid="tr-bks">
        {#each [1, 2, 3] as b (b)}<option value={b}>{`BKS ${b} · I = ${IMPORTANCE[b as 1 | 2 | 3]} · ${t(`loads.tr.seismic.bks${b}`)}`}</option>{/each}
      </select></label>
  </div>
  <Hint text={t('loads.tr.seismic.tdthHint')} />
  {#if !ready}<p class="pk-warn" data-testid="tr-seismic-missing">{t('loads.tr.seismic.blocked.spectrum')}</p>{/if}
  {#if v.soil === 'ZF'}<p class="pk-warn">{t('loads.tr.seismic.blocked.zf')}</p>{/if}
  {#if preview}
    <p class="pk-hint" data-testid="tr-seismic-preview">{tp('loads.tr.seismic.preview', {
      fs: preview.fs.toFixed(2), f1: preview.f1.toFixed(2), sds: preview.sds.toFixed(3), sd1: preview.sd1.toFixed(3),
      ta: preview.ta.toFixed(3), tb: preview.tb.toFixed(3), dts: designClass(preview.sds, v.bks) })}</p>
  {/if}
</div>

<div class="al-sub">
  <span class="al-sub-title">{t('loads.tr.seismic.systemTitle')}</span>
  <div class="al-grid">
    <label class="al-field al-field-wide"><span class="al-label">{t('loads.tr.seismic.system')}</span>
      <select value={v.system} onchange={(e) => set({ system: e.currentTarget.value })} data-testid="tr-system">
        {#each SYSTEMS as s (s.key)}<option value={s.key}>{s.key} · R = {s.r}, D = {s.d} · {t(`loads.tr.system.${s.key}`)}</option>{/each}
      </select></label>
    <label class="al-field al-field-wide"><span class="al-label">{t('loads.tr.seismic.systemY')}</span>
      <select value={v.systemY ?? ''} onchange={(e) => set({ systemY: e.currentTarget.value || undefined })} data-testid="tr-system-y">
        <option value="">{t('loads.tr.seismic.sameSystem')}</option>
        {#each SYSTEMS as s (s.key)}<option value={s.key}>{s.key} · R = {s.r}, D = {s.d}</option>{/each}
      </select></label>
    <label class="al-field"><span class="al-label">{t('loads.tr.seismic.tp')}</span>
      <input type="number" min="0" step="0.01" value={v.tp ?? ''} oninput={(e) => set({ tp: num(e) })} data-testid="tr-tp" /></label>
    <label class="al-field"><span class="al-label">C<sub>t</sub></span>
      <input type="number" min="0" step="0.005" value={v.ct ?? ''} placeholder={t('loads.tr.seismic.fromSystem')} oninput={(e) => set({ ct: num(e) })} data-testid="tr-ct" /></label>
    <label class="al-field"><span class="al-label">η<sub>bi</sub></span>
      <input type="number" min="1" step="0.05" value={v.etaBi ?? ''} oninput={(e) => set({ etaBi: num(e) })} data-testid="tr-eta" /></label>
    <label class="al-field"><span class="al-label">{t('loads.tr.seismic.massUse')}</span>
      <select value={v.massUse ?? ''} onchange={(e) => set({ massUse: (e.currentTarget.value || undefined) as MassUse | undefined })} data-testid="tr-mass-use">
        <option value="">{t('loads.tr.seismic.fromOccupancy')}</option>
        {#each USES as u (u)}<option value={u}>{t(`loads.tr.seismic.use.${u}`)}</option>{/each}
      </select></label>
  </div>
  <Hint text={t('loads.tr.seismic.periodHint')} />
  <label class="pk-check"><input type="checkbox" checked={v.regular} onchange={(e) => set({ regular: e.currentTarget.checked })} data-testid="tr-regular" />{t('loads.tr.seismic.regular')}</label>
  <label class="pk-check"><input type="checkbox" checked={v.eccentricity} onchange={(e) => set({ eccentricity: e.currentTarget.checked })} data-testid="tr-ecc" />{t('loads.tr.seismic.eccentricity')}</label>
  <label class="pk-check"><input type="checkbox" checked={v.orthogonal} onchange={(e) => set({ orthogonal: e.currentTarget.checked })} data-testid="tr-ortho" />{t('loads.tr.seismic.orthogonal')}</label>
  <div class="pk-row">
    <span class="pk-label">{t('loads.tr.directions')}</span>
    <label class="pk-check"><input type="checkbox" checked={dirs.x} onchange={(e) => set({ directions: { ...dirs, x: e.currentTarget.checked } })} data-testid="tr-seismic-x" />X</label>
    <label class="pk-check"><input type="checkbox" checked={dirs.y} onchange={(e) => set({ directions: { ...dirs, y: e.currentTarget.checked } })} data-testid="tr-seismic-y" />Y</label>
  </div>
</div>
