/**
 * Top steel on a beam the analysis asks for none on — the rule, and the bars it produces.
 *
 * The unit half of the fix for the 63 empty beams. `beam-emptiness-diagnostic.test.ts` is the
 * other half: it runs the whole 7-storey building and asserts the outcome on the real model.
 * This file asserts the RULE, one condition at a time, so that when the building test fails it
 * is possible to tell which condition moved.
 *
 * The clauses, and precisely what each does and does not fix, are in the header of
 * `../beam-top-steel.ts`. The two facts this file exists to keep true:
 *
 *   the COUNT is two and comes from the regulation;
 *   the DIAMETER comes from nowhere in the regulation, and every bar carrying one says so.
 */

import { describe, it, expect } from 'vitest';
import {
  barAreaCm2, hangerTopSteel, reconcileAcrossTheMember, resolveTopSteel,
} from '../beam-top-steel';
import { STANDARD_LONG_DIAS } from '../../design/objective';
import {
  generateBeamBars, type BeamGenerationInput, type MomentStation,
} from '../generate-beam';
import { assignMarks } from '../assembly';

// ─── Fixtures ────────────────────────────────────────────────────

/** Sagging-only envelope: a beam that never hogs, which is the whole population at issue. */
function saggingOnly(L = 6, mMid = 40, v = 40): MomentStation[] {
  const out: MomentStation[] = [];
  for (let i = 0; i <= 10; i++) {
    const s = i / 10;
    out.push({ x: s * L, axialCompression: 0, mPos: mMid * 4 * s * (1 - s), mNeg: 0, v: v * Math.abs(1 - 2 * s) });
  }
  return out;
}

/** The ordinary case: hogging at both supports, so the design produces real top steel. */
function withHogging(L = 6, mMid = 200, mEnd = 150, v = 180): MomentStation[] {
  const out: MomentStation[] = [];
  for (let i = 0; i <= 10; i++) {
    const s = i / 10;
    out.push({
      x: s * L,
      mPos: Math.max(0, mMid * 4 * s * (1 - s)),
      mNeg: Math.max(0, mEnd * (1 - 4 * s * (1 - s))),
      v: v * Math.abs(1 - 2 * s),
    });
  }
  return out;
}

const SECTION = {
  b: 0.30, cover: 0.025, stirrupDiaMm: 8, maxAggregateSizeMm: 20,
  availableDiametersMm: STANDARD_LONG_DIAS, edition: '2025' as const,
};

function beam(over: Partial<BeamGenerationInput> = {}): BeamGenerationInput {
  return {
    elementId: 7, L: 6, b: 0.30, h: 0.65, d: 0.60, cover: 0.025, stirrupDia: 8,
    fc: 25, fy: 420, maxAggregateSizeMm: 20, edition: '2025',
    stations: saggingOnly(), supportI: 'continuous', supportJ: 'continuous',
    bottom: { count: 2, diameterMm: 20 },
    topStart: { count: 2, diameterMm: 10 },
    topEnd: { count: 2, diameterMm: 10 },
    topPurpose: { start: 'stirrupHanger', end: 'stirrupHanger' },
    lateralSystem: false,
    ld: (d) => 0.04 * d,
    origin: { x: 0, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 },
    bentUp: { seismicDesign: 'notRequired', optOut: false, assumption: 'Zona sísmica 0' },
    ...over,
  };
}

const longitudinals = (bars: ReturnType<typeof generateBeamBars>['bars']) =>
  bars.filter((b) => b.role === 'longitudinal');
const topBars = (bars: ReturnType<typeof generateBeamBars>['bars']) =>
  longitudinals(bars).filter((b) => b.layerId?.split(':')[1]?.startsWith('top'));

// ─── 1. A beam with bottom steel and no top groups ───────────────

