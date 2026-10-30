"""Write a wasm-metadce graph that keeps only this crate's exports.

The research crate links the Stabileo engine, whose #[wasm_bindgen] exports would otherwise all
be kept in this bundle. Every export whose name starts with one of KEEP is a root; everything
else (and the code only it reaches) is removed by wasm-metadce.

  python3 -I trim_exports.py <in.wasm> <graph.json>
"""
import json, sys

KEEP = ("form_find", "__wbindgen", "memory")


def leb(b, i):
    r = s = 0
    while True:
        x = b[i]; i += 1
        r |= (x & 0x7F) << s; s += 7
        if x < 0x80:
            return r, i


def name(b, i):
    n, i = leb(b, i)
    return b[i:i + n].decode(), i + n


data = open(sys.argv[1], "rb").read()
assert data[:4] == b"\0asm"
i = 8
exports, imports = [], []
while i < len(data):
    sid = data[i]; i += 1
    size, i = leb(data, i)
    end = i + size
    if sid == 2:
        n, j = leb(data, i)
        for _ in range(n):
            mod, j = name(data, j); base, j = name(data, j)
            kind = data[j]; j += 1
            if kind == 0: _, j = leb(data, j)
            elif kind == 1: j += 1; flags, j = leb(data, j); _, j = leb(data, j); j = leb(data, j)[1] if flags & 1 else j
            elif kind == 2: flags, j = leb(data, j); _, j = leb(data, j); j = leb(data, j)[1] if flags & 1 else j
            elif kind == 3: j += 2
            elif kind == 4: j += 1; _, j = leb(data, j)
            imports.append((mod, base))
    elif sid == 7:
        n, j = leb(data, i)
        for _ in range(n):
            nm, j = name(data, j); j += 1; _, j = leb(data, j)
            exports.append(nm)
    i = end
graph = [{"name": f"export:{e}", "export": e, "root": True} for e in exports if e.startswith(KEEP)]
graph += [{"name": f"import:{m}:{b}", "import": [m, b]} for m, b in imports]
kept = sum(1 for g in graph if g.get("root"))
print(f"{len(exports)} exports, keeping {kept}; {len(imports)} imports", file=sys.stderr)
json.dump(graph, open(sys.argv[2], "w"))
