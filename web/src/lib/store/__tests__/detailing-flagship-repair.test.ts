/**
 * The repair ladder on the 408-member frame (`rc-design-frame`), designed with "design all" (which
 * also details): no bar it moves leaves its section or gives up lever arm, and every clash it
 * could not separate is on record with its cause.
 *
 * Before the ladder was bounded by the section (`repair-envelope.ts`), this run left 28 beam bars
 * outside their section — the support mats of e381, e385, e389 and e393 lifted 46 mm into
 * 43 mm of room, the top mat of e397/e398 pushed 77 mm sideways — each reported as
 * `detailing.cover.violated` and its clash counted as resolved.
 *
 * The section is recomputed here from the members' own numbers, independently of the envelope.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { designRunStore } from '../design-run.svelte';
import { detailingStore } from '../detailing.svelte';
import { verificationStore } from '../verification.svelte';
import { initSolver } from '../../engine/wasm-solver';
import { resultsStore } from '../results.svelte';
import { solveCombinations3D, validateAndSolve3D } from '../../engine/solver-service';
import { samplePath, type BarPath } from '../../codes/cirsoc201/bar-geometry';
import { memoriaInput } from '../memoria-inputs';
import { projectIfcInput } from '../ifc-export';
import { designSheets } from '../design-exchange';

beforeAll(async () => { await initSolver(); });

describe('the flagship: the repair ladder bounded by the section', () => {
  beforeAll(async () => {
    await modelStore.loadExample('rc-design-frame');
    uiStore.analysisMode = 'pro';
    const combo: any = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, true, false);
    resultsStore.setResults3D(validateAndSolve3D(modelStore.model as never, true, false) as never);
    resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
    // The whole frame, whatever the machine: the user's 20 s cap (`DEFAULT_RUN_MS`) stops the run
    // on a slower runner with members not designed, and the assertions below are about all of them.
    // The engine's tests on this frame give `runDesign` the same 180 s.
    designRunStore.designAll({ maxRunMs: 180_000 });
    const summary = verificationStore.runSummary;
    if (!summary || summary.aborted || summary.notReached > 0) throw new Error(`design all left the frame incomplete: aborted ${summary?.aborted}, not reached ${summary?.notReached}`);
  }, 600_000);

  it('no bar outside its section, none moved inward, and every clash the ladder left is reported with its cause', () => {
    const run = detailingStore.lastRun!;
    expect(run, 'design all ran the detailing').toBeTruthy();
    const nodes = modelStore.nodes as unknown as Map<number, { x: number; y: number; z?: number }>;
    const elements = modelStore.elements as unknown as Map<number, { nodeI: number; nodeJ: number }>;
    const contexts = verificationStore.contexts;

    // ── 1. The run-middle cover guard reports nothing ──
    const cover = run.assemblies.flatMap((a) => a.unsupported.filter((u) => u.key === 'detailing.cover.violated'));
    expect(cover.map((u) => u.params?.bar)).toEqual([]);

    // ── 2. Every bar the ladder moved: inside its beam, hooks included, and not toward mid-depth ──
    const bars = new Map<string, BarPath>(run.assemblies.flatMap((a) => a.bars.map((b) => [b.id, b] as [string, BarPath])));
    let moved = 0;
    const offenders: string[] = [];
    for (const c of run.coordination) for (const { id, offset } of c.repair.moved) {
      moved++;
      const bar = bars.get(id)!;
      for (const owner of bar.ownerElementIds) {
        const ctx = contexts.get(owner);
        const el = elements.get(owner);
        if (!ctx || !el || ctx.elementType !== 'beam') continue;
        const a = nodes.get(el.nodeI)!, b = nodes.get(el.nodeJ)!;
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
        // Measured from the stirrup the member is detailed with, the design's: the project's
        // default read a bar seated on a Ø6 stirrup 1,4 mm past its cover (e391, e379: moved
        // across by the ladder, its height untouched, and only then measured).
        const designed = verificationStore.outcomeFor(owner)?.accepted?.regions;
        const stirrup = Math.max(designed?.stirrupsSupport?.diameter ?? 0, designed?.stirrupsSpan?.diameter ?? 0) || ctx.material.stirrupDia;
        const room = (half: number) => half - ctx.material.cover - stirrup / 1000 - bar.diameterMm / 2000;
        for (const p of samplePath(bar, 0.005)) {
          const s = (p.x - a.x) * u.x + (p.y - a.y) * u.y;
          if (s < 0 || s > L) continue; // past the beam's end: in the joint
          const across = Math.abs((p.x - a.x) * -u.y + (p.y - a.y) * u.x);
          const up = Math.abs(p.z - (a.z ?? 0));
          if (across > room(ctx.section.b / 2) + 1e-4 || up > room(ctx.section.h / 2) + 1e-4) {
            offenders.push(`${id} in ${owner}: ${across.toFixed(3)} / ${up.toFixed(3)}`);
            break;
          }
        }
        const run0 = bar.segments[0]!;
        const side = Math.sign((run0.start.z + run0.end.z) / 2 - (a.z ?? 0));
        if (side * offset.z < -1e-9) offenders.push(`${id} moved ${(offset.z * 1000).toFixed(1)} mm toward mid-depth`);
      }
    }
    expect(offenders).toEqual([]);
    expect(moved).toBeGreaterThan(0);

    // ── 3. Every conflict the ladder could have moved is an open condition naming its pair ──
    let unreported = 0;
    let reported = 0;
    for (const a of run.assemblies) {
      const open = new Set(a.unsupported.filter((u) => u.key === 'detailing.clash.unresolved')
        .map((u) => `${u.params!.bar}|${u.params!.barB}`));
      const ids = new Map(a.bars.map((b) => [b.id, b]));
      for (const c of a.conflicts) {
        const x = ids.get(c.barA)!, y = ids.get(c.barB)!;
        if (x.role === 'transverse' || y.role === 'transverse' || (x.locked && y.locked)) continue;
        if (open.has(`${c.barA}|${c.barB}`)) reported++; else unreported++;
      }
      // And nothing on record that is not a conflict of the assembly.
      const pairs = new Set(a.conflicts.map((c) => `${c.barA}|${c.barB}`));
      expect([...open].filter((k) => !pairs.has(k)), a.id).toEqual([]);
    }
    expect(unreported).toBe(0);
    expect(reported).toBeGreaterThan(0);
    // An open condition keeps every assembly below CONSTRUCTIBLE.
    for (const a of run.assemblies) {
      if (a.unsupported.some((u) => u.key === 'detailing.clash.unresolved')) expect(a.state, a.id).not.toBe('CONSTRUCTIBLE');
    }
  });

  it('a member holding an unresolved clash is a draft in the document, open in the memoria, the IFC and the workbook, and never ok on the desk', () => {
    const tr = (k: string) => k;
    const clashes = (modelStore.model.detailing?.assemblies ?? []).flatMap((a) => a.unsupported)
      .filter((u) => u.key === 'detailing.clash.unresolved');
    expect(clashes.length).toBeGreaterThan(0);
    const held = [...new Set(clashes.flatMap((u) => u.scope.elementIds ?? []))]
      .filter((id) => verificationStore.contexts.has(id)).sort((x, y) => x - y);
    const doc = detailingStore.buildDocument({ author: 'test', at: '2026-10-12T00:00:00Z' })!;
    expect(doc.readiness).toBe('REVIEW_DRAFT');
    const listed = new Set((doc.openIssues ?? []).filter((i) => i.key === 'detailing.clash.unresolved')
      .map((i) => `${i.params!.bar}|${i.params!.barB}`));
    expect(clashes.filter((u) => !listed.has(`${u.params!.bar}|${u.params!.barB}`)).length).toBe(0);
    const memo = memoriaInput(tr, 'es');
    const ifc = projectIfcInput(tr, 'es', 'flagship');
    const checks = designSheets(tr, 'es').find((x) => x.name === 'Design checks')!.rows;
    const problems: string[] = [];
    for (const id of held) {
      const el = memo.elements.find((e) => e.id === `e${id}`);
      if (!el) continue; // a member with no provided reinforcement has no memoria entry to hold it
      if (!el.rows.some((r) => r.titleKey === 'check.detailing.clash' && r.status === 'unsupported')) problems.push(`memoria e${id}`);
      if (!checks.some((r) => r[0] === el.name && r[2] === 'check.detailing.clash' && r[10] === 'unsupported')) problems.push(`workbook e${id}`);
      const m = ifc.members.find((x) => x.id === String(id));
      if (m && ['satisfies', 'within limit'].includes(String(m.props?.DesignState))) problems.push(`ifc e${id}: ${m.props?.DesignState}`);
      // The desk's word: never ok or warn. A provisional proposal keeps its own word, which
      // already says it may not be built from.
      const desk = verificationStore.getDisplayStatus(id);
      if (desk === 'ok' || desk === 'warn') problems.push(`desk e${id}: ${desk}`);
    }
    expect(problems).toEqual([]);
  });
});
