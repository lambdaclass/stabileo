import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from '../web/node_modules/typescript/lib/typescript.js';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const allowFile = 'scripts/agent-mistakes-allow.txt';
const issueTag = /known wrong result: #([1-9]\d*)\b/;
const protectedPath = /^web\/src\/lib\/(?:engine|model|store)\//;
const testModule = /^(?:vitest|@playwright\/test|node:test|.*\/fixtures)$/;
const testFile = /(?:\.(?:test|spec)\.[^.]+$|\/__tests__\/|^web\/e2e\/)/;
const testNames = new Set(['it', 'test', 'describe', 'suite']);
const modes = new Set(['skip', 'skipIf', 'runIf', 'fails', 'only', 'todo']);
const conditions = new Set(['skipIf', 'runIf']);
const wrappingModifiers = new Set(['each', 'extend', 'for', ...conditions]);
const K = ts.SyntaxKind;

function knownWrongIssue(annotation) {
  return annotation?.match(issueTag)?.[1];
}

function visit(node, callback) {
  if (callback(node) !== false) ts.forEachChild(node, child => visit(child, callback));
}

function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node))) node = node.expression;
  return node;
}

function access(node) {
  if (node && ts.isPropertyAccessExpression(node)) return [node.expression, node.name.text];
  if (node && ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return [node.expression, node.argumentExpression.text];
  }
  return [];
}

function transfer(statement) {
  if (ts.isThrowStatement(statement) || ts.isReturnStatement(statement) ||
    ts.isBreakStatement(statement) || ts.isContinueStatement(statement)) return true;
  if (ts.isBlock(statement)) return statement.statements.some(transfer);
  return ts.isIfStatement(statement) && statement.elseStatement &&
    transfer(statement.thenStatement) && transfer(statement.elseStatement);
}

function checkedNever(node, operand, checker) {
  if (ts.isSatisfiesExpression(node)) {
    return node.type.kind === K.NeverKeyword && node.expression.getText() === operand.getText();
  }
  if (ts.isIdentifier(node)) {
    const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
    return declaration && ts.isVariableDeclaration(declaration) && declaration.type?.kind === K.NeverKeyword &&
      declaration.initializer?.getText() === operand.getText();
  }
  return ts.isCallExpression(node) && checker.getResolvedSignature(node)?.declaration?.type?.kind === K.NeverKeyword;
}

function explicitRefusal(node) {
  if (!ts.isObjectLiteralExpression(node)) return false;
  const marker = node.properties.findLast(property => ts.isSpreadAssignment(property) ||
    property.name && ts.isComputedPropertyName(property.name) || property.name.text === 'ok');
  return marker && ts.isPropertyAssignment(marker) && marker.name.text === 'ok' &&
    marker.initializer.kind === K.FalseKeyword;
}

function switchDefaults(node, checker, report) {
  const clauses = node.caseBlock.clauses;
  const start = clauses.findIndex(ts.isDefaultClause);
  if (start < 0) return;
  for (const clause of clauses.slice(start)) {
    for (const statement of clause.statements) {
      visit(statement, child => {
        if (ts.isFunctionLike(child) || ts.isClassLike(child)) return false;
        if (ts.isReturnStatement(child) && child.expression) {
          const value = unwrap(child.expression);
          if (!explicitRefusal(value) && !checkedNever(value, node.expression, checker)) report('switch-default', child);
        }
        if ((ts.isBinaryExpression(child) && child.operatorToken.kind >= K.FirstAssignment && child.operatorToken.kind <= K.LastAssignment) ||
          ((ts.isPrefixUnaryExpression(child) || ts.isPostfixUnaryExpression(child)) &&
            (child.operator === K.PlusPlusToken || child.operator === K.MinusMinusToken))) {
          report('switch-default', child);
        }
      });
      if (transfer(statement)) return;
    }
  }
}