describe('a beam designed with bottom steel and no top steel', () => {
  it('gets two top bars, and the regulation is what says two', () => {
    const p = resolveTopSteel({ ...SECTION, designed: undefined, hoggingMoment: 0 });
    expect(p.group).toEqual({ count: 2, diameterMm: expect.any(Number) });
    expect(p.group!.count).toBe(2);
    // Every clause that reaches this face agrees on the number, and all three are cited.
    const ids = p.refs.map((r) => r.clause);
    expect(ids).toContain('25.7.1.2');
    expect(ids).toContain('25.7.1.3');
    expect(ids).toContain('9.7.7.1');
  });

  it('states that the DIAMETER has no clause behind it', () => {
    const p = resolveTopSteel({ ...SECTION, designed: undefined, hoggingMoment: 0 });
    expect(p.diameterProvisional).toBe(true);
    expect(p.note).toMatch(/NO FIJA EL DIÁMETRO/);
  });

  it('quotes no required AREA, because no clause sets one on this face', () => {
    /**
     * The refusal that keeps §9.6.1.2 out of a place it does not belong.
     *
     * `max(0,25·√f'c/f_y, 1,4/f_y)·b_w·d` is a real number and it would look conservative
     * printed here. §9.6.1.1 scopes it to sections where the analysis requires tension steel,
     * and this face is not one, so printing it would be inventing a demand — a number an
     * engineer would reasonably read as something the regulation asked for.
     */
    const p = resolveTopSteel({ ...SECTION, designed: undefined, hoggingMoment: 0 });
    expect(p.asRequiredCm2).toBeNull();
    expect(p.asProvidedCm2).toBeCloseTo(2 * barAreaCm2(p.group!.diameterMm), 6);
    expect(p.note).toMatch(/9\.6\.1\.1/);
  });

  it('picks the smallest bar that fits two per row and is not thinner than the stirrup', () => {
    const p = hangerTopSteel({ ...SECTION, stirrupDiaMm: 8 });
    expect(p.group!.diameterMm).toBe(10);
    // Raise the stirrup and the choice follows it — a Ø10 longitudinal inside a Ø12 stirrup
    // is not a detail anyone builds, and the note calls that a convention rather than a clause.
    const bigger = hangerTopSteel({ ...SECTION, stirrupDiaMm: 12 });
    expect(bigger.group!.diameterMm).toBe(12);
    expect(bigger.note).toMatch(/constructibilidad, no una cláusula/);
  });
});

// ─── 2. A beam with complete top groups ──────────────────────────

describe('a beam whose design produced hogging steel', () => {
  it('keeps its own group, untouched and unmarked', () => {
    const p = resolveTopSteel({
      ...SECTION, designed: { count: 4, diameterMm: 16 }, hoggingMoment: 150,
    });
    expect(p.group).toEqual({ count: 4, diameterMm: 16 });
    expect(p.purpose).toBe('flexural');
    expect(p.diameterProvisional).toBe(false);
  });

  it('does not mark its continuous top pair as a hanger', () => {
    /**
     * The understatement this prevents.
     *
     * The two bars that run support to support on a hogging beam ARE part of that support's
     * hogging steel — `generateBeamBars` takes them out of the group rather than adding them to
     * it, and the area accounting depends on that. Marking them `stirrupHanger` would report a
     * designed beam as carrying assembly steel.
     */
    const gen = generateBeamBars(beam({
      stations: withHogging(),
      topStart: { count: 4, diameterMm: 16 }, topEnd: { count: 4, diameterMm: 16 },
      topPurpose: { start: 'flexural', end: 'flexural' },
    }));
    expect(gen.bars.filter((b) => b.purpose === 'stirrupHanger')).toEqual([]);
    expect(topBars(gen.bars).length).toBeGreaterThan(2);
  });
});

// ─── 3–4. VERIFIED and PROVISIONAL_BIAXIAL are not inputs to this ─

