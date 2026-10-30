import ts from 'typescript';

import { SMOKE_TIMEOUT_MS } from './e2e-budgets';
export { SMOKE_PATTERN, SMOKE_TIMEOUT_MS } from './e2e-budgets';

export function inspectE2E(source: string, file = 'spec.ts') {
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const jsonImports: string[] = [];
  const smokeTimeouts: string[] = [];
  const location = (node: ts.Node) => `${file}:${root.getLineAndCharacterOfPosition(node.getStart(root)).line + 1}`;
  // Only executable string literals count; comments mentioning @smoke do not.
  const tags = (node: ts.Node): string[] => {
    const found: string[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) found.push(...(n.text.match(/@(smoke|slow|flaky)\b/g) ?? []));
      ts.forEachChild(n, visit);
    };
    visit(node);
    return found;
  };
  const isScope = (node: ts.Node): node is ts.CallExpression =>
    ts.isCallExpression(node) && /^test(?:\.(?:describe|serial|parallel|only|skip|fixme))*$/.test(node.expression.getText(root));
  const scopeTags = (node: ts.CallExpression) => {
    const title = node.arguments[0];
    const found = title && (ts.isStringLiteralLike(title) || ts.isTemplateExpression(title)) ? tags(title) : [];
    const details = node.arguments[1];
    if (details && ts.isObjectLiteralExpression(details)) {
      for (const property of details.properties) {
        if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
          && property.name.text === 'tag') found.push(...tags(property.initializer));
      }
    }
    return found;
  };
  let fileHasSmoke = false;
  const findSmoke = (node: ts.Node) => {
    if (isScope(node) && scopeTags(node).includes('@smoke')) fileHasSmoke = true;
    ts.forEachChild(node, findSmoke);
  };
  findSmoke(root);
  const exempt = (node: ts.Node) => {
    const line = root.getLineAndCharacterOfPosition(node.getStart(root)).line;
    const start = root.getPositionOfLineAndCharacter(line, 0);
    const end = source.indexOf('\n', start);
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source.slice(start, end < 0 ? undefined : end));
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      if (token === ts.SyntaxKind.SingleLineCommentTrivia && /^\/\/\s*slow-ok:\s*\S.*$/.test(scanner.getTokenText())) return true;
    }
    return false;
  };
  const visit = (node: ts.Node, slow = false) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.endsWith('.json')) {
      const attrs = node.attributes;
      if (attrs?.token !== ts.SyntaxKind.WithKeyword || !attrs.elements.some(a => a.name.text === 'type' && ts.isStringLiteral(a.value) && a.value.text === 'json')) jsonImports.push(location(node));
    }
    if (isScope(node)) {
      const ownTags = scopeTags(node);
      slow ||= ownTags.includes('@slow') || ownTags.includes('@flaky');
    }
    if (fileHasSmoke && !slow) {
      let value: ts.Expression | undefined;
      let testBudget = false;
      if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === 'timeout') {
        value = node.initializer;
        const options = node.parent;
        const call = options.parent;
        testBudget = ts.isObjectLiteralExpression(options) && ts.isCallExpression(call)
          && /^test\.describe(?:\.(?:serial|parallel))?\.configure$/.test(call.expression.getText(root));
      }
      if (ts.isCallExpression(node) && /^(?:test|testInfo|info)\.setTimeout$/.test(node.expression.getText(root))) { value = node.arguments[0]; testBudget = true; }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'setTimeout') {
        const receiver = node.expression.expression;
        if (ts.isCallExpression(receiver) && receiver.arguments.length === 0 && ts.isPropertyAccessExpression(receiver.expression)
          && ts.isIdentifier(receiver.expression.expression) && receiver.expression.expression.text === 'test'
          && receiver.expression.name.text === 'info') { value = node.arguments[0]; testBudget = true; }
      }
      // Parentheses do not change a literal's value. Other expressions must use
      // literal milliseconds so an unresolved test budget cannot evade the cap.
      while (value && ts.isParenthesizedExpression(value)) value = value.expression;
      const invalid = value && (!ts.isNumericLiteral(value) || Number(value.text) > SMOKE_TIMEOUT_MS || Number(value.text) <= 0);
      if (testBudget ? !value || invalid : value && ts.isNumericLiteral(value) && invalid && !exempt(node)) smokeTimeouts.push(location(node));
      if (ts.isCallExpression(node) && node.expression.getText(root) === 'test.slow') smokeTimeouts.push(location(node));
    }
    ts.forEachChild(node, child => visit(child, slow));
  };
  visit(root);
  return { jsonImports, smokeTimeouts };
}
