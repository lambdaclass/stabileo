{
  description = "Stabileo — structural analysis engine, web app and SaaS backend";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs { inherit system overlays; };

        erlang = pkgs.beam.interpreters.erlang_27;
        elixir = pkgs.beam.packages.erlang_27.elixir_1_18;

        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [ "rust-src" "rust-analyzer" "clippy" "rustfmt" ];
          targets = [ "wasm32-unknown-unknown" ];
        };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            # Rust
            rustToolchain
            pkgs.wasm-pack
            pkgs.cargo-watch
            pkgs.cargo-nextest

            # Node / frontend
            pkgs.nodejs_22
            pkgs.nodePackages.npm

            # Elixir backend
            erlang
            elixir
            pkgs.postgresql_18

            # AI backend runtime deps
            pkgs.pkg-config
            pkgs.openssl

            # Docker (optional — uses host docker)
            pkgs.docker-compose

            # Dev tools
            pkgs.just
            pkgs.jq
            pkgs.curl
            pkgs.git
            pkgs.gnumake
            pkgs.shellcheck
            pkgs.lsof
          ] ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [
            pkgs.apple-sdk_15
          ] ++ pkgs.lib.optionals pkgs.stdenv.isLinux [
            pkgs.inotify-tools
            # engine/.cargo/config.toml links x86_64 Linux builds with clang + mold.
            pkgs.clang
            pkgs.mold
          ];

          shellHook = ''
            export PGHOST="''${PGHOST:-localhost}"
            export PGPORT="''${PGPORT:-5452}"

            export MIX_HOME="''${MIX_HOME:-$PWD/.mix}"
            export HEX_HOME="''${HEX_HOME:-$PWD/.hex}"
            export ERL_AFLAGS="''${ERL_AFLAGS:--kernel shell_history enabled}"
          '';

          LANG = "en_US.UTF-8";
          LC_ALL = "en_US.UTF-8";

          RUST_SRC_PATH = "${rustToolchain}/lib/rustlib/src/rust/library";
        };
      }
    );
}
