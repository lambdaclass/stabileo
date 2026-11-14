import { describe, expect, it } from 'vitest';
import { TOOLS, TOPICS, findTool, toolLastmod, toolPaths, toolsIn } from '../registry';
import { TOOL_IDS } from '../calculators';
import { BATCH_IDS } from '../batch';
import { EXAMPLES } from '../../examples/catalog';
import { toolTranslations } from '../translations';
import { batchTranslations } from '../batch-i18n';
import { hubTranslations } from '../hub-i18n';
import { PUBLIC_LOCALES } from '../../../lib/i18n/offered';
import { PUBLIC_KEY_PREFIXES } from '../../../lib/i18n/public-prefixes';
import toolReviews from '../../../../../research/tools/batches/VALIDATION.json';

const text = (locale: string, key: string) => batchTranslations[locale]?.[key] ?? hubTranslations[locale]?.[key] ?? toolTranslations[locale]?.[key];

describe('tool registry', () => {
  it('holds every calculator, batch tool and model once, each under a unique id', () => {
    const ids = TOOLS.map(tool => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TOOLS.filter(tool => tool.kind === 'calculator').map(tool => tool.id).sort()).toEqual([...TOOL_IDS].sort());
    expect(TOOLS.filter(tool => tool.kind === 'batch').map(tool => tool.id).sort()).toEqual([...BATCH_IDS].sort());
    expect(TOOLS.filter(tool => tool.kind === 'model').map(tool => tool.id).sort()).toEqual(EXAMPLES.map(e => e.id).sort());
  });

  it('files every tool under a topic and keeps a slot for stresses', () => {
    for (const tool of TOOLS) expect(TOPICS).toContain(tool.topic);
    expect(TOPICS).toEqual(['beams', 'stability', 'stresses', 'models']);
    expect(TOPICS.flatMap(toolsIn)).toHaveLength(TOOLS.length);
  });

  it('finds a tool by its path, with or without the trailing slash, and lists the index first', () => {
    expect(findTool('/tools/beam-frame')?.kind).toBe('model');
    expect(findTool('/tools/portal-frame/')?.kind).toBe('batch');
    expect(findTool('/tools')).toBeUndefined();
    expect(findTool('/tools/unknown')).toBeUndefined();
    expect(toolPaths()).toEqual(['/tools', ...TOOLS.map(tool => `/tools/${tool.id}`)]);
  });

  it('dates every tool by its review or by the day it states', () => {
    for (const tool of TOOLS) expect(toolLastmod(tool, toolReviews.batches), tool.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const latest = (batch: string) => toolReviews.batches.find(b => b.id === batch)!.reviews.map(r => r.date).sort().at(-1);
    expect(toolLastmod(findTool('/tools/truss-2d')!, toolReviews.batches)).toBe(latest('tools-batch-2'));
    expect(toolLastmod(findTool('/tools/cantilever-beam')!, toolReviews.batches)).toBe(latest('tools-batch-1'));
  });

  it('names and describes every tool and topic in all six languages', () => {
    for (const locale of PUBLIC_LOCALES) {
      for (const tool of TOOLS) {
        expect(text(locale, `tools.${tool.id}`), `${locale} ${tool.id}`).toBeTruthy();
        expect(text(locale, `tools.${tool.id}.subtitle`), `${locale} ${tool.id}`).toBeTruthy();
      }
      for (const topic of TOPICS) {
        expect(text(locale, `tools.topic.${topic}`), `${locale} ${topic}`).toBeTruthy();
        expect(text(locale, `tools.topic.${topic}.lead`), `${locale} ${topic}`).toBeTruthy();
      }
    }
  });

  it('keeps the tools hub strings in all six languages, out of the landing dictionary', () => {
    const keys = Object.keys(hubTranslations.en).sort();
    for (const locale of PUBLIC_LOCALES) {
      expect(Object.keys(hubTranslations[locale]).sort(), locale).toEqual(keys);
      for (const key of keys) expect(hubTranslations[locale][key].match(/\{\w+\}/g) ?? [], `${locale} ${key}`).toEqual(hubTranslations.en[key].match(/\{\w+\}/g) ?? []);
    }
    for (const key of keys) expect(PUBLIC_KEY_PREFIXES.some(prefix => key.startsWith(prefix)), key).toBe(false);
    for (const value of Object.values(hubTranslations.es)) expect(value).not.toMatch(/—|\b(mueve|mira|cambia) /);
  });
});
