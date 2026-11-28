import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from 'svelte/compiler';
import { prunePublicBuildBranches } from './prune-public-build-branches.mjs';

const off = { proRcSheets: false, accounts: false, research: false, tools: false, diagramGame: false };
const on = Object.fromEntries(Object.keys(off).map(key => [key, true]));
const cases = [
  ['disabled branch', '{#if __PUBLIC_FEATURES__.research}<p>Research</p>{:else}<p>Main</p>{/if}', off, '<p>Main</p>'],
  ['enabled branch', '{#if __PUBLIC_FEATURES__.research}<p>Research</p>{:else}<p>Main</p>{/if}', on, '<p>Research</p>'],
  ['short circuit excludes unread runtime state', '{#if !__PUBLIC_FEATURES__.accounts || runtime()}<p>Main</p>{/if}', off, '<p>Main</p>'],
  ['runtime calls are preserved', '{#if runtime() || !__PUBLIC_FEATURES__.accounts}<p>Main</p>{/if}', off, '{#if runtime() || !__PUBLIC_FEATURES__.accounts}<p>Main</p>{/if}'],
  ['nested retained branch', '{#if __PUBLIC_FEATURES__.research}<div>{#if __PUBLIC_FEATURES__.tools}<p>Tool</p>{/if}</div>{/if}', on, '<div><p>Tool</p></div>'],
  ['unknown predicate', '{#if __PUBLIC_FEATURES__.research && visible}<p>Research</p>{/if}', on, '{#if __PUBLIC_FEATURES__.research && visible}<p>Research</p>{/if}'],
  ['style inactive without accounts', '<div style:margin-left={__PUBLIC_FEATURES__.accounts && actions ? "auto" : null}></div>', off, '<div ></div>'],
  ['style retains runtime actions', '<div style:margin-left={__PUBLIC_FEATURES__.accounts && actions ? "auto" : null}></div>', on, '<div style:margin-left={__PUBLIC_FEATURES__.accounts && actions ? "auto" : null}></div>'],
  ['inline style keeps its null override', '<div style="margin-left: 2rem" style:margin-left={__PUBLIC_FEATURES__.accounts && actions ? "auto" : null}></div>', off, '<div style="margin-left: 2rem" style:margin-left={__PUBLIC_FEATURES__.accounts && actions ? "auto" : null}></div>'],
  ['spread style keeps its null override', '<div {...attributes} style:margin-left={__PUBLIC_FEATURES__.accounts && actions ? "auto" : null}></div>', off, '<div {...attributes} style:margin-left={__PUBLIC_FEATURES__.accounts && actions ? "auto" : null}></div>'],

];
for (const [name, source, environment, expected] of cases) {
  test(name, () => {
    const { code } = prunePublicBuildBranches(source, environment);
    assert.equal(code, expected);
    assert.doesNotThrow(() => parse(code, { modern: true }));
  });
}

test('else-if chains retain their syntax and runtime decision', () => {
  const source = '{#if __PUBLIC_FEATURES__.research}<p>Research</p>{:else if visible}<p>Visible</p>{:else}<p>Main</p>{/if}';
  assert.equal(prunePublicBuildBranches(source, off).code, source);
});

for (const [file, tags] of [
  ['src/components/pro/ProPanel.svelte', ['ProRcSheetsTab']],
  ['src/App.svelte', ['MohrDialog', 'ResultsDisclaimer', 'UsageNotice', 'TermsUpdateDialog', 'AccountGateDialog', 'FeedbackDialog']],
  ['src/components/account/ProfileDialog.svelte', ['CloudProjectsDialog']],
  ['src/components/toolbar/ToolbarProject.svelte', ['CloudProjectsDialog']],
  ['src/components/pro/ProProjectTab.svelte', ['CloudProjectsDialog']],
]) {
  test(`${file} removes optional application components before compilation`, async () => {
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const [environment, expected] of [[off, false], [on, true]]) {
      const markup = prunePublicBuildBranches(content, environment).code.split('</script>').at(-1);
      for (const tag of tags) assert.equal(markup.includes(`<${tag}`), expected, tag);
    }
  });
}

