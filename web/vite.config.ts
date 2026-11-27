import { featureDefines, featuresForMode, unitFeatureProfile, type BuildFeatures } from './config/public-features.mjs';
import { defineConfig, searchForWorkspaceRoot, type Plugin, type UserConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { copyFileSync, cpSync, existsSync, readFileSync } from 'fs';
import { execSync, execFileSync } from 'child_process';
import { resolve } from 'path';
import { PUBLIC_KEY_PREFIXES } from './src/lib/i18n/public-prefixes';
import { mesherLabels } from './src/lib/i18n/locales/mesher-labels';
import { loadedPreloads } from './scripts/loaded-preloads';
import { buildPublicLocales } from './src/lib/i18n/offered-research';
import { resultChangeMetadataPlugin } from './scripts/result-change-metadata.mjs';
import { prunePublicBuildBranches } from './scripts/prune-public-build-branches.mjs';
import { researchLocaleBuildPlugin } from './scripts/research-locale-build.mjs';
import { sharedSwitchOnUnitFiles, switchOnUnitFiles } from './scripts/switch-on-unit.mjs';
import { blogTranslations } from './scripts/blog-translations';

/**
 * Stub out the WASM glue module when it hasn't been built yet.
 * This lets CI run `npm run build` without `wasm-pack build` first.
 */
function wasmStubPlugin(): Plugin {
  const wasmGlue = resolve(__dirname, 'src/lib/wasm/dedaliano_engine.js');
  return {
    name: 'wasm-stub',
    resolveId(id) {
      if (id.includes('wasm/dedaliano_engine') && id.endsWith('.js') && !existsSync(wasmGlue)) {
        return '\0wasm-stub';
      }
    },
    load(id) {
      if (id === '\0wasm-stub') {
        return 'export function initSync() {} export function solve_3d() { return "{}"; }';
      }
    },
  };
}

/**
 * `virtual:public-i18n`: the dictionaries' entries the public pages read (`landing.*`, `blog.*`, `lang.*`,
 * `contact.*`). The landing and the blog load these instead of the whole dictionaries (3 MB of
 * source, most of the public bundle); the application registers the rest when it loads
 * (`lib/i18n/full-dictionaries.ts`, from `virtual:app-i18n`, the entries that are not public).
 * English is bundled; every other language is its own chunk (`loaders`, awaited by
 * `ensurePublicLocale` before a page renders in it), except under Vitest, which gets them all
 * bundled. The entries are copied line by line, which `union-merge-safe.test.ts` keeps possible:
 * one entry per line.
 */
function publicBuildSwitchesPlugin(featureConfig: unknown) {
  let features: BuildFeatures;
  let e2e = false;
  let testing = false;
  const plugin: Plugin = {
    name: 'public-build-switches',
    config(_config, { mode, command }) {
      testing = !!process.env.VITEST && command === 'serve';
      const profile = testing ? unitFeatureProfile()
        : command === 'build' && process.env.VITE_E2E === '1' ? process.env.STABILEO_E2E_PROFILE || mode
        : mode;
      features = featuresForMode(profile, featureConfig);
      const define = featureDefines(features, command === 'build');
      if (testing) return { environments: { client: { define } } };
      if (command === 'build' && mode === 'production' && process.env.STABILEO_ROUTE_BUDGET_LEGACY === '1') {
        define['import.meta.env.VITE_RESEARCH'] = JSON.stringify(features.research ? '1' : '0');
        define['import.meta.env.VITE_TOOLS'] = JSON.stringify(features.tools ? '1' : '0');
      }
      return { define };
    },
    resolveId: {
      order: 'pre',
      handler(id, importer) {
        if (features.proRcSheets && (id === './rc-sheet-readers' || id === './rc-sheets-documents') && importer?.startsWith(resolve(__dirname, 'src/lib/store') + '/')) {
          return resolve(__dirname, 'src/lib/store/active-' + id.slice(2) + '.ts');
        }
      },
    },
    configResolved(config) {
      e2e = config.env.VITE_E2E === '1';
    },
    generateBundle() {
      if (e2e) this.emitFile({ type: 'asset', fileName: 'e2e-features.json', source: JSON.stringify(features) });
    },
  };
  return { plugin, features: () => features, testing: () => testing };
}

function publicI18nPlugin(features: () => BuildFeatures, eager: () => boolean): Plugin {
  const id = 'virtual:public-i18n';
  const app = 'virtual:app-i18n';
  const mesher = 'virtual:mesher-i18n';
  const locales = () => buildPublicLocales(features().research);
  const offered = (code: string) => locales().some(locale => locale === code);
  const entries = (loc: string, dictionary: 'public' | 'app' | 'mesher', watch: (file: string) => void) => {
    const file = resolve(__dirname, 'src/lib/i18n/locales', `${loc}.ts`);
    watch(file);
    const pruneEntries = !eager();
    const { accounts, diagramGame, proPlatesUnified, proRcSheets, tools } = features();
    const entryKey = (line: string) => /^\s*(['"])([^'"]+)\1: /.exec(line)?.[2];
    const translatedMesherLabels = mesherLabels[loc] ?? {};
    const lines = readFileSync(file, 'utf8').split('\n').filter((line) => {
      const key = entryKey(line);
      if (!key || Object.hasOwn(translatedMesherLabels, key)) return false;
      if (proPlatesUnified && key.startsWith('mesher.')) return dictionary === 'mesher';
      if (dictionary === 'mesher') return false;
      const publicAccountEntry = /^(?:legal\.|landing\.foot(?:Terms|Privacy|AdCookies)$)/.test(key);
      if (pruneEntries) {
        if (proPlatesUnified && /^plates\.(?:qualityCell|planTotal|meshSummary)$/.test(key)) return false;
        if (!proPlatesUnified) {
          if (/^plates\.(?:firstSide|drawingLabel|qualityGood|qualityPoor|qualityHint|planTotalOnly|localLoadsWarnOne|keptNodesNoteOne|remeshNote(?:One|Some|All))$/.test(key)) return false;
          if (/^plates\.(?:state\.|summary\.|(?:meshHeading|filterKind|kindAll|kindSlabs|kindWalls|filterLevel|allLevels|nSelectedOf|selectAll|scopePlates|scopeElements|elementsNote|header)$)/.test(key)) return false;
          if (/^building\.(?:walls\.mesh(?:AtSolve|Now)Hint|slabs\.(?:withMesh|clearMesh|cleared))$/.test(key)) return false;
          if (/^plates\.(?:openSpec(?:Element|Many)?|fromLevel|onItsElements|areaLoadHintWall)$/.test(key) || key === 'pro.curvedShellAuto' || key === 'surface.summaryFolded') return false;
          if (key.startsWith('diag.reviewSummary')) return false;
          if (/^autoLoad\.(?:occupancy|roof\.(?:occupancyOf|maintenanceCode|occupancyCode)|fromTableLoCode|live\.(?:partitionTitleCode|partitionOnCode|partitionValueCode|partitionChoice|reductionTitleCode)|applyLiveReductionCode|reductionElementCode|patterns(?:Code|NoRef|HintCode)|dead\.codeHint)$/.test(key)) return false;
          if (key === 'file.workspaceNoticeClose') return false;
          if (/^loads\.(asce7|ec|tr)\./.test(key)) return false;
          if (/^ex\.pro-rc-(house|four-storey|steel-columns|lift-core|party-wall)(\.|$)/.test(key)) return false;
          if (/^pro\.(examples\.(loading\.|group(Rc|Steel)Buildings$)|tag(Core|Stair)$|stats\.plates$)/.test(key)) return false;
          if (key === 'ex.pro-steel-building-slabs.generatedDesc') return false;
          if (key === 'physical.automaticExplain' || key === 'desk.prep.automaticExistingHint' || key === 'pro.physical.diag.review' || key === 'physical.diag.review' || key === 'physical.pending' || key === 'physical.pendingReview') return false;
          if (/^designData\.(?:executionControl|slabBars|diametersHint)$/.test(key)) return false;
          if (/^autoLoad\.(?:family(?:Hint|Name\..+)?|noFamilySeismic)$/.test(key)) return false;
          if (key.startsWith('centres.') || key === 'pro.elementQualityTitle') return false;
          if (key.startsWith('solveProgress.')) return false;
          if (key === 'plates.openInLoads' || /^floorLoad\.(?:pickedPlates|addedPlates|plateDefault)$/.test(key)) return false;
          if (/^plates\.progress(?:Planning|Meshing|Title|TitleAnalysis|Undo)$/.test(key)) return false;
          if (key.startsWith('notices.') || /^containment\.(?:restore|dismissHintPro|dismissHintBasic|toDiagnostics|dismiss)$/.test(key)) return false;
          if (key === 'quickEdit.meshPlate' || /^combos\.rules\.(seed|none)Code$/.test(key)) return false;
          if (key === 'drawBar.circle' || /^plates\.(circle|shape|shapeProblem|meshShort|unified)\./.test(key)) return false;
          if (/^plates\.meshState(?:WillMesh|Missing|AsCame|Ready|Kept)$/.test(key)) return false;
        }
        if (!proRcSheets) {
          if (/^(?:footing\.ui\.(?:inSheets|openSheets)|memo\.rc\.(?:line|notAdopted|supportTop))$/.test(key)) return false;
          if (key === 'spec.section.placement' || key.startsWith('rcSheets.')) return false;
          if (/^designData\.(alt|crit|criteria|deflectionSupports|flange|opt)\./.test(key)) return false;
          if (/^designData\.(?:seismic\.|presumedBearing|foundingElevation|deflection(?:Months|Sustained|Creep|Always)|minTieSpacing|maxAggregate)/.test(key)) return false;
          if (/^designData\.(?:analysis|detailing|seismicSection|alternatives|criteria|foundations|foundingAuto|propertyLinesHint|deflectionSupports|solveAgain|assignedSolve|concreteKeep|slabBaseNone)$/.test(key)) return false;
        }
        if (!ADMIN && key.startsWith('admin.')) return false;
        if (!tools && /^(?:advanced\.mohr$|advHelp\.mohr\.|stress\.openMohr$)/.test(key)) return false;
        if (!ADMIN && !accounts) {
          if (key.startsWith('disclaimer.') && key !== 'disclaimer.report') return false;
          if (publicAccountEntry || /^(?:account\.|cloud\.|feedbackForm\.|usage\.)/.test(key)) return false;
        }
        if (!diagramGame && key === 'landing.navGame') return false;
      }
      const publicEntry = PUBLIC_KEY_PREFIXES.some(prefix => key.startsWith(prefix)) && (!publicAccountEntry || accounts);
      return publicEntry === (dictionary === 'public');
    });
    if (dictionary === (proPlatesUnified ? 'mesher' : 'app')) {
      lines.push(...Object.entries(translatedMesherLabels).map(([key, value]) => JSON.stringify(key) + ': ' + JSON.stringify(value) + ','));
    }
    if (dictionary === 'app') {
      const resources = ['load-basis', 'reinforcement-results', 'model-diagnostics'].map(group => {
        const messages = resolve(__dirname, 'src/lib/i18n/locales', group, `${loc}.ts`);
        watch(messages);
        return readFileSync(messages, 'utf8').split('\n').filter(entryKey);
      });
      const resourceKeys = new Set(resources.flat().map(entryKey));
      const baseLines = lines.filter(line => !resourceKeys.has(entryKey(line)));
      return `{\n${[...resources.map(messages => `...{\n${messages.join('\n')}\n},`), ...baseLines].join('\n')}\n}`;
    }
    return `{\n${lines.join('\n')}\n}`;
  };
  return {
    name: 'public-i18n',
    resolveId(s) {
      return s === mesher || [id, app].some((v) => s === v || s.startsWith(`${v}/`)) ? '\0' + s : null;
    },
    load(resolved) {
      const watch = (f: string) => this.addWatchFile(f);
      if (resolved === '\0' + mesher && features().proPlatesUnified) {
        const dictionaries = locales().map(loc => `${loc}: ${entries(loc, 'mesher', watch)}`);
        return `export default {${dictionaries.join(',')}};\n`;
      }
      if (resolved.startsWith(`\0${id}/`)) return `export default ${entries(resolved.slice(id.length + 2), 'public', watch)};\n`;
      if (resolved === `\0${app}` || resolved.startsWith(`\0${app}/`)) {
        const locale = resolved.slice(app.length + 2);
        return (locale ? [locale] : ['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu', 'zh'])
          .map((loc) => `export const ${loc} = ${offered(loc) ? entries(loc, 'app', watch) : '{}'};\n`).join('');
      }
      if (resolved !== '\0' + id) return null;
      let out = '';
      const lazy: string[] = [];
      for (const loc of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu', 'zh']) {
        if (!offered(loc) || (!eager() && loc !== 'en')) {
          out += `export const ${loc} = {};\n`;
          if (offered(loc)) lazy.push(`${loc}: () => import(${JSON.stringify(`${id}/${loc}`)})`);
          continue;
        }
        out += `export const ${loc} = ${entries(loc, 'public', watch)};\n`;
      }
      return out + `export const loaders = {${lazy.join(', ')}};\n`;
    },
  };
}

/** Not Vitest's business: dependencies, build output, and Playwright's own specs. */
// `.stryker-tmp` holds Stryker's sandbox copies of the tests (without the gitignored WASM build):
// collected here, a mutation run in progress made every engine test fail.
// determinism/ is a Playwright suite of its own (determinism/playwright.config.ts).
// scripts/*.test.mjs are node:test suites (the Research workflow runs them with node --test).
const NOT_VITEST = ['**/node_modules/**', '**/dist/**', 'e2e/**', 'determinism/**', '**/.stryker-tmp/**', 'scripts/**/*.test.mjs'];

const EXCLUDED_SWITCH_ON_UNIT_TESTS = process.env.STABILEO_UNIT_PROFILE === 'production' ? switchOnUnitFiles : [];
const INCLUDED_SWITCH_ON_UNIT_TESTS = [...switchOnUnitFiles, ...sharedSwitchOnUnitFiles];

/**
 * Tests that shell out to a real build or another project script, plus timing budgets
 * that need the runner to themselves.
 *
 * These run in their own SERIAL pass rather than inside the general pool — see
 * `scripts/test-all.mjs` for the measurements behind that. Listed explicitly rather than
 * matched by a naming convention so that adding one is a deliberate act: a build test that
 * lands in the general pool by accident is how the whole suite started exiting 1 with
 * `[vitest-worker]: Timeout calling "onTaskUpdate"` while every assertion passed.
 *
 * `harness-architecture.test.ts` fails if a test spawns a build without being listed here.
 */
/**
 * The results snapshot gate (#716): the reference corpus solved through the app's path and
 * compared with `results-snapshots/`. Its own pass and its own CI job (`Results Snapshot`), so a
 * result change is reported as one, by name, rather than as a unit failure among hundreds.
 */
const RESULTS_SNAPSHOT_TESTS = ['src/lib/results-snapshot/__tests__/**'];

const PRODUCTION_BUILD_TESTS = [
  'src/lib/provenance/__tests__/numbered-stamps.test.ts',
  'src/lib/utils/__tests__/benchmark-build.test.ts',
  'src/lib/provenance/__tests__/notice-bundle.test.ts',
  // Wall-clock budgets must not compete with the parallel unit workers. Keep the full
  // 5,000-member fixture and thresholds; run it in the serial pass, including in CI.
  'src/lib/engine/__tests__/scale-budget.test.ts',
  'src/lib/utils/__tests__/e2e-hook-gating.test.ts',
  'src/lib/utils/__tests__/shared-build.test.ts',
  // Runs `scripts/typecheck.mjs` itself, to prove the gate cannot report a green it has not
  // earned. It spawns a Node process rather than a vite build, but it is the same reason for
  // being here: a process-spawning test does not belong in the parallel pool.
  'src/lib/engine/__tests__/typecheck-gate.test.ts',
  // Runs `scripts/third-party-notices.mjs` in check mode, and that script runs
  // `npm ls --omit=dev --all`, which walks the whole dependency tree. Same reason again: it
  // spawns, so it belongs here rather than competing with 300 other files for a worker.
  'src/lib/export/__tests__/third-party-notices.test.ts',
  // Spawns a real `vite build` to prove the production bundle carries nothing that only
  // exists on a development machine. It reads a build it made itself rather than a
  // checked-out dist/, precisely so it cannot skip itself into a green.
  // NOTE: no apostrophes or quotes in these comments — `configArray` in
  // harness-architecture.test.ts harvests every quoted run inside this array.
  'src/lib/utils/__tests__/no-dev-assets-in-build.test.ts',
  // Spawns a vite build AND a prerender pass, then checks that every URL the sitemap
  // publishes is a file the host serves rather than an address it redirects. It builds
  // its own for the same reason as the one above: reading a checked-out dist/ let it
  // skip itself into a green on any machine where nobody had built.
  'src/lib/i18n/__tests__/published-urls-resolve.test.ts',
  'src/lib/utils/__tests__/prerender-reproducible.test.ts',
];


const ADMIN = process.env.VITE_APP_TYPE === 'admin';

const ADMIN_PUBLIC_ASSETS = ['fonts', 'favicon.svg'];

function adminPublicAssetsPlugin(): Plugin {
  return {
    name: 'admin-public-assets',
    apply: 'build',
    config: () => ({ publicDir: false }),
    closeBundle() {
      for (const asset of ADMIN_PUBLIC_ASSETS) {
        const from = resolve(__dirname, 'public', asset);
        const to = resolve(__dirname, 'dist-admin', asset);
        if (asset.includes('.')) copyFileSync(from, to);
        else cpSync(from, to, { recursive: true });
      }
    },
  };
}

/** This checkout's instance (`INST`, else the `.stabileo-inst` that `make inst.claim` writes); every dev port shifts by `INST * 10`. */
function instance(): number {
  let raw = process.env.INST;
  if (raw === undefined) {
    try {
      raw = readFileSync(resolve(__dirname, '../.stabileo-inst'), 'utf8');
    } catch {
      raw = '0';
    }
  }
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

const INST = instance();
const DEV_API_URL = process.env.VITE_API_URL || `http://localhost:${4100 + INST * 10}`;

const ADMIN_CLIENT_ROUTES = ['/', '/metrics', '/projects', '/feedback', '/audit-log', '/settings', '/allowlist', '/oauth/callback'];

function adminRootPlugin(): Plugin {
  const rewrite = (req: { url?: string }) => {
    if (!req.url) return;
    const cut = req.url.indexOf('?');
    const path = cut === -1 ? req.url : req.url.slice(0, cut);
    const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path;
    if (ADMIN_CLIENT_ROUTES.includes(normalized)) req.url = `/admin.html${cut === -1 ? '' : req.url.slice(cut)}`;
  };
  return {
    name: 'admin-root',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req);
        next();
      });
    },
  };
}

