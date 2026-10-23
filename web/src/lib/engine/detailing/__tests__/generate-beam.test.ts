import { describe, it, expect } from 'vitest';
import { stirrupStations } from '../../../codes/cirsoc201/transverse-cage';
import {
  bentUpPermitted, evaluateCutoff, generateBeamBars, layoutBarRow, mergeStirrupZones, theoreticalCutoff,
  type BeamGenerationInput, type BentUpPolicy, type MomentStation, type StirrupZone,
} from '../generate-beam';

/** Parabolic sagging envelope with hogging at both ends — a typical interior span. */
function envelope(L = 6, mMid = 200, mEnd = 150, v = 180): MomentStation[] {
  const out: MomentStation[] = [];
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * L;
    const s = x / L;
    out.push({
      x,
      mPos: Math.max(0, mMid * 4 * s * (1 - s)),
      mNeg: Math.max(0, mEnd * (1 - 4 * s * (1 - s))),
      v: v * Math.abs(1 - 2 * s),
    });
  }
  return out;
}

function input(over: Partial<BeamGenerationInput> = {}): BeamGenerationInput {
  return {
    elementId: 7, L: 6, b: 0.30, h: 0.60, d: 0.55, cover: 0.025, stirrupDia: 8,
    fc: 25, fy: 420, maxAggregateSizeMm: 20, edition: '2025',
    stations: envelope(), supportI: 'continuous', supportJ: 'continuous',
    vn: 400,
    bottom: { count: 6, diameterMm: 20 },
    topStart: { count: 4, diameterMm: 16 },
    topEnd: { count: 4, diameterMm: 16 },
    lateralSystem: false,
    ld: (d) => 0.04 * d,
    origin: { x: 0, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 },
    bentUp: { seismicDesign: 'notRequired', optOut: false, assumption: 'Zona sísmica 0' },
    ...over,
  };
}

describe('provided bottom rows reach the fabricated cage', () => {
  it('restores a verified 8+5 bottom cage instead of borrowing a 6+6+1 layout from the top', () => {
    const row = [-0.133778, -0.080267, -0.026756, 0.026756, 0.080267, 0.133778];
    const build = (rowCounts?: number[]) => generateBeamBars(input({
      b: 0.35, h: 0.65, bottom: { count: 13, diameterMm: 10, rowCounts },
      topStart: { count: 24, diameterMm: 10 }, topEnd: { count: 24, diameterMm: 10 },
      transverseSlots: [...row, ...row, ...row, ...row],
      transverseLayers: [0, 1, 2, 3].flatMap(layer => row.map(() => layer)),
      bentUp: { seismicDesign: 'notRequired', optOut: true },
    }));
    const rows = (g: ReturnType<typeof build>) => {
      const counts: number[] = [];
      for (const bar of g.bars.filter(b => b.id.includes('-bot-'))) {
        counts[g.barLayers[bar.id]] = (counts[g.barLayers[bar.id]] ?? 0) + 1;
      }
      return counts;
    };
    expect(rows(build())).toEqual([6, 6, 1]);
    const restored = build([8, 5]);
    expect(rows(restored)).toEqual([8, 5]);
    expect(restored.bars.filter(b => b.id.includes('-bot-')).every(b => b.diameterMm === 10)).toBe(true);
  });

  it.each([[2, 4], [3, 2], [7, -1], [2.5, 3.5]])('does not certify an invalid prescribed population %j', (...rowCounts) => {
    expect(layoutBarRow({ count: 6, diameterMm: 16, rowCounts,
      clearWidth: 0.23, minClear: 0.025, layerClear: 0.025,
    }).fits).toBe(false);
  });
  it('changes the actual row populations instead of repacking the same total', () => {
    const build = (rowCounts: number[]) => generateBeamBars(input({
      bottom: { count: 6, diameterMm: 16, rowCounts },
      bentUp: { seismicDesign: 'notRequired', optOut: true },
      // A coordinated six-bar row cannot overwrite a provided two-row cage.
      transverseSlots: [-0.10, -0.06, -0.02, 0.02, 0.06, 0.10],
      transverseLayers: [0, 0, 0, 0, 0, 0],
    }));
    const counts = (r: ReturnType<typeof build>) => {
      const result = [0, 0];
      for (const bar of r.bars.filter(b => b.id.includes('-bot-'))) result[r.barLayers[bar.id]]++;
      return result;
    };
    const a = build([4, 2]), b = build([3, 3]);
    expect(counts(a)).toEqual([4, 2]);
    expect(counts(b)).toEqual([3, 3]);
    expect(b.bars.filter(x => x.id.includes('-bot-')).map(x => x.segments))
      .not.toEqual(a.bars.filter(x => x.id.includes('-bot-')).map(x => x.segments));
  });
});

