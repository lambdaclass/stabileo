if [[ -v CARGO_ENCODED_RUSTFLAGS ]]; then
  research_rust_flags=$CARGO_ENCODED_RUSTFLAGS
else
  read -ra research_flag_words <<< "${RUSTFLAGS:-}"
  research_rust_flags=$(IFS=$'\x1f'; printf '%s' "${research_flag_words[*]}")
fi
export CARGO_ENCODED_RUSTFLAGS="${research_rust_flags:+${research_rust_flags}$'\x1f'}--remap-path-prefix=$root=."
unset research_rust_flags research_flag_words
