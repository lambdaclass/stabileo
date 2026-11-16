import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const root = join(__dirname, '../../..');
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? e.name === '__tests__' || e.name === 'axes' ? [] : files(join(dir, e.name)) : /\.(ts|svelte)$/.test(e.name) ? [join(dir, e.name)] : []);

function directTransforms(source: string): string[] {
  const failures: string[] = [];
  const script = source.includes('<script') ? [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n') : source;
  const sf = ts.createSourceFile('output.ts', script, ts.ScriptTarget.Latest, true);
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || !/axes\/frame$/.test(statement.moduleSpecifier.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
      const name = (binding.propertyName ?? binding.name).text;
      if (/^(toUser|toModel|pseudoToUser|pseudoToModel)$/.test(name)) failures.push(`primitive import: ${name}`);
    }
  }
  for (const pattern of [
    /(?:along|userAxisAlong)\([^)]*\)\.sign\s*\*/g,
    /\b(?:frame|axesStore\.frame)\.rows\b/g,
    /\btwoD\.(?:x|z|rot)\((?:[rd]\.(?:ux|uz|ry|rx|rz|my)|-?get2DDisplay(?:DisplacementVertical|Rotation|ReactionVertical|Moment)\([rd]\))/g,
  ]) for (const match of source.matchAll(pattern)) failures.push(match[0]);
  return failures;
}

it('the output guard rejects direct transforms including aliased primitive imports', () => {
  for (const source of ["import { toUser as display } from '../axes/frame';", 'const v = frame.rows.map(row => row[0] * force);', 'const ratio = along(0).sign * participation;', 'const d = twoD.x(d.ux);']) expect(directTransforms(source).length).toBeGreaterThan(0);
  expect(directTransforms("const v = resultComponents(frame, results).vec(fx, fy, fz);")).toEqual([]);
});

it.skip('known wrong result: #2259 every output selects a quantity kind through the shared transform layer', () => {
  const failures = files(root).flatMap(file => directTransforms(readFileSync(file, 'utf8')).map(reason => `${relative(root, file)}: ${reason}`));
  expect(failures).toEqual([]);
});
