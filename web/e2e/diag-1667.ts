import { writeFileSync, mkdirSync } from 'node:fs';
type Page = import('@playwright/test').Page;

const CATEGORIES = [
  'devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'v8.execute', 'blink.user_timing',
  'disabled-by-default-v8.gc', 'v8.gc', 'blink_gc', 'disabled-by-default-v8.cpu_profiler', 'toplevel',
  'disabled-by-default-devtools.timeline.frame', 'gpu', 'blink',
];

export async function diagStart(page: Page): Promise<void> {
  await page.context().browser()!.startTracing(page, { categories: CATEGORIES });
}

interface Ev { name: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: any; cat?: string }

export async function diagStop(page: Page, label: string): Promise<void> {
  const buf = await page.context().browser()!.stopTracing();
  mkdirSync('e2e/.artifacts/diag', { recursive: true });
  writeFileSync(`e2e/.artifacts/diag/${label}.json`, buf);
  const events: Ev[] = (JSON.parse(buf.toString()).traceEvents ?? JSON.parse(buf.toString()));
  const marks = events.filter((e) => e.name?.startsWith('stabileo:3d:'));
  const click = marks.find((e) => e.name === 'stabileo:3d:click');
  if (!click) { console.log(`[diag ${label}] no click mark`); return; }
  const pid = click.pid;
  const names = events.filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.pid === pid);
  const main = names.find((e) => e.args?.name === 'CrRendererMain')?.tid ?? click.tid;
  const t0 = click.ts;
  const rel = (ts: number) => ((ts - t0) / 1000).toFixed(0);
  const out: string[] = [];
  out.push(`[diag ${label}] marks: ${marks.filter((m) => m.pid === pid).map((m) => `${m.name.slice(12)}@${rel(m.ts)}`).join(' ')}`);
  const mainEvs = events.filter((e) => e.pid === pid && e.tid === main && e.ph === 'X' && (e.dur ?? 0) >= 40_000);
  const end = events.reduce((m, e) => (e.pid === pid && e.ts > m ? e.ts : m), 0);
  for (const e of mainEvs.sort((a, b) => a.ts - b.ts)) {
    const d = e.args?.data ?? e.args?.beginData ?? {};
    const fn = d.functionName ? ` fn=${d.functionName}` : '';
    const url = d.url ? ` ${String(d.url).split('/').pop()}:${d.lineNumber ?? ''}` : '';
    const extra = e.name.includes('GC') || e.name.includes('Gc') ? ` ${JSON.stringify(e.args ?? {}).slice(0, 160)}` : '';
    out.push(`  ${rel(e.ts).padStart(7)} +${((e.dur ?? 0) / 1000).toFixed(0).padStart(6)} ${e.name}${fn}${url}${extra}`);
  }
  const gc = events.filter((e) => e.pid === pid && e.ph === 'X' && /^(MajorGC|MinorGC|V8\.GC_MARK_COMPACTOR|V8\.GCFinalizeMC|V8\.GCScavenger|BlinkGC\.AtomicPhase|V8\.GC_MC_BACKGROUND|CppGC.*)$/.test(e.name));
  const sum = new Map<string, [number, number, number]>();
  for (const e of gc) {
    const k = `${e.name}@${e.tid === main ? 'main' : 'bg'}`;
    const s = sum.get(k) ?? [0, 0, 0];
    s[0] += 1; s[1] += (e.dur ?? 0) / 1000; s[2] = Math.max(s[2], (e.dur ?? 0) / 1000);
    sum.set(k, s);
  }
  for (const [k, [n, tot, mx]] of sum) out.push(`  GC ${k}: n=${n} total=${tot.toFixed(0)}ms max=${mx.toFixed(0)}ms`);
  out.push(`  trace end @${rel(end)}`);

  const geomMark = marks.find((m) => m.pid === pid && m.name === 'stabileo:3d:geometry');
  const windows: Array<[string, number, number]> = [['open', t0, geomMark?.ts ?? t0 + 10e6]];
  if (geomMark) windows.push(['after-geometry', geomMark.ts, end]);
  const chunks = events.filter((e) => e.pid === pid && (e.name === 'Profile' || e.name === 'ProfileChunk'));
  const nodes = new Map<number, any>();
  let profileTs = 0;
  const samples: Array<[number, number]> = [];
  for (const c of chunks) {
    if (c.name === 'Profile') { profileTs = c.args?.data?.startTime ?? c.ts; continue; }
    const cp = c.args?.data?.cpuProfile ?? {};
    for (const n of cp.nodes ?? []) nodes.set(n.id, n);
    const deltas: number[] = c.args?.data?.timeDeltas ?? [];
    (cp.samples ?? []).forEach((s: number, i: number) => { profileTs += deltas[i] ?? 0; samples.push([profileTs, s]); });
  }
  for (const [wname, a, b] of windows) {
    const self = new Map<string, number>();
    const incl = new Map<string, number>();
    let prev: [number, number] | null = null;
    for (const s of samples) {
      if (prev && prev[0] >= a && prev[0] < b) {
        const dt = (s[0] - prev[0]) / 1000;
        const n = nodes.get(prev[1]);
        const f = n?.callFrame ?? {};
        const key = `${f.functionName || '(anon)'} ${String(f.url ?? '').split('/').pop()}:${f.lineNumber ?? ''}`;
        self.set(key, (self.get(key) ?? 0) + dt);
        const seen = new Set<string>();
        let cur = n;
        while (cur) {
          const cf = cur.callFrame ?? {};
          const k = `${cf.functionName || '(anon)'} ${String(cf.url ?? '').split('/').pop()}:${cf.lineNumber ?? ''}`;
          if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + dt); }
          cur = cur.parent !== undefined ? nodes.get(cur.parent) : undefined;
        }
      }
      prev = s;
    }
    out.push(`  [${wname}] self top:`);
    for (const [k, v] of [...self].sort((x, y) => y[1] - x[1]).slice(0, 25)) out.push(`    ${v.toFixed(0).padStart(6)} ${k}`);
    out.push(`  [${wname}] inclusive top:`);
    for (const [k, v] of [...incl].sort((x, y) => y[1] - x[1]).slice(0, 40)) out.push(`    ${v.toFixed(0).padStart(6)} ${k}`);
  }
  console.log(out.join('\n'));
}