describe('the rule does not read the design outcome', () => {
  it('answers the same for a VERIFIED beam and a provisional one', () => {
    /**
     * Asserted because the obvious reading of the original defect was "proposals lose their
     * steel", and it was wrong: 62 of the 63 were PROVISIONAL_BIAXIAL and one was VERIFIED.
     * The rule takes a section, a stirrup and a moment, and there is deliberately no outcome
     * parameter for a future change to start branching on.
     */
    const a = resolveTopSteel({ ...SECTION, designed: undefined, hoggingMoment: 0 });
    const b = resolveTopSteel({ ...SECTION, designed: undefined, hoggingMoment: 0 });
    expect(a.group).toEqual(b.group);
    expect(a.purpose).toBe(b.purpose);
  });
});

// ─── 5. Top steel that IS minimum, and the case that is not ──────

describe('minimum versus assembly versus resistant', () => {
  it('separates the three roles instead of merging them into one group', () => {
    const resistant = resolveTopSteel({
      ...SECTION, designed: { count: 4, diameterMm: 16 }, hoggingMoment: 150,
    });
    const assembly = resolveTopSteel({ ...SECTION, designed: undefined, hoggingMoment: 0 });
    expect(resistant.purpose).toBe('flexural');
    expect(assembly.purpose).toBe('stirrupHanger');
    // And the one thing they must never share: whether a capacity stands behind them.
    expect(resistant.diameterProvisional).toBe(false);
    expect(assembly.diameterProvisional).toBe(true);
  });

  it('refuses to fill a hogging face with assembly bars', () => {
    /**
     * The third branch, and the one that keeps the other two honest.
     *
     * A support that hogs and has no designed steel is a gap in the design. Two constructive
     * bars put there would sit on a tension face and read as the answer to that moment. The
     * blockage is reported with the moment in it, and nothing is drawn.
     */
    const p = resolveTopSteel({ ...SECTION, designed: undefined, hoggingMoment: 87.5 });
    expect(p.group).toBeNull();
    expect(p.blocked?.key).toBe('detailing.topSteel.hoggingWithoutDesign');
    expect(p.blocked?.params.momentKNm).toBeCloseTo(87.5, 6);
    expect(p.note).toMatch(/87\.50 kN·m/);
  });
});

// ─── A beam that hogs at ONE end ─────────────────────────────────

describe('a beam that hogs at one support and not the other', () => {
  const mixed = () => reconcileAcrossTheMember(
    resolveTopSteel({ ...SECTION, designed: undefined, hoggingMoment: 0 }),
    resolveTopSteel({ ...SECTION, designed: { count: 4, diameterMm: 16 }, hoggingMoment: 150 }),
  );

  it('reports the diameter that will actually be drawn, not the one it first chose', () => {
    /**
     * There is ONE continuous top pair for the whole member and `generateBeamBars` draws it at
     * the widest of the two supports' groups, so the hanger end's own Ø10 never materialises.
     * A trace naming a diameter the sheet does not show is the kind of disagreement a reviewer
     * finds by measuring, halfway through a set.
     */
    const { start } = mixed();
    expect(start.purpose).toBe('stirrupHanger');
    expect(start.group).toEqual({ count: 2, diameterMm: 16 });
    expect(start.asProvidedCm2).toBeCloseTo(2 * barAreaCm2(16), 6);
    expect(start.note).toMatch(/Se dibuja Ø16 y no Ø10/);
  });

  it('leaves the designed support untouched, and never grows it', () => {
    const { end } = mixed();
    expect(end.group).toEqual({ count: 4, diameterMm: 16 });
    expect(end.purpose).toBe('flexural');
    // And a hanger never pulls a designed group UP to its own size.
    const other = reconcileAcrossTheMember(
      resolveTopSteel({ ...SECTION, designed: undefined, hoggingMoment: 0 }),
      resolveTopSteel({ ...SECTION, designed: { count: 4, diameterMm: 10 }, hoggingMoment: 150 }),
    );
    expect(other.end.group).toEqual({ count: 4, diameterMm: 10 });
    expect(other.start.group).toEqual({ count: 2, diameterMm: 10 });
    expect(other.start.note).not.toMatch(/Se dibuja/);
  });

  it('keeps its top pair unmarked, because it is the hogging support\'s steel', () => {
    /**
     * `generateBeamBars` marks the pair only when NEITHER end hogs. Here one does, the pair is
     * drawn from its group and counts toward it, and marking it assembly steel would understate
     * a design that really was made.
     */
    const gen = generateBeamBars(beam({
      stations: withHogging(6, 200, 150),
      topStart: { count: 2, diameterMm: 16 }, topEnd: { count: 4, diameterMm: 16 },
      topPurpose: { start: 'stirrupHanger', end: 'flexural' },
    }));
    expect(gen.bars.filter((b) => b.purpose === 'stirrupHanger')).toEqual([]);
    // And the hanger end grows no curtailed group of its own.
    expect(gen.trace.filter((t) => /Armadura superior I/.test(t))).toEqual([]);
    expect(gen.trace.filter((t) => /Armadura superior J/.test(t))).toHaveLength(1);
  });
});

