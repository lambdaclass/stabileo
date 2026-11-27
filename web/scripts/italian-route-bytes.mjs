function propertyName(property) {
  if (property.type !== 'Property' || property.computed) return undefined;
  return property.key.name ?? property.key.value;
}

function children(node, visit) {
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      for (const item of child) if (item?.type) visit(item);
    } else if (child?.type) visit(child);
  }
}

export function italianCopyBytes(code, moduleIds, parse) {
  const dedicated = moduleIds.length > 0 && moduleIds.every(id =>
    /\/lib\/i18n\/locales\/(?:[^/]+\/)*it\.ts$/.test(id) || /^\0virtual:(?:app|public)-i18n\/it$/.test(id));
  if (!dedicated && !/\bit\b/.test(code)) return 0;

  const ast = parse(code);
  const bindings = new Map();
  const eligible = new Set();
  for (const statement of ast.body) {
    const declaration = statement.declaration ?? statement;
    if (declaration.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
    for (const { id, init } of declaration.declarations) {
      if (id.type === 'Identifier' && init?.type === 'ObjectExpression') {
        bindings.set(id.name, init);
        eligible.add(id.start);
      }
    }
  }
  const copy = new Set();
  const references = [];
  const identifiers = [];
  function collect(node) {
    if (node.type === 'Property' && !node.computed) {
      collect(node.value);
      return;
    }
    if (node.type === 'Identifier') identifiers.push(node);
    if (node.type === 'ObjectExpression') {
      if (dedicated) {
        copy.add(node);
        return;
      }
      if (node.properties.some(p => propertyName(p) === 'en')) {
        const value = node.properties.find(p => propertyName(p) === 'it')?.value;
        if (value?.type === 'Identifier') {
          references.push(value.name);
          eligible.add(value.start);
        } else if (value) copy.add(value);
      }
    }
    children(node, collect);
  }
  collect(ast);
  for (const identifier of identifiers) {
    if (!eligible.has(identifier.start)) bindings.delete(identifier.name);
  }
  for (const name of references) if (bindings.has(name)) copy.add(bindings.get(name));

  const literals = new Set();
  function count(node) {
    if (node.type === 'ObjectExpression') {
      for (const prop of node.properties) if (propertyName(prop) !== undefined) count(prop.value);
    } else if (node.type === 'ArrayExpression') {
      for (const item of node.elements) if (item) count(item);
    } else if (node.type === 'Literal' && typeof node.value === 'string') {
      literals.add(node);
    }
  }
  for (const value of copy) count(value);
  let bytes = 0;
  for (const literal of literals) bytes += Buffer.byteLength(code.slice(literal.start, literal.end));
  return bytes;
}