for (const [file, attribute] of [
  ['src/components/ContactMenu.svelte', 'contact-feedback'],
  ['src/components/toolbar/ToolbarAdvanced.svelte', 'adv-mohr'],
  ['src/components/toolbar/ToolbarConfig.svelte', 'cfg-privacy'],
]) {
  test(`${file} removes disabled feature actions before compilation`, async () => {
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const [environment, expected] of [[off, false], [on, true]]) {
      const markup = prunePublicBuildBranches(content, environment).code.split('</script>').at(-1);
      assert.equal(markup.includes(`data-testid="${attribute}"`), expected);
    }
  });
}

test('removes the component import when its only use was in discarded markup', () => {
  const header = "<script>import Panel from './Panel.svelte';</script>";
  const branch = '{#if __PUBLIC_FEATURES__.proRcSheets}<Panel />{/if}';
  assert.equal(prunePublicBuildBranches(header + branch, off).code, '<script></script>');
  assert.equal(prunePublicBuildBranches(header + branch, on).code, header + '<Panel />');
  assert.equal(prunePublicBuildBranches(header + branch + '<Panel />', off).code, header + '<Panel />');
  const scripted = header.replace('</script>', 'const other = Panel;</script>');
  assert.equal(prunePublicBuildBranches(scripted + branch, off).code, scripted);
  const combined = header.replace('import Panel from', 'import Panel, { initialize } from');
  assert.equal(prunePublicBuildBranches(combined + branch, off).code, combined);
  const sideEffect = "<script>import './Panel.svelte';</script>";
  assert.equal(prunePublicBuildBranches(sideEffect + branch, off).code, sideEffect);
});

test('known wrong result: #1928 the original switches retain the published component module dependency', () => {
  const header = "<script>import Picker from './Picker.svelte';</script>";
  for (const flag of ['research', 'accounts', 'tools', 'globalAxes', 'diagramGame']) {
    const code = header + `{#if __PUBLIC_FEATURES__.${flag}}<Picker />{/if}`;
    assert.equal(prunePublicBuildBranches(code, { ...off, globalAxes: false }).code, header);
  }
  const independent = header + '{#if false && __PUBLIC_FEATURES__.proRcSheets}<Picker />{/if}';
  assert.equal(prunePublicBuildBranches(independent, off).code, header);
});

test('known wrong result: #1928 resolve physical report options before Svelte compiles the released script', () => {
  const wrap = body => '<script>' + body + '</script>';
  const source = wrap("const rows = [first(), ...(__PUBLIC_FEATURES__.proPlatesUnified ? [centres()] : []), last()]; const label = __PUBLIC_FEATURES__.proPlatesUnified ? 'quality' : 'diagnostics';");
  for (const enabled of [false, true]) {
    const output = prunePublicBuildBranches(source, { ...off, proPlatesUnified: enabled }).code;
    const read = code => {
      const ast = parse(code, { modern: true }).instance.content;
      return JSON.stringify(ast.body, (key, value) => ['start', 'end', 'loc', 'raw'].includes(key) ? undefined : value);
    };
    const rows = enabled ? '[first(), ...([centres()]), last()]' : '[first(), last()]';
    assert.equal(read(output), read(wrap('const rows = ' + rows + "; const label = '" + (enabled ? 'quality' : 'diagnostics') + "';")));
  }
});

