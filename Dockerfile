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

# A pinned wasm-pack built from crates.io against its lockfile, instead of
# piping an unpinned installer script into sh.
RUN rustup target add wasm32-unknown-unknown \
    && cargo install --locked wasm-pack --version 0.13.1

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY engine/ engine/
RUN cd engine && wasm-pack build --target web --out-dir ../web-wasm --no-opt

# Build the same trimmed WASM and verified replay as make research.wasm.
RUN apt-get update && apt-get install -y --no-install-recommends python3 binaryen \
    && rm -rf /var/lib/apt/lists/*
COPY research/ research/
RUN RESEARCH_SKIP_VIEWER=1 research/fracture/shauer-2025/wasm/build.sh

FROM ${NODE_IMAGE} AS web-builder

WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
# --ignore-scripts: no dependency install hooks run in the build.
RUN npm ci --ignore-scripts

COPY web/ .
COPY research/ /app/research/
COPY --from=wasm-builder /app/web-wasm src/lib/wasm/
COPY --from=wasm-builder /app/web/public/research-wasm public/research-wasm/
RUN npx vite build -c vite.research-viewer.config.ts --outDir public/research-wasm/viewer \
    && npm run build \
    && test -s dist/research-wasm/shauer-2025/phasefield_bg.wasm \
    && test -s dist/research-wasm/shauer-2025/replay.srpl \
    && test -s dist/research-wasm/viewer/viewer.js

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