// ─── D13c ────────────────────────────────────────────────────────

describe('D13c — when bent-up bars may be generated', () => {
  const p = (o: Partial<BentUpPolicy>): BentUpPolicy =>
    ({ seismicDesign: 'unstated', optOut: false, ...o });

  it('refuses when the project has not stated whether seismic design applies', () => {
    // The rule that matters: absence of seismic load cases is NOT sufficient. A model
    // whose author has not added the seismic case yet is indistinguishable from one in a
    // non-seismic jurisdiction.
    const d = bentUpPermitted(p({ seismicDesign: 'unstated' }), '2025');
    expect(d.permitted).toBe(false);
    expect(d.reason).toMatch(/indistinguible de uno en jurisdicción no sísmica/);
  });

  it('permits when the project explicitly states seismic design does not apply', () => {
    const d = bentUpPermitted(
      p({ seismicDesign: 'notRequired', assumption: 'Zona sísmica 0' }), '2025');
    expect(d.permitted).toBe(true);
    expect(d.reason).toMatch(/Zona sísmica 0/);
  });

  it('defers to the 103 Part II adapter in a seismic project', () => {
    expect(bentUpPermitted(p({ seismicDesign: 'required' }), '2025').permitted).toBe(false);
    expect(bentUpPermitted(
      p({ seismicDesign: 'required', seismicAdapterPermits: true }), '2025').permitted).toBe(true);
    expect(bentUpPermitted(
      p({ seismicDesign: 'required', seismicAdapterPermits: false }), '2025').permitted).toBe(false);
  });

  it('honours the project opt-out over everything', () => {
    const d = bentUpPermitted(
      p({ seismicDesign: 'notRequired', optOut: true }), '2025');
    expect(d.permitted).toBe(false);
    expect(d.reason).toMatch(/desactivadas/);
  });

  it('always gives a reason and cites the right edition', () => {
    for (const s of ['required', 'notRequired', 'unstated'] as const) {
      for (const ed of ['2025', '2005'] as const) {
        const d = bentUpPermitted(p({ seismicDesign: s }), ed);
        expect(d.reason.length).toBeGreaterThan(20);
        expect(d.refs.find((r) => r.regulation === 'cirsoc-201')?.edition).toBe(ed);
      }
    }
  });
});

// ─── Cut-offs ────────────────────────────────────────────────────

