{
  description = "Stabileo — structural analysis engine, web app and SaaS backend";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    # Playwright 1.60.0: update together with web/package-lock.json.
    nixpkgs-playwright.url = "github:NixOS/nixpkgs/33f539df43ae63a09cb69baec738fb43f073e5b4";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, nixpkgs-playwright, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs { inherit system overlays; };

        browserPkgs = import nixpkgs-playwright { inherit system; };
        playwright = browserPkgs.playwright-driver;
        playwrightVersion = (builtins.fromJSON (builtins.readFile ./web/package-lock.json)).packages."node_modules/@playwright/test".version;

        erlang = pkgs.beam.interpreters.erlang_27;
        elixir = pkgs.beam.packages.erlang_27.elixir_1_18;

        # The one toolchain, shared with rustup and every CI job (scripts/check-pins.sh).
        rustToolchain = pkgs.rust-bin.fromRustupToolchainFile ./rust-toolchain.toml;
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            # Rust
            rustToolchain
            pkgs.wasm-pack
            pkgs.cargo-watch
            pkgs.cargo-nextest
            # Compiled crates shared by every worktree (RUSTC_WRAPPER below).
            pkgs.sccache

            # Node / frontend: the major in .nvmrc, which CI reads.
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
            pkgs.python3
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
          '' + pkgs.lib.optionalString pkgs.stdenv.isLinux ''
            # The shell replaces XDG_DATA_DIRS; without the system dirs WebKit finds no MIME database and refuses every load.
            export XDG_DATA_DIRS="''${XDG_DATA_DIRS:+$XDG_DATA_DIRS:}/usr/local/share:/usr/share"
            # Playwright checks browser libraries with the ldd on PATH, which here is the shell's and cannot see the system's.
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
          '';

          RUSTC_WRAPPER = "sccache";

          LANG = "en_US.UTF-8";
          LC_ALL = "en_US.UTF-8";

          RUST_SRC_PATH = "${rustToolchain}/lib/rustlib/src/rust/library";
        };

        # Linux browser CI; npm supplies the driver, Nix supplies its exact browser builds.
        devShells.e2e = assert pkgs.lib.assertMsg (playwright.version == playwrightVersion)
          "Playwright npm/Nix versions differ: update nixpkgs-playwright with package-lock.json";
          pkgs.mkShell {
            # Web Build checks third-party notices via cargo metadata; use the repository pin.
            packages = [ rustToolchain pkgs.nodejs_22 pkgs.git pkgs.gnumake pkgs.bash pkgs.python3 ];
            shellHook = pkgs.lib.optionalString pkgs.stdenv.isLinux ''
              export PLAYWRIGHT_BROWSERS_PATH="${playwright.browsers}"
              export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
              export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
              # Match nixpkgs' Ubuntu 24.04 archives, including WebKit's revision.
              export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE="${if pkgs.stdenv.hostPlatform.isAarch64 then "ubuntu24.04-arm64" else "ubuntu24.04-x64"}"
              # App fonts are bundled in web/public/fonts (tokens.css); provide system fallbacks.
              export FONTCONFIG_FILE="${pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts pkgs.liberation_ttf pkgs.noto-fonts-color-emoji ]; }}"
              export XDG_DATA_DIRS="${pkgs.shared-mime-info}/share''${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}"
            '';
          };

        # Verification tooling: Lean (elan reads verify/lean-toolchain), Kani, SAT solvers.
        # Kani is not in nixpkgs: scripts/kani-setup.sh installs it into ./.tools, and it
        # keeps its own nightly toolchain and CBMC under ./.tools/kani (KANI_HOME). Do not add
        # nixpkgs' cbmc here: it shadows Kani's bundled CBMC and breaks goto-cc on macOS.
        devShells.verify = pkgs.mkShell {
          buildInputs = [
            rustToolchain
            pkgs.elan
            pkgs.kissat
            pkgs.cadical
            pkgs.git
            pkgs.curl
            pkgs.jq
          ] ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [
            pkgs.apple-sdk_15
          ] ++ pkgs.lib.optionals pkgs.stdenv.isLinux [
            # engine/.cargo/config.toml links x86_64 Linux builds with clang + mold.
            pkgs.clang
            pkgs.mold
          ];

          shellHook = ''
            root=$(git rev-parse --show-toplevel)
            export ELAN_HOME="$root/.tools/elan"
            export KANI_HOME="$root/.tools/kani"
            export PATH="$root/.tools/bin:$ELAN_HOME/bin:$PATH"
          '';
        };
      }
    );
}
