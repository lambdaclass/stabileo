/**
 * The dictionary entries the public pages read before the application loads: vite.config.ts
 * builds `virtual:public-i18n` from these, and `public-keys.test.ts` holds the pages to them.
 *
 * `tabBar.`: the model and tab stores name the first project when their module is evaluated
 * (`t('tabBar.newStructure')`), and in the production build that happens before the full
 * dictionaries are registered. `full-dictionaries.ts` is App.svelte's first import, but Rollup
 * puts the stores in a shared chunk that the App chunk imports, and a chunk's imports are evaluated
 * before its own body, where the registration landed. With only this subset loaded at that moment,
 * a key outside it comes back from `t()` as the key itself: every fresh Basic and PRO session named
 * its project `tabBar.newStructure` (`e2e/no-raw-i18n-keys.spec.ts`, #719).
 */
export const PUBLIC_KEY_PREFIXES = ['landing.', 'blog.', 'changelog.', 'contact.', 'lang.', 'tabBar.'];
