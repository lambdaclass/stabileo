function propertyName(property) {
  if (property.type !== 'Property' || property.computed) return undefined;
  return property.key.name ?? property.key.value;
}

export function italianCopyBytes(code, moduleIds, parse) {
  const dedicated = moduleIds.length > 0 && moduleIds.every(id =>
    /\/lib\/i18n\/locales\/(?:[^/]+\/)*it\.ts$/.test(id) || /^\0virtual:(?:app|public)-i18n\/it$/.test(id));
  if (!dedicated && !code.includes('it:') && !code.includes('"it":')) return 0;

  function dataBytes(node) {
    if (node.type === 'ArrayExpression') return node.elements.reduce((sum, item) => sum + (item ? dataBytes(item) : 0), 0);
    if (node.type === 'ObjectExpression') return node.properties.reduce((sum, prop) =>
      sum + (propertyName(prop) !== undefined ? dataBytes(prop.value) : 0), 0);
    return node.type === 'Literal' && typeof node.value === 'string'
      ? Buffer.byteLength(code.slice(node.start, node.end)) : 0;
  }

  let bytes = 0;
  function visit(node) {
    if (node.type === 'ObjectExpression') {
      if (dedicated) {
        bytes += dataBytes(node);
        return;
      }
      const fields = node.properties;
      if (fields.some(prop => propertyName(prop) === 'en') && fields.some(prop => propertyName(prop) === 'it')) {
        bytes += dataBytes(fields.find(prop => propertyName(prop) === 'it').value);
        for (const prop of fields) if (propertyName(prop) !== 'it') visit(prop);
        return;
      }
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) {
        for (const item of child) if (item?.type) visit(item);
      } else if (child?.type) visit(child);
    }
  }
  visit(parse(code));
  return bytes;
}
