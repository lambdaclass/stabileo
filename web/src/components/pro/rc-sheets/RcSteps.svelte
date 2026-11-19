<script lang="ts">
  import { t, i18n } from '../../../lib/i18n';
  import { decimalFor } from '../../../lib/rc-sheets/format';
  import { localizeDecimals } from '../../../lib/rc-sheets/view-helpers';
  import type { StepGroup } from '../../../lib/rc-sheets/types';
  import { localizeCriterion } from '../../../lib/rc-sheets/criteria';

  let { groups }: { groups: StepGroup[] } = $props();
  const comma = $derived(decimalFor(i18n.locale) === ',');
  const num = (s: string | undefined) => localizeDecimals(localizeCriterion(s, t), comma);
</script>

<div class="rcs-steps" data-testid="rc-steps">
  {#each groups as g, i (i)}
    <section>
      <h5>{t(g.title)}</h5>
      <ol>
        {#each g.steps as s, i (i)}
          {@const fx = num(s.formula)}
          {@const val = num(s.value)}
          <li class:bad={s.ok === false} class:good={s.ok === true} class:note={!fx && !val} data-testid="rc-step">
            <span class="lab">{t(s.label)}</span>
            {#if fx || val}
              <span class="body">
                {#if fx}<span class="fx">{fx}</span>{/if}
                {#if val}<span class="val">{val}</span>{/if}
              </span>
            {/if}
            <span class="st">{s.ok === true ? '✓' : s.ok === false ? '✗' : ''}</span>
          </li>
        {/each}
      </ol>
    </section>
  {/each}
</div>

<style>
  .rcs-steps { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); gap: 10px; min-width: 0; }
  section { min-width: 0; border: 1px solid var(--st-hair); border-radius: var(--st-radius-lg, 6px); background: var(--st-surface-2); padding: 6px 8px; overflow: hidden; }
  h5 { margin: 0 0 4px; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--st-text-2); }
  ol { list-style: none; margin: 0; padding: 0; font-size: 0.72rem; }
  li { display: grid; grid-template-columns: minmax(9em, 32%) minmax(0, 1fr) 1.2em; gap: 2px 8px; padding: 3px 2px; border-top: 1px solid var(--st-hair); color: var(--st-text); }
  li:first-child { border-top: none; }
  li.note { grid-template-columns: minmax(0, 1fr) 1.2em; }
  .lab { min-width: 0; color: var(--st-text-2); overflow-wrap: break-word; hyphens: auto; }
  .body { min-width: 0; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 2px 10px; }
  .fx { flex: 1 1 14em; min-width: 0; font-family: var(--st-mono); color: var(--st-text-2); overflow-wrap: anywhere; }
  .val { flex: 0 1 auto; min-width: 0; margin-left: auto; font-family: var(--st-mono); text-align: right; overflow-wrap: anywhere; }
  .st { text-align: center; font-weight: 700; }
  li.good .st { color: var(--st-ok); }
  li.bad .st, li.bad .val { color: var(--st-danger); }
</style>
