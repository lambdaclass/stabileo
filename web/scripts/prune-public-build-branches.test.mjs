import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from 'svelte/compiler';
import { prunePublicBuildBranches } from './prune-public-build-branches.mjs';

const off = { VITE_ACCOUNTS: '0', VITE_RESEARCH: '0', VITE_TOOLS: '0', VITE_DIAGRAM_GAME: '0' };
const on = Object.fromEntries(Object.keys(off).map(key => [key, '1']));
const cases = [
  ['disabled branch', '{#if import.meta.env.VITE_RESEARCH === "1"}<p>Research</p>{:else}<p>Main</p>{/if}', off, '<p>Main</p>'],
  ['enabled branch', '{#if import.meta.env.VITE_RESEARCH === "1"}<p>Research</p>{:else}<p>Main</p>{/if}', on, '<p>Research</p>'],
  ['unspecified accounts capability', '{#if import.meta.env.VITE_ACCOUNTS !== "0"}<p>Accounts</p>{/if}', {}, '<p>Accounts</p>'],
  ['short circuit excludes unread runtime state', '{#if import.meta.env.VITE_ACCOUNTS === "0" || runtime()}<p>Main</p>{/if}', off, '<p>Main</p>'],
  ['runtime calls are preserved', '{#if runtime() || import.meta.env.VITE_ACCOUNTS === "0"}<p>Main</p>{/if}', off, '{#if runtime() || import.meta.env.VITE_ACCOUNTS === "0"}<p>Main</p>{/if}'],
  ['nested retained branch', '{#if import.meta.env.VITE_RESEARCH === "1"}<div>{#if import.meta.env.VITE_TOOLS === "1"}<p>Tool</p>{/if}</div>{/if}', on, '<div><p>Tool</p></div>'],
  ['unknown predicate', '{#if import.meta.env.VITE_RESEARCH === "1" && visible}<p>Research</p>{/if}', on, '{#if import.meta.env.VITE_RESEARCH === "1" && visible}<p>Research</p>{/if}'],
  ['missing switch defaults off', '{#if import.meta.env.VITE_RESEARCH === "1"}<p>Research</p>{/if}', {}, ''],
  ['style inactive without accounts', '<div style:margin-left={import.meta.env.VITE_ACCOUNTS !== "0" && actions ? "auto" : null}></div>', off, '<div ></div>'],
  ['style retains runtime actions', '<div style:margin-left={import.meta.env.VITE_ACCOUNTS !== "0" && actions ? "auto" : null}></div>', on, '<div style:margin-left={import.meta.env.VITE_ACCOUNTS !== "0" && actions ? "auto" : null}></div>'],
  ['inline style keeps its null override', '<div style="margin-left: 2rem" style:margin-left={import.meta.env.VITE_ACCOUNTS !== "0" && actions ? "auto" : null}></div>', off, '<div style="margin-left: 2rem" style:margin-left={import.meta.env.VITE_ACCOUNTS !== "0" && actions ? "auto" : null}></div>'],
  ['spread style keeps its null override', '<div {...attributes} style:margin-left={import.meta.env.VITE_ACCOUNTS !== "0" && actions ? "auto" : null}></div>', off, '<div {...attributes} style:margin-left={import.meta.env.VITE_ACCOUNTS !== "0" && actions ? "auto" : null}></div>'],

];
for (const [name, source, environment, expected] of cases) {
  test(name, () => {
    const { code } = prunePublicBuildBranches(source, environment);
    assert.equal(code, expected);
    assert.doesNotThrow(() => parse(code, { modern: true }));
  });
}

test('else-if chains retain their syntax and runtime decision', () => {
  const source = '{#if import.meta.env.VITE_RESEARCH === "1"}<p>Research</p>{:else if visible}<p>Visible</p>{:else}<p>Main</p>{/if}';
  assert.equal(prunePublicBuildBranches(source, off).code, source);
});
