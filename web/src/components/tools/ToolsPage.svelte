<script lang="ts">
  import './register-i18n';
  import { details, detailKey } from './load-detail';
  import LandingFooter from '../landing/LandingFooter.svelte';
  import RelatedLinks from '../research/RelatedLinks.svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import ToolPreview from './ToolPreview.svelte';
  import { publicI18n } from '../../lib/i18n/store.svelte';
  import { applyPageMeta, restorePageMeta, stabileoSoftware, stabileoCalculator, breadcrumbs, WEBSITE_ID } from '../../lib/page-meta';
  import { publicUrl } from '../../lib/i18n/public-routes';
  import { tBatch as t } from './batch-i18n';
  import { TOOLS, TOPICS, findTool, toolsIn } from './registry';
  import '../landing/landing.css';
  import '../blog/blog.css';
  import '../research/research.css';
  import './tools.css';

  let { path }: { path: string } = $props();
  const tool = $derived(findTool(path));
  const Detail = $derived(tool ? details.get(detailKey(tool)) : undefined);
  const title = $derived(t(tool ? `tools.${tool.id}` : 'tools.index'));
  const others = $derived(TOOLS.filter(other => other.id !== tool?.id));
  const has = (key: string) => t(key) !== key;
  $effect(() => {
    const locale = publicI18n.locale;
    if (tool) {
      const route = `/tools/${tool.id}`, url = publicUrl(route, locale);
      const subtitle = t(`tools.${tool.id}.subtitle`);
      const description = (tool.kind === 'calculator' || tool.kind === 'batch') ? `${subtitle} ${t('tools.free')}` : subtitle;
      const heading = has(`tools.${tool.id}.case`) ? `${title}: ${t(`tools.${tool.id}.case`)}` : title;
      applyPageMeta({ title: `${heading} — Stabileo`, description, locale, path: route,
        graph: [
          stabileoCalculator(locale, { '@id': `${url}#calculator`, name: title, description, url }),
          stabileoSoftware(locale),
          breadcrumbs(locale, [['Stabileo', '/'], [t('tools.index'), '/tools'], [title, route]]),
        ] });
    } else {
      const url = publicUrl('/tools', locale), description = t('tools.index.description');
      applyPageMeta({ title: `${t('tools.index.metaTitle')} — Stabileo`, description, locale, path: '/tools',
        graph: [
          { '@type': 'CollectionPage', '@id': url, url, name: title, description, inLanguage: locale, isPartOf: { '@id': WEBSITE_ID }, mainEntity: { '@id': `${url}#calculators` } },
          { '@type': 'ItemList', '@id': `${url}#calculators`, itemListElement: TOOLS.map((entry, i) => ({ '@type': 'ListItem', position: i + 1, name: t(`tools.${entry.id}`), url: publicUrl(`/tools/${entry.id}`, locale) })) },
          breadcrumbs(locale, [['Stabileo', '/'], [title, '/tools']]),
        ] });
    }
    return () => restorePageMeta();
  });
</script>

<div class="landing blog research tools">
  <main class="sec sec--ink">
    <div class="wrap tools-wrap" class:gallery={!tool}>
    {#if tool}
      {#key tool.id}{#if Detail}<Detail id={tool.id} />{/if}{/key}
      <nav class="tool-others" aria-labelledby="tool-others-h">
        <h2 id="tool-others-h">{t('tools.index')}</h2>
        <ul>{#each others as other (other.id)}<li><PublicLink to={`/tools/${other.id}`}>{t(`tools.${other.id}`)}</PublicLink></li>{/each}</ul>
      </nav>
    {:else}
      <header class="index-head"><h1>{title}</h1><p class="lead">{t('tools.lead')}</p></header>
      {#each TOPICS as topic (topic)}
        {@const list = toolsIn(topic)}
        {#if list.length}
          <section class="topic" data-topic={topic} aria-labelledby={`topic-${topic}`}>
            <h2 id={`topic-${topic}`}>{t(`tools.topic.${topic}`)}</h2>
            <p class="topic-lead">{t(`tools.topic.${topic}.lead`)}</p>
            <ul class="tool-cards">
              {#each list as entry (entry.id)}
                <li class="tool-card" data-testid={`card-${entry.id}`}>
                  <PublicLink to={`/tools/${entry.id}`} class="preview" aria-label={t(`tools.${entry.id}`)}><ToolPreview id={entry.id} /></PublicLink>
                  <div class="card-body">
                    <h3><PublicLink to={`/tools/${entry.id}`}>{t(`tools.${entry.id}`)}</PublicLink></h3>
                    <p>{t(`tools.${entry.id}.subtitle`)}</p>
                  </div>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      {/each}
      <p class="fine">{t('tools.indexAssumptions')}</p>
    {/if}
    </div>
  </main>
  <RelatedLinks {path} />
  <LandingFooter />
</div>

<style>
  .index-head { max-width: 52rem; margin-bottom: 1.5rem; }
  .index-head h1 { font-size: clamp(2rem, 4.5vw, 3rem); margin-top: .5rem; }
  .topic { margin: 2.5rem 0 0; }
  .topic h2 { font: 600 clamp(1.375rem, 2.5vw, 1.75rem)/1.2 var(--lp-display); margin: 0 0 .35rem; }
  .topic-lead { color: var(--fg-2); max-width: 52rem; margin: 0 0 1rem; }
  .tool-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); gap: 1rem; list-style: none; padding: 0; margin: 0; }
  .tool-card { display: grid; grid-template-rows: auto 1fr; background: var(--card); border: 1px solid var(--card-hair); border-radius: 6px; overflow: hidden; }
  .tool-card :global(.preview) { display: grid; place-items: center; background: var(--lp-ink-2); aspect-ratio: 5 / 2; padding: .5rem; }
  .tool-card :global(.preview svg) { max-height: 100%; }
  .card-body { padding: .9rem 1rem 1rem; }
  .card-body h3 { font: 500 1.125rem/1.25 var(--lp-display); margin: 0 0 .35rem; }
  .card-body h3 :global(a) { display: inline-flex; align-items: center; min-height: 44px; text-decoration: none; }
  .card-body p { font-size: .9375rem; color: var(--fg-2); margin: 0; }
  .fine { margin-top: 2.5rem; }
</style>
