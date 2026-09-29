<script lang="ts">
  import { proNav } from '../../lib/store/pro-nav.svelte';
  /**
   * The project's data (`model/project-info.ts`): client, job, site, revisions with dates, and who
   * designed, checked and approved it. Saved with the project; the report's cover prints it.
   */
  import { modelStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { cleanProjectInfo, type ProjectInfo, type ProjectRevision, type Signatory } from '../../lib/model/project-info';

  const info = $derived<ProjectInfo>(modelStore.projectInfo ?? {});
  const today = () => new Date().toISOString().slice(0, 10);

  function write(patch: Partial<ProjectInfo>) { modelStore.setProjectInfo(cleanProjectInfo({ ...info, ...patch }) ?? null); }
  function setPerson(role: 'designer' | 'checker' | 'approver', patch: Partial<Signatory>) {
    write({ [role]: { name: '', ...info[role], ...patch } });
  }
  const revisions = $derived(info.revisions ?? []);
  function addRevision() {
    const last = revisions[revisions.length - 1]?.code;
    const code = last && /^\d+$/.test(last) ? String(Number(last) + 1) : last && /^[A-Y]$/.test(last) ? String.fromCharCode(last.charCodeAt(0) + 1) : revisions.length === 0 ? 'A' : `${revisions.length + 1}`;
    write({ revisions: [...revisions, { code, date: today() }] });
  }
  function setRevision(i: number, patch: Partial<ProjectRevision>) { write({ revisions: revisions.map((r, k) => (k === i ? { ...r, ...patch } : r)) }); }
  const ROLES = ['designer', 'checker', 'approver'] as const;
</script>

<details class="pi" data-testid="project-info" bind:open={proNav.projectInfoOpen}>
  <summary class="pp-heading">{t('projectInfo.title')}{#if info.job} · {info.job}{/if}</summary>
  <div class="pi-grid">
    <label>{t('projectInfo.client')} <input value={info.client ?? ''} onchange={(e) => write({ client: e.currentTarget.value })} data-testid="pi-client" /></label>
    <label>{t('projectInfo.job')} <input value={info.job ?? ''} onchange={(e) => write({ job: e.currentTarget.value })} data-testid="pi-job" /></label>
    <label>{t('projectInfo.jobNumber')} <input value={info.jobNumber ?? ''} onchange={(e) => write({ jobNumber: e.currentTarget.value })} data-testid="pi-job-number" /></label>
    <label>{t('projectInfo.site')} <input value={info.site ?? ''} onchange={(e) => write({ site: e.currentTarget.value })} data-testid="pi-site" /></label>
  </div>
  <h5 class="pi-sub">{t('projectInfo.people')}</h5>
  {#each ROLES as r (r)}
    <div class="pi-row" data-testid="pi-{r}">
      <span class="pi-role">{t(`projectInfo.role.${r}`)}</span>
      <input placeholder={t('projectInfo.name')} value={info[r]?.name ?? ''} onchange={(e) => setPerson(r, { name: e.currentTarget.value })} data-testid="pi-{r}-name" />
      <input type="date" value={info[r]?.date ?? ''} onchange={(e) => setPerson(r, { date: e.currentTarget.value })} disabled={!info[r]?.name} data-testid="pi-{r}-date" />
    </div>
  {/each}
  <h5 class="pi-sub">{t('projectInfo.revisions')}</h5>
  {#each revisions as rev, i (i)}
    <div class="pi-row" data-testid="pi-revision">
      <input class="pi-code" value={rev.code} onchange={(e) => setRevision(i, { code: e.currentTarget.value })} aria-label={t('projectInfo.revisionCode')} />
      <input type="date" value={rev.date} onchange={(e) => setRevision(i, { date: e.currentTarget.value })} aria-label={t('projectInfo.date')} />
      <input class="pi-note" placeholder={t('projectInfo.revisionNote')} value={rev.note ?? ''} onchange={(e) => setRevision(i, { note: e.currentTarget.value })} />
      <button class="pp-btn pi-x" onclick={() => write({ revisions: revisions.filter((_, k) => k !== i) })} aria-label={t('projectInfo.removeRevision')}>×</button>
    </div>
  {/each}
  <button class="pp-btn" onclick={addRevision} data-testid="pi-add-revision">+ {t('projectInfo.addRevision')}</button>
  <p class="pi-hint">{revisions.length ? tp('projectInfo.current', { code: revisions[revisions.length - 1]!.code, date: revisions[revisions.length - 1]!.date }) : t('projectInfo.hint')}</p>
</details>

<style>
  .pi summary { cursor: pointer; }
  .pi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; margin: 6px 0; font-size: 0.66rem; }
  .pi-grid label { display: flex; flex-direction: column; gap: 2px; color: var(--st-text-2); }
  .pi-sub { margin: 8px 0 4px; font-size: 0.66rem; color: var(--st-text-2); }
  .pi-row { display: flex; gap: 4px; align-items: center; margin: 3px 0; font-size: 0.66rem; }
  .pi-role { width: 80px; color: var(--st-text-2); }
  .pi-code { width: 40px; }
  .pi-note { flex: 1; min-width: 0; }
  .pi-x { padding: 0 6px; }
  .pi-hint { margin: 4px 0 0; font-size: 0.6rem; color: var(--st-text-3); }
</style>
