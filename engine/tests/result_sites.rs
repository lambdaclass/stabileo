use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use syn::{Attribute, Fields, GenericArgument, GenericParam, Item, PathArguments, Type};

#[derive(Clone, Debug, PartialEq)]
enum Shape {
    Leaf,
    Diagnostic,
    Opaque,
    Seq(Box<Shape>),
    Map(Box<Shape>),
    Tuple(Vec<Shape>),
    Param(String),
    Named(String, Vec<Shape>),
    Unsupported(String),
}

#[derive(Clone, Debug, Default)]
struct FieldAttrs {
    rename: Option<String>,
    skip: bool,
    flatten: bool,
    custom: bool,
}

#[derive(Clone, Debug)]
struct FieldDef {
    ident: Option<String>,
    shape: Shape,
    attrs: FieldAttrs,
}

#[derive(Clone, Debug)]
enum Body {
    Named(Vec<FieldDef>),
    Unnamed(Vec<FieldDef>),
    Unit,
}

#[derive(Clone, Debug, Default)]
struct ContainerAttrs {
    rename_all: Option<String>,
    rename_all_fields: Option<String>,
    tag: Option<String>,
    content: Option<String>,
    untagged: bool,
    transparent: bool,
}

#[derive(Clone, Debug)]
struct VariantDef {
    name: String,
    rename: Option<String>,
    rename_all: Option<String>,
    skip: bool,
    untagged: bool,
    body: Body,
}

#[derive(Clone, Debug)]
enum DefKind {
    Struct(Body),
    Enum(Vec<VariantDef>),
}

#[derive(Clone, Debug)]
struct Def {
    origin: String,
    generics: Vec<(String, Option<Shape>)>,
    attrs: ContainerAttrs,
    kind: DefKind,
}