// ─── 6. Torsion is not what this answers ─────────────────────────

describe('torsion', () => {
  it('is not resolved by these bars and does not change them', () => {
    /**
     * §9.7.5.1 requires longitudinal reinforcement distributed around the perimeter WHERE
     * TORSION REINFORCEMENT IS REQUIRED, and no check in this application evaluates torsion —
     * the code adapter says so and `torsion-notice.ts` reports it per member. So a beam
     * carrying torsion gets exactly the same two bars as one that does not, and the torsion
     * notice remains the only thing that speaks about the torsion.
     *
     * The alternative — sizing these bars for §9.7.5 — would be moving torsion authority, and
     * would attach a torsion claim to a bar nobody verified for torsion.
     */
    const plain = resolveTopSteel({ ...SECTION, designed: undefined, hoggingMoment: 0 });
    const torsional = resolveTopSteel({ ...SECTION, designed: undefined, hoggingMoment: 0 });
    expect(torsional.group).toEqual(plain.group);
    expect(plain.refs.map((r) => r.clause)).not.toContain('9.7.5.1');
  });
});

// ─── 7. A section that cannot host the pair ──────────────────────

describe('a section too narrow for two bars', () => {
  it('reports the blockage instead of placing one bar or inventing a size', () => {
    const p = hangerTopSteel({ ...SECTION, b: 0.10, stirrupDiaMm: 8 });
    expect(p.group).toBeNull();
    expect(p.blocked?.key).toBe('detailing.topSteel.noDiameterFits');
    expect(p.blocked?.params.clearWidthMm).toBe(34);
    expect(p.note).toMatch(/no se coloca una sola barra ni se inventa un diámetro/);
  });

  it('reports it when the stirrup is thicker than every longitudinal the project has', () => {
    const p = hangerTopSteel({ ...SECTION, stirrupDiaMm: 40 });
    expect(p.group).toBeNull();
    expect(p.blocked?.params.stirrupDiaMm).toBe(40);
  });
});

// ─── 8. Anchorage and prolongation ───────────────────────────────

describe('the pair runs support to support', () => {
  it('embeds into both supports rather than stopping at the faces', () => {
    /**
     * There is no curtailment to compute: the face has no hogging envelope to curtail against,
     * so the two bars are continuous by construction and reach past both nodes. That is the
     * same answer §9.7.3.8 gives on the bottom face when no theoretical cut-off exists, and it
     * is the conservative and constructible one.
     */
    const gen = generateBeamBars(beam());
    const hangers = gen.bars.filter((b) => b.purpose === 'stirrupHanger');
    expect(hangers).toHaveLength(2);
    for (const h of hangers) {
      const xs = h.segments.flatMap((s) => [s.start.x, s.end.x]);
      expect(Math.min(...xs)).toBeLessThan(0);
      expect(Math.max(...xs)).toBeGreaterThan(6);
    }
  });

  it('computes no cut-off for a face that has no hogging envelope', () => {
    /**
     * Running the curtailment loop on a zero peak returns the support itself, records a
     * §9.7.3.5 legality for a termination that does not exist, and writes a trace line about a
     * decision nobody made. The bottom face's two cut-offs are the only ones this beam has.
     */
    const gen = generateBeamBars(beam());
    expect(gen.trace.filter((t) => /Armadura superior/.test(t))).toEqual([]);
    expect(gen.cutoffs.length).toBeLessThanOrEqual(2);
  });
});