describe('§9.7.3 cut-off computation', () => {
  const st = envelope();

  it('finds the point where the envelope drops to the retained capacity', () => {
    const x = theoreticalCutoff(st, 'mPos', 200, 0.5, 3, 0);
    expect(x).not.toBeNull();
    expect(x!).toBeGreaterThan(0);
    expect(x!).toBeLessThan(3);
  });

  it('returns null when the envelope never drops that far', () => {
    expect(theoreticalCutoff(st, 'mPos', 200, 0.0, 3, 2.9)).toBeNull();
  });

  it('extends by max(d, 12 d_b) per §9.7.3.3', () => {
    // d = 0.55 governs over 12 × 0.020 = 0.24.
    const c = evaluateCutoff({
      theoretical: 2.0, d: 0.55, diameterMm: 20, stations: st, vn: 400,
      b: 0.30, fy: 420, continuingDoubleArea: false, inTensionZone: false,
      edition: '2025', towardEnd: true,
    });
    expect(c.actual).toBeCloseTo(2.55, 9);
    expect(c.refs[0].clause).toBe('9.7.3.3');
  });

  it('lets 12 d_b govern for a large bar in a shallow beam', () => {
    // 12 × 0.032 = 0.384 > d = 0.30.
    const c = evaluateCutoff({
      theoretical: 2.0, d: 0.30, diameterMm: 32, stations: st, vn: 400,
      b: 0.30, fy: 420, continuingDoubleArea: false, inTensionZone: false,
      edition: '2025', towardEnd: true,
    });
    expect(c.actual).toBeCloseTo(2.384, 6);
  });

  it('does not apply §9.7.3.5 outside a tension zone', () => {
    const c = evaluateCutoff({
      theoretical: 2.0, d: 0.55, diameterMm: 20, stations: st, vn: 400,
      b: 0.30, fy: 420, continuingDoubleArea: false, inTensionZone: false,
      edition: '2025', towardEnd: true,
    });
    expect(c.legality).toBe('notInTension');
  });

  it('legalises via §9.7.3.5(a) when shear is low', () => {
    // Cut near midspan, where the envelope shear is small.
    const c = evaluateCutoff({
      theoretical: 2.9, d: 0.55, diameterMm: 20, stations: st, vn: 400,
      b: 0.30, fy: 420, continuingDoubleArea: false, inTensionZone: true,
      edition: '2025', towardEnd: true,
    });
    expect(c.legality).toBe('lowShear');
    expect(c.note).toMatch(/9\.7\.3\.5\(a\)/);
  });

  it('legalises via §9.7.3.5(b) with double area and moderate shear', () => {
    const c = evaluateCutoff({
      theoretical: 0.8, d: 0.55, diameterMm: 25, stations: envelope(6, 200, 150, 300),
      vn: 400, b: 0.30, fy: 420, continuingDoubleArea: true, inTensionZone: true,
      edition: '2025', towardEnd: false,
    });
    expect(['doubleArea', 'lowShear']).toContain(c.legality);
  });

  it('falls back to §9.7.3.5(c) extra stirrups when (a) and (b) both fail', () => {
    const c = evaluateCutoff({
      theoretical: 0.2, d: 0.55, diameterMm: 20, stations: envelope(6, 200, 150, 390),
      vn: 400, b: 0.30, fy: 420, continuingDoubleArea: false, inTensionZone: true,
      edition: '2025', towardEnd: false,
    });
    expect(c.legality).toBe('extraStirrups');
    expect(c.extraStirrups!.length).toBeCloseTo(0.75 * 0.55, 9);
    expect(c.extraStirrups!.maxSpacing).toBeCloseTo(0.55 / 8, 9);
    expect(c.extraStirrups!.minAvOverS).toBeCloseTo(0.41 * 0.30 / 420, 9);
    expect(c.note).toMatch(/βb adoptado = 1/);
  });

  it('never invents a convenient cut-off position', () => {
    // The actual position is always the theoretical one plus the mandated extension,
    // in the stated direction — never nudged to make a rule pass.
    for (const toward of [true, false]) {
      const c = evaluateCutoff({
        theoretical: 1.5, d: 0.55, diameterMm: 20, stations: st, vn: 400,
        b: 0.30, fy: 420, continuingDoubleArea: false, inTensionZone: true,
        edition: '2025', towardEnd: toward,
      });
      expect(c.actual).toBeCloseTo(toward ? 1.5 + 0.55 : 1.5 - 0.55, 9);
    }
  });
});

// ─── Stirrup zones ───────────────────────────────────────────────