function previewAuthConfigPlugin(): Plugin {
  const body = JSON.stringify({ user_login_enabled: false, terms_version: null, usage_telemetry_enabled: false, cloud_projects_enabled: false, save_requires_account: false, google_login: false });
  return {
    name: 'preview-auth-config',
    configurePreviewServer(server) {
      server.middlewares.use('/api/v1/auth/config', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(body);
      });
    },
  };
}

/** The commit this bundle is built from, for the project workbook's cover (`lib/build-info.ts`). */
function buildCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

/** The app version: the status bar, the what's-new notice (`lib/build-info.ts`) and result
 * provenance (`lib/provenance/build-identity.ts`). */
function appVersion(): string {
  return JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version;
}

const researchManifest = resolve(__dirname, 'public/research-wasm/build.json');
const researchBuildId = existsSync(researchManifest) ? JSON.parse(readFileSync(researchManifest, 'utf8')).build_id : 'unavailable';
if (researchBuildId !== 'unavailable') {
  const actual = execFileSync('python3', [resolve(__dirname, '../research/tools/asset_identity.py'), resolve(__dirname, '..'), resolve(__dirname, 'public/research-wasm/shauer-2025')], { encoding: 'utf8' }).trim();
  if (actual !== researchBuildId) throw new Error('Research assets are stale: run make research.wasm');
}