function testRules(source, checker, report) {
  const symbol = node => checker.getSymbolAtLocation(node);
  const declaration = node => ts.isIdentifier(node) ? symbol(node)?.valueDeclaration : undefined;
  const reported = new Set();

  function once(rule, node, snippet) {
    const key = rule + ':' + node.pos;
    if (reported.has(key)) return;
    reported.add(key);
    report(rule, node, snippet);
  }

  function readsEnv(node, seen = new Set()) {
    node = unwrap(node);
    if (!node || seen.has(node)) return false;
    seen.add(node);
    const [base, property] = access(node);
    if (property === 'env' && (base.getText() === 'process' || base.getText() === 'import.meta')) return true;
    const binding = declaration(node);
    if (binding && ts.isVariableDeclaration(binding) && readsEnv(binding.initializer, seen)) return true;
    if (binding && ts.isBindingElement(binding)) {
      const initial = binding.parent.parent.initializer;
      if ((binding.propertyName ?? binding.name).getText() === 'env' && initial?.getText() === 'process') return true;
      if (readsEnv(initial, seen)) return true;
    }
    const imported = ts.isIdentifier(node) && symbol(node)?.declarations?.[0];
    if (imported && ts.isImportSpecifier(imported) && (imported.propertyName ?? imported.name).text === 'env' &&
      /^(?:node:)?process$/.test(imported.parent.parent.parent.moduleSpecifier.text)) return true;
    return !!ts.forEachChild(node, child => readsEnv(child, seen) || undefined);
  }

  function title(node, seen = new Set()) {
    node = unwrap(node);
    if (!node || seen.has(node)) return '';
    seen.add(node);
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isTemplateExpression(node)) {
      return node.head.text + node.templateSpans.map(span => {
        const expression = title(span.expression, seen);
        return (expression || '\u0000') + span.literal.text;
      }).join('');
    }
    const binding = declaration(node);
    if (binding && ts.isVariableDeclaration(binding)) return title(binding.initializer, seen);
    return '';
  }

  function knownWrong(node) {
    const condition = node.condition;
    if (!ts.isBinaryExpression(condition) || condition.operatorToken.kind !== K.EqualsEqualsEqualsToken ||
      condition.left.getText() !== 'process.env.RUN_KNOWN_WRONG' || !ts.isStringLiteral(condition.right) ||
      !/^[1-9]\d*$/.test(condition.right.text) || node.whenTrue.getText() !== 'it' ||
      node.whenFalse.getText() !== 'it.skip') return;
    const binding = node.parent;
    if (!ts.isVariableDeclaration(binding) || !(binding.parent.flags & ts.NodeFlags.Const)) return;
    return condition.right.text;
  }

  function api(node, seen = new Set()) {
    node = unwrap(node);
    if (!node || seen.has(node)) return;
    seen.add(node);
    if (ts.isIdentifier(node)) {
      const binding = declaration(node);
      if (binding && ts.isVariableDeclaration(binding)) return api(binding.initializer, seen);
      const imported = symbol(node)?.declarations?.[0];
      if (imported && ts.isImportSpecifier(imported) && testModule.test(imported.parent.parent.parent.moduleSpecifier.text)) {
        const name = (imported.propertyName ?? imported.name).text;
        if (testNames.has(name)) return { name };
      }
      if (imported && ts.isImportClause(imported) && imported.parent.moduleSpecifier.text === 'node:test') return { name: 'test' };
      if (!imported && testNames.has(node.text)) return { name: node.text };
    }
    if (ts.isConditionalExpression(node)) {
      const yes = api(node.whenTrue, new Set(seen));
      const no = api(node.whenFalse, seen);
      if (!yes && !no) return;
      const skip = yes?.skip ?? no?.skip;
      const env = readsEnv(node.condition) ? node : yes?.env ?? no?.env;
      return { name: (yes ?? no).name, skip, env, skipOrigin: skip && node, issue: knownWrong(node) };
    }
    if (ts.isCallExpression(node)) {
      const wrapper = api(node.expression, seen);
      if (wrapper?.wrap) return { ...wrapper, wrap: false };
      return;
    }
    const [base, property] = access(node);
    if (!base) return;
    const namespace = ts.isIdentifier(base) && symbol(base)?.declarations?.[0];
    if (namespace && ts.isNamespaceImport(namespace) &&
      testModule.test(namespace.parent.parent.moduleSpecifier.text) && testNames.has(property)) return { name: property };
    const parent = api(base, seen);
    if (!parent) return;
    if (parent.name === 'test' && property === 'describe') return { ...parent, name: 'describe' };
    if (!modes.has(property) && !wrappingModifiers.has(property)) return;
    return {
      ...parent,
      mode: modes.has(property) ? property : parent.mode,
      skip: property === 'skip' || property === 'skipIf' ? node : parent.skip,
      wrap: wrappingModifiers.has(property),
    };
  }

  function hasRegistration(node) {
    if (ts.isCallExpression(node) && api(node.expression)) return true;
    if (ts.isFunctionLike(node)) return false;
    return !!ts.forEachChild(node, child => hasRegistration(child) || undefined);
  }

  function isTestCallback(node) {
    let parent = node.parent;
    while (parent && !ts.isFunctionLike(parent)) parent = parent.parent;
    return parent && ts.isCallExpression(parent.parent) && !!api(parent.parent.expression);
  }

  function hasEarlyReturn(node) {
    if (ts.isReturnStatement(node)) return true;
    if (ts.isFunctionLike(node)) return false;
    return !!ts.forEachChild(node, child => hasEarlyReturn(child) || undefined);
  }

  visit(source, node => {
    if (ts.isCallExpression(node)) {
      const call = api(node.expression);
      if (!call) return;
      if (call.wrap) {
        if (conditions.has(call.mode) && readsEnv(node.arguments[0])) once('test-env', node);
        return;
      }
      const tag = knownWrongIssue(title(node.arguments[0]));
      if (call.env && (!call.issue || tag !== call.issue)) once('test-env', call.env);
      if (call.skip && !tag) {
        const argumentsBeforeCallback = [];
        for (const argument of node.arguments) {
          if (ts.isFunctionLike(argument)) break;
          argumentsBeforeCallback.push(argument.getText());
        }
        const signature = node.expression.getText() + '(' + argumentsBeforeCallback.join(', ') + ')';
        const guard = call.skipOrigin ?? (ts.isExpressionStatement(node.parent) && ts.isIfStatement(node.parent.parent)
          ? node.parent.parent.expression : undefined);
        once('test-skip', node, guard ? signature + ' via ' + guard.getText() : signature);
      }
      if (call.skip && readsEnv(node.arguments[0])) once('test-env', node);
      for (const argument of node.arguments) {
        if (!ts.isObjectLiteralExpression(argument)) continue;
        for (const property of argument.properties) {
          if (ts.isPropertyAssignment(property) && ['skip', 'todo', 'only'].includes(property.name.text) &&
            readsEnv(property.initializer)) once('test-env', property);
        }
      }
    }
    if (ts.isIfStatement(node) || ts.isConditionalExpression(node)) {
      const predicate = ts.isIfStatement(node) ? node.expression : node.condition;
      const branches = ts.isIfStatement(node) ? [node.thenStatement, node.elseStatement] : [node.whenTrue, node.whenFalse];
      if (readsEnv(predicate) && branches.some(branch => branch &&
          (hasRegistration(branch) || (isTestCallback(node) && hasEarlyReturn(branch))))) {
        once('test-env', node);
      }
      if (ts.isConditionalExpression(node) && !knownWrong(node) && api(node)?.env === node) {
        once('test-env', node);
      }
    }
    if ((ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node)) &&
      readsEnv(node.expression) && hasRegistration(node.statement)) {
      once('test-env', node);
    }
    if (ts.isBinaryExpression(node) &&
      [K.AmpersandAmpersandToken, K.BarBarToken, K.QuestionQuestionToken].includes(node.operatorToken.kind) &&
      readsEnv(node.left) && hasRegistration(node.right)) once('test-env', node);
  });
}

