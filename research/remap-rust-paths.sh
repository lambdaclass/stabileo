if [[ -v CARGO_ENCODED_RUSTFLAGS ]]; then
  research_rust_flags=$CARGO_ENCODED_RUSTFLAGS
else
  read -ra research_flag_words <<< "${RUSTFLAGS:-}"
  research_rust_flags=$(IFS=$'\x1f'; printf '%s' "${research_flag_words[*]}")
fi
export CARGO_ENCODED_RUSTFLAGS="${research_rust_flags:+${research_rust_flags}$'\x1f'}--remap-path-prefix=$root=."
unset research_rust_flags research_flag_words

research_workspace() {
  local package=$1 stage=$2
  wasm_crate=$(python3 "$root/research/tools/cargo-workspace.py" "$root" "$package" "$stage") || return
  export CARGO_ENCODED_RUSTFLAGS="${CARGO_ENCODED_RUSTFLAGS}"$'\x1f'"--remap-path-prefix=$stage=."
  export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$package/target}"
  if [[ -z ${STABILEO_GIT_COMMIT:-} ]] && git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    STABILEO_GIT_COMMIT=$(git -C "$root" rev-parse HEAD)
    export STABILEO_GIT_COMMIT
  fi
}