test('script choices preserve sparse arrays, side effects, comments and local feature bindings', () => {
  const flags = { ...off, proPlatesUnified: false };
  const run = (source, prune) => {
    const input = '<script>' + source + '</script>';
    const code = prune ? prunePublicBuildBranches(input, flags).code : input;
    return Function('__PUBLIC_FEATURES__', code.slice(8, -9) + '\nreturn result;')(flags);
  };
  for (const source of [
    'let n = 0; const items = [n++, ...(__PUBLIC_FEATURES__.proPlatesUnified ? [n++] : []) /* trailing */, n++]; const result = [items, n];',
    'const items = [1,, ...(__PUBLIC_FEATURES__.proPlatesUnified ? [3] : []),,4]; const result = [items.length, Object.keys(items)];',
    'let n = 0; const result = [n++ && __PUBLIC_FEATURES__.proPlatesUnified ? 7 : 9, n];',
    'const local = __PUBLIC_FEATURES__ => __PUBLIC_FEATURES__.proPlatesUnified ? 1 : 2; const result = local({proPlatesUnified: true});',
    'const result = 2 * (__PUBLIC_FEATURES__.proPlatesUnified ? 1 : 2 + 3);',
  ]) assert.deepEqual(run(source, true), run(source, false));
});

test('only remove the optional report namespace when its view and script uses have gone', () => {
  const source = "<script>import * as Panel from './Panel.svelte'; const count = __PUBLIC_FEATURES__.proPlatesUnified ? Panel.count() : 0;</script>{#if __PUBLIC_FEATURES__.proPlatesUnified}<Panel.default />{/if}";
  assert.doesNotMatch(prunePublicBuildBranches(source, { proPlatesUnified: false }).code, /Panel/);
  assert.match(prunePublicBuildBranches(source, { proPlatesUnified: true }).code, /import \* as Panel/);
  const used = source.replace('</script>', ' Panel.initialize();</script>');
  assert.match(prunePublicBuildBranches(used, { proPlatesUnified: false }).code, /import \* as Panel/);
});

test('a similarly named component or comment cannot remove a separate module initialization', () => {
  const header = "<script>import * as Panel from './Panel.svelte';</script>";
  for (const markup of ['<PanelOptions />', '<!-- <Panel.default /> -->']) {
    const input = header + '{#if __PUBLIC_FEATURES__.proRcSheets}' + markup + '{/if}';
    assert.equal(prunePublicBuildBranches(input, off).code, header);
  }
});

test('known wrong result: #1928 a disabled form attribute has the same reactive dependencies as its released markup', () => {
  const source = '<button disabled={__PUBLIC_FEATURES__.proPlatesUnified ? unavailable() : blocked}>Apply</button>';
  for (const [enabled, expression] of [[false, 'blocked'], [true, 'unavailable()']]) {
    const produced = prunePublicBuildBranches(source, { proPlatesUnified: enabled }).code;
    const attribute = parse(produced, { modern: true }).fragment.nodes[0].attributes[0];
    assert.equal(produced.slice(attribute.value.expression.start, attribute.value.expression.end), expression);
  }
  const scoped = '{#each options as __PUBLIC_FEATURES__}' + source + '{/each}';
  assert.equal(prunePublicBuildBranches(scoped, { proPlatesUnified: false }).code, scoped);
});

test.skip('known wrong result: #1928 literal class choices compile as static class attributes', () => {
  const source = '<button class={__PUBLIC_FEATURES__.proRcSheets ? "pk-btn primary" : "pro-btn"}></button>';
  assert.equal(prunePublicBuildBranches(source, off).code, '<button class="pro-btn"></button>');
  assert.equal(prunePublicBuildBranches(source, on).code, '<button class="pk-btn primary"></button>');
  for (const content of ['<button class={runtime ? "a" : "b"}></button>', '<button class="prefix {runtime}"></button>']) {
    assert.equal(prunePublicBuildBranches(content, off).code, content);
  }
});

test.skip('known wrong result: #1928 inactive solve progress has no compiled effect dependencies', () => {
  const contents = '<script>function run() { if (__PUBLIC_FEATURES__.proPlatesUnified) { untrack(progress); } done(); }</script>';
  assert.doesNotMatch(prunePublicBuildBranches(contents, { ...off, proPlatesUnified: false }).code, /untrack/);
  assert.match(prunePublicBuildBranches(contents, { ...on, proPlatesUnified: true }).code, /untrack\(progress\)/);
});