// ─── 9. An invalid section ───────────────────────────────────────

describe('an invalid section', () => {
  it('is a blockage with a reason, not a crash and not a zero-diameter bar', () => {
    for (const b of [0, -0.3, 0.02]) {
      const p = hangerTopSteel({ ...SECTION, b });
      expect(p.group).toBeNull();
      expect(p.blocked).toBeDefined();
      expect(p.asProvidedCm2).toBe(0);
    }
  });
});

// ─── 10. Several failures at once ────────────────────────────────

describe('several conditions failing at once', () => {
  it('reports the first that applies and never partially places steel', () => {
    // Hogging demand AND a section too narrow: the demand is reported, because a face that
    // hogs is the thing an engineer must act on and widening the web would not answer it.
    const p = resolveTopSteel({
      ...SECTION, b: 0.10, stirrupDiaMm: 40, designed: undefined, hoggingMoment: 40,
    });
    expect(p.group).toBeNull();
    expect(p.blocked?.key).toBe('detailing.topSteel.hoggingWithoutDesign');
    expect(p.asProvidedCm2).toBe(0);
  });
});

// ─── 11. Ids and marks ───────────────────────────────────────────

describe('ids and marks', () => {
  it('gives every bar a distinct id and keeps the existing naming', () => {
    const gen = generateBeamBars(beam());
    const ids = gen.bars.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(gen.bars.filter((b) => b.purpose === 'stirrupHanger').map((b) => b.id))
      .toEqual(['e7-topRun-0', 'e7-topRun-1']);
  });

  it('does not let a hanger share a schedule row with resistant steel', () => {
    /**
     * Same diameter, same cut length, same shape — the same fabricated item, and a fabricator
     * is right to nest them. An engineer signing the planilla is not reading a fabrication
     * list: "2Ø10 resistant" and "2Ø10 assembly" are different statements about the structure,
     * and a merged row makes it impossible to tell which the drawing meant.
     */
    const gen = generateBeamBars(beam());
    const marks = assignMarks(gen.bars);
    const hangerMarks = marks.filter((m) => m.purpose === 'stirrupHanger');
    expect(hangerMarks.length).toBeGreaterThan(0);
    for (const m of hangerMarks) {
      expect(m.role).toBe('longitudinal');
      expect(m.quantity).toBe(2);
    }
    // And a mark never mixes the two.
    for (const m of marks) {
      const bars = gen.bars.filter((b) => m.barIds.includes(b.id));
      expect(new Set(bars.map((b) => b.purpose ?? '')).size).toBe(1);
    }
  });

  it('leaves the marks of a beam with no hangers exactly as they were', () => {
    /**
     * The `purpose` term joins the mark key, so this asserts the term is empty on every bar
     * that carries no purpose — otherwise every existing drawing's marks would shuffle.
     */
    const gen = generateBeamBars(beam({
      stations: withHogging(),
      topStart: { count: 4, diameterMm: 16 }, topEnd: { count: 4, diameterMm: 16 },
      topPurpose: { start: 'flexural', end: 'flexural' },
    }));
    const marks = assignMarks(gen.bars);
    expect(marks.every((m) => m.purpose === undefined)).toBe(true);
    expect(marks.map((m) => m.mark)).toEqual(marks.map((_, i) => `B${i + 1}`));
  });
});

// ─── 12. Minimum is not resistant ────────────────────────────────

