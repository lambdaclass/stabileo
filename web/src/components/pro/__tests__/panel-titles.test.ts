import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const panel = readFileSync(join(process.cwd(), 'src/components/pro/ProPanel.svelte'), 'utf8');
const stages = readFileSync(join(process.cwd(), 'src/lib/pro/stages.ts'), 'utf8');

describe('the PRO panel says where it is', () => {
  it('has a title for every panel a ribbon command opens, never the fallback "Nodes"', () => {
    const map = /const TAB_TITLE: Record<string, string> = \{([\s\S]*?)\n  \};/.exec(panel)?.[1] ?? '';
    const titled = new Set([...map.matchAll(/\b([a-zA-Z]+): '/g)].map((m) => m[1]!));
    const opened = new Set([...stages.matchAll(/tab: '([a-zA-Z]+)'/g)].map((m) => m[1]!));
    expect([...opened].filter((tab) => !titled.has(tab))).toEqual([]);
  });
});
