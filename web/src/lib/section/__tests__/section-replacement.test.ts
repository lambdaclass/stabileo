/**
 * A section replaced through the store keeps nothing of the section it replaced.
 *
 * The store merges a choice's fields into the section. A field the choice left out kept the old
 * section's value, and a geometry-backed section's A and J were stripped from the edit, so the
 * old ones stayed for the resolver to start from: a tube reopened as a round bar stayed a tube, a
 * catalogue pick reopened as the template it replaced, and a channel edited into an inverted L
 * kept the channel's J as if it were published.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { toSectionFields } from '../section-choice';
import { computeSectionProperties, type ShapeType } from '../../data/section-shapes';
import { defaultProfileSpec } from '../profile-spec';
import { solverProperties } from '../state';
import { hasCanonicalGeometryExport } from '../../engine/wasm-solver';

const d = hasCanonicalGeometryExport() ? describe : describe.skip;

function template(shapeType: ShapeType, params: Record<string, number>) {
  const props = computeSectionProperties(shapeType, params)!;
  return { props, fields: toSectionFields({ kind: 'built', name: shapeType, shapeType, params, props, rotationDeg: 0 }, 0)! };
}

beforeEach(() => modelStore.clear());

d('a section replaced through the store', () => {
  it('a tube reopened as a solid round bar is the bar', () => {
    const id = modelStore.addSection(template('hollow-circular', { d: 0.2, t: 0.008 }).fields as never);
    const bar = template('circular', { d: 0.2 });
    modelStore.updateSection(id, bar.fields as never);
    const s = modelStore.sections.get(id)!;
    expect(s.t).toBeUndefined();
    const sp = solverProperties(s);
    expect(sp.source).toBe('canonical');
    expect(Math.abs(sp.a - bar.props.a) / bar.props.a).toBeLessThan(1e-12);
  });

  it('a template replaced by a catalogue pick drops the template record and its lip', () => {
    const id = modelStore.addSection(template('C-custom', { h: 0.2, b: 0.075, tw: 0.002, tf: 0.002, c: 0.02, tl: 0.002 }).fields as never);
    expect(modelStore.sections.get(id)!.built).toBeDefined();
    modelStore.updateSection(id, toSectionFields({ kind: 'standard', spec: defaultProfileSpec('IPE 200') }, 0) as never);
    const s = modelStore.sections.get(id)!;
    expect(s.built).toBeUndefined();
    expect(s.tl).toBeUndefined();
    expect(s.shape).toBe('I');
  });

  it('a catalogue pick replaced by a template drops the composition and family', () => {
    const id = modelStore.addSection(toSectionFields({ kind: 'standard', spec: defaultProfileSpec('IPE 200') }, 0) as never);
    expect(modelStore.sections.get(id)!.composition).toBeDefined();
    modelStore.updateSection(id, template('rect', { b: 0.2, h: 0.4 }).fields as never);
    const s = modelStore.sections.get(id)!;
    expect(s.composition).toBeUndefined();
    expect(s.profileFamily).toBeUndefined();
  });

  it('a channel edited into an inverted L takes the L\'s J, not the channel\'s', () => {
    const id = modelStore.addSection(template('C-custom', { h: 0.2, b: 0.075, tw: 0.002, tf: 0.002, c: 0.02, tl: 0.002 }).fields as never);
    const jChannel = solverProperties(modelStore.sections.get(id)!).j!;
    const l = template('concrete-invL', { bw: 0.2, hw: 0.4, bf: 0.6, hf: 0.12 });
    modelStore.updateSection(id, l.fields as never);
    const j = solverProperties(modelStore.sections.get(id)!).j!;
    expect(j).not.toBe(jChannel);
    expect(j).toBeCloseTo(l.props.j!, 12);
  });

  /*
   * The store mirrors the J it resolved into the section's `j`, and the resolver takes a section's
   * own `j` as published. An edit that brought no J of its own then kept the mirrored one, as
   * 'catalogue', for a web nearly twice as thick.
   */
  it('a J the engine computed is computed again after a dimension edit, not kept as published', () => {
    const id = modelStore.addSection(toSectionFields({ kind: 'standard', spec: defaultProfileSpec('IPE 300') }, 0) as never);
    modelStore.updateSection(id, toSectionFields({ kind: 'standard', spec: defaultProfileSpec('IPE 300') }, 0) as never);
    const before = solverProperties(modelStore.sections.get(id)!);
    expect(before.jProvenance).toBe('saintVenant');
    modelStore.updateSection(id, { tw: 0.012 });
    const after = solverProperties(modelStore.sections.get(id)!);
    expect(after.jProvenance).toBe('saintVenant');
    expect(after.j!).toBeGreaterThan(before.j! * 1.2);
  });
});
