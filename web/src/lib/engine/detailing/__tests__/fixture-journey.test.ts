/**
 * The feasible fixture's FULL deliverable journey, end to end, nothing seeded.
 *
 * `fixture-acceptance.test.ts` proves the twelve conditions. This proves what an engineer
 * actually does with them:
 *
 *   VERIFIED → coordinate → re-verify at final geometry → repair → CONSTRUCTIBLE
 *            → named review (REVIEWED) → document FOR_REVIEW then REVIEWED
 *            → report / drawings / schedule, all three carrying real content
 *            → edit the reinforcement → the issued document becomes SUPERSEDED
 *            → regenerate, re-coordinate, re-verify → a NEW current revision
 *
 * These were carried as "journey steps 6–9 and 13, not done" for several cycles because the
 * fixture could not reach CONSTRUCTIBLE and the review path was therefore unreachable. It is
 * reachable now, so it is asserted.
 */

import { describe, expect, it } from 'vitest';
import frame from '../../../templates/fixtures/rc-design-qa-8.json';
import { runDesign } from '../../design/candidate-search';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import { solveFixture } from '../../design/__tests__/helpers';
import { runDetailing, type RunDetailingResult } from '../run-detailing';
import { runDesignFeedbackLoop, type DesignFeedbackLoopResult } from '../design-feedback-loop';
import {
  applyReview, type DetailingAssembly,
} from '../assembly';
import {
  buildDocumentModel, documentReadiness, isConstructionReady, openConflictsOf, supersede,
  type CertificateEntry, type DocumentModel,
} from '../document-model';
import { renderDrawings, renderReportHtml, renderSchedule } from '../document-render';
import { rebarHash } from '../../design/rebar-hash';
import { dictFor } from '../../../i18n/store.svelte';
import type { MemberDesignOutcome } from '../../design/outcome';
import type { MemberContext } from '../../design/member-context';
import type { ProvidedReinforcement } from '../../../store/model.svelte';

const RENDER = { locale: 'es', projectName: 'rc-design-qa-8' } as const;

/**
 * The REAL Spanish dictionary, not `(k) => k`.
 *
 * An identity translator would let a report full of raw keys pass every assertion below,
 * which is precisely the defect this journey is supposed to catch.
 */
const translate = (key: string, params?: Record<string, unknown>): string => {
  const raw = dictFor('es')[key];
  if (raw === undefined) return `«MISSING:${key}»`;
  return raw.replace(/\{(\w+)\}/g, (_, p) => String(params?.[p] ?? `{${p}}`));
};

interface Chain {
  contexts: Map<number, MemberContext>;
  /** The solved model's node/element maps, reused so nothing is rebuilt from raw JSON. */
  nodes: unknown;
  elements: unknown;
  loop: DesignFeedbackLoopResult;
  /** Reinforcement as the model would hold it after the loop is published. */
  reinforcement: Map<number, ProvidedReinforcement>;
}

let cached: Chain | null = null;

/** solve → design → coordinate → re-verify → repair. The real chain. */
function chain(): Chain {
  if (cached) return cached;
  const solved = solveFixture(frame as never);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  const detail = (outcomes: ReadonlyMap<number, MemberDesignOutcome>) => runDetailing({
    contexts: solved.contexts,
    outcomes,
    nodes: solved.data.nodes as never,
    elements: solved.data.elements as never,
    edition: '2025',
    maxAggregateSizeMm: 19,
    verifierId: 'cirsoc201.provided.v2.2025',
    demandRevision: 1,
    reverify: (id: number, loss: never) => {
      const ctx = solved.contexts.get(id);
      const accepted = outcomes.get(id)?.accepted;
      if (!ctx || !accepted) return 'fail' as const;
      const res = cirsoc201Adapter.verify({ ...ctx, finalGeometry: loss } as never, accepted);
      return res?.overallStatus === 'fail' ? 'fail' as const
        : res?.overallStatus === 'warn' ? 'warn' as const : 'ok' as const;
    },
  } as never);

  const loop = runDesignFeedbackLoop({
    adapter: cirsoc201Adapter,
    contexts: solved.contexts,
    outcomes: summary.outcomes,
    detail,
  });
  const reinforcement = new Map<number, ProvidedReinforcement>();
  for (const [id, o] of loop.outcomes) if (o.accepted) reinforcement.set(id, o.accepted);
  cached = {
    contexts: solved.contexts,
    nodes: solved.data.nodes, elements: solved.data.elements,
    loop, reinforcement,
  };
  return cached;
}

/**
 * Certificates exactly as `detailingStore.buildDocument` assembles them.
 *
 * The certified hash is the hash of the steel that was verified; the current hash is the
 * hash of the steel in the model. Passing the same value for both would make `matches`
 * vacuous, so each is derived from its own source.
 */
