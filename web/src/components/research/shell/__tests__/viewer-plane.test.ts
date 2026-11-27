import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const research = fileURLToPath(new URL('../..', import.meta.url));

function svelteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : svelteFiles(path);
    return entry.name.endsWith('.svelte') ? [path] : [];
  });
}

const usages = svelteFiles(research)
  .filter((file) => !file.endsWith('shell/StabileoViewer.svelte'))
  .flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/<(StabileoViewer|ScalarFieldViewer)\b([\s\S]*?)\/>/g)].map((m) => ({
    file: relative(research, file),
    plane: m[2].match(/\bplane=(?:"([^"]*)"|\{([^}]*)\})/)?.slice(1).find((v) => v !== undefined)?.trim() ?? null,
  })));

const expected: Record<string, string[]> = {
  'andreassen2011/TopoptPage.svelte': ['elevation'],
  'biggins2026/BigginsPage.svelte': ['elevation'],
  'cqc1981/CqcPage.svelte': ['elevation'],
  'dadeppo1975/ArchPage.svelte': ['elevation'],
  'fairclough2026/FaircloughPage.svelte': ["plan ? 'plan' : 'elevation'"],
  'feher2026/ShapePage.svelte': ['elevation'],
  'ferrari2025/FerrariPage.svelte': ['elevation'],
  'gayNeto2014/RiserPage.svelte': ['elevation', 'elevation'],
  'grossman2026/SpringsPage.svelte': ['elevation'],
  'heyman1966/ArchPage.svelte': ['elevation'],
  'vella2024/VellaPage.svelte': ['elevation'],
  'lee1968/LeePage.svelte': ['elevation'],
  'macneal1985/MacnealPage.svelte': ["current.dimension === 2 ? 'elevation' : 'plan'"],
  'mattiasson1981/MattiassonPage.svelte': ['elevation'],
  'navier1823/NavierPage.svelte': ['plan'],
  'newmark1959/NewmarkPage.svelte': ['elevation'],
  'pastrana2026/FormPage.svelte': ['elevation'],
  'plastic-collapse/PlasticPage.svelte': ['elevation'],
  'riksCrisfield/RiksCrisfieldPage.svelte': ['elevation'],
  'shauer2025/ShauerPage.svelte': ['elevation'],
  'shell1985/ShellPage.svelte': ['elevation'],
};

it('every research viewer declares the plane its paper draws the model in', () => {
  const undeclared = usages.filter((u) => u.plane === null).map((u) => u.file);
  expect(undeclared).toEqual([]);
  for (const u of usages) {
    if (!/[?:]/.test(u.plane!)) expect(['plan', 'elevation'], u.file).toContain(u.plane);
  }
});

it('keeps the audited plane of each paper, and a new viewer must be audited here', () => {
  const declared: Record<string, string[]> = {};
  for (const u of usages) (declared[u.file] ??= []).push(u.plane!);
  expect(declared).toEqual(expected);
});

it('the research shell passes the plane through and types it as required', () => {
  const shell = readFileSync(join(research, 'shell/StabileoViewer.svelte'), 'utf8');
  expect(shell).toMatch(/\bplane: ScalarFieldPlane;/);
  expect(shell).not.toMatch(/\bplane\?: /);
  expect(shell).toMatch(/\.\.\.props, plane \}/);
});
