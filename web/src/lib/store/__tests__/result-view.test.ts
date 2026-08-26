/**
 * Which quantity is on screen, and how it is drawn.
 *
 * These are two independent facts that `diagramType` had been encoding as one:
 * `'axial'` is the axial force as a diagram, `'axialColor'` is the same
 * quantity as member colour, and `'colorMap'` is some quantity — named in a
 * second field — as a heat map. Three spellings for two facts.
 *
 * Every reader had to know all three encodings to answer "what is the user
 * looking at", and each derived it separately: the ribbon to light a command,
 * the panel to offer the representations. So the derivation is pinned here
 * rather than in each of them.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { installViewModeRules } from '../view-mode';
import {
  activeQuantity, activeRepresentation, representationsFor,
  showQuantityAs, commandShowsQuantity,
  colourScaleSource, hasLiveColourScale, showStressMap, activeMapMeasure,
} from '../result-view';

/*
 * The editing/reading exclusion is wired by installViewModeRules(), normally
 * called once from the store barrel. This file imports the stores directly, so
 * it installs the rules itself — the invariant under test lives in that wiring.
 */
installViewModeRules();

beforeEach(() => {
  resultsStore.diagramType = 'none' as never;
  resultsStore.colorMapKind = 'moment';
});

describe('reading what is on screen', () => {
  it('a diagram is that quantity, drawn as a diagram', () => {
    resultsStore.diagramType = 'momentY' as never;
    expect(activeQuantity()).toBe('momentY');
    expect(activeRepresentation()).toBe('diagram');
  });

  it('member colour is the axial force, drawn as colour', () => {
    resultsStore.diagramType = 'axialColor' as never;
    expect(activeQuantity()).toBe('axial');
    expect(activeRepresentation()).toBe('memberColour');
  });

  it('a colour map is the quantity named in the second field', () => {
    resultsStore.diagramType = 'colorMap' as never;
    resultsStore.colorMapKind = 'shearZ';
    expect(activeQuantity()).toBe('shearZ');
    expect(activeRepresentation()).toBe('colourMap');
  });

  it('says nothing is shown when nothing is', () => {
    expect(activeQuantity()).toBeNull();
    expect(activeRepresentation()).toBeNull();
  });

  it('does not claim a quantity for the deformed shape', () => {
    resultsStore.diagramType = 'deformed' as never;
    expect(activeQuantity()).toBeNull();
  });

  it('does not claim a quantity for a stress-ratio map', () => {
    /*
     * `stressRatio` and `vonMises` are derived measures, not internal forces:
     * they are chosen elsewhere, carry their own fixed scale, and must not
     * appear in a per-quantity selector — offering "show the stress ratio as a
     * diagram" would be offering something that does not exist.
     */
    resultsStore.diagramType = 'colorMap' as never;
    for (const kind of ['stressRatio', 'vonMises', 'shellVonMises', 'shellBending'] as const) {
      resultsStore.colorMapKind = kind;
      expect(activeQuantity(), kind).toBeNull();
      expect(activeRepresentation(), kind).toBeNull();
    }
  });
});

describe('what each quantity can be shown as', () => {
  it('offers a colour map for every quantity', () => {
    for (const q of ['axial', 'moment', 'shear', 'momentY', 'momentZ', 'shearY', 'shearZ', 'torsion'] as const) {
      expect(representationsFor(q), q).toContain('colourMap');
      expect(representationsFor(q), q).toContain('diagram');
    }
  });

  it('offers member colour for axial alone', () => {
    expect(representationsFor('axial')).toEqual(['diagram', 'memberColour', 'colourMap']);
    for (const q of ['moment', 'momentY', 'shearZ', 'torsion'] as const) {
      expect(representationsFor(q), q).not.toContain('memberColour');
    }
  });

  it('always lists the diagram first', () => {
    for (const q of ['axial', 'momentY', 'torsion'] as const) {
      expect(representationsFor(q)[0]).toBe('diagram');
    }
  });
});

