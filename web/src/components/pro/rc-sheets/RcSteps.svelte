<script lang="ts">
  import { t, i18n } from '../../../lib/i18n';
  import { decimalFor } from '../../../lib/rc-sheets/format';
  import type { StepGroup } from '../../../lib/rc-sheets/types';

  let { groups }: { groups: StepGroup[] } = $props();
  const comma = $derived(decimalFor(i18n.locale) === ',');
  const num = (s: string | undefined) => (s && comma ? s.replace(/(?<![\d.§])(\d+)\.(\d+)(?![\d.])/g, '$1,$2') : s ?? '');
</script>

<div class="rcs-steps" data-testid="rc-steps">
  {#each groups as g (g.title)}
    <section>
      <h5>{t(g.title)}</h5>
      <table>
        <tbody>
          {#each g.steps as s, i (i)}
            <tr class:bad={s.ok === false} class:good={s.ok === true}>
              <td class="lab">{t(s.label)}</td>
              <td class="fx">{num(s.formula)}</td>
              <td class="val">{s.value}</td>
              <td class="st">{s.ok === true ? '✓' : s.ok === false ? '✗' : ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/each}
</div>

<style>
  .rcs-steps { display: grid; grid-template-columns: repeat(auto-fill, minmax(520px, 1fr)); gap: 10px; }
  section { border: 1px solid var(--st-hair); border-radius: var(--st-radius-lg, 6px); background: var(--st-surface-2); padding: 6px 8px; }
  h5 { margin: 0 0 4px; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--st-text-2); }
  table { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
  td { padding: 2px 4px; vertical-align: top; border-top: 1px solid var(--st-hair); color: var(--st-text); }
  tr:first-child td { border-top: none; }
  .lab { color: var(--st-text-2); width: 26%; }
  .fx { min-width: 14em; font-family: var(--st-mono); color: var(--st-text-2); }
  .val { font-family: var(--st-mono); white-space: nowrap; text-align: right; }
  .st { width: 1.2em; text-align: center; font-weight: 700; }
  tr.good .st { color: var(--st-ok); }
  tr.bad .st, tr.bad .val { color: var(--st-danger); }
</style>