describe('what the bars claim downstream', () => {
  it('marks every synthesised bar and no others', () => {
    const gen = generateBeamBars(beam());
    const marked = gen.bars.filter((b) => b.purpose === 'stirrupHanger');
    expect(marked).toHaveLength(2);
    // The bottom steel is resistant and stays unmarked; so does the cage.
    for (const b of gen.bars) {
      if (marked.includes(b)) continue;
      expect(b.purpose).toBeUndefined();
    }
  });

  it('says in the trace that no hogging capacity is attributed', () => {
    const gen = generateBeamBars(beam());
    const said = gen.trace.join(' ');
    expect(said).toMatch(/no se les atribuye capacidad a momento negativo/);
    expect(said).toMatch(/9\.6\.1\.2 no rige en esta cara/);
    expect(gen.refs.map((r) => r.clause)).toContain('25.7.1.2');
  });
});

// ─── 13–14. The cage, and geometric containment ──────────────────

describe('the cage the pair exists for', () => {
  it('leaves no stirrup bend gripping nothing', () => {
    /**
     * The clause, measured rather than asserted.
     *
     * `transverseFindings.bendsWithoutBar` is the generator's own §25.7.1.2 count, taken by
     * `bendsWithoutLongitudinalBar` against the longitudinal bars that actually exist at each
     * station. Before the fix this beam had no longitudinal bars at all and no cage either, so
     * the clause was not violated — it was unreachable. Now there is a cage, and it grips.
     */
    const gen = generateBeamBars(beam());
    expect(gen.transverse.length).toBeGreaterThan(0);
    expect(gen.transverseFindings.bendsWithoutBar).toBe(0);
    expect(gen.unsupported).toEqual([]);
  });

  it('places the pair inside the section, one on each side of the centreline', () => {
    const gen = generateBeamBars(beam());
    const hangers = gen.bars.filter((b) => b.purpose === 'stirrupHanger');
    const ys = hangers.map((h) => h.segments[0].start.y);
    expect(ys.some((y) => y < 0)).toBe(true);
    expect(ys.some((y) => y > 0)).toBe(true);
    // Inside the web, allowing for the bar radius.
    for (const y of ys) expect(Math.abs(y)).toBeLessThan(0.30 / 2);
    // And on the TOP face: above the section centreline, below the top fibre.
    for (const h of hangers) {
      const z = h.segments[0].start.z;
      expect(z).toBeGreaterThan(0);
      expect(z).toBeLessThan(0.65 / 2);
    }
  });

  it('never draws a bar of zero diameter or zero length', () => {
    const gen = generateBeamBars(beam());
    for (const b of gen.bars) {
      expect(b.diameterMm, b.id).toBeGreaterThan(0);
      expect(b.cuttingLength, b.id).toBeGreaterThan(0);
      expect(b.segments.length, b.id).toBeGreaterThan(0);
    }
  });
});

// ─── 16–17. Nothing bare, and nothing silent ─────────────────────

describe('the two guarantees', () => {
  it('produces main steel whenever the rule can produce the pair', () => {
    const gen = generateBeamBars(beam());
    expect(longitudinals(gen.bars).length).toBeGreaterThanOrEqual(4);
    expect(topBars(gen.bars)).toHaveLength(2);
  });

  it('produces a structured reason whenever it cannot', () => {
    /**
     * Requirement 17, at the level the rule lives on: every refusal carries a key a caller can
     * branch on, parameters a message can render, and a sentence a sheet can print. A refusal
     * with none of those is what "silently empty" meant.
     */
    for (const p of [
      hangerTopSteel({ ...SECTION, b: 0.10 }),
      resolveTopSteel({ ...SECTION, designed: undefined, hoggingMoment: 12 }),
    ]) {
      expect(p.group).toBeNull();
      expect(p.blocked?.key).toMatch(/^detailing\.topSteel\./);
      expect(Object.keys(p.blocked!.params).length).toBeGreaterThan(0);
      expect(p.note.length).toBeGreaterThan(40);
      expect(p.refs.length).toBeGreaterThan(0);
    }
  });
});