describe('stirrup zone merging', () => {
  const z = (from: number, to: number, spacing: number,
    reason: StirrupZone['reason'] = 'shear'): StirrupZone =>
    ({
      from, to, spacing, diameterMm: 8, legs: 2, reason, refs: [],
      // Table 9.7.6.2.2 fields the zone now carries. Row 1's across-width limit for a
      // 300 mm web is 400 mm against 242 mm between two leg centres, so 2 legs are legal.
      acrossMax: 0.400, row: 'row1',
    });

  it('lets the tighter spacing win over an overlap', () => {
    // Two overlapping zones with different spacings would be an undrawable instruction.
    const merged = mergeStirrupZones([z(0, 6, 0.30, 'minimum'), z(0, 1.2, 0.15)], 6);
    expect(merged[0].spacing).toBeCloseTo(0.15, 9);
    expect(merged[0].to).toBeCloseTo(1.2, 9);
    expect(merged[1].spacing).toBeCloseTo(0.30, 9);
  });

  it('produces contiguous, non-overlapping zones covering the span', () => {
    const merged = mergeStirrupZones(
      [z(0, 6, 0.30, 'minimum'), z(0, 1.2, 0.15), z(4.8, 6, 0.15)], 6);
    expect(merged[0].from).toBeCloseTo(0, 9);
    expect(merged[merged.length - 1].to).toBeCloseTo(6, 9);
    for (let i = 1; i < merged.length; i++) {
      expect(merged[i].from).toBeCloseTo(merged[i - 1].to, 9);
    }
  });

  it('coalesces adjacent identical zones', () => {
    const merged = mergeStirrupZones([z(0, 3, 0.20), z(3, 6, 0.20)], 6);
    expect(merged).toHaveLength(1);
    expect(merged[0].to).toBeCloseTo(6, 9);
  });

  it('clamps zones to the span', () => {
    const merged = mergeStirrupZones([z(-1, 7, 0.20)], 6);
    expect(merged[0].from).toBeCloseTo(0, 9);
    expect(merged[0].to).toBeCloseTo(6, 9);
  });

  it('returns nothing for no input', () => {
    expect(mergeStirrupZones([], 6)).toEqual([]);
  });

  it.each([
    [z(0, 5.99625, 0.075, 'cutoff'), z(5.99625, 6, 0.175)],
    [z(0, 0.00375, 0.175), z(0.00375, 6, 0.075, 'cutoff')],
    [z(0, 0.85775, 0.175), z(0.85775, 0.85875, 0.075, 'cutoff'), z(0.85875, 6, 0.275)],
  ])('does not place colliding cages at a millimetre-wide requirement boundary (%#)', (...zones) => {
    const merged = mergeStirrupZones(zones, 6);
    const stations = merged.flatMap((zone, i) => stirrupStations({ ...zone,
      nextZoneStartsAtEnd: i + 1 < merged.length && merged[i + 1].from === zone.to,
    }));
    expect(stations[0]).toBe(0);
    expect(stations.at(-1)).toBe(6);
    for (let i = 1; i < stations.length; i++) {
      expect(stations[i] - stations[i - 1]).toBeGreaterThan(0.016);
      // Every interval that intersects a requirement respects that requirement's pitch.
      for (const zone of zones) {
        if (stations[i] > zone.from + 1e-9 && stations[i - 1] < zone.to - 1e-9) {
          expect(stations[i] - stations[i - 1]).toBeLessThanOrEqual(zone.spacing + 1e-6);
        }
      }
    }
  });

  it('keeps incompatible cages and uncovered gaps explicit', () => {
    const first = z(0, 0.003, 0.15);
    for (const change of [{ diameterMm: 10 }, { legs: 4 }, { acrossMax: 0.2 }, { row: 'row2' as const }, { from: 0.004 }]) {
      const second = { ...z(0.003, 6, 0.15), ...change };
      expect(mergeStirrupZones([first, second], 6)).toEqual([first, second]);
    }
  });
});

// ─── End-to-end generation ───────────────────────────────────────