function rustIgnores(text, report) {
  const tokens = [];
  const token = /\/\/[^\n]*|\/\*|(?:br|cr|r)(#*)"[\s\S]*?"\1|(?:b|c)?"(?:\\[\s\S]|[^"\\])*"|(?:b)?'(?:\\u\{[\da-fA-F]+\}|\\.|[^'\\\n])'|[A-Za-z_]\w*|[^\s]/g;
  for (let match; (match = token.exec(text));) {
    if (match[0].startsWith('//')) continue;
    if (match[0] === '/*') {
      const comments = /\/\*|\*\//g;
      comments.lastIndex = token.lastIndex;
      let depth = 1;
      for (let part; depth && (part = comments.exec(text));) depth += part[0] === '/*' ? 1 : -1;
      token.lastIndex = depth ? text.length : comments.lastIndex;
      continue;
    }
    tokens.push({ value: match[0], offset: match.index });
  }
  const value = index => tokens[index]?.value;
  for (let index = 0; index < tokens.length; index++) {
    if (value(index) !== '#' || value(index + 1) !== '[') continue;
    let depth = 1;
    let end = index + 2;
    for (; end < tokens.length && depth; end++) {
      if (value(end) === '[') depth++;
      if (value(end) === ']') depth--;
    }
    for (let n = index + 2; n < end - 1; n++) {
      if (value(n) !== 'ignore' || !['=', ']', ')', ','].includes(value(n + 1))) continue;
      if (n !== index + 2 && !(value(index + 2) === 'cfg_attr' && value(n - 1) === ',')) continue;
      const annotation = value(n + 1) === '=' && value(n + 2)?.match(/^(?:r#*)?"([\s\S]*?)"#*$/)?.[1];
      if (annotation && knownWrongIssue(annotation)) continue;
      const attr = text.slice(tokens[index].offset, tokens[end - 1].offset + 1);
      const fn = text.slice(tokens[end - 1].offset + 1).match(/^(?:(?:\s|#\[[^\n]*\])*)(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)/)?.[1];
      report('test-skip', tokens[n].offset, fn ? attr + ' fn ' + fn : attr);
    }
    index = end - 1;
  }
}

function walk(root, dir = '') {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const path = dir ? dir + '/' + entry.name : entry.name;
    return entry.isDirectory() ? walk(root, path) : entry.isFile() ? [path] : [];
  });
}

function loadAllow(text) {
  const entries = new Map();
  const problems = [];
  let reason = false;
  for (const [index, raw] of text.split('\n').entries()) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('## ')) { reason = true; continue; }
    if (line.startsWith('#')) continue;
    if (!/^(?:switch-default|test-skip|test-env) [^:]+: .+$/.test(line)) {
      problems.push(allowFile + ':' + (index + 1) + ': expected "<rule> <path>: <source>"');
    } else if (!reason) {
      problems.push(allowFile + ':' + (index + 1) + ': no "## reason" line above entry');
    } else {
      entries.set(line, (entries.get(line) ?? 0) + 1);
    }
    reason = false;
  }
  return { entries, problems };
}

const messages = {
  'switch-default': 'default must refuse or be checked as never before returning a value; do not assign a fallback',
  'test-skip': 'skipped test needs "known wrong result: #<issue>" in its name or Rust ignore reason',
  'test-env': 'environment controls whether this test runs; use ordinary registration or the issue-matched RUN_KNOWN_WRONG mechanism',
};

function check(root, paths) {
  const { entries, problems } = loadAllow(readFileSync(join(root, allowFile), 'utf8'));
  const sources = new Map();
  const tests = new Set();
  const report = (rule, path, line, snippet) => {
    const normalized = snippet.trim().replace(/\s+/g, ' ');
    const signature = normalized.length <= 250 ? normalized
      : normalized.slice(0, 180) + ' … [' + createHash('sha256').update(normalized).digest('hex').slice(0, 16) + ']';
    const key = rule + ' ' + path + ': ' + signature;
    const count = entries.get(key) ?? 0;
    if (count) entries.set(key, count - 1);
    else problems.push(path + ':' + line + ': [' + rule + '] ' + messages[rule] + '\n  ' + key);
  };
  for (const path of paths.sort()) {
    if (!existsSync(join(root, path))) continue;
    if (path.endsWith('.rs')) {
      const content = readFileSync(join(root, path), 'utf8');
      if (/\bignore\b/.test(content)) rustIgnores(content, (rule, offset, snippet) => {
        report(rule, path, content.slice(0, offset).split('\n').length, snippet);
      });
    }
    if (!/\.(?:[cm]?[jt]sx?|svelte)$/.test(path)) continue;
    const text = readFileSync(join(root, path), 'utf8');
    const switchCandidate = protectedPath.test(path) && /\bdefault\b/.test(text);
    const testCandidate = /\b(?:skip|skipIf|runIf|env)\b/.test(text) &&
      (testFile.test(path) || /['"](?:vitest|@playwright\/test|node:test)['"]/.test(text));
    if (!switchCandidate && !testCandidate) continue;
    let content = text;
    if (path.endsWith('.svelte')) {
      content = text.replace(/<script\b[^>]*>([\s\S]*?)<\/script>|[^]+?(?=<script\b|$)/g, (match, code, offset) => {
        if (code === undefined) return match.replace(/[^\n]/g, ' ');
        const start = match.indexOf('>') + 1;
        return match.slice(0, start).replace(/[^\n]/g, ' ') + code + ' '.repeat(match.length - start - code.length);
      });
    }
    const file = join(root, path);
    sources.set(file, ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true,
      path.endsWith('.svelte') ? ts.ScriptKind.TS : undefined));
    if (testCandidate) tests.add(file);
  }
  const compiler = { allowJs: true, allowNonTsExtensions: true, noLib: true, noResolve: true, types: [] };
  const host = ts.createCompilerHost(compiler);
  host.getSourceFile = file => sources.get(file);
  const checker = ts.createProgram([...sources.keys()], compiler, host).getTypeChecker();
  for (const [file, source] of sources) {
    const path = file.slice(root.length + 1);
    const hit = (rule, node, snippet = node.getText()) => {
      report(rule, path, source.getLineAndCharacterOfPosition(node.getStart()).line + 1, snippet);
    };
    if (protectedPath.test(path)) visit(source, node => {
      if (ts.isSwitchStatement(node)) switchDefaults(node, checker, hit);
    });
    if (tests.has(file)) testRules(source, checker, hit);
  }
  for (const [key, count] of entries) if (count) problems.push(allowFile + ': entry no longer matches: ' + key);
  return problems;
}

const root = process.argv[2] === '--root' ? resolve(process.argv[3]) : repo;
const paths = root === repo
  ? [...new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--'], { cwd: root })
    .toString().split('\0').filter(Boolean))]
  : walk(root);
const problems = check(root, paths);
for (const problem of problems) console.error(problem);
if (problems.length) process.exitCode = 1;
