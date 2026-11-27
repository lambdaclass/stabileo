<script lang="ts">
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

<div class="pi" data-testid="project-info">
  <div class="pi-grid">
    <label>{t('projectInfo.client')} <input value={info.client ?? ''} onchange={(e) => write({ client: e.currentTarget.value })} data-testid="pi-client" /></label>
    <label>{t('projectInfo.job')} <input value={info.job ?? ''} onchange={(e) => write({ job: e.currentTarget.value })} data-testid="pi-job" /></label>
    <label>{t('projectInfo.jobNumber')} <input value={info.jobNumber ?? ''} onchange={(e) => write({ jobNumber: e.currentTarget.value })} data-testid="pi-job-number" /></label>
    <label>{t('projectInfo.site')} <input value={info.site ?? ''} onchange={(e) => write({ site: e.currentTarget.value })} data-testid="pi-site" /></label>
  </div>
  <h5 class="pi-sub">{t('projectInfo.people')}</h5>
  <div class="pi-people">
    {#each ROLES as r (r)}
      <div class="pi-row" data-testid="pi-{r}">
        <span class="pi-role">{t(`projectInfo.role.${r}`)}</span>
        <input class="pi-grow" placeholder={t('projectInfo.name')} value={info[r]?.name ?? ''} onchange={(e) => setPerson(r, { name: e.currentTarget.value })} data-testid="pi-{r}-name" />
        <input class="pi-date" type="date" value={info[r]?.date ?? ''} onchange={(e) => setPerson(r, { date: e.currentTarget.value })} disabled={!info[r]?.name} aria-label={t('projectInfo.date')} data-testid="pi-{r}-date" />
      </div>
    {/each}
  </div>
  <h5 class="pi-sub">{t('projectInfo.revisions')}</h5>
  {#each revisions as rev, i (i)}
    <div class="pi-row" data-testid="pi-revision">
      <input class="pi-code" value={rev.code} onchange={(e) => setRevision(i, { code: e.currentTarget.value })} aria-label={t('projectInfo.revisionCode')} />
      <input class="pi-date" type="date" value={rev.date} onchange={(e) => setRevision(i, { date: e.currentTarget.value })} aria-label={t('projectInfo.date')} />
      <input class="pi-grow" placeholder={t('projectInfo.revisionNote')} value={rev.note ?? ''} onchange={(e) => setRevision(i, { note: e.currentTarget.value })} />
      <button class="pi-btn pi-x" onclick={() => write({ revisions: revisions.filter((_, k) => k !== i) })} aria-label={t('projectInfo.removeRevision')}>×</button>
    </div>
  {/each}
  <button class="pi-btn pi-add" onclick={addRevision} data-testid="pi-add-revision">+ {t('projectInfo.addRevision')}</button>
  <p class="pi-hint">{revisions.length ? tp('projectInfo.current', { code: revisions[revisions.length - 1]!.code, date: revisions[revisions.length - 1]!.date }) : t('projectInfo.hint')}</p>
</div>

<style>
  .pi { display: flex; flex-direction: column; gap: 6px; }
  .pi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px 12px; }
  .pi-grid label { display: flex; flex-direction: column; gap: 4px; font-size: 0.72rem; color: var(--st-text-2); }
  .pi input {
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font: inherit;
    font-size: 0.78rem;
    color-scheme: dark;
  }
  .pi input:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 1px; }
  .pi input:disabled { opacity: 0.45; }
  .pi-sub {
    margin: 12px 0 2px;
    font-family: var(--st-mono);
    font-size: 0.62rem;
    font-weight: 400;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }
  .pi-people { display: flex; flex-direction: column; gap: 6px; }
  .pi-row { display: flex; gap: 6px; align-items: center; }
  .pi-role { flex: 0 0 96px; font-size: 0.74rem; color: var(--st-text-2); }
  .pi-grow { flex: 1; }
  .pi-date { flex: 0 0 138px; }
  .pi-code { flex: 0 0 48px; text-align: center; }
  .pi-btn {
    height: 30px;
    padding: 0 10px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.76rem;
    cursor: pointer;
  }
  .pi-btn:hover { background: var(--st-surface-3); color: var(--st-text); }
  .pi-x { flex: none; width: 30px; padding: 0; }
  .pi-add { align-self: flex-start; }
  .pi-hint { margin: 4px 0 0; font-size: 0.7rem; color: var(--st-text-3); }
  @media (max-width: 600px) {
    .pi-role { flex-basis: 72px; }
    .pi-date { flex-basis: 120px; }
  }
</style>