const preloads = loadedPreloads();

export function createWebConfig(featureConfig?: unknown): UserConfig {
  const switches = publicBuildSwitchesPlugin(featureConfig);
  return {
    ...baseConfig,
    plugins: [
      switches.plugin,
      researchLocaleBuildPlugin(switches.features),
      preloads.plugin,
      wasmStubPlugin(),
      publicI18nPlugin(switches.features, switches.testing),
      resultChangeMetadataPlugin(),
      svelte({ preprocess: { markup: ({ content }) => switches.testing() ? { code: content } : prunePublicBuildBranches(content, switches.features()) } }),
      ...(ADMIN ? [adminRootPlugin(), adminPublicAssetsPlugin()] : [previewAuthConfigPlugin()]),
    ],
  };
}

const baseConfig = defineConfig({
  define: {
    "import.meta.env.RESEARCH_BUILD_ID": JSON.stringify(researchBuildId),
    __STABILEO_COMMIT__: JSON.stringify(buildCommit()),
    __STABILEO_VERSION__: JSON.stringify(appVersion()),
    __STABILEO_APP_VERSION__: JSON.stringify(appVersion()),
    __STABILEO_DEV_API_URL__: JSON.stringify(DEV_API_URL),
    __BLOG_TRANSLATIONS__: JSON.stringify(blogTranslations(__dirname)),
  },
  base: process.env.BASE_PATH || '/',
  server: {
    port: (ADMIN ? 4001 : 4000) + INST * 10,
    // The /research pages import the catalog and reference results from ../research.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), resolve(__dirname, '../research')] },
  },
  worker: {
    format: 'es',
    plugins: () => [wasmStubPlugin()],
  },
  build: ADMIN
    ? {
        target: 'esnext',
        outDir: 'dist-admin',
        rollupOptions: { input: { admin: resolve(__dirname, 'admin.html') } },
      }
    : {
        target: 'esnext',
        modulePreload: { resolveDependencies: preloads.resolveDependencies },
      },
  optimizeDeps: {
    exclude: ['dedaliano-engine', 'web-ifc'],
  },
  test: {
    // Playwright owns `e2e/`. Vitest would otherwise try to collect those specs and
    // fail on `test.describe()` from a different runner.
    exclude: NOT_VITEST,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          setupFiles: ['./vitest.setup.ts'],
          // Everything except the production-build tests, which get their own pass.
          exclude: [...NOT_VITEST, ...PRODUCTION_BUILD_TESTS, ...RESULTS_SNAPSHOT_TESTS, ...EXCLUDED_SWITCH_ON_UNIT_TESTS],
          ...(process.env.STABILEO_UNIT_PROFILE === 'test' ? { include: INCLUDED_SWITCH_ON_UNIT_TESTS } : {}),
          // THREADS, NOT FORKS — and this is the line that fixed the RPC timeout.
          //
          // `onTaskUpdate` is the worker → coordinator RPC, and birpc gives it a SIXTY
          // second budget. Losing it does not mean a slow test; it means the coordinator
          // was not scheduled for a full minute. With `forks` the coordinator is a
          // separate process, so every ack needs the OS to schedule a process that is
          // competing with its own CPU-bound children (measured: coordinator 25.8 % CPU
          // while seven workers held 44–68 % each). With `threads` the workers are
          // worker_threads inside the coordinator's own process, so the ack is an
          // in-process postMessage and cannot be starved out by the workers it is waiting
          // on.
          //
          // Measured back to back on 8 cores with 6 unrelated CPU hogs running:
          //   forks    exit 1  73.07 s  216 files passed + Timeout calling "onTaskUpdate"
          //   threads  exit 0  82.82 s  216 files passed, zero RPC errors
          //
          // ~13 % slower under that load, and it is the difference between a green suite
          // and a suite that throws away a correct result.
          pool: 'threads',
          /*
           * Fifteen seconds, not five.
           *
           * The default was never chosen with these tests in mind. The CIRSOC
           * sweeps bisect over a 400-point interaction curve at every point of
           * a dense moment or steel range, and the slowest lands at 4.95 s on
           * an idle machine — inside the default by fifty milliseconds. Under
           * any load at all it goes over, and vitest reports a timeout the
           * same way it reports a failed assertion: as a broken invariant,
           * with the test's own message attached. That sent me looking for a
           * shared-state bug in a module that reads no state.
           *
           * Raised rather than thinning the sweeps. The density is the point —
           * the defects they catch are a few kN·m wide, and the dead band
           * that shipped was five.
           */
          testTimeout: 15_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'build',
          setupFiles: ['./vitest.setup.ts'],
          include: PRODUCTION_BUILD_TESTS,
          // Forks here on purpose: this test shells out to real builds, and a child
          // process tree belongs to a process, not to a thread of the coordinator.
          pool: 'forks',
          // One at a time, and nothing else alongside them. A `vite build` is itself a
          // parallel rollup/esbuild job: it does not occupy one worker slot, it occupies
          // the machine. Measured at 58.9 s of a 60.3 s run — it set the wall-clock floor
          // for the whole suite by itself, and it peaked at 1.75 GB RSS / 78 % CPU.
          // Vitest 3 reads fileParallelism and maxWorkers from the root config only, so inside a project they are ignored.
          poolOptions: { forks: { singleFork: true } },
          // Every file here spawns a process; on a hosted runner `npm ls --all` alone took 64 s.
          testTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'results',
          setupFiles: ['./vitest.setup.ts'],
          include: RESULTS_SNAPSHOT_TESTS,
          // One file per corpus group, each on its own worker; the cases of a group in order,
          // since they share the app's stores.
          pool: 'threads',
          testTimeout: 180_000,
        },
      },
    ],
  },
});

export default createWebConfig();
