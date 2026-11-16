import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const root = join(__dirname, '../../..');
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? e.name === '__tests__' || e.name === 'axes' && dir === join(root, 'lib') ? [] : files(join(dir, e.name)) : /\.(ts|svelte)$/.test(e.name) ? [join(dir, e.name)] : []);

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
  const axisNames = new Set(['frame']);
  for (const m of source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:along|userAxisAlong|makeFrame|axesStore\.frame)\b|\b(\w+)\s*:\s*(?:import\([^)]+\)\.)?AxesFrame\b/g)) axisNames.add((m[1] ?? m[2])!);
  for (const m of source.matchAll(/const\s*\[([^\]]+)\]\s*=\s*\[along\(/g)) for (const name of m[1]!.split(',')) axisNames.add(name.trim());
  for (const m of source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:along|userAxisAlong)\([^)]*\)\.sign/g)) {
    const pattern = new RegExp(`\\b${m[1]}\\s*\\*`, 'g');
    for (const match of source.matchAll(pattern)) failures.push(match[0]);
  }
  for (const name of axisNames) {
    for (const pattern of [new RegExp(`\\b${name}\\.rows\\b`, 'g'), new RegExp(`\\b${name}\\.sign\\s*\\*`, 'g')]) for (const m of source.matchAll(pattern)) failures.push(m[0]);
  }
  for (const pattern of [
    /(?:along|userAxisAlong)\([^)]*\)\.sign\s*\*/g,
    /\b(?:frame|axesStore\.frame)\.rows\b/g,
    /\buserVec\((?:r\.f[xyz]|d\.u[xyz])|\buserRot\((?:r\.m[xyz]|d\.r[xyz])/g,
    /\btwoD\.(?:x|z|rot)\((?:[rd]\.(?:ux|uz|ry|rx|rz|my)|-?get2DDisplay(?:DisplacementVertical|Rotation|ReactionVertical|Moment)\([rd]\))/g,
  ]) for (const match of source.matchAll(pattern)) failures.push(match[0]);
  return failures;
}

it('the output guard rejects direct transforms including aliased primitive imports', () => {
  for (const source of ["import { toUser as display } from '../axes/frame';", 'const v = frame.rows.map(row => row[0] * force);', 'const ratio = along(0).sign * participation;', 'const a = along(0); const f = a.sign * force;', 'const view = (f: AxesFrame) => f.rows.map(row => row[0] * force);', 'const d = twoD.x(d.ux);', 'const r = userVec(r.fx, r.fy, r.fz);', 'const r = userRot(d.rx, d.ry, d.rz);', 'const flip = along(0).sign; const v = flip * force;', 'const alias = axesStore.frame; const v = alias.rows.map(row => row[0] * force);']) expect(directTransforms(source).length).toBeGreaterThan(0);
  expect(directTransforms("const v = resultComponents(frame, results).vec(fx, fy, fz);")).toEqual([]);
});

it('known wrong result: #2259 every output selects a quantity kind through the shared transform layer', () => {
  const failures = files(root).flatMap(file => directTransforms(readFileSync(file, 'utf8')).map(reason => `${relative(root, file)}: ${reason}`));
  expect(failures).toEqual([]);
});
