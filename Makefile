.PHONY: dev dev-backend dev-web wasm build build-backend build-web \
       test test-engine test-backend test-web \
       docker-build docker-up docker-down \
       clean fmt check

# ── Development ──────────────────────────────────────────────

## Start everything: backend + web dev server (requires .env in backend/)
dev:
	@echo "Starting backend and web dev server..."
	$(MAKE) -j2 dev-backend dev-web

dev-backend:
	cd backend && cargo run

dev-web: wasm
	cd web && npm install && npm run dev

## Build WASM engine for the frontend
wasm:
	cd engine && wasm-pack build --target web --out-dir ../web/src/lib/wasm --no-opt

# ── Build ────────────────────────────────────────────────────

build: build-backend build-web

build-backend:
	cargo build -p dedaliano-backend --release

build-web: wasm
	cd web && npm install && npm run build

# ── Test ─────────────────────────────────────────────────────

test: test-engine test-backend test-web

test-engine:
	cargo test -p dedaliano-engine

test-backend:
	cargo test -p dedaliano-backend

test-web:
	cd web && npm install && npx vitest run

# ── Docker ───────────────────────────────────────────────────

docker-build:
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down

# ── Utilities ────────────────────────────────────────────────

fmt:
	cargo fmt --all

check:
	cargo clippy --workspace -- -D warnings

clean:
	cargo clean
	rm -rf web/dist web/node_modules/.vite
