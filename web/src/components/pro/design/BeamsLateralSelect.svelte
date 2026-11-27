<script lang="ts">
  import { t } from '../../../lib/i18n';
  import { setBeamsLateral } from '../../../lib/store/lateral-system';
  let { value }: { value: string } = $props();
</script>

<select {value} onchange={(e) => { const v = e.currentTarget.value; setBeamsLateral(v === 'lateral' || v === 'gravity' ? v : null); }} data-testid="design-data-lateral-beams">
  <option value="">{t('lateral.option.undeclared')}</option>
  <option value="lateral">{t('lateral.option.lateral')}</option>
  <option value="gravity">{t('lateral.option.gravity')}</option>
</select>
