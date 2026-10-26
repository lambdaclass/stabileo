.PHONY: check-pins worktree worktree-prune hooks dev dev-backend dev-web wasm build build-backend build-web \
       test test-changed test-engine test-backend test-web test-inventory \
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

## Build WASM engine for the frontend (a copy from the cache when these sources were built before)
wasm:
	scripts/wasm-cached.sh

## A new worktree ready to test in seconds: make worktree NAME=fix-x [BASE=main]
worktree:
	scripts/worktree.sh $(NAME) $(or $(BASE),main)

## Remove the worktrees that are clean and already on origin/main (never forces)
worktree-prune:
	scripts/worktree-prune.sh

## Use the versioned git hooks (scripts/hooks): pre-push runs the web typecheck and the related
## unit tests. Set in the repository's config, so every worktree of this clone gets it; skip one
## push with `git push --no-verify`; undo with `git config --unset core.hooksPath`.
hooks:
	git config core.hooksPath scripts/hooks
	@echo "hooks: core.hooksPath = scripts/hooks (pre-push: typecheck + related unit tests)"

# ── Build ────────────────────────────────────────────────────

build: build-backend build-web

build-backend:
	cargo build -p dedaliano-backend --release

build-web: wasm
	cd web && npm install && npm run build

## One version of each tool everywhere (rust-toolchain.toml, .nvmrc, flake.nix, CI)
check-pins:
	scripts/check-pins.sh

# ── Test ─────────────────────────────────────────────────────

test: test-engine test-backend test-web

## Only the tests your changes most likely affect (vs origin/main, uncommitted work included);
## prints what it runs and what it skips. BASE=<rev> to compare with something else.
test-changed:
	scripts/test-changed.sh $(if $(BASE),--base $(BASE))

test-engine:
	cargo test -p dedaliano-engine

test-backend:
	cargo test -p dedaliano-backend

test-web:
	cd web && npm install && npm test

## Measure the engine test inventory published in docs/BENCHMARKS.md.
## Engine-coupled = every target except `reference`, whose tests recompute
## textbook/code formulas inline and never call the engine (see
## engine/tests/reference/main.rs). Single pass: attributes each `test result`
## line to the target announced by the preceding `Running` line. A complete run
## reports every [[test]] binary in engine/Cargo.toml plus the library's unit tests.
test-inventory:
	@cd engine && cargo test 2>&1 | awk -v sha="$$(git rev-parse --short HEAD)" -v day="$$(date +%Y-%m-%d)" \
		-v expected="$$(( $$(grep -c '^\[\[test\]\]' Cargo.toml) + 1 ))" ' \
		/^[[:space:]]*Running / { target = $$2 } \
		/^[[:space:]]*Doc-tests / { target = "doc-tests" } \
		/^test result:/ { \
			if ($$5 != "passed;") next; \
			if (target ~ /reference/) ref += $$4; else eng += $$4; \
			failed += $$6; seen++; \
		} \
		END { \
			if (seen < expected || ref == 0) { \
				printf "INCOMPLETE RUN (%d target(s) reported, reference=%d) — do not publish these numbers.\n", seen, ref; \
				exit 1; \
			} \
			printf "measured at %s on %s\n", sha, day; \
			printf "engine-coupled: %d passing, %d failures\n", eng, failed; \
			printf "reference-formula self-checks: %d passing\n", ref; \
			printf "total registered: %d\n", eng + ref; \
		}'

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