describe('switching representation keeps the quantity', () => {
  it('diagram → colour map shows the same quantity', () => {
    showQuantityAs('momentZ', 'diagram');
    expect(activeQuantity()).toBe('momentZ');

    showQuantityAs('momentZ', 'colourMap');
    expect(activeQuantity()).toBe('momentZ');
    expect(activeRepresentation()).toBe('colourMap');
    expect(resultsStore.diagramType).toBe('colorMap');
  });

  it('colour map → diagram comes back to the same quantity', () => {
    showQuantityAs('shearY', 'colourMap');
    showQuantityAs('shearY', 'diagram');
    expect(resultsStore.diagramType).toBe('shearY');
    expect(activeRepresentation()).toBe('diagram');
  });

  it('axial round-trips through all three', () => {
    showQuantityAs('axial', 'diagram');
    expect(resultsStore.diagramType).toBe('axial');

    showQuantityAs('axial', 'memberColour');
    expect(resultsStore.diagramType).toBe('axialColor');
    expect(activeQuantity()).toBe('axial');

    showQuantityAs('axial', 'colourMap');
    expect(activeQuantity()).toBe('axial');
    expect(resultsStore.colorMapKind).toBe('axial');

    showQuantityAs('axial', 'diagram');
    expect(resultsStore.diagramType).toBe('axial');
  });

  it('member colour asked for a quantity that has none falls back to the diagram', () => {
    // Rather than painting a moment red for "hogging", which is a convention
    // about which fibre is in tension and not something to read off a colour.
    showQuantityAs('momentY', 'memberColour');
    expect(resultsStore.diagramType).toBe('momentY');
  });

  it('switching quantity while in a colour map keeps the colour map', () => {
    showQuantityAs('momentY', 'colourMap');
    showQuantityAs('torsion', 'colourMap');
    expect(activeQuantity()).toBe('torsion');
    expect(activeRepresentation()).toBe('colourMap');
  });
});

describe('the ribbon lights the quantity, not the representation', () => {
  it('stays lit through all three representations', () => {
    for (const how of ['diagram', 'memberColour', 'colourMap'] as const) {
      showQuantityAs('axial', how);
      expect(commandShowsQuantity('axial'), how).toBe(true);
    }
  });

  it('lights a colour-mapped quantity, which used to go dark', () => {
    showQuantityAs('shearZ', 'colourMap');
    expect(commandShowsQuantity('shearZ')).toBe(true);
    expect(commandShowsQuantity('momentY')).toBe(false);
  });

  it('lights exactly one command at a time', () => {
    const commands = ['axial', 'momentY', 'momentZ', 'shearY', 'shearZ', 'torsion'];
    for (const q of commands) {
      showQuantityAs(q as never, 'colourMap');
      const lit = commands.filter((c) => commandShowsQuantity(c));
      expect(lit, `showing ${q}`).toEqual([q]);
    }
  });

  it('lights nothing when a stress-ratio map is shown', () => {
    resultsStore.diagramType = 'colorMap' as never;
    resultsStore.colorMapKind = 'stressRatio';
    for (const c of ['axial', 'momentY', 'shearZ']) {
      expect(commandShowsQuantity(c), c).toBe(false);
    }
  });

  it('lights a non-quantity view — deformed — only while it is on screen', () => {
    /*
     * The Deformed command names no internal force, so the quantity logic can
     * never light it; it lights while exactly that view is shown, and goes out
     * when a quantity replaces it.
     */
    resultsStore.diagramType = 'deformed' as never;
    expect(commandShowsQuantity('deformed')).toBe(true);

    resultsStore.diagramType = 'moment' as never;
    expect(commandShowsQuantity('deformed')).toBe(false);
  });
});

describe('editing and reading stay mutually exclusive', () => {
  beforeEach(() => {
    uiStore.currentTool = 'select';
    resultsStore.diagramType = 'none' as never;
  });

  it('setting a diagram while a build tool is armed disarms the tool', () => {
    /*
     * The leak this closes: most entry points (keyboard 0–9, the mobile panel,
     * the advanced toolbar) write `diagramType` directly rather than calling
     * showDiagram — pressing "2" with the node tool armed left you placing
     * nodes on a shear diagram. The store's own setter enforces the rule now.
     */
    uiStore.currentTool = 'node';
    resultsStore.diagramType = 'shear' as never;
    expect(uiStore.currentTool).toBe('select');
    expect(resultsStore.diagramType).toBe('shear');
  });

  it('arming a build tool clears the diagram on screen', () => {
    resultsStore.diagramType = 'momentY' as never;
    uiStore.currentTool = 'element';
    expect(resultsStore.diagramType).toBe('none');
    expect(uiStore.currentTool).toBe('element');
  });

  it('clearing the diagram leaves the tool alone', () => {
    uiStore.currentTool = 'node';
    resultsStore.diagramType = 'none' as never;
    expect(uiStore.currentTool).toBe('node');
  });

  it('view tools stay armed while a diagram is shown', () => {
    // Select and Pan are how you LOOK at a result, not how you edit — picking
    // a diagram must not knock the pointer out of them.
    uiStore.currentTool = 'pan';
    resultsStore.diagramType = 'deformed' as never;
    expect(uiStore.currentTool).toBe('pan');
  });

  it('showQuantityAs disarms a build tool too', () => {
    uiStore.currentTool = 'support';
    showQuantityAs('torsion', 'colourMap');
    expect(uiStore.currentTool).toBe('select');
    expect(activeQuantity()).toBe('torsion');
  });
});