describe('beam bar generation', () => {
  it('uses each group diameter for clear spacing, including larger top bars', () => {
    const g = generateBeamBars(input({ b: 0.4,
      bottom: { count: 4, diameterMm: 12 },
      topStart: { count: 6, diameterMm: 32 }, topEnd: { count: 6, diameterMm: 32 },
    }));
    const top = g.bars.filter(b => b.id.includes('-topRun-') || b.id.includes('-topI-'));
    expect(top).toHaveLength(6);
    const firstRow = top.filter(b => g.barLayers[b.id] === 0).map(b =>
      b.segments.filter(s => s.kind === 'straight').sort((a, b) => b.length - a.length)[0].start.y).sort((a, b) => a - b);
    expect(firstRow).toHaveLength(5);
    for (let k = 1; k < firstRow.length; k++) expect(firstRow[k] - firstRow[k - 1] - 0.032).toBeGreaterThanOrEqual(0.032);
  });

  it('fits the support steel between the actual asymmetric continuous pair', () => {
    // The 350 mm frame beam's coordinated row is clipped at the stirrup bend. Its
    // fallback must keep BOTH corner positions, not mirror the wider one and leave
    // only 20 mm between the retained continuous bar and the next support bar.
    const row = [-0.1186164141349725, -0.024283080801639167, 0.017, 0.05566666666666666, 0.09433333333333332, 0.133];
    const g = generateBeamBars(input({ b: 0.35, h: 0.65, stirrupDia: 10,
      topStart: { count: 16, diameterMm: 12 }, topEnd: { count: 17, diameterMm: 12 },
      transverseSlots: [...row, ...row, ...row.slice(0, 5)],
      transverseLayers: [...row.map(() => 0), ...row.map(() => 1), ...row.slice(0, 5).map(() => 2)],
    }));
    for (const [side, count] of [['I', 16], ['J', 17]] as const) {
      const bars = g.bars.filter(b => b.id.includes('-topRun-') || b.id.includes(`-top${side}-`));
      expect(bars).toHaveLength(count);
      const rows = new Map<number, number[]>();
      for (const b of bars) {
        const body = b.segments.filter(s => s.kind === 'straight').sort((a, b) => b.length - a.length)[0];
        const key = Math.round(body.start.z * 1e6);
        rows.set(key, [...(rows.get(key) ?? []), body.start.y]);
      }
      for (const positions of rows.values()) {
        positions.sort((a, b) => a - b);
        for (let k = 1; k < positions.length; k++) {
          expect(positions[k] - positions[k - 1] - 0.012).toBeGreaterThanOrEqual(0.02666666);
        }
      }
    }
  });

  it('generates physical bars, cut-offs and stirrup zones', () => {
    const g = generateBeamBars(input());
    expect(g.bars.length).toBeGreaterThan(0);
    expect(g.cutoffs.length).toBeGreaterThan(0);
    expect(g.stirrupZones.length).toBeGreaterThan(0);
    expect(g.trace.length).toBeGreaterThan(3);
  });

  it('continues one quarter of the positive steel into a continuous support', () => {
    const g = generateBeamBars(input({ supportI: 'continuous', supportJ: 'continuous' }));
    // 6 bars, 1/4 -> ceil(1.5) = 2, floored at 2.
    const cont = g.bars.filter((b) => b.id.includes('bot-cont'));
    expect(cont).toHaveLength(2);
    expect(g.trace.join(' ')).toMatch(/1\/4 mínimo/);
  });

  it('continues one third into a simple support', () => {
    const g = generateBeamBars(input({ supportI: 'simple' }));
    // 6 bars, 1/3 -> 2.
    expect(g.bars.filter((b) => b.id.includes('bot-cont'))).toHaveLength(2);
    expect(g.trace.join(' ')).toMatch(/1\/3 mínimo/);
  });

  it('never continues fewer than two bars', () => {
    const g = generateBeamBars(input({ bottom: { count: 3, diameterMm: 16 } }));
    expect(g.bars.filter((b) => b.id.includes('bot-cont')).length).toBeGreaterThanOrEqual(2);
  });

  it('extends continuing bottom bars past the support face', () => {
    const g = generateBeamBars(input());
    const cont = g.bars.find((b) => b.id.includes('bot-cont'))!;
    // 6 m span plus 150 mm each side.
    expect(cont.cuttingLength).toBeCloseTo(6.3, 6);
  });

  it('anchors with hooks when the beam is part of the lateral system', () => {
    const plain = generateBeamBars(input({ lateralSystem: false }));
    const lateral = generateBeamBars(input({ lateralSystem: true }));
    const pc = plain.bars.find((b) => b.id.includes('bot-cont'))!;
    const lc = lateral.bars.find((b) => b.id.includes('bot-cont'))!;
    expect(pc.startTreatment.kind).toBe('straight');
    expect(lc.startTreatment.kind).toBe('hook');
    expect(lc.cuttingLength).toBeGreaterThan(pc.cuttingLength);
    expect(lateral.trace.join(' ')).toMatch(/9\.7\.3\.8\.2/);
  });

  it('curtails the remaining bottom bars between the two cut-offs', () => {
    const g = generateBeamBars(input());
    const cut = g.bars.filter((b) => b.id.includes('bot-cut'));
    expect(cut.length).toBe(4);
    // A curtailed bar is shorter than a continuing one.
    const cont = g.bars.find((b) => b.id.includes('bot-cont'))!;
    expect(cut[0].cuttingLength).toBeLessThan(cont.cuttingLength);
  });

  it('runs bars through rather than inventing a cut-off when none exists', () => {
    // A flat envelope never drops to the retained level.
    const flat: MomentStation[] = Array.from({ length: 11 }, (_, i) =>
      ({ x: i * 0.6, mPos: 200, mNeg: 0, v: 100 }));
    const g = generateBeamBars(input({ stations: flat }));
    expect(g.bars.some((b) => b.id.includes('bot-run'))).toBe(true);
    // Reported in the trace, NOT as an unsupported condition: running the bars through is
    // the correct outcome, and calling it unsupported blocked CONSTRUCTIBLE for every
    // ordinary beam, which made the review workflow unreachable.
    expect(g.trace.join(' ')).toMatch(/se corre completa/);
    expect(g.unsupported.join(' ')).not.toMatch(/corte teórico/);
  });

  it('generates top bars at both supports, two of them running through', () => {
    const g = generateBeamBars(input());
    // §25.7.1.2: each of a closed stirrup's two top bends "debe contener una barra
    // longitudinal", so two top bars run the whole member instead of every one of them
    // curtailing into a support. They occupy two of each support's positions and count
    // toward its hogging steel, so the per-support totals are unchanged — what changed is
    // that two of the bars no longer stop.
    const run = g.bars.filter((b) => b.id.includes('topRun'));
    expect(run).toHaveLength(2);
    expect(g.bars.filter((b) => b.id.includes('topI')).length + run.length).toBe(4);
    expect(g.bars.filter((b) => b.id.includes('topJ')).length + run.length).toBe(4);
    // They are continuous: present at mid-span, where the curtailed bars are not.
    for (const bar of run) {
      const xs = bar.segments.flatMap((sg) => [sg.start.x, sg.end.x]);
      expect(Math.min(...xs)).toBeLessThanOrEqual(0);
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(6);
    }
  });

  it('places bottom bars below the axis and top bars above it', () => {
    const g = generateBeamBars(input());
    const bot = g.bars.find((b) => b.id.includes('bot-cont'))!;
    const top = g.bars.find((b) => b.id.includes('topI'))!;
    expect(bot.segments[0].start.z).toBeLessThan(0);
    expect(top.segments[0].start.z).toBeGreaterThan(0);
  });

  it('adds a §9.7.3.5(c) stirrup zone when a cut-off needs one', () => {
    const g = generateBeamBars(input({ stations: envelope(6, 200, 150, 390), vn: 400 }));
    const hasCutoffZone = g.stirrupZones.some((z) => z.reason === 'cutoff');
    const needed = g.cutoffs.some((c) => c.legality === 'extraStirrups');
    expect(hasCutoffZone).toBe(needed);
  });

  it('tightens stirrups near the supports', () => {
    const g = generateBeamBars(input());
    const atSupport = g.stirrupZones.find((z) => z.from < 0.1)!;
    const atMid = g.stirrupZones.find((z) => z.from < 3 && z.to > 3)!;
    expect(atSupport.spacing).toBeLessThanOrEqual(atMid.spacing);
  });

  it('records the bent-up decision in the trace regardless of outcome', () => {
    for (const s of ['required', 'notRequired', 'unstated'] as const) {
      const g = generateBeamBars(input({ bentUp: { seismicDesign: s, optOut: false } }));
      expect(g.trace[0]).toMatch(/Barras dobladas:/);
    }
  });

  it('cites only the declared edition', () => {
    for (const ed of ['2025', '2005'] as const) {
      const g = generateBeamBars(input({ edition: ed }));
      const c201 = g.refs.filter((r) => r.regulation === 'cirsoc-201');
      expect(c201.length).toBeGreaterThan(0);
      expect(c201.every((r) => r.edition === ed), ed).toBe(true);
    }
  });

  it('is byte-deterministic', () => {
    expect(JSON.stringify(generateBeamBars(input())))
      .toBe(JSON.stringify(generateBeamBars(input())));
  });

  it('gives every bar a unique id', () => {
    const ids = generateBeamBars(input()).bars.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('attributes every bar to its element', () => {
    for (const b of generateBeamBars(input()).bars) {
      expect(b.ownerElementIds).toContain(7);
    }
  });
});
