import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { RESULT_PROPERTY_POLICY } from '../../model/result-properties';

describe('result property classification #1318', () => {
  const source = ts.createSourceFile('model.svelte.ts', readFileSync(new URL('../../store/model.svelte.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  for (const [kind, name] of [['material', 'Material'], ['section', 'Section']] as const) {
    it(`classifies every ${name} field for fingerprinting`, () => {
      const declaration = source.statements.find((statement): statement is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(statement) && statement.name.text === name)!;
      expect(declaration).toBeDefined();
      expect(declaration.members.every(ts.isPropertySignature)).toBe(true);
      const fields = declaration.members.map(member => member.name!.getText(source));
      expect(Object.keys(RESULT_PROPERTY_POLICY[kind]).sort()).toEqual(fields.sort());
    });
  }
});
