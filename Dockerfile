# Base images are pinned by digest (tag kept for readability); Dependabot
# proposes digest bumps. A tag alone can be repointed upstream.
ARG RUST_IMAGE=rust:1.94-bookworm@sha256:6ae102bdbf528294bc79ad6e1fae682f6f7c2a6e6621506ba959f9685b308a55
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
ARG RUNTIME_IMAGE=debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587

# ── Stage 1: Build backend ────────────────────────────────────
FROM ${RUST_IMAGE} AS backend-builder

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY engine/ engine/
COPY ai-backend/ ai-backend/

RUN cargo build --locked -p dedaliano-backend --release

# ── Stage 2: Build frontend ──────────────────────────────────
FROM ${RUST_IMAGE} AS wasm-builder

# engine/.cargo/config.toml selects clang and mold for native build scripts.
RUN apt-get update && apt-get install -y --no-install-recommends clang mold \
    && rm -rf /var/lib/apt/lists/*

# A pinned wasm-pack built from crates.io against its lockfile, instead of
# piping an unpinned installer script into sh.
RUN rustup target add wasm32-unknown-unknown \
    && cargo install --locked wasm-pack --version 0.13.1

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY engine/ engine/
COPY ai-backend/ ai-backend/
RUN cd engine && wasm-pack build --target web --out-dir ../web-wasm --no-opt

# Build the same trimmed WASM and verified replay as make research.wasm.
# Binaryen 125 matches the Nix build. Bookworm's 108 breaks wasm-bindgen's externref table.
RUN apt-get update && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/* \
    && case "$(uname -m)" in \
      aarch64) arch=aarch64; checksum=d0382de3c189a7cbb9fdda93e2966f4557f6a00f201e2c4937c27ca01cead4fc ;; \
      x86_64) arch=x86_64; checksum=7c3bc16599c8274a04d34a504fe4be2047884f900e0e2da2f6fb9cd667183be4 ;; \
      *) exit 1 ;; \
    esac \
    && curl -fLsS --retry 3 "https://github.com/WebAssembly/binaryen/releases/download/version_125/binaryen-version_125-${arch}-linux.tar.gz" -o /tmp/binaryen.tar.gz \
    && echo "$checksum  /tmp/binaryen.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/binaryen.tar.gz --strip-components=1 -C /usr/local \
    && rm /tmp/binaryen.tar.gz
COPY research/ research/
RUN RESEARCH_SKIP_VIEWER=1 research/fracture/shauer-2025/wasm/build.sh \
    && research/metamaterials/grossman-2026/wasm/build.sh

FROM ${NODE_IMAGE} AS web-builder

RUN apt-get update && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
# --ignore-scripts: no dependency install hooks run in the build.
RUN npm ci --ignore-scripts
# npm run build prerenders the site in Chromium; only the builder needs it.
RUN npx playwright install --with-deps chromium

COPY web/ .
COPY research/ /app/research/
COPY --from=wasm-builder /app/web-wasm src/lib/wasm/
COPY --from=wasm-builder /app/web/public/research-wasm public/research-wasm/
RUN node ../research/fracture/shauer-2025/wasm/check.mjs public/research-wasm/shauer-2025 ../research/fracture/shauer-2025/reference-results/ex2_steps.csv \
    && node ../research/metamaterials/grossman-2026/wasm/check.mjs public/research-wasm/grossman-2026 \
    && npx vite build -c vite.research-viewer.config.ts --outDir public/research-wasm/viewer \
    && python3 ../research/tools/publish_assets.py /app /app/web/public/research-wasm/shauer-2025 \
    && npm run build \
    && test -s dist/research-wasm/shauer-2025/phasefield.js \
    && test -s dist/research-wasm/shauer-2025/phasefield_bg.wasm \
    && test -s dist/research-wasm/shauer-2025/replay.srpl \
    && test -s dist/research-wasm/grossman-2026/springs.js \
    && test -s dist/research-wasm/grossman-2026/springs_bg.wasm \
    && test -s dist/research-wasm/viewer/viewer.js \
    && node scripts/check-research-springs.mjs

# ── Stage 3: Runtime ─────────────────────────────────────────
FROM ${RUNTIME_IMAGE} AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -r -u 10001 -s /usr/sbin/nologin dedaliano

WORKDIR /app

# Backend binary (root-owned, not writable by the service user)
COPY --from=backend-builder /app/target/release/dedaliano-backend ./backend

# Frontend static files (served by a reverse proxy or static file server)
COPY --from=web-builder /app/web/dist ./web-dist

USER dedaliano

EXPOSE 3001

ENV HOST=0.0.0.0
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["./backend", "healthcheck"]

CMD ["./backend"]