function certificatesFor(
  assemblies: readonly DetailingAssembly[],
  reinforcement: ReadonlyMap<number, ProvidedReinforcement>,
  contexts: ReadonlyMap<number, MemberContext>,
  /** Members whose model steel has been edited away from what was certified. */
  edited: ReadonlyMap<number, ProvidedReinforcement> = new Map(),
): CertificateEntry[] {
  const out: CertificateEntry[] = [];
  for (const a of assemblies) {
    for (const id of a.elementIds) {
      const certifiedReinf = reinforcement.get(id);
      const modelReinf = edited.get(id) ?? certifiedReinf;
      const ctx = contexts.get(id);
      const certified = certifiedReinf ? rebarHash(certifiedReinf) : '';
      const current = modelReinf ? rebarHash(modelReinf) : '';
      const verdict = ctx && modelReinf
        ? cirsoc201Adapter.verify(ctx, modelReinf) : undefined;
      out.push({
        elementId: id,
        certifiedHash: certified,
        currentHash: current,
        matches: certified !== '' && current !== '' && certified === current,
        verifierId: a.provenance.verifierId,
        status: verdict?.overallStatus === 'ok' ? 'ok'
          : verdict?.overallStatus === 'warn' ? 'warn'
            : verdict?.overallStatus === 'fail' ? 'fail' : 'notRun',
      });
    }
  }
  return out;
}

function buildDoc(
  assemblies: readonly DetailingAssembly[],
  run: RunDetailingResult,
  certificates: readonly CertificateEntry[],
  revision: number,
  supersededBy?: number,
): DocumentModel {
  return buildDocumentModel({
    seriesId: 'detailing',
    revision: {
      number: revision,
      at: '2026-07-27T12:00:00Z',
      author: 'Bauti',
      detailingRevision: Math.max(0, ...assemblies.map((a) => a.detailingRevision ?? 0)),
      demandRevision: 1,
    },
    regulations: [{ id: 'cirsoc-201', edition: '2025' }],
    assemblies,
    laps: run.lapping.laps,
    certificates,
    ...(supersededBy !== undefined ? { supersededBy } : {}),
  });
}

// ── Step 1: CONSTRUCTIBLE through the real chain ──

describe('step 1 — the fixture reaches CONSTRUCTIBLE', () => {
  it('every assembly is CONSTRUCTIBLE with no blockers', () => {
    const c = chain();
    expect(c.loop.outcome).toBe('FINAL_GEOMETRY_VERIFIED');
    expect(c.loop.result.assemblies.length).toBeGreaterThan(0);
    for (const a of c.loop.result.assemblies) {
      expect(a.state, a.id).toBe('CONSTRUCTIBLE');
      expect(a.constructibility?.verdict, a.id).toBe('CONSTRUCTIBLE');
      expect(a.stateBlockers ?? [], a.id).toEqual([]);
      expect(a.conflicts, a.id).toEqual([]);
    }
  });
});

// ── Step 2: a named review ──

describe('step 2 — a named review is recorded', () => {
  it('refuses an unnamed reviewer even at CONSTRUCTIBLE', () => {
    // Reaching CONSTRUCTIBLE earns the right to be reviewed; it does not review itself.
    const a = chain().loop.result.assemblies[0];
    const attempt = applyReview(a, {
      engineer: '   ', state: 'REVIEWED', at: '2026-07-27T12:00:00Z',
      acknowledgedProvisional: [], provisionalAcknowledged: false, notes: '',
    } as never);
    expect(attempt.ok).toBe(false);
    expect(attempt.assembly).toBeUndefined();
  });

  it('accepts a named review and carries the revision it applies to', () => {
    const a = chain().loop.result.assemblies[0];
    const attempt = applyReview(a, {
      engineer: 'Bauti', state: 'REVIEWED', at: '2026-07-27T12:00:00Z',
      acknowledgedProvisional: [], provisionalAcknowledged: false,
      notes: 'Feasible fixture acceptance run.',
    } as never);
    expect(attempt.ok).toBe(true);
    expect(attempt.assembly!.state).toBe('REVIEWED');
    expect(attempt.assembly!.review!.engineer).toBe('Bauti');
    // The review is pinned to a revision, so a later regeneration can tell it is stale.
    expect(attempt.assembly!.review!.revision).toBe(a.detailingRevision);
  });
});

// ── Steps 3 + 4: the document and its three renderings ──