const SEQUENCES: &[&str] = &["Vec", "VecDeque", "HashSet", "BTreeSet", "IndexSet"];
const TRANSPARENT: &[&str] = &["Option", "Box", "Rc", "Arc", "Cow", "RefCell", "Cell"];
const MAPS: &[&str] = &["HashMap", "BTreeMap", "IndexMap", "Map"];
const PRIMITIVES: &[&str] = &[
    "f64", "f32", "i8", "i16", "i32", "i64", "i128", "isize", "u8", "u16", "u32", "u64", "u128", "usize",
    "bool", "char", "str", "String", "PathBuf", "Duration",
];

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let mut entries: Vec<_> = std::fs::read_dir(dir).unwrap().map(|e| e.unwrap().path()).collect();
    entries.sort();
    for path in entries {
        if path.is_dir() {
            rust_files(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

fn is_cfg_test(attrs: &[Attribute]) -> bool {
    attrs.iter().any(|a| {
        a.path().is_ident("cfg") && a.meta.require_list().is_ok_and(|l| {
            let tokens = l.tokens.to_string();
            tokens == "test" || tokens.starts_with("all (test") || tokens.starts_with("all(test")
        })
    })
}

fn derives_serialize(attrs: &[Attribute]) -> bool {
    let mut found = false;
    for attr in attrs {
        if attr.path().is_ident("derive") {
            let _ = attr.parse_nested_meta(|m| {
                if m.path.segments.last().is_some_and(|s| s.ident == "Serialize") {
                    found = true;
                }
                Ok(())
            });
        }
        if attr.path().is_ident("cfg_attr") {
            assert!(!attr.meta.to_token_stream_string().contains("Serialize"), "cfg_attr derive of Serialize is not supported: {}", attr.meta.to_token_stream_string());
        }
    }
    found
}

trait TokenString {
    fn to_token_stream_string(&self) -> String;
}

impl<T: quote::ToTokens> TokenString for T {
    fn to_token_stream_string(&self) -> String {
        self.to_token_stream().to_string()
    }
}

fn lit_string(m: &syn::meta::ParseNestedMeta) -> syn::Result<String> {
    let value = m.value()?;
    let lit: syn::LitStr = value.parse()?;
    Ok(lit.value())
}

fn serialize_name(m: &syn::meta::ParseNestedMeta) -> syn::Result<Option<String>> {
    if m.input.peek(syn::Token![=]) {
        return lit_string(m).map(Some);
    }
    let mut name = None;
    m.parse_nested_meta(|inner| {
        if inner.path.is_ident("serialize") {
            name = Some(lit_string(&inner)?);
        } else {
            let _ = lit_string(&inner)?;
        }
        Ok(())
    })?;
    Ok(name)
}

fn skip_value(m: &syn::meta::ParseNestedMeta) -> syn::Result<()> {
    if m.input.peek(syn::Token![=]) {
        let value = m.value()?;
        let _: syn::Expr = value.parse()?;
    } else if m.input.peek(syn::token::Paren) {
        m.parse_nested_meta(|inner| skip_value(&inner))?;
    }
    Ok(())
}

fn container_attrs(attrs: &[Attribute], origin: &str) -> ContainerAttrs {
    let mut out = ContainerAttrs::default();
    for attr in attrs.iter().filter(|a| a.path().is_ident("serde")) {
        attr.parse_nested_meta(|m| {
            let key = m.path.get_ident().map(|i| i.to_string()).unwrap_or_default();
            match key.as_str() {
                "rename_all" => out.rename_all = serialize_name(&m)?,
                "rename_all_fields" => out.rename_all_fields = serialize_name(&m)?,
                "tag" => out.tag = Some(lit_string(&m)?),
                "content" => out.content = Some(lit_string(&m)?),
                "untagged" => out.untagged = true,
                "transparent" => out.transparent = true,
                "rename" => { serialize_name(&m)?; }
                "deny_unknown_fields" | "default" | "bound" | "crate" | "expecting" | "from" | "try_from" => skip_value(&m)?,
                other => panic!("{origin}: container attribute serde({other}) changes the serialized shape; teach result_sites.rs about it"),
            }
            Ok(())
        }).unwrap_or_else(|e| panic!("{origin}: {e}"));
    }
    out
}

fn field_attrs(attrs: &[Attribute], origin: &str) -> FieldAttrs {
    let mut out = FieldAttrs::default();
    for attr in attrs.iter().filter(|a| a.path().is_ident("serde")) {
        attr.parse_nested_meta(|m| {
            let key = m.path.get_ident().map(|i| i.to_string()).unwrap_or_default();
            match key.as_str() {
                "rename" => out.rename = serialize_name(&m)?,
                "skip" | "skip_serializing" => out.skip = true,
                "flatten" => out.flatten = true,
                "serialize_with" | "with" | "getter" => { out.custom = true; skip_value(&m)?; }
                "default" | "skip_serializing_if" | "alias" | "deserialize_with" | "skip_deserializing" | "bound" | "borrow" => skip_value(&m)?,
                other => panic!("{origin}: field attribute serde({other}) is not understood by result_sites.rs"),
            }
            Ok(())
        }).unwrap_or_else(|e| panic!("{origin}: {e}"));
    }
    out
}

fn variant_attrs(attrs: &[Attribute], origin: &str) -> (Option<String>, Option<String>, bool, bool) {
    let (mut rename, mut rename_all, mut skip, mut untagged) = (None, None, false, false);
    for attr in attrs.iter().filter(|a| a.path().is_ident("serde")) {
        attr.parse_nested_meta(|m| {
            let key = m.path.get_ident().map(|i| i.to_string()).unwrap_or_default();
            match key.as_str() {
                "rename" => rename = serialize_name(&m)?,
                "rename_all" => rename_all = serialize_name(&m)?,
                "skip" | "skip_serializing" => skip = true,
                "untagged" => untagged = true,
                "alias" | "other" | "skip_deserializing" | "bound" | "borrow" | "deserialize_with" => skip_value(&m)?,
                other => panic!("{origin}: variant attribute serde({other}) is not understood by result_sites.rs"),
            }
            Ok(())
        }).unwrap_or_else(|e| panic!("{origin}: {e}"));
    }
    (rename, rename_all, skip, untagged)
}

fn type_args(args: &PathArguments, params: &BTreeSet<String>) -> Vec<Shape> {
    match args {
        PathArguments::AngleBracketed(a) => a.args.iter().filter_map(|g| match g {
            GenericArgument::Type(t) => Some(shape_of(t, params)),
            _ => None,
        }).collect(),
        _ => vec![],
    }
}

fn shape_of(ty: &Type, params: &BTreeSet<String>) -> Shape {
    match ty {
        Type::Path(p) if p.qself.is_none() => {
            let segments: Vec<String> = p.path.segments.iter().map(|s| s.ident.to_string()).collect();
            let last = p.path.segments.last().unwrap();
            let name = last.ident.to_string();
            let args = type_args(&last.arguments, params);
            if segments.len() == 1 && params.contains(&name) {
                return Shape::Param(name);
            }
            if name == "StructuredDiagnostic" {
                return Shape::Diagnostic;
            }
            if name == "Value" && (segments.len() == 1 || segments.iter().any(|s| s == "serde_json")) {
                return Shape::Opaque;
            }
            if PRIMITIVES.contains(&name.as_str()) {
                return Shape::Leaf;
            }
            if SEQUENCES.contains(&name.as_str()) {
                return Shape::Seq(Box::new(args.into_iter().next().expect("sequence element type")));
            }
            if TRANSPARENT.contains(&name.as_str()) {
                return args.into_iter().last().unwrap_or(Shape::Leaf);
            }
            if MAPS.contains(&name.as_str()) {
                return Shape::Map(Box::new(args.into_iter().nth(1).expect("map value type")));
            }
            Shape::Named(name, args)
        }
        Type::Array(a) => Shape::Seq(Box::new(shape_of(&a.elem, params))),
        Type::Slice(s) => Shape::Seq(Box::new(shape_of(&s.elem, params))),
        Type::Reference(r) => shape_of(&r.elem, params),
        Type::Paren(p) => shape_of(&p.elem, params),
        Type::Group(g) => shape_of(&g.elem, params),
        Type::Tuple(t) if t.elems.is_empty() => Shape::Leaf,
        Type::Tuple(t) => Shape::Tuple(t.elems.iter().map(|e| shape_of(e, params)).collect()),
        other => Shape::Unsupported(other.to_token_stream_string()),
    }
}

fn body_of(fields: &Fields, params: &BTreeSet<String>, origin: &str) -> Body {
    let make = |f: &syn::Field| FieldDef {
        ident: f.ident.as_ref().map(|i| i.to_string()),
        shape: shape_of(&f.ty, params),
        attrs: field_attrs(&f.attrs, origin),
    };
    match fields {
        Fields::Named(n) => Body::Named(n.named.iter().map(make).collect()),
        Fields::Unnamed(u) => Body::Unnamed(u.unnamed.iter().map(make).collect()),
        Fields::Unit => Body::Unit,
    }
}

fn generics_of(g: &syn::Generics) -> (Vec<(String, Option<Shape>)>, BTreeSet<String>) {
    let names: BTreeSet<String> = g.params.iter().filter_map(|p| match p {
        GenericParam::Type(t) => Some(t.ident.to_string()),
        _ => None,
    }).collect();
    let list = g.params.iter().filter_map(|p| match p {
        GenericParam::Type(t) => Some((t.ident.to_string(), t.default.as_ref().map(|d| shape_of(d, &names)))),
        _ => None,
    }).collect();
    (list, names)
}

#[derive(Default)]
struct Source {
    leaves: BTreeSet<String>,
    defs: HashMap<String, Vec<Def>>,
    aliases: HashMap<String, (Vec<String>, Shape)>,
}

fn collect_items(items: &[Item], file: &str, src: &mut Source) {
    for item in items {
        match item {
            Item::Struct(s) if !is_cfg_test(&s.attrs) && derives_serialize(&s.attrs) => {
                let origin = format!("{file}::{}", s.ident);
                let (generics, params) = generics_of(&s.generics);
                let def = Def { origin: origin.clone(), generics, attrs: container_attrs(&s.attrs, &origin), kind: DefKind::Struct(body_of(&s.fields, &params, &origin)) };
                src.defs.entry(s.ident.to_string()).or_default().push(def);
            }
            Item::Enum(e) if !is_cfg_test(&e.attrs) && derives_serialize(&e.attrs) => {
                let origin = format!("{file}::{}", e.ident);
                let (generics, params) = generics_of(&e.generics);
                let variants = e.variants.iter().map(|v| {
                    let (rename, rename_all, skip, untagged) = variant_attrs(&v.attrs, &origin);
                    VariantDef { name: v.ident.to_string(), rename, rename_all, skip, untagged, body: body_of(&v.fields, &params, &origin) }
                }).collect();
                let def = Def { origin: origin.clone(), generics, attrs: container_attrs(&e.attrs, &origin), kind: DefKind::Enum(variants) };
                src.defs.entry(e.ident.to_string()).or_default().push(def);
            }
            Item::Type(t) if !is_cfg_test(&t.attrs) => {
                let (generics, params) = generics_of(&t.generics);
                src.aliases.insert(t.ident.to_string(), (generics.into_iter().map(|g| g.0).collect(), shape_of(&t.ty, &params)));
            }
            Item::Macro(m) if m.mac.path.is_ident("quantity") => {
                let name = m.mac.tokens.clone().into_iter().next().expect("quantity name").to_string();
                src.leaves.insert(name);
            }
            Item::Mod(m) if !is_cfg_test(&m.attrs) => {
                if let Some((_, inner)) = &m.content {
                    collect_items(inner, file, src);
                }
            }
            _ => {}
        }
    }
}

fn read_source(root: &Path) -> Source {
    let mut files = vec![];
    rust_files(&root.join("src"), &mut files);
    let mut src = Source::default();
    for path in files {
        let rel = path.strip_prefix(root).unwrap().display().to_string();
        let text = std::fs::read_to_string(&path).unwrap();
        let file = syn::parse_file(&text).unwrap_or_else(|e| panic!("{rel}: {e}"));
        collect_items(&file.items, &rel, &mut src);
    }
    src
}

fn substitute(shape: &Shape, env: &HashMap<String, Shape>) -> Shape {
    match shape {
        Shape::Param(p) => env.get(p).cloned().unwrap_or_else(|| panic!("unbound type parameter {p}")),
        Shape::Seq(s) => Shape::Seq(Box::new(substitute(s, env))),
        Shape::Map(s) => Shape::Map(Box::new(substitute(s, env))),
        Shape::Tuple(xs) => Shape::Tuple(xs.iter().map(|x| substitute(x, env)).collect()),
        Shape::Named(n, args) => Shape::Named(n.clone(), args.iter().map(|a| substitute(a, env)).collect()),
        other => other.clone(),
    }
}

fn render(shape: &Shape) -> String {
    match shape {
        Shape::Leaf => "leaf".into(),
        Shape::Diagnostic => "StructuredDiagnostic".into(),
        Shape::Opaque => "Value".into(),
        Shape::Seq(s) => format!("[{}]", render(s)),
        Shape::Map(s) => format!("{{{}}}", render(s)),
        Shape::Tuple(xs) => format!("({})", xs.iter().map(render).collect::<Vec<_>>().join(", ")),
        Shape::Param(p) => p.clone(),
        Shape::Unsupported(t) => t.clone(),
        Shape::Named(n, args) if args.is_empty() => n.clone(),
        Shape::Named(n, args) => format!("{n}<{}>", args.iter().map(render).collect::<Vec<_>>().join(", ")),
    }
}

fn case_words(name: &str) -> Vec<String> {
    if name.contains('_') {
        return name.split('_').filter(|w| !w.is_empty()).map(|w| w.to_lowercase()).collect();
    }
    let mut words: Vec<String> = vec![];
    for c in name.chars() {
        if c.is_uppercase() || words.is_empty() {
            words.push(c.to_lowercase().collect());
        } else {
            words.last_mut().unwrap().push(c);
        }
    }
    words
}

fn rename_field(name: &str, rule: Option<&str>) -> String {
    match rule {
        None => name.to_string(),
        Some("camelCase") => {
            let mut out = String::new();
            let mut upper = false;
            for c in name.chars() {
                if c == '_' { upper = true; continue; }
                if upper { out.extend(c.to_uppercase()); upper = false; } else { out.push(c); }
            }
            out
        }
        Some("snake_case") | Some("lowercase") => name.to_string(),
        Some("SCREAMING_SNAKE_CASE") | Some("UPPERCASE") => name.to_uppercase(),
        Some("PascalCase") => case_words(name).iter().map(|w| { let mut c = w.chars(); c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default() }).collect(),
        Some("kebab-case") => name.replace('_', "-"),
        Some(other) => panic!("rename_all = {other:?} is not understood by result_sites.rs"),
    }
}

fn rename_variant(name: &str, rule: Option<&str>) -> String {
    let words = case_words(name);
    match rule {
        None => name.to_string(),
        Some("lowercase") => name.to_lowercase(),
        Some("UPPERCASE") => name.to_uppercase(),
        Some("camelCase") => { let mut c = name.chars(); c.next().map(|f| f.to_lowercase().collect::<String>() + c.as_str()).unwrap_or_default() }
        Some("snake_case") => words.join("_"),
        Some("SCREAMING_SNAKE_CASE") => words.join("_").to_uppercase(),
        Some("kebab-case") => words.join("-"),
        Some("PascalCase") => name.to_string(),
        Some(other) => panic!("rename_all = {other:?} is not understood by result_sites.rs"),
    }
}

struct Schema {
    src: Source,
    known: BTreeMap<String, bool>,
    instances: BTreeMap<String, (String, Vec<Shape>)>,
    unknown: BTreeSet<String>,
}

impl Schema {
    fn resolve_alias(&self, name: &str, args: &[Shape]) -> Option<Shape> {
        let (params, shape) = self.src.aliases.get(name)?;
        let env = params.iter().cloned().zip(args.iter().cloned()).collect();
        Some(substitute(shape, &env))
    }

    fn has(&mut self, shape: &Shape) -> bool {
        match shape {
            Shape::Leaf => false,
            Shape::Diagnostic | Shape::Opaque => true,
            Shape::Seq(s) | Shape::Map(s) => self.has(s),
            Shape::Tuple(xs) => xs.iter().fold(false, |acc, x| self.has(x) || acc),
            Shape::Param(p) => panic!("unbound type parameter {p}"),
            Shape::Unsupported(t) => panic!("a serialized field has type {t}, which result_sites.rs cannot read"),
            Shape::Named(name, args) => {
                if self.src.leaves.contains(name) {
                    return false;
                }
                if !self.src.defs.contains_key(name) {
                    if let Some(aliased) = self.resolve_alias(name, args) {
                        return self.has(&aliased);
                    }
                    self.unknown.insert(name.clone());
                    return false;
                }
                let key = render(shape);
                if !self.known.contains_key(&key) {
                    self.known.insert(key.clone(), false);
                    self.instances.insert(key.clone(), (name.clone(), args.clone()));
                }
                self.known[&key]
            }
        }
    }

    fn defs_of(&self, name: &str, args: &[Shape]) -> Vec<(Def, HashMap<String, Shape>)> {
        self.src.defs[name].iter().map(|def| {
            let env = def.generics.iter().enumerate().map(|(i, (p, default))| {
                let arg = args.get(i).cloned().or_else(|| default.clone()).unwrap_or_else(|| panic!("{}: missing type argument {p}", def.origin));
                (p.clone(), arg)
            }).collect();
            (def.clone(), env)
        }).collect()
    }

    fn body_has(&mut self, body: &Body, env: &HashMap<String, Shape>) -> bool {
        let fields = match body {
            Body::Named(f) | Body::Unnamed(f) => f.clone(),
            Body::Unit => vec![],
        };
        fields.iter().filter(|f| !f.attrs.skip).fold(false, |acc, f| {
            let s = substitute(&f.shape, env);
            self.has(&s) || acc
        })
    }

    fn instance_has(&mut self, name: &str, args: &[Shape]) -> bool {
        let mut any = false;
        for (def, env) in self.defs_of(name, args) {
            match &def.kind {
                DefKind::Struct(body) => any |= self.body_has(body, &env),
                DefKind::Enum(variants) => {
                    for v in variants.iter().filter(|v| !v.skip) {
                        any |= self.body_has(&v.body, &env);
                    }
                }
            }
        }
        any
    }

    fn build(root: &Path) -> Schema {
        Schema::from_source(read_source(root))
    }

    fn from_source(src: Source) -> Schema {
        let mut schema = Schema { src, known: BTreeMap::new(), instances: BTreeMap::new(), unknown: BTreeSet::new() };
        let roots: Vec<String> = schema.src.defs.iter().filter(|(_, defs)| defs.iter().all(|d| d.generics.iter().all(|g| g.1.is_some()) || d.generics.is_empty())).map(|(n, _)| n.clone()).collect();
        for name in roots {
            schema.has(&Shape::Named(name, vec![]));
        }
        loop {
            let before = schema.instances.len();
            let mut changed = false;
            let instances: Vec<(String, (String, Vec<Shape>))> = schema.instances.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
            for (key, (name, args)) in instances {
                let now = schema.instance_has(&name, &args);
                if now != schema.known[&key] {
                    schema.known.insert(key, now);
                    changed = true;
                }
            }
            if !changed && schema.instances.len() == before {
                break;
            }
        }
        schema
    }

    fn shape_json(&mut self, shape: &Shape) -> Value {
        match shape {
            Shape::Diagnostic => json!("diagnostic"),
            Shape::Opaque => json!("opaque"),
            Shape::Seq(s) => json!({ "seq": self.shape_json(s) }),
            Shape::Map(s) => json!({ "map": self.shape_json(s) }),
            Shape::Tuple(xs) => {
                let items: Vec<Value> = xs.iter().map(|x| if self.has(x) { self.shape_json(x) } else { Value::Null }).collect();
                json!({ "tuple": items })
            }
            Shape::Named(name, args) if !self.src.defs.contains_key(name) => {
                let aliased = self.resolve_alias(name, args).expect("alias");
                self.shape_json(&aliased)
            }
            Shape::Named(..) => json!({ "ref": render(shape) }),
            Shape::Leaf | Shape::Param(_) | Shape::Unsupported(_) => Value::Null,
        }
    }

    fn body_json(&mut self, body: &Body, env: &HashMap<String, Shape>, rule: Option<&str>, origin: &str) -> Value {
        match body {
            Body::Unit => json!({ "kind": "unit" }),
            Body::Named(fields) => {
                let mut out = serde_json::Map::new();
                let mut flatten = vec![];
                for f in fields.iter().filter(|f| !f.attrs.skip) {
                    let s = substitute(&f.shape, env);
                    if !self.has(&s) {
                        continue;
                    }
                    assert!(!f.attrs.custom, "{origin}: field {} carries diagnostics but serializes through serialize_with/with, so its shape is unknown", f.ident.as_deref().unwrap_or("?"));
                    let shape = self.shape_json(&s);
                    if f.attrs.flatten {
                        flatten.push(shape);
                    } else {
                        let key = f.attrs.rename.clone().unwrap_or_else(|| rename_field(f.ident.as_deref().unwrap(), rule));
                        out.insert(key, shape);
                    }
                }
                json!({ "kind": "struct", "fields": out, "flatten": flatten })
            }
            Body::Unnamed(fields) => {
                let live: Vec<&FieldDef> = fields.iter().filter(|f| !f.attrs.skip).collect();
                for f in &live {
                    let s = substitute(&f.shape, env);
                    assert!(!(f.attrs.custom && self.has(&s)), "{origin}: a tuple field carries diagnostics but serializes through serialize_with/with");
                }
                if live.len() == 1 {
                    let s = substitute(&live[0].shape, env);
                    json!({ "kind": "newtype", "inner": self.shape_json(&s) })
                } else {
                    let items: Vec<Value> = live.iter().map(|f| {
                        let s = substitute(&f.shape, env);
                        if self.has(&s) { self.shape_json(&s) } else { Value::Null }
                    }).collect();
                    json!({ "kind": "tuple", "items": items })
                }
            }
        }
    }

    fn type_json(&mut self, name: &str, args: &[Shape]) -> Value {
        let mut out = vec![];
        for (def, env) in self.defs_of(name, args) {
            let a = &def.attrs;
            let entry = match &def.kind {
                DefKind::Struct(body) => {
                    if a.transparent {
                        let fields = match body { Body::Named(f) | Body::Unnamed(f) => f.clone(), Body::Unit => vec![] };
                        let live: Vec<&FieldDef> = fields.iter().filter(|f| !f.attrs.skip).collect();
                        assert_eq!(live.len(), 1, "{}: transparent with more than one field", def.origin);
                        let s = substitute(&live[0].shape, &env);
                        json!({ "kind": "newtype", "inner": self.shape_json(&s) })
                    } else {
                        self.body_json(body, &env, a.rename_all.as_deref(), &def.origin)
                    }
                }
                DefKind::Enum(variants) => {
                    let tagging = match (&a.tag, &a.content, a.untagged) {
                        (_, _, true) => "untagged",
                        (Some(_), Some(_), _) => "adjacent",
                        (Some(_), None, _) => "internal",
                        _ => "external",
                    };
                    let mut vs = serde_json::Map::new();
                    for v in variants.iter().filter(|v| !v.skip) {
                        if !self.body_has(&v.body, &env) {
                            continue;
                        }
                        let key = v.rename.clone().unwrap_or_else(|| rename_variant(&v.name, a.rename_all.as_deref()));
                        let rule = v.rename_all.as_deref().or(a.rename_all_fields.as_deref());
                        let mut body = self.body_json(&v.body, &env, rule, &def.origin);
                        if v.untagged {
                            body["untagged"] = json!(true);
                        }
                        vs.insert(key, body);
                    }
                    json!({ "kind": "enum", "tagging": tagging, "tag": a.tag, "content": a.content, "variants": vs })
                }
            };
            out.push(json!({ "origin": def.origin, "shape": entry }));
        }
        json!(out)
    }

    fn types(&mut self) -> BTreeMap<String, Value> {
        let keys: Vec<(String, (String, Vec<Shape>))> = self.instances.iter().filter(|(k, _)| self.known[*k]).map(|(k, v)| (k.clone(), v.clone())).collect();
        keys.into_iter().map(|(key, (name, args))| (key, self.type_json(&name, &args))).collect()
    }
}

#[derive(Default)]
struct KeySets {
    diagnostic: BTreeSet<String>,
    record: BTreeSet<String>,
    map: BTreeSet<String>,
    opaque: BTreeSet<String>,
}

fn classify(shape: &Value, types: &BTreeMap<String, Value>, key: &str, sets: &mut KeySets) {
    match shape {
        Value::String(s) if s == "diagnostic" => { sets.diagnostic.insert(key.into()); }
        Value::String(s) if s == "opaque" => { sets.opaque.insert(key.into()); }
        Value::Object(o) if o.contains_key("seq") => classify(&o["seq"], types, key, sets),
        Value::Object(o) if o.contains_key("tuple") => {
            for item in o["tuple"].as_array().unwrap().iter().filter(|i| !i.is_null()) {
                classify(item, types, key, sets);
            }
        }
        Value::Object(o) if o.contains_key("map") => {
            sets.map.insert(key.into());
            let mut inner = KeySets::default();
            classify(&o["map"], types, key, &mut inner);
            assert!(inner.diagnostic.is_empty() && inner.map.is_empty(), "{key}: a map whose values are diagnostics or maps is not supported by the walkers");
            sets.opaque.extend(inner.opaque);
        }
        Value::Object(o) if o.contains_key("ref") => {
            for def in types[o["ref"].as_str().unwrap()].as_array().unwrap() {
                classify_type(&def["shape"], types, key, sets);
            }
        }
        other => panic!("{key}: unexpected shape {other}"),
    }
}

fn classify_type(shape: &Value, types: &BTreeMap<String, Value>, key: &str, sets: &mut KeySets) {
    match shape["kind"].as_str().unwrap() {
        "struct" => { sets.record.insert(key.into()); }
        "newtype" => classify(&shape["inner"], types, key, sets),
        "tuple" => {
            for item in shape["items"].as_array().unwrap().iter().filter(|i| !i.is_null()) {
                classify(item, types, key, sets);
            }
        }
        "enum" if shape["tagging"] == "untagged" => {
            for v in shape["variants"].as_object().unwrap().values() {
                classify_type(v, types, key, sets);
            }
        }
        "enum" => {
            sets.record.insert(key.into());
            for v in shape["variants"].as_object().unwrap().values() {
                if v["untagged"] == true {
                    classify_type(v, types, key, sets);
                }
            }
        }
        "unit" => {}
        other => panic!("{key}: unexpected kind {other}"),
    }
}

fn record_keys(shape: &Value, types: &BTreeMap<String, Value>, sets: &mut KeySets) {
    match shape["kind"].as_str().unwrap() {
        "struct" => {
            for (key, field) in shape["fields"].as_object().unwrap() {
                classify(field, types, key, sets);
            }
        }
        "enum" => {
            let tagging = shape["tagging"].as_str().unwrap();
            for (name, v) in shape["variants"].as_object().unwrap() {
                record_keys(v, types, sets);
                match tagging {
                    "external" if v["untagged"] != true => classify_type(v, types, name, sets),
                    "adjacent" if v["untagged"] != true => classify_type(v, types, shape["content"].as_str().unwrap(), sets),
                    _ => {}
                }
            }
        }
        _ => {}
    }
}

fn key_sets(types: &BTreeMap<String, Value>) -> KeySets {
    let mut sets = KeySets::default();
    for defs in types.values() {
        for def in defs.as_array().unwrap() {
            record_keys(&def["shape"], types, &mut sets);
        }
    }
    sets
}

const WEB_TS: &str = "../web/src/lib/engine/generated/result-sites.ts";
const WEB_TYPES: &str = "../web/src/lib/engine/generated/result-site-types.json";
const ENGINE_RS: &str = "src/result_sites/keys.rs";

fn list(set: &BTreeSet<String>) -> String {
    set.iter().map(|k| format!("{k:?}")).collect::<Vec<_>>().join(", ")
}

fn generated() -> (BTreeMap<String, Value>, KeySets, Vec<(&'static str, String)>) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let units = std::fs::read_to_string(root.join("src/types/units.rs")).unwrap();
    assert!(units.contains("#[serde(transparent)]") && units.contains("pub struct $name(f64);"), "quantity! no longer serializes as one number; result_sites.rs treats its types as leaves");
    let mut schema = Schema::build(root);
    let unknown: Vec<String> = schema.unknown.iter().filter(|n| !EXTERNAL_LEAVES.contains(&n.as_str())).cloned().collect();
    assert!(unknown.is_empty(), "result types use types result_sites.rs cannot see: {unknown:?}. Add each to EXTERNAL_LEAVES only if it cannot hold a StructuredDiagnostic");
    let types = schema.types();
    let sets = key_sets(&types);
    let header = "Generated by `make gen.result-sites` from the engine's Serialize types (engine/tests/result_sites.rs). Do not edit.";
    let ts = format!(
        "// {header}\n\nexport const diagnosticKeys = [{}] as const;\nexport const recordKeys = [{}] as const;\nexport const mapKeys = [{}] as const;\nexport const opaqueKeys = [{}] as const;\n",
        list(&sets.diagnostic), list(&sets.record), list(&sets.map), list(&sets.opaque)
    );
    let rs = format!(
        "// {header}\n\npub const DIAGNOSTIC_KEYS: &[&str] = &[{}];\npub const RECORD_KEYS: &[&str] = &[{}];\npub const MAP_KEYS: &[&str] = &[{}];\npub const OPAQUE_KEYS: &[&str] = &[{}];\n",
        list(&sets.diagnostic), list(&sets.record), list(&sets.map), list(&sets.opaque)
    );
    let types_json = serde_json::to_string_pretty(&json!({ "generatedBy": header, "types": types })).unwrap() + "\n";
    (types, sets, vec![(WEB_TS, ts), (ENGINE_RS, rs), (WEB_TYPES, types_json)])
}

const EXTERNAL_LEAVES: &[&str] = &[];

#[test]
fn a_generic_instance_found_only_inside_another_is_still_settled() {
    let text = r#"
        #[derive(Serialize)] pub struct Root { pub outer: Outer<u8> }
        #[derive(Serialize)] pub struct Outer<T> { pub inner: Inner<T, StructuredDiagnostic> }
        #[derive(Serialize)] pub struct Inner<T, U> { pub value: T, pub issue: U }
    "#;
    let mut src = Source::default();
    collect_items(&syn::parse_file(text).unwrap().items, "fixture.rs", &mut src);
    let mut schema = Schema::from_source(src);
    assert!(schema.has(&Shape::Named("Root".into(), vec![])), "Root holds a diagnostic two generic instances down");
    let sets = key_sets(&schema.types());
    assert!(sets.diagnostic.contains("issue") && sets.record.contains("outer") && sets.record.contains("inner"));
}

#[test]
fn generated_result_sites_are_current() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let (_, _, files) = generated();
    let write = std::env::var_os("STABILEO_WRITE_RESULT_SITES").is_some();
    let mut stale = vec![];
    for (path, text) in files {
        let full = root.join(path);
        if write {
            std::fs::create_dir_all(full.parent().unwrap()).unwrap();
            std::fs::write(&full, &text).unwrap();
        } else if std::fs::read_to_string(&full).ok().as_deref() != Some(text.as_str()) {
            stale.push(path);
        }
    }
    assert!(stale.is_empty(), "{stale:?} no longer match the engine's result types: run `make gen.result-sites` and commit the result");
}

#[derive(Clone, Debug)]
enum Seg {
    Key(String),
    Index,
    MapValue,
    TupleAt(usize, usize),
    Tag(String, String),
}

#[derive(Clone, Debug, PartialEq)]
enum Target {
    Diagnostic,
    Opaque,
    Type(String),
}

fn expand(shape: &Value) -> Vec<(Vec<Seg>, Target)> {
    let prefixed = |seg: Seg, inner: &Value| expand(inner).into_iter().map(|(mut segs, t)| { segs.insert(0, seg.clone()); (segs, t) }).collect::<Vec<_>>();
    match shape {
        Value::String(s) if s == "diagnostic" => vec![(vec![], Target::Diagnostic)],
        Value::String(s) if s == "opaque" => vec![(vec![], Target::Opaque)],
        Value::Object(o) if o.contains_key("seq") => prefixed(Seg::Index, &o["seq"]),
        Value::Object(o) if o.contains_key("map") => prefixed(Seg::MapValue, &o["map"]),
        Value::Object(o) if o.contains_key("tuple") => {
            let items = o["tuple"].as_array().unwrap();
            items.iter().enumerate().filter(|(_, i)| !i.is_null()).flat_map(|(i, item)| prefixed(Seg::TupleAt(i, items.len()), item)).collect()
        }
        Value::Object(o) if o.contains_key("ref") => vec![(vec![], Target::Type(o["ref"].as_str().unwrap().to_string()))],
        other => panic!("unexpected shape {other}"),
    }
}

fn body_edges(body: &Value) -> Vec<(Vec<Seg>, Value)> {
    match body["kind"].as_str().unwrap() {
        "struct" => {
            let mut out: Vec<(Vec<Seg>, Value)> = body["fields"].as_object().unwrap().iter().map(|(k, s)| (vec![Seg::Key(k.clone())], s.clone())).collect();
            out.extend(body["flatten"].as_array().unwrap().iter().map(|s| (vec![], s.clone())));
            out
        }
        "newtype" => vec![(vec![], body["inner"].clone())],
        "tuple" => {
            let items = body["items"].as_array().unwrap();
            items.iter().enumerate().filter(|(_, i)| !i.is_null()).map(|(i, s)| (vec![Seg::TupleAt(i, items.len())], s.clone())).collect()
        }
        _ => vec![],
    }
}

fn type_edges(types: &BTreeMap<String, Value>, name: &str) -> Vec<(Vec<Seg>, Target)> {
    let mut out = vec![];
    for def in types[name].as_array().unwrap() {
        let shape = &def["shape"];
        let bodies: Vec<(Vec<Seg>, Value)> = if shape["kind"] == "enum" {
            let tagging = shape["tagging"].as_str().unwrap();
            shape["variants"].as_object().unwrap().iter().flat_map(|(variant, body)| {
                let prefix = match (tagging, body["untagged"] == true) {
                    (_, true) | ("untagged", _) => vec![],
                    ("external", _) => vec![Seg::Key(variant.clone())],
                    ("internal", _) => vec![Seg::Tag(shape["tag"].as_str().unwrap().into(), variant.clone())],
                    ("adjacent", _) => vec![Seg::Tag(shape["tag"].as_str().unwrap().into(), variant.clone()), Seg::Key(shape["content"].as_str().unwrap().into())],
                    _ => unreachable!(),
                };
                body_edges(body).into_iter().map(move |(segs, s)| ([prefix.clone(), segs].concat(), s))
            }).collect()
        } else {
            body_edges(shape)
        };
        for (segs, s) in bodies {
            for (more, target) in expand(&s) {
                out.push(([segs.clone(), more].concat(), target));
            }
        }
    }
    out
}

fn build(segs: &[Seg], leaf: Value) -> Value {
    segs.iter().rev().fold(leaf, |inner, seg| match seg {
        Seg::Key(k) => json!({ k.clone(): inner }),
        Seg::Index => json!([inner]),
        Seg::MapValue => json!({ "7": inner }),
        Seg::TupleAt(i, n) => {
            let mut items = vec![Value::Null; *n];
            items[*i] = inner;
            Value::Array(items)
        }
        Seg::Tag(tag, variant) => {
            let mut object = inner.as_object().cloned().expect("an internally tagged variant serializes as an object");
            object.insert(tag.clone(), json!(variant));
            Value::Object(object)
        }
    })
}

fn shortest_to_leaf(types: &BTreeMap<String, Value>) -> BTreeMap<String, (Vec<Seg>, Target)> {
    let mut best: BTreeMap<String, (Vec<Seg>, Target)> = BTreeMap::new();
    loop {
        let mut changed = false;
        for name in types.keys() {
            for (segs, target) in type_edges(types, name) {
                let candidate = match &target {
                    Target::Type(next) => best.get(next).map(|(rest, t)| ([segs.clone(), rest.clone()].concat(), t.clone())),
                    leaf => Some((segs.clone(), leaf.clone())),
                };
                if let Some(c) = candidate {
                    if best.get(name).is_none_or(|b| c.0.len() < b.0.len()) {
                        best.insert(name.clone(), c);
                        changed = true;
                    }
                }
            }
        }
        if !changed {
            return best;
        }
    }
}

fn diagnostic(severity: &str) -> Value {
    json!({ "code": "known_issue", "severity": severity, "phase": "NL-13", "value": 432, "message": format!("injected {severity}") })
}

fn leaf(target: &Target, severity: &str) -> Value {
    match target {
        Target::Opaque => json!({ "deep": [diagnostic(severity)] }),
        _ => diagnostic(severity),
    }
}

struct Injection {
    root: String,
    path: Vec<Seg>,
    target: Target,
}

fn injections(types: &BTreeMap<String, Value>) -> Vec<Injection> {
    let finish = shortest_to_leaf(types);
    let mut out = vec![];
    for root in types.keys() {
        let mut prefix: BTreeMap<String, Vec<Seg>> = BTreeMap::from([(root.clone(), vec![])]);
        let mut queue = std::collections::VecDeque::from([root.clone()]);
        while let Some(owner) = queue.pop_front() {
            for (segs, target) in type_edges(types, &owner) {
                let path = [prefix[&owner].clone(), segs].concat();
                match &target {
                    Target::Type(next) => {
                        if !prefix.contains_key(next) {
                            prefix.insert(next.clone(), path.clone());
                            queue.push_back(next.clone());
                        }
                        let (rest, end) = finish.get(next).cloned().unwrap_or_else(|| panic!("{next} reaches no diagnostic"));
                        out.push(Injection { root: root.clone(), path: [path, rest].concat(), target: end });
                    }
                    leaf => out.push(Injection { root: root.clone(), path, target: leaf.clone() }),
                }
            }
        }
    }
    out
}

fn visible_at_root(outgoing: dedaliano_engine::result_sites::Outgoing, sample: &Value, message: &str) -> bool {
    use dedaliano_engine::result_sites::Outgoing;
    let lists = |v: &Value| dedaliano_engine::result_sites::DIAGNOSTIC_KEYS.iter().any(|k| v[*k].as_array().is_some_and(|l| l.iter().any(|d| d["message"] == message)));
    match outgoing {
        Outgoing::Unchanged => lists(sample),
        Outgoing::Lifted(v) => lists(&v),
        Outgoing::Refused(text) => serde_json::from_str::<Value>(&text).is_ok_and(|v| lists(&v)),
    }
}

#[test]
fn a_refusal_at_every_field_path_of_every_result_type_is_found_and_reaches_the_root() {
    use dedaliano_engine::result_sites::{contain, walk};
    let (types, _, _) = generated();
    let all = injections(&types);
    assert!(all.len() > types.len(), "only {} injections over {} result types", all.len(), types.len());
    for root in types.keys() {
        assert!(all.iter().any(|i| &i.root == root), "{root}: no injection");
    }
    for injection in &all {
        let refused = build(&injection.path, leaf(&injection.target, "error"));
        let found = walk(&refused);
        assert!(found.refused(), "{}: the walker misses a refusal at {:?}", injection.root, injection.path);
        assert!(visible_at_root(contain(&refused), &refused, "injected error"), "{}: a refusal at {:?} does not reach the root at the boundary", injection.root, injection.path);
        let warned = build(&injection.path, leaf(&injection.target, "warning"));
        let found = walk(&warned);
        assert!(!found.refused() && found.all.iter().any(|d| d["message"] == "injected warning"), "{}: the walker misses a warning at {:?}", injection.root, injection.path);
        assert!(matches!(contain(&warned), dedaliano_engine::result_sites::Outgoing::Unchanged), "{}: a warning at {:?} changed the outgoing value", injection.root, injection.path);
    }
}

#[test]
fn the_engine_walker_reads_the_generated_keys() {
    use dedaliano_engine::result_sites::{DIAGNOSTIC_KEYS, MAP_KEYS, OPAQUE_KEYS, RECORD_KEYS};
    let (_, sets, _) = generated();
    let same = |a: &[&str], b: &BTreeSet<String>| a.iter().map(|s| s.to_string()).collect::<BTreeSet<_>>() == *b;
    assert!(same(DIAGNOSTIC_KEYS, &sets.diagnostic) && same(RECORD_KEYS, &sets.record) && same(MAP_KEYS, &sets.map) && same(OPAQUE_KEYS, &sets.opaque));
}

#[test]
fn a_key_outside_the_schema_is_not_walked() {
    let found = dedaliano_engine::result_sites::walk(&json!({ "unrelated": { "structuredDiagnostics": [diagnostic("error")] } }));
    assert!(found.all.is_empty());
}

#[test]
fn the_boundary_lifts_a_nested_refusal_once_and_leaves_a_root_refusal_alone() {
    use dedaliano_engine::result_sites::{contain, Outgoing};
    let nested = json!({ "structuredDiagnostics": [], "results": { "structuredDiagnostics": [diagnostic("error")] }, "linearResults": { "structuredDiagnostics": [diagnostic("error")] } });
    let Outgoing::Lifted(lifted) = contain(&nested) else { panic!("a nested refusal must be lifted") };
    assert_eq!(lifted["structuredDiagnostics"], json!([diagnostic("error")]));
    assert_eq!(lifted["results"], nested["results"]);
    let at_root = json!({ "structuredDiagnostics": [diagnostic("error")], "results": { "structuredDiagnostics": [diagnostic("error")] } });
    assert!(matches!(contain(&at_root), Outgoing::Unchanged));
    let in_array = json!([{ "structuredDiagnostics": [diagnostic("error")] }]);
    let Outgoing::Refused(text) = contain(&in_array) else { panic!("a refusal with no root record must be refused") };
    let refusal: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(refusal["structuredDiagnostics"], json!([diagnostic("error")]));
    assert!(dedaliano_engine::known_issues::is_refusal(&text));
}

#[test]
fn every_wasm_export_that_returns_a_result_serializes_it_through_the_contained_boundary() {
    const HELPERS: &[&str] = &["to_js_value", "to_json", "contained_text"];
    const NOT_RESULTS: &[&str] = &["engine_build_info"];
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut files = vec![];
    rust_files(&root.join("src"), &mut files);
    let mut checked = 0;
    let mut bad = vec![];
    let returns_payload = |out: &syn::ReturnType| {
        let syn::ReturnType::Type(_, ty) = out else { return false };
        let Type::Path(p) = ty.as_ref() else { return false };
        let last = p.path.segments.last().unwrap();
        let ok = match (last.ident.to_string().as_str(), &last.arguments) {
            ("Result", PathArguments::AngleBracketed(a)) => a.args.first().map(|g| g.to_token_stream_string()).unwrap_or_default(),
            (name, _) => name.to_string(),
        };
        ok == "String" || ok == "JsValue"
    };
    let wasm = |attrs: &[Attribute]| attrs.iter().any(|a| a.path().is_ident("wasm_bindgen"));
    let mut check = |name: String, sig: &syn::Signature, body: String| {
        if !returns_payload(&sig.output) || NOT_RESULTS.contains(&name.as_str()) || sig.ident == "new" {
            return;
        }
        checked += 1;
        let idents: BTreeSet<&str> = body.split(|c: char| !(c.is_alphanumeric() || c == '_')).collect();
        let through_helper = HELPERS.iter().any(|h| idents.contains(h));
        let raw = body.contains("serde_json :: to_string") || body.contains("serde_wasm_bindgen :: to_value") || body.contains("to_string ()");
        if !through_helper || raw {
            bad.push(name);
        }
    };
    for path in files {
        let file = syn::parse_file(&std::fs::read_to_string(&path).unwrap()).unwrap();
        for item in &file.items {
            match item {
                Item::Fn(f) if wasm(&f.attrs) => check(f.sig.ident.to_string(), &f.sig, f.block.to_token_stream_string()),
                Item::Impl(i) if wasm(&i.attrs) => {
                    for it in &i.items {
                        if let syn::ImplItem::Fn(f) = it {
                            check(format!("{}::{}", i.self_ty.to_token_stream_string(), f.sig.ident), &f.sig, f.block.to_token_stream_string());
                        }
                    }
                }
                _ => {}
            }
        }
    }
    assert!(checked > 100, "only {checked} exports checked");
    assert!(bad.is_empty(), "these WASM exports return a result without the contained boundary (to_js_value / to_json / contained_text): {bad:?}");
}

fn inject(value: &mut Value, segs: &[Seg], leaf: Value) {
    let Some((seg, rest)) = segs.split_first() else {
        *value = leaf;
        return;
    };
    match seg {
        Seg::Key(k) => {
            if value.is_null() { *value = json!({}) }
            inject(value.as_object_mut().expect("a record").entry(k.clone()).or_insert(Value::Null), rest, leaf)
        }
        Seg::Index => {
            if value.is_null() { *value = json!([]) }
            let items = value.as_array_mut().expect("a sequence");
            if rest.is_empty() || items.is_empty() { items.push(Value::Null) }
            let at = if rest.is_empty() { items.len() - 1 } else { 0 };
            inject(&mut items[at], rest, leaf)
        }
        other => panic!("injecting through {other:?} into a solved result is not needed by these tests"),
    }
}

fn case_sites(type_name: &str) -> Vec<Vec<Seg>> {
    let (types, _, _) = generated();
    let sites: Vec<Vec<Seg>> = injections(&types).into_iter().filter(|i| i.root == type_name && i.target == Target::Diagnostic).map(|i| i.path).collect();
    assert!(!sites.is_empty(), "{type_name} has no diagnostic site");
    sites
}

fn warned<T: serde::Serialize + serde::de::DeserializeOwned>(clean: &T, site: &[Seg], severity: &str) -> T {
    let mut value = serde_json::to_value(clean).unwrap();
    inject(&mut value, site, diagnostic(severity));
    serde_json::from_value(value).unwrap()
}

fn messages<T: serde::Serialize>(result: &T) -> Vec<String> {
    dedaliano_engine::result_sites::walk(result).all.iter().map(|d| d["message"].as_str().unwrap().to_string()).collect()
}

#[test]
fn a_combination_keeps_every_known_issue_of_a_contributing_case_wherever_the_case_type_holds_it() {
    use dedaliano_engine::postprocess::combinations::*;
    let clean = dedaliano_engine::solver::linear::solve_2d(&crate::common::make_ss_beam_udl(4, 6.0, 200_000.0, 0.01, 1e-4, -10.0)).unwrap();
    for site in case_sites("AnalysisResults") {
        let case = |id, results| CaseEntry { case_id: id, results };
        let combo = |a: f64, b: f64, first: dedaliano_engine::types::AnalysisResults| CombinationInput {
            factors: vec![CombinationFactor { case_id: 1, factor: a }, CombinationFactor { case_id: 2, factor: b }],
            cases: vec![case(1, first), case(2, clean.clone())],
        };
        let combined = combine_results(&combo(1.2, 1.6, warned(&clean, &site, "warning"))).unwrap();
        assert!(messages(&combined).contains(&"injected warning".to_string()), "a warning at {site:?} is lost by the combination");
        let envelope = compute_envelope(&[combined.clone(), clean.clone()]).unwrap();
        assert!(messages(&envelope).contains(&"injected warning".to_string()), "a warning at {site:?} is lost by the envelope");
        assert!(messages(&combine_results(&combo(0.0, 1.6, warned(&clean, &site, "warning"))).unwrap()).is_empty(), "a zero factor lends no diagnostic");
        let refused = combine_results_checked(&combo(1.2, 1.6, warned(&clean, &site, "error"))).unwrap_err();
        assert!(dedaliano_engine::known_issues::is_refusal(&refused), "a refusal at {site:?} is combined");
        assert!(compute_envelope(&[warned(&clean, &site, "error")]).is_err(), "a refusal at {site:?} is enveloped");
    }
}

#[test]
fn a_3d_combination_keeps_every_known_issue_of_a_contributing_case_wherever_the_case_type_holds_it() {
    use dedaliano_engine::postprocess::combinations::*;
    use dedaliano_engine::types::*;
    let load = SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 3, fx: 0.0, fy: 0.0, fz: -10.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None });
    let input = crate::common::make_3d_beam(2, 4.0, 200_000.0, 0.3, 0.01, 1e-4, 1e-4, 1e-5, vec![true; 6], None, vec![load]);
    let clean = dedaliano_engine::solver::linear::solve_3d(&input).unwrap();
    for site in case_sites("AnalysisResults3D") {
        let combo = |a: f64, first: AnalysisResults3D| CombinationInput3D {
            plate_thicknesses: vec![],
            factors: vec![CombinationFactor { case_id: 1, factor: a }, CombinationFactor { case_id: 2, factor: 0.5 }],
            cases: vec![CaseEntry3D { case_id: 1, results: first }, CaseEntry3D { case_id: 2, results: clean.clone() }],
        };
        let combined = combine_results_3d(&combo(0.5, warned(&clean, &site, "warning"))).unwrap().unwrap();
        assert!(messages(&combined).contains(&"injected warning".to_string()), "a warning at {site:?} is lost by the 3D combination");
        let envelope = compute_envelope_3d(&[combined.clone(), clean.clone()]).unwrap();
        assert!(messages(&envelope).contains(&"injected warning".to_string()), "a warning at {site:?} is lost by the 3D envelope");
        let refused = combine_results_3d(&combo(0.5, warned(&clean, &site, "error"))).unwrap_err();
        assert!(dedaliano_engine::known_issues::is_refusal(&refused), "a refusal at {site:?} is combined in 3D");
    }
}
