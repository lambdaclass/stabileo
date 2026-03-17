# ── Stage 1: Build backend ────────────────────────────────────
FROM rust:1.84-bookworm AS backend-builder

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY engine/ engine/
COPY backend/ backend/

RUN cargo build -p dedaliano-backend --release

# ── Stage 2: Build frontend ──────────────────────────────────
FROM rust:1.84-bookworm AS wasm-builder

RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

WORKDIR /app
COPY engine/ engine/
RUN cd engine && wasm-pack build --target web --out-dir ../web-wasm --no-opt

FROM node:22-bookworm-slim AS web-builder

WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci

COPY web/ .
COPY --from=wasm-builder /app/web-wasm src/lib/wasm/
RUN npm run build

# ── Stage 3: Runtime ─────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -r -s /bin/false dedaliano

WORKDIR /app

# Backend binary
COPY --from=backend-builder /app/target/release/dedaliano-backend ./backend

# Frontend static files (served by a reverse proxy or static file server)
COPY --from=web-builder /app/web/dist ./web-dist

USER dedaliano

EXPOSE 3001

ENV HOST=0.0.0.0
ENV PORT=3001

CMD ["./backend"]
