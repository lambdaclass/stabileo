import ts from 'typescript';

function unusedLocaleInitializers(source, edits) {
  const options = { noLib: true, noResolve: true, target: ts.ScriptTarget.Latest };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = id => id === source.fileName ? source : undefined;
  const checker = ts.createProgram([source.fileName], options, host).getTypeChecker();
  const module = checker.getSymbolAtLocation(source);
  if (!module) return;
  const exported = new Set(checker.getExportsOfModule(module).map(symbol => symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol));
  const candidates = new Map();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const symbol = checker.getSymbolAtLocation(declaration.name);
      if (!exported.has(symbol)) candidates.set(symbol, { declaration, references: [] });
    }
  }
  function references(node) {
    if (ts.isIdentifier(node)) {
      const symbol = ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
      const candidate = candidates.get(symbol);
      if (candidate && node !== candidate.declaration.name) candidate.references.push(node);
    }
    ts.forEachChild(node, references);
  }
  references(source);
  const removed = node => edits.some(([start, end]) => start <= node.getStart(source) && node.end <= end);
  let changed;
  do {
    changed = false;
    for (const [symbol, { declaration, references }] of candidates) {
      if (!references.length || !references.every(removed)) continue;
      edits.push([declaration.initializer.getStart(source), declaration.initializer.end, 'undefined']);
      candidates.delete(symbol);
      changed = true;
    }
  } while (changed);
}

export function researchLocaleBuildPlugin(features) {
  return {
    name: 'research-locale-build',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (features().research || !/\/src\/components\/(research|tools)\/.*\.ts$/.test(id) || /\.(test|spec)\.ts$/.test(id)) return null;
      const source = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      if (source.parseDiagnostics.length) throw new Error(`Cannot gate research locales in ${id}: invalid TypeScript`);
      const edits = [];
      function visit(node) {
        if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) && node.name.getText(source).replace(/^['"]|['"]$/g, '') === 'hu') {
          edits.push([node.getStart(source), node.end, '...{}']);
          return;
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      if (!edits.length) return null;
      unusedLocaleInitializers(source, edits);
      const outer = edits.filter(([start, end], index) => !edits.some(([otherStart, otherEnd], other) => index !== other && otherStart <= start && end <= otherEnd));
      for (const [start, end, replacement] of outer.sort((a, b) => b[0] - a[0])) code = code.slice(0, start) + replacement + code.slice(end);
      return { code, map: null };
    },
  };
}
