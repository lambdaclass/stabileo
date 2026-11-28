import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore } from '..';
import { adoptAll, liveAdopted, proposalBasis, rcSheetsData, saveRcSheetsData, setSheetCode, sheetCode } from '../rc-sheets.svelte';
import { foundationSystem, setFoundationSystem } from '../rc-sheets-footings';
import { footingPreview } from '../rc-sheets-footing-preview.svelte';
import { designData, patchDesignData } from '../design-data';
import { migrateDesignData } from '../../model/design-data';
import type { Adopted } from '../../rc-sheets/types';

const column = { b: 0.3, h: 0.3 } as unknown as Adopted;
const footing = { B: 1.2, L: 1.2, h: 0.4 } as unknown as Adopted;
const live = () => Object.keys(liveAdopted(rcSheetsData(), sheetCode())).sort();

beforeEach(() => {
  modelStore.clear(); historyStore.clear();
  setSheetCode('cirsoc201-2025');
  footingPreview.system = 'auto';
});

describe('the foundation layout', () => {
  it('is cleared by hand even where the model holds footings, and stays cleared when the project is opened again', () => {
    modelStore.addFooting(modelStore.addNode(0, 0, 0), 'Z1');
    expect(foundationSystem(rcSheetsData())).toBe('auto');
    setFoundationSystem(null);
    expect(foundationSystem(rcSheetsData())).toBeNull();
    const reopened = migrateDesignData(JSON.parse(JSON.stringify(designData())));
    expect(reopened.rcSheets?.foundationSystem).toBeNull();
    expect(foundationSystem(reopened.rcSheets!)).toBeNull();
  });

  it('is the one shown when a footing is adopted while none is, and takes no other layout\'s footings with it', () => {
    footingPreview.system = 'strips';
    adoptAll([{ key: 'column:7', proposed: column }, { key: 'footing:n1', proposed: footing }]);
    expect(rcSheetsData().foundationSystem).toBe('strips');
    setFoundationSystem('mat');
    expect(Object.keys(rcSheetsData().adopted)).toEqual(['column:7']);
  });

  it('is not adopted by adopting members other than footings', () => {
    footingPreview.system = 'piles';
    adoptAll([{ key: 'column:7', proposed: column }]);
    expect(rcSheetsData().foundationSystem).toBeUndefined();
  });
});

describe('adopted proposals and the soil', () => {
  it('a new presumed pressure or property line designs only the footings again', () => {
    setFoundationSystem('footings');
    adoptAll([{ key: 'column:7', proposed: column }, { key: 'footing:n1', proposed: footing }]);
    expect(live()).toEqual(['column:7', 'footing:n1']);
    patchDesignData({ presumedBearingKPa: 220 });
    expect(live()).toEqual(['column:7']);
    patchDesignData({ propertyLines: { minX: true, maxX: false, minY: false, maxY: false } });
    expect(live()).toEqual(['column:7']);
  });

  it('a change the members read designs every family again', () => {
    adoptAll([{ key: 'column:7', proposed: column }]);
    patchDesignData({ covers: { ...designData().covers, beam: 0.04 } });
    expect(live()).toEqual([]);
  });

  it('a basis stored with the soil in it, before it had its own, keeps the members it was adopted for', () => {
    adoptAll([{ key: 'column:7', proposed: column }]);
    const old = JSON.stringify({ ...JSON.parse(proposalBasis()), bearing: 150, lines: null });
    const { adoptedFoundationBasis: _, ...d } = rcSheetsData();
    saveRcSheetsData({ ...d, adoptedBasis: old });
    expect(live()).toEqual(['column:7']);
  });
});