describe('steps 3 and 4 — the document climbs on evidence, and renders', () => {
  /** Reviewed assemblies + the document built from them. */
  function reviewed() {
    const c = chain();
    const assemblies = c.loop.result.assemblies.map((a) => applyReview(a, {
      engineer: 'Bauti', state: 'REVIEWED', at: '2026-07-27T12:00:00Z',
      acknowledgedProvisional: [], provisionalAcknowledged: false, notes: '',
    } as never).assembly!);
    const certificates = certificatesFor(assemblies, c.reinforcement, c.contexts);
    return { c, assemblies, certificates };
  }

  it('is FOR_REVIEW before the review and REVIEWED after it', () => {
    const c = chain();
    const before = buildDoc(
      c.loop.result.assemblies, c.loop.result,
      certificatesFor(c.loop.result.assemblies, c.reinforcement, c.contexts), 1);
    expect(before.readiness).toBe('FOR_REVIEW');
    // FOR_REVIEW is not a construction claim, and must not read as one.
    expect(isConstructionReady(before)).toBe(false);

    const { assemblies, certificates, c: ch } = reviewed();
    const after = buildDoc(assemblies, ch.loop.result, certificates, 2);
    expect(after.readiness).toBe('REVIEWED');
  });

  it('every certificate matches the steel in the model, and none is notRun', () => {
    // The condition that used to fail. A certificate that does not describe the steel in
    // the model is worse than none — it is a correct-looking claim about absent geometry.
    const { certificates } = reviewed();
    expect(certificates.length).toBeGreaterThan(0);
    for (const cert of certificates) {
      expect(cert.matches, `element ${cert.elementId}`).toBe(true);
      expect(cert.status, `element ${cert.elementId}`).not.toBe('notRun');
      expect(cert.status, `element ${cert.elementId}`).not.toBe('fail');
      expect(cert.verifierId).toBe('cirsoc201.provided.v2.2025');
    }
  });

  it('has no open conflicts to act on', () => {
    const { assemblies } = reviewed();
    for (const a of assemblies) expect(openConflictsOf(a as never, [])).toEqual([]);
  });

  it('the report states the edition, the revision and the certificates', () => {
    const { assemblies, certificates, c } = reviewed();
    const html = renderReportHtml(
      buildDoc(assemblies, c.loop.result, certificates, 2), RENDER, translate);
    expect(html.length).toBeGreaterThan(2000);
    expect(html).toContain('cirsoc-201');
    expect(html).toContain('2025');
    // Every member appears by id, so a reader can find the one they care about.
    for (const cert of certificates) {
      expect(html, `element ${cert.elementId}`).toContain(String(cert.elementId));
    }
    // Real prose, in Spanish, from the real dictionary — no raw keys, no placeholders left
    // unfilled, nothing undefined. An identity translator would hide all three.
    expect(html).not.toContain('«MISSING:');
    expect(html).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('the drawings carry real DXF geometry for every assembly', () => {
    const { assemblies, certificates, c } = reviewed();
    const set = renderDrawings(buildDoc(assemblies, c.loop.result, certificates, 2), RENDER);
    expect(set.sheets.length).toBeGreaterThan(0);
    for (const s of set.sheets) {
      expect(s.dxf).toContain('SECTION');
      expect(s.dxf).toContain('ENTITIES');
      // Real ordinates, not an empty frame: a DXF with a header and no vertices would
      // otherwise pass a length check.
      expect(s.dxf.match(/^\s*10\s*$/gm)?.length ?? 0).toBeGreaterThan(10);
      expect(s.svg).toContain('<svg');
      expect(s.dxf).not.toContain('NaN');
    }
    expect(set.dxf).toContain('EOF');
  });

  it('the schedule uses the assembly’s own marks and totals real steel', () => {
    const { assemblies, certificates, c } = reviewed();
    const sheets = renderSchedule(
      buildDoc(assemblies, c.loop.result, certificates, 2), RENDER);
    expect(sheets.length).toBe(assemblies.length);
    for (const [i, s] of sheets.entries()) {
      expect(s.aoa.length).toBeGreaterThan(5);
      const flat = s.aoa.flat().map(String).join('|');
      // Every mark on the drawing appears on the schedule — one mark scheme, not two.
      for (const m of assemblies[i].marks) expect(flat).toContain(m.mark);
      expect(flat).not.toContain('NaN');
      expect(flat).not.toContain('undefined');
    }
  });
});

// ── Steps 5 + 6: a reinforcement edit supersedes, and regeneration re-establishes ──

describe('steps 5 and 6 — an edit supersedes, and regeneration produces a new revision', () => {
  /** An engineer opens beam 5 and opens its support stirrups out to 300 mm. */
  function edit(): { edited: Map<number, ProvidedReinforcement>; elementId: number } {
    const c = chain();
    const elementId = 5;
    const base = c.reinforcement.get(elementId)!;
    const edited = new Map<number, ProvidedReinforcement>([[elementId, {
      ...base,
      regions: {
        ...base.regions!,
        stirrupsSupport: { ...base.regions!.stirrupsSupport!, spacing: 0.30 },
      },
    }]]);
    return { edited, elementId };
  }

  it('the issued document becomes SUPERSEDED, non-destructively', () => {
    const c = chain();
    const assemblies = c.loop.result.assemblies;
    const issued = buildDoc(
      assemblies, c.loop.result,
      certificatesFor(assemblies, c.reinforcement, c.contexts), 1);
    expect(issued.readiness).toBe('FOR_REVIEW');

    const retired = supersede(issued, 2);
    expect(retired.readiness).toBe('SUPERSEDED');
    expect(isConstructionReady(retired)).toBe(false);
    // Non-destructive: the retired revision keeps its own number and its content, because a
    // project that cannot show what it previously issued cannot answer the only question
    // that matters after something goes wrong.
    expect(retired.revision.number).toBe(issued.revision.number);
    expect(retired.assemblies.length).toBe(issued.assemblies.length);
    expect(retired.assemblies[0].bars.length).toBe(issued.assemblies[0].bars.length);
  });

  it('an edited member’s certificate stops matching, which blocks the document', () => {
    // This is the mechanism, asserted rather than assumed: the document is not "stale
    // because we said so", it is stale because the hash of the steel in the model no longer
    // equals the hash of the steel that was verified.
    const c = chain();
    const { edited, elementId } = edit();
    const certificates = certificatesFor(
      c.loop.result.assemblies, c.reinforcement, c.contexts, edited);
    const mine = certificates.find((x) => x.elementId === elementId)!;
    expect(mine.matches).toBe(false);
    expect(mine.currentHash).not.toBe(mine.certifiedHash);
    for (const other of certificates.filter((x) => x.elementId !== elementId)) {
      expect(other.matches, `element ${other.elementId}`).toBe(true);
    }
    // One stale certificate is enough to stop the whole document claiming readiness.
    expect(documentReadiness({
      assemblies: buildDoc(c.loop.result.assemblies, c.loop.result, certificates, 3).assemblies,
      certificates,
    })).toBe('REVIEW_DRAFT');
  });

  it('regenerating from the edit coordinates, re-verifies and reaches a NEW revision', () => {
    // The full round trip: the edit is designed back into a verified state by the same loop,
    // coordinated, re-verified at ITS final geometry, and the result carries a higher
    // detailing revision than the one it replaces.
    const c = chain();
    const { edited, elementId } = edit();
    const previousRevision = Math.max(
      0, ...c.loop.result.assemblies.map((a) => a.detailingRevision ?? 0));

    const outcomes = new Map(c.loop.outcomes);
    const base = outcomes.get(elementId)!;
    outcomes.set(elementId, { ...base, accepted: edited.get(elementId)! });

    const detail = (o: ReadonlyMap<number, MemberDesignOutcome>) => runDetailing({
      contexts: c.contexts,
      outcomes: o,
      nodes: c.nodes as never,
      elements: c.elements as never,
      edition: '2025',
      maxAggregateSizeMm: 19,
      verifierId: 'cirsoc201.provided.v2.2025',
      demandRevision: 1,
      previousRevision,
      reverify: (id: number, loss: never) => {
        const ctx = c.contexts.get(id);
        const accepted = o.get(id)?.accepted;
        if (!ctx || !accepted) return 'fail' as const;
        const res = cirsoc201Adapter.verify({ ...ctx, finalGeometry: loss } as never, accepted);
        return res?.overallStatus === 'fail' ? 'fail' as const
          : res?.overallStatus === 'warn' ? 'warn' as const : 'ok' as const;
      },
    } as never);

    const regenerated = runDesignFeedbackLoop({
      adapter: cirsoc201Adapter,
      contexts: c.contexts,
      outcomes,
      detail,
    });

    expect(regenerated.outcome).toBe('FINAL_GEOMETRY_VERIFIED');
    for (const a of regenerated.result.assemblies) {
      expect(a.state, a.id).toBe('CONSTRUCTIBLE');
      // A new revision, strictly above the one the superseded document described.
      expect(a.detailingRevision ?? 0, a.id).toBeGreaterThan(previousRevision);
    }
    // The edit was over the spacing limit at the final geometry, so the loop had to repair
    // it — which is the whole point of regenerating rather than redrawing.
    expect(regenerated.iterations.flatMap((i) => i.changed)).toContain(elementId);

    // And the new document is current, with every certificate matching again.
    const fresh = new Map<number, ProvidedReinforcement>();
    for (const [id, o] of regenerated.outcomes) if (o.accepted) fresh.set(id, o.accepted);
    const doc = buildDoc(
      regenerated.result.assemblies, regenerated.result,
      certificatesFor(regenerated.result.assemblies, fresh, c.contexts), 3);
    expect(doc.readiness).toBe('FOR_REVIEW');
    expect(doc.revision.detailingRevision).toBeGreaterThan(previousRevision);
  });
});
