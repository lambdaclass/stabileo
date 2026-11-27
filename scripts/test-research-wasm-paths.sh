#!/usr/bin/env bash
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$repo/.tools"
scratch=$(mktemp -d "$repo/.tools/research-paths-XXXXXXXX")
trap 'rm -r "$scratch"' EXIT

for checkout in first second-checkout; do
  root="$scratch/$checkout"
  mkdir -p "$root/solver/src" "$root/browser/src" "$root/research"
  cp "$repo/research/remap-rust-paths.sh" "$root/research/"
  mkdir -p "$root/research/tools"
  cp "$repo/research/tools/cargo-workspace.py" "$root/research/tools/"
  cat > "$root/browser/Cargo.toml" <<'TOML'
[package]
name = "research_witness"
version = "0.0.0"
edition = "2021"
[lib]
crate-type = ["cdylib"]
[dependencies]
solver = { path = "../solver" }
[workspace]
TOML
  cat > "$root/solver/Cargo.toml" <<'TOML'
[package]
name = "solver"
version = "0.0.0"
edition = "2021"
TOML
  cat > "$root/solver/src/lib.rs" <<'RS'
#[inline(never)]
pub fn read(i: usize) -> u8 { include!(concat!(env!("CARGO_MANIFEST_DIR"), "/location.rs")).as_bytes()[i] }

pub struct Section;
pub fn type_identity() -> u64 {
    use std::hash::{DefaultHasher, Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    std::any::TypeId::of::<Section>().hash(&mut hasher);
    hasher.finish()
}
RS
  echo 'file!()' > "$root/solver/location.rs"
  cat > "$root/browser/src/lib.rs" <<'RS'
#[no_mangle]
pub extern "C" fn location(i: usize) -> u8 { solver::read(i) }
#[no_mangle]
pub extern "C" fn type_identity() -> u64 { solver::type_identity() }
RS
  (
    cd "$root/browser"
    source "$root/research/remap-rust-paths.sh"
    cargo generate-lockfile --offline
    research_workspace "$root/browser" "$root/staging"
    cd "$wasm_crate"
    CARGO_TARGET_DIR="$root/target" cargo build --offline --release --target wasm32-unknown-unknown
  )
done
artifacts=target/wasm32-unknown-unknown/release
cmp "$scratch/first/$artifacts/research_witness.wasm" "$scratch/second-checkout/$artifacts/research_witness.wasm"
first=("$scratch/first/$artifacts/deps"/libsolver-*.rlib)
second=("$scratch/second-checkout/$artifacts/deps"/libsolver-*.rlib)
if [[ ${first[0]##*/} != ${second[0]##*/} ]]; then
  printf 'Different dependency identities: %s and %s\n' "${first[0]##*/}" "${second[0]##*/}" >&2
  exit 1
fi