/**
 * The measure selector unmounting itself.
 *
 * The shell contours are offered INSIDE the stress-measure select, but the
 * select was gated on the stress measures alone — choosing "Shell σ Von
 * Mises" made the control vanish as a direct consequence of using it, and no
 * ribbon command lit over a map that was plainly on screen. `activeMapMeasure`
 * is the gate that knows the shells too.
 */
describe('the measure selector, shells included', () => {
  beforeEach(() => {
    resultsStore.diagramType = 'colorMap' as never;
  });

  it('names the stress measures AND the shell contours', () => {
    for (const kind of ['stressRatio', 'vonMises', 'sigmaMax', 'tauMax', 'shellVonMises', 'shellBending'] as const) {
      resultsStore.colorMapKind = kind;
      expect(activeMapMeasure(), kind).toBe(kind);
    }
  });

  it('says nothing for an internal force or for no map at all', () => {
    resultsStore.colorMapKind = 'momentY';
    expect(activeMapMeasure()).toBeNull();
    resultsStore.diagramType = 'none' as never;
    expect(activeMapMeasure()).toBeNull();
  });

  it('lets the select switch to a shell contour without unmounting itself', () => {
    showStressMap('stressRatio');
    expect(activeMapMeasure()).toBe('stressRatio');
    showStressMap('shellVonMises');
    expect(resultsStore.diagramType).toBe('colorMap');
    expect(activeMapMeasure()).toBe('shellVonMises');
  });
});

/**
 * The legend outliving its picture.
 *
 * Reported from the app: turn the scale on over a stress map, switch to a
 * bending diagram, and the bar stayed — labelled with the map's maximum, over
 * a picture that has nothing to do with it. The publisher is the drawing code,
 * so nothing runs to retract the value; the fix is that the value carries the
 * name of what drew it and is unusable once that changes.
 */
describe('colour scale liveness', () => {
  beforeEach(() => {
    resultsStore.setColourScale(null);
    resultsStore.diagramType = 'none' as never;
  });

  it('distinguishes two maps of different quantities', () => {
    showStressMap('vonMises');
    const a = colourScaleSource();
    showStressMap('tauMax');
    expect(colourScaleSource()).not.toBe(a);
  });

  it('goes dead when the result changes under it', () => {
    showStressMap('vonMises');
    resultsStore.setColourScale({ max: 235, unit: 'MPa', source: colourScaleSource() });
    expect(hasLiveColourScale()).toBe(true);

    showQuantityAs('momentZ', 'diagram');
    expect(hasLiveColourScale()).toBe(false);
  });

  it('goes dead between two maps until the new one publishes', () => {
    showStressMap('vonMises');
    resultsStore.setColourScale({ max: 235, unit: 'MPa', source: colourScaleSource() });

    // The switch alone must not leave the old maximum readable, even though
    // both pictures are colour maps and both want a legend.
    showStressMap('stressRatio');
    expect(hasLiveColourScale()).toBe(false);

    resultsStore.setColourScale({ max: 1, unit: '', source: colourScaleSource() });
    expect(hasLiveColourScale()).toBe(true);
  });

  it('comes back for the same picture without republishing', () => {
    showStressMap('vonMises');
    const scale = { max: 235, unit: 'MPa', source: colourScaleSource() };
    resultsStore.setColourScale(scale);
    showQuantityAs('momentZ', 'diagram');
    expect(hasLiveColourScale()).toBe(false);
    showStressMap('vonMises');
    expect(hasLiveColourScale()).toBe(true);
  });
});
