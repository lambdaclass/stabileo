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

test.skip('known wrong result: #1928 the original switches retain the published component module dependency', () => {
  const header = "<script>import Picker from './Picker.svelte';</script>";
  for (const flag of ['research', 'accounts', 'tools', 'globalAxes', 'diagramGame']) {
    const code = header + `{#if __PUBLIC_FEATURES__.${flag}}<Picker />{/if}`;
    assert.equal(prunePublicBuildBranches(code, { ...off, globalAxes: false }).code, header);
  }
  const independent = header + '{#if false && __PUBLIC_FEATURES__.proRcSheets}<Picker />{/if}';
  assert.equal(prunePublicBuildBranches(independent, off).code, header);
});
