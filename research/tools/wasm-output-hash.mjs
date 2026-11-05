import { createHash } from 'node:crypto';
const h = createHash('sha256');
let count = 0;
const tag = (s) => h.update(s + '\0');
export function feed(v) {
  count++;
  if (v === null || v === undefined) return tag(String(v));
  if (typeof v === 'number') { const b = Buffer.alloc(8); b.writeDoubleLE(v); tag('n'); return h.update(b); }
  if (typeof v === 'bigint' || typeof v === 'boolean') return tag(typeof v + String(v));
  if (typeof v === 'string') return tag('s' + v);
  if (ArrayBuffer.isView(v)) { tag('t' + v.constructor.name + v.length); return h.update(Buffer.from(v.buffer, v.byteOffset, v.byteLength)); }
  if (Array.isArray(v)) { tag('a' + v.length); return v.forEach(feed); }
  if (typeof v === 'object') {
    if ('__wbg_ptr' in v) return tag('wasm-object');
    const keys = Object.keys(v).sort(); tag('o' + keys.join(','));
    return keys.forEach((k) => feed(v[k]));
  }
  tag(typeof v);
}
const wrapped = new WeakMap();
export function wrap(x, name) {
  if (typeof x !== 'function' && (typeof x !== 'object' || x === null || !('__wbg_ptr' in x))) return x;
  if (wrapped.has(x)) return wrapped.get(x);
  const p = new Proxy(x, {
    apply(t, self, args) { const r = Reflect.apply(t, self && self.__real ? self.__real : self, args.map((a) => (a && a.__real) || a)); tag('call ' + name); feed(r); return wrap(r, name + '()'); },
    construct(t, args) { const r = Reflect.construct(t, args.map((a) => (a && a.__real) || a)); tag('new ' + name); return wrap(r, name); },
    get(t, k) {
      if (k === '__real') return t;
      const v = Reflect.get(t, k, t);
      return typeof v === 'function' && k !== 'constructor' ? wrap(v.bind ? v.bind(t) : v, name + '.' + String(k)) : v;
    },
  });
  wrapped.set(x, p);
  return p;
}
process.on('exit', () => console.log(`OUTPUT-HASH ${h.digest('hex')} values=${count}`));
