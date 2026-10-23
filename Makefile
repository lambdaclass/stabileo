.PHONY: help install-nix shell setup setup.run git.setup deps backend.run console routes \
       lint.engine check.engine.acceptance-models test.engine.gates test.engine.metamorphic test.engine.suite bench.engine \
       web.deps typecheck.web test.web.unit test.web.build test.web.determinism e2e.web.setup e2e.web.build e2e.web.smoke e2e.web.slow e2e.web.visual \
       test.ci-scripts \
       test test.engine test.backend test.backend.file test.web test.ai-backend test.inventory \
       lint.backend format format.backend \
       wasm web.setup web.run web.build admin.run admin.build \
       ai-backend.run ai-backend.build \
       db.setup db.reset db.migrate db.rollback db.gen.migration db.psql \
       migrations.check migrations.check.file migrations.check.all \
       release.secrets backend.release.build backend.release.run backend.release.migrate \
       services services.stop postgres.start postgres.stop \
       inst inst.check inst.claim inst.release inst.list ports \
       docker.build docker.up docker.down \
       check-pins check.changelog worktree worktree-prune \
       fmt check clean

NIX_RUN = nix develop --command

# Multi-instance support: INST=0 (default), INST=1, ... Each instance gets its own
# ports and databases, so several checkouts/worktrees can run side by side:
#   INST=0: web 4000, admin 4001, backend 4100, db stabileo_dev
#   INST=1: web 4010, admin 4011, backend 4110, db stabileo_dev_1
# web/vite.config.ts and backend/config/dev.exs derive the same ports from INST.
# INST is read from .stabileo-inst (gitignored, one per checkout), which
# `make inst.claim` writes. An explicit INST=N still wins.
INST ?= $(shell cat .stabileo-inst 2>/dev/null || echo 0)
INST_SOURCE = $(if $(filter command line environment,$(origin INST)),explicit,$(if $(wildcard .stabileo-inst),file,default))

DATA_DIR = $(HOME)/.local/share/stabileo
POSTGRES_DIR = $(DATA_DIR)/postgres
INST_REGISTRY = $(DATA_DIR)/instances

# Not the default 5432 (nor scasaas's 5442), so this runs next to other projects' servers.
PG_PORT = 5452
DB_USER = postgres

SUBMAKE = $(MAKE) --no-print-directory

INST_DB_SUFFIX = $(if $(filter 0,$(INST)),,_$(INST))
DB_NAME = stabileo_dev$(INST_DB_SUFFIX)
BACKEND_PORT := $(shell expr 4100 + $(INST) \* 10)
WEB_PORT := $(shell expr 4000 + $(INST) \* 10)
ADMIN_PORT := $(shell expr 4001 + $(INST) \* 10)

export INST

help:
	@echo "Stabileo development commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install-nix    - Install Nix (Determinate Systems installer)"
	@echo "  make shell          - Enter the nix development shell"
	@echo "  make setup          - First-time setup: claim an instance, start PostgreSQL, fetch deps, create the DB"
	@echo "  make worktree NAME=fix-x [BASE=main] - A worktree ready to test in seconds"
	@echo "  make worktree-prune - Remove worktrees that are clean and already on origin/main"
	@echo ""
	@echo "Development:"
	@echo "  make backend.run    - Start the Phoenix backend (port 4100 + INST*10)"
	@echo "  make web.run        - Build the WASM engine and start the web app (port 4000 + INST*10)"
	@echo "  make admin.run      - Start the admin site (port 4001 + INST*10), no WASM build"
	@echo "  make admin.build    - Build the admin site into web/dist-admin"
	@echo "  make console        - IEx console on the backend"
	@echo "  make routes         - Show backend routes"
	@echo "  make ai-backend.run - Start the legacy Rust AI backend (port 3001)"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Engine, backend and web tests"
	@echo "  make test.engine    - Rust engine tests"
	@echo "  make test.backend   - Elixir backend tests"
	@echo "  make test.backend.file FILE=apps/... - One backend test file or dir"
	@echo "  make test.web       - Web (Vitest) tests"
	@echo "  make test.ai-backend - Legacy Rust AI backend tests"
	@echo ""
	@echo "CI-shaped targets (what each CI job runs):"
	@echo "  make check-pins           - One version of each tool in rust-toolchain.toml, .nvmrc, flake.nix and CI"
	@echo "  make check.changelog      - changelog.d/ fragments are well formed"
	@echo "  make lint.engine          - Clippy over the engine"
	@echo "  make test.engine.gates    - The named engine correctness gates"
	@echo "  make test.engine.metamorphic - Metamorphic tests, in release"
	@echo "  make test.engine.suite [SHARD=1/2] - Every engine test outside the gates"
	@echo "  make bench.engine         - Criterion benchmarks (informational)"
	@echo "  make typecheck.web        - tsc against its baseline + svelte-check gate"
	@echo "  make test.web.unit [SHARD=1/2] - Vitest unit pass"
	@echo "  make test.web.build       - Production build + build-pass tests"
	@echo "  make test.web.determinism - WASM results bit-identical across Node and three browsers"
	@echo "  make e2e.web.build        - The VITE_E2E=1 site the e2e suites run on with E2E_PREBUILT=1"
	@echo "  make e2e.web.smoke [SHARD=1/5] - Playwright smoke suite"
	@echo "  make e2e.web.slow [SHARD=1/5] / e2e.web.visual - The heavier Playwright suites"
	@echo "  make lint.backend   - Format check and credo over the backend"
	@echo "  make format         - Format Elixir and Rust"
	@echo ""
	@echo "Database:"
	@echo "  make db.setup       - Create, migrate and seed"
	@echo "  make db.reset       - Drop, create, migrate and seed"
	@echo "  make db.migrate     - Run pending migrations"
	@echo "  make db.rollback    - Roll back the last migration"
	@echo "  make db.gen.migration name=create_foo - Generate a migration (never by hand)"
	@echo "  make db.psql        - PostgreSQL console"
	@echo "  make migrations.check - Check pending migrations for production safety"
	@echo "  make migrations.check.file FILE=apps/.../xxx.exs - Check one migration"
	@echo "  make migrations.check.all - Check every migration"
	@echo ""
	@echo "Instances:"
	@echo "  make inst           - Which instance this checkout uses"
	@echo "  make inst.claim     - Claim a free instance for this checkout"
	@echo "  make inst.release   - Give this checkout's instance back"
	@echo "  make inst.list      - Every instance claimed on this machine"
	@echo "  make ports          - Ports and databases for this INST"
	@echo ""
	@echo "Release:"
	@echo "  make release.secrets       - Generate SECRET_KEY_BASE and JWT_SECRET into .env.prod"
	@echo "  make backend.release.build - Build the backend release"
	@echo "  make backend.release.run   - Run the release locally (needs .env.prod)"
	@echo "  make backend.release.migrate - Run migrations through the release"
	@echo ""
	@echo "Services:"
	@echo "  make services       - Start PostgreSQL (:$(PG_PORT))"
	@echo "  make services.stop  - Stop PostgreSQL"

install-nix:
	@if command -v nix >/dev/null 2>&1; then \
		echo "Nix is already installed: $$(nix --version)"; \
	else \
		curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install; \
	fi

shell:
	nix develop

# INST is exported, so the sub-make drops it from the environment to re-read
# .stabileo-inst, and passes an explicit one back on the command line.
setup:
	@if [ "$(INST_SOURCE)" = "default" ]; then $(SUBMAKE) inst.claim; fi
	@env -u INST $(MAKE) --no-print-directory $(if $(filter explicit,$(INST_SOURCE)),INST=$(INST)) setup.run

setup.run: git.setup services
	$(SUBMAKE) deps db.setup
	@echo "Setup complete. Run 'make backend.run' and 'make web.run'."

# Nix flakes only see tracked files.
git.setup:
	@git add -N flake.nix flake.lock 2>/dev/null || true

deps:
	$(NIX_RUN) bash -c "cd backend && mix local.hex --force --if-missing && mix local.rebar --force --if-missing && mix deps.get"

backend.run: services
	$(NIX_RUN) bash -c "cd backend && MIX_ENV=dev INST=$(INST) mix ecto.migrate && MIX_ENV=dev INST=$(INST) iex -S mix phx.server"

console: services
	$(NIX_RUN) bash -c "cd backend && MIX_ENV=dev INST=$(INST) iex -S mix"

# The umbrella has no default router, so phx.routes needs it named.
routes:
	$(NIX_RUN) bash -c "cd backend && mix phx.routes StabileoWeb.Router"

test: test.engine test.backend test.web

test.engine:
	$(NIX_RUN) cargo test -p dedaliano-engine

test.backend: services
	$(NIX_RUN) bash -c "cd backend && MIX_ENV=test mix ecto.create --quiet && MIX_ENV=test mix ecto.migrate --quiet && mix test"

# FILE is relative to backend/.
test.backend.file: services
	$(NIX_RUN) bash -c "cd backend && MIX_ENV=test mix ecto.create --quiet && MIX_ENV=test mix ecto.migrate --quiet && mix test $(FILE)"

test.web:
	$(NIX_RUN) bash -c "cd web && npm install && npm test"

# Each named gate runs once on its own; the suite runs everything else, so no
# test runs twice. Add a gate here and it is excluded from the suite automatically.
GATE_SHELL_BENCH = test(/benchmark_shell/) + test(/benchmark_beam_shell/) + test(/benchmark_plate/) + test(/benchmark_navier/) + test(/benchmark_scordelis/) + test(/benchmark_cantilever/) + test(/benchmark_pinched/) + test(/test_quad_thin_plate/)
GATE_SHELL_ACCEPTANCE = test(/acceptance_.*shell/) + test(/acceptance_.*diaphragm/)
GATE_CONSTRAINT_BENCH = test(/benchmark_.*constraint/)
GATE_BINARIES = sparse_shell_gates solver_invariants solver_ci_coverage conditioning_adversarial kfull_overbuild_gates acceptance certify properties_2d properties_3d
# Wall-clock gates run single-threaded, so elapsed time is CPU work, not contention.
GATE_TIMED_BINARIES = perf_regression_gates perf_regression_advanced
# Metamorphic tests run apart, in release: unoptimised they outlast a suite shard.
GATE_RELEASE_BINARIES = metamorphic
SUITE_FILTER = all() - test(harmonic_phase_breakdown) - test(harmonic_modal_vs_direct_timing) $(foreach b,$(GATE_TIMED_BINARIES) $(GATE_RELEASE_BINARIES),- binary($(b)) )- ($(GATE_SHELL_BENCH)) - ($(GATE_SHELL_ACCEPTANCE)) - $(GATE_CONSTRAINT_BENCH) $(foreach b,$(GATE_BINARIES),- binary($(b)) )
NEXTEST = cd engine && $(NIX_RUN) cargo nextest run --profile ci

lint.engine:
	cd engine && $(NIX_RUN) cargo clippy --lib -- -W clippy::all -A clippy::erasing_op

# The acceptance models are generated (docs/verification/ACCEPTANCE.md); a hand edit fails here.
check.engine.acceptance-models:
	$(NIX_RUN) bash -c 'for g in engine/tests/acceptance/generators/*.py; do python3 -I "$$g"; done'
	git diff --exit-code -- engine/tests/acceptance/models

test.engine.gates: check.engine.acceptance-models
	$(NEXTEST) -E '$(GATE_SHELL_BENCH)'
	$(NEXTEST) -E '$(GATE_SHELL_ACCEPTANCE)'
	$(NEXTEST) -E '$(GATE_CONSTRAINT_BENCH)'
	$(foreach b,$(GATE_BINARIES),($(NEXTEST) --test $(b)) &&) true
	$(foreach b,$(GATE_TIMED_BINARIES),($(NEXTEST) --test $(b) --test-threads 1) &&) true

test.engine.metamorphic:
	$(NEXTEST) --cargo-profile release $(foreach b,$(GATE_RELEASE_BINARIES),--test $(b))

test.engine.suite:
	$(NEXTEST) -E '$(SUITE_FILTER)' $(if $(SHARD),--partition count:$(SHARD))

bench.engine:
	cd engine && $(NIX_RUN) cargo bench --no-run
	cd engine && $(NIX_RUN) cargo bench --bench solver_bench --bench assembly_bench --bench workflow_bench -- --sample-size 10 --warm-up-time 1 --measurement-time 3

web.deps:
	$(NIX_RUN) bash -c "cd web && npm ci"

typecheck.web:
	$(NIX_RUN) bash -c "cd web && npm run typecheck && npm run check:gate"

test.web.unit:
	$(NIX_RUN) bash -c "cd web && npx vitest run --project unit $(if $(SHARD),--shard=$(SHARD))"

# The build prerenders the public pages in Chromium, so it needs the browser.
test.web.build:
	$(NIX_RUN) bash -c "cd web && npx playwright install chromium && npm run build && npx vitest run --project build"

# The WASM must give bit-identical results in Node, Chromium, Firefox and WebKit
# (docs/verification/TRUSTED_BASE.md). Needs make wasm and make web.deps first.
test.web.determinism:
	$(NIX_RUN) bash -c "cd web && npx playwright install chromium firefox webkit && node --test determinism/serve.test.mjs determinism/checks.test.mjs && node determinism/node-run.mjs && npx playwright test -c determinism/playwright.config.ts"

e2e.web.setup:
	$(NIX_RUN) bash -c "cd web && npx playwright install chromium"

# The site the e2e suites test with E2E_PREBUILT=1: VITE_E2E=1 compiles the read-only test hooks in,
# and web/playwright.config.ts refuses a prebuilt dist without the marker. Needs make e2e.web.setup.
e2e.web.build:
	$(NIX_RUN) bash -c 'cd web && VITE_E2E=1 npm run build && echo "VITE_E2E=1 build of $${GITHUB_SHA:-$$(git rev-parse HEAD)}" > dist/e2e-build.txt'

# SHARD=i/n picks whole spec files balanced by measured duration (web/scripts/e2e-shard.mjs).
e2e.web.smoke:
	$(NIX_RUN) bash -c 'cd web && npx playwright test --grep @smoke $(if $(SHARD),$$(node scripts/e2e-shard.mjs $(subst /, ,$(SHARD))))'

e2e.web.slow:
	$(NIX_RUN) bash -c 'cd web && npx playwright test --grep "@slow" --grep-invert "visual baselines" $(if $(SHARD),--shard=$(SHARD))'

e2e.web.visual:
	$(NIX_RUN) bash -c 'cd web && npx playwright test --grep "visual baselines" $(if $(UPDATE_SNAPSHOTS),--update-snapshots)'

test.ai-backend:
	$(NIX_RUN) cargo test -p dedaliano-backend

## Measure the engine test inventory published in docs/BENCHMARKS.md.
## Engine-coupled = every target except `reference`, whose tests recompute
## textbook/code formulas inline and never call the engine (see
## engine/tests/reference/main.rs). Single pass: attributes each `test result`
## line to the target announced by the preceding `Running` line.
test.inventory:
	@cd engine && $(NIX_RUN) cargo test 2>&1 | awk -v sha="$$(git rev-parse --short HEAD)" -v day="$$(date +%Y-%m-%d)" ' \
		/^[[:space:]]*Running / { target = $$2 } \
		/^[[:space:]]*Doc-tests / { target = "doc-tests" } \
		/^test result:/ { \
			if ($$5 != "passed;") next; \
			if (target ~ /reference/) ref += $$4; else eng += $$4; \
			failed += $$6; seen++; \
		} \
		END { \
			if (seen < 20 || ref == 0) { \
				printf "INCOMPLETE RUN (%d target(s) reported, reference=%d) — do not publish these numbers.\n", seen, ref; \
				exit 1; \
			} \
			printf "measured at %s on %s\n", sha, day; \
			printf "engine-coupled: %d passing, %d failures\n", eng, failed; \
			printf "reference-formula self-checks: %d passing\n", ref; \
			printf "total registered: %d\n", eng + ref; \
		}'

## One version of each tool everywhere (rust-toolchain.toml, .nvmrc, flake.nix, CI)
check-pins:
	scripts/check-pins.sh

## Unreleased changes are one file each in changelog.d/ (scripts/changelog.py)
check.changelog:
	$(NIX_RUN) python3 -I scripts/changelog.py --check

test.ci-scripts:
	$(NIX_RUN) bash -c 'shellcheck -S warning .github/scripts/*.sh'

lint.backend:
	$(NIX_RUN) bash -c "cd backend && mix format --check-formatted"
	$(NIX_RUN) bash -c "cd backend && mix credo"

format.backend:
	$(NIX_RUN) bash -c "cd backend && mix format"

format: format.backend fmt

## Build the WASM engine for the frontend (a copy from the cache when these sources were built before)
wasm:
	$(NIX_RUN) scripts/wasm-cached.sh

## A new worktree ready to test in seconds: make worktree NAME=fix-x [BASE=main]
worktree:
	scripts/worktree.sh $(NAME) $(or $(BASE),main)

## Remove the worktrees that are clean and already on origin/main (never forces)
worktree-prune:
	scripts/worktree-prune.sh

web.setup:
	$(NIX_RUN) bash -c "cd web && npm install"

web.run: wasm
	$(NIX_RUN) bash -c "cd web && npm install && VITE_API_URL=http://localhost:$(BACKEND_PORT) npm run dev -- --port $(WEB_PORT)"

# Builds from the installed dependencies (make web.deps), so CI never resolves away from the lockfile.
web.build: wasm
	$(NIX_RUN) bash -c "cd web && npm run build"

admin.run:
	$(NIX_RUN) bash -c "cd web && VITE_APP_TYPE=admin VITE_API_URL=http://localhost:$(BACKEND_PORT) npx vite --port $(ADMIN_PORT)"

admin.build:
	$(NIX_RUN) bash -c "cd web && npm run build:admin"

ai-backend.run:
	$(NIX_RUN) bash -c "cd ai-backend && cargo run"

ai-backend.build:
	$(NIX_RUN) cargo build -p dedaliano-backend --release

db.setup: services
	$(NIX_RUN) bash -c "cd backend && MIX_ENV=dev INST=$(INST) mix ecto.create && MIX_ENV=dev INST=$(INST) mix ecto.migrate"
	$(NIX_RUN) bash -c "cd backend && MIX_ENV=dev INST=$(INST) mix run apps/stabileo_repo/priv/repo/seeds.exs"

db.reset: services
	$(NIX_RUN) bash -c "cd backend && MIX_ENV=dev INST=$(INST) mix ecto.drop && MIX_ENV=dev INST=$(INST) mix ecto.create && MIX_ENV=dev INST=$(INST) mix ecto.migrate"
	$(NIX_RUN) bash -c "cd backend && MIX_ENV=dev INST=$(INST) mix run apps/stabileo_repo/priv/repo/seeds.exs"

db.migrate: services
	$(NIX_RUN) bash -c "cd backend && MIX_ENV=dev INST=$(INST) mix ecto.migrate"

db.rollback: services
	$(NIX_RUN) bash -c "cd backend && MIX_ENV=dev INST=$(INST) mix ecto.rollback"

db.gen.migration:
ifndef name
	$(error Usage: make db.gen.migration name=create_products)
endif
	$(NIX_RUN) bash -c "cd backend/apps/stabileo_repo && mix ecto.gen.migration '$(name)'"

db.psql: services
	$(NIX_RUN) bash -c "psql -h $(POSTGRES_DIR) -p $(PG_PORT) -U $(DB_USER) -d $(DB_NAME)"

migrations.check:
	$(NIX_RUN) bash -c "cd backend && mix compile && mix stabileo.check_migrations --pending --verbose"

migrations.check.file:
ifndef FILE
	$(error Usage: make migrations.check.file FILE=apps/stabileo_repo/priv/repo/migrations/2026..._name.exs)
endif
	$(NIX_RUN) bash -c "cd backend && mix compile && mix stabileo.check_migrations --file '$(FILE)' --verbose"

migrations.check.all:
	$(NIX_RUN) bash -c "cd backend && mix compile && mix stabileo.check_migrations --verbose"

RELEASE_DB_URL = ecto://postgres:postgres@localhost:$(PG_PORT)/$(DB_NAME)

release.secrets:
	@if [ -f .env.prod ]; then \
		echo "Secrets file .env.prod already exists. Delete it first to regenerate."; \
	else \
		echo "# Generated secrets for production - DO NOT COMMIT" > .env.prod; \
		echo "SECRET_KEY_BASE=$$($(NIX_RUN) bash -c 'cd backend && mix phx.gen.secret 2>/dev/null' | tail -1)" >> .env.prod; \
		echo "JWT_SECRET=$$($(NIX_RUN) bash -c 'cd backend && mix phx.gen.secret 64 2>/dev/null' | tail -1)" >> .env.prod; \
		echo "Secrets generated in .env.prod"; \
	fi

backend.release.build:
	$(NIX_RUN) bash -c "cd backend && mix local.hex --force --if-missing && mix local.rebar --force --if-missing && MIX_ENV=prod mix deps.get --only prod && MIX_ENV=prod mix compile && MIX_ENV=prod mix release --overwrite"
	@echo "Backend release built: backend/_build/prod/rel/stabileo/"

backend.release.run: services
	@if [ ! -f .env.prod ]; then echo "Error: .env.prod not found. Run 'make release.secrets' first."; exit 1; fi
	$(NIX_RUN) bash -c '\
		set -a && . ./.env.prod && set +a && \
		DATABASE_URL=$${DATABASE_URL:-"$(RELEASE_DB_URL)"} \
		PHX_HOST=$${PHX_HOST:-localhost} \
		PORT=$${PORT:-$(BACKEND_PORT)} \
		./backend/_build/prod/rel/stabileo/bin/stabileo start'

backend.release.migrate: services
	@if [ ! -f .env.prod ]; then echo "Error: .env.prod not found. Run 'make release.secrets' first."; exit 1; fi
	$(NIX_RUN) bash -c '\
		set -a && . ./.env.prod && set +a && \
		DATABASE_URL=$${DATABASE_URL:-"$(RELEASE_DB_URL)"} \
		./backend/_build/prod/rel/stabileo/bin/stabileo eval "StabileoRepo.Release.migrate()"'

inst:
	@if [ -f .stabileo-inst ]; then \
		echo "INST=$(INST) (from .stabileo-inst)"; \
	else \
		echo "INST=$(INST) (default; no .stabileo-inst in this checkout)"; \
	fi

# Fails when this checkout would collide with an instance owned by another checkout.
inst.check:
	@here="$$(pwd -P)"; reg="$(INST_REGISTRY)/$(INST)"; src="$(INST_SOURCE)"; \
	owner=""; [ -f "$$reg" ] && owner=$$(cat "$$reg"); \
	if [ "$$src" != "explicit" ] && [ -n "$$owner" ] && [ "$$owner" != "$$here" ] && [ -d "$$owner" ]; then \
		echo "ERROR: INST=$(INST) is owned by another checkout: $$owner"; \
		echo "       Run 'make inst.claim' here (or pass INST=N explicitly)."; \
		exit 1; \
	fi; \
	if [ "$$src" = "file" ] && [ -z "$$owner" ]; then mkdir -p "$(INST_REGISTRY)"; echo "$$here" > "$$reg"; fi; \
	echo "INST=$(INST) ($$src) · backend $(BACKEND_PORT) · db $(DB_NAME)"

# Claims the lowest instance that is unregistered and whose backend port is free.
# Atomic (noclobber), idempotent, and reclaims entries whose checkout is gone.
inst.claim:
	@here="$$(pwd -P)"; \
	mkdir -p "$(INST_REGISTRY)"; \
	if [ -f .stabileo-inst ]; then \
		n=$$(cat .stabileo-inst); \
		[ -f "$(INST_REGISTRY)/$$n" ] || echo "$$here" > "$(INST_REGISTRY)/$$n"; \
		echo "Already on instance $$n. Use 'make inst.release' to give it up."; \
		exit 0; \
	fi; \
	for f in "$(INST_REGISTRY)"/*; do \
		[ -f "$$f" ] || continue; \
		owner=$$(cat "$$f"); \
		if [ ! -d "$$owner" ] || [ ! -f "$$owner/.stabileo-inst" ]; then rm -f "$$f"; fi; \
	done; \
	for n in 0 1 2 3 4 5 6 7 8 9; do \
		[ -f "$(INST_REGISTRY)/$$n" ] && continue; \
		if lsof -ti:$$(expr 4100 + $$n \* 10) >/dev/null 2>&1; then continue; fi; \
		( set -o noclobber; echo "$$here" > "$(INST_REGISTRY)/$$n" ) 2>/dev/null || continue; \
		echo $$n > .stabileo-inst; \
		echo "Claimed instance $$n for this checkout."; \
		$(SUBMAKE) INST=$$n ports; \
		exit 0; \
	done; \
	echo "No free instance in 0-9. Run 'make inst.list'."; \
	exit 1

inst.release:
	@here="$$(pwd -P)"; n="$(INST)"; \
	if [ "$(INST_SOURCE)" = "default" ]; then echo "No instance claimed by this checkout."; exit 0; fi; \
	if [ -f "$(INST_REGISTRY)/$$n" ] && [ "$$(cat "$(INST_REGISTRY)/$$n")" = "$$here" ]; then rm -f "$(INST_REGISTRY)/$$n"; fi; \
	if [ -f .stabileo-inst ] && [ "$$(cat .stabileo-inst)" = "$$n" ]; then rm -f .stabileo-inst; fi; \
	echo "Released instance $$n."

inst.list:
	@here="$$(pwd -P)"; \
	if [ -z "$$(ls -A "$(INST_REGISTRY)" 2>/dev/null)" ]; then echo "No instances claimed."; exit 0; fi; \
	for f in "$(INST_REGISTRY)"/*; do \
		owner=$$(cat "$$f"); mark=""; \
		[ "$$owner" = "$$here" ] && mark="  <- this checkout"; \
		[ -d "$$owner" ] || mark="  (stale: path missing)"; \
		printf "  INST=%s  %s%s\n" "$$(basename $$f)" "$$owner" "$$mark"; \
	done

ports:
	@echo "INST=$(INST)"
	@echo "  backend   $(BACKEND_PORT)   db $(DB_NAME)"
	@echo "  test db   stabileo_test$(INST_DB_SUFFIX)"
	@echo "  web       $(WEB_PORT) (VITE_API_URL=http://localhost:$(BACKEND_PORT))"
	@echo "  admin     $(ADMIN_PORT)"
	@echo "  postgres  $(PG_PORT) (shared, data namespaced per INST)"

services: inst.check git.setup postgres.start

services.stop: postgres.stop

postgres.start:
	@mkdir -p $(POSTGRES_DIR)
	@if [ ! -d "$(POSTGRES_DIR)/base" ]; then \
		echo "Initializing PostgreSQL..."; \
		$(NIX_RUN) bash -c "initdb -D $(POSTGRES_DIR) --no-locale --encoding=UTF8 -U postgres"; \
		echo "unix_socket_directories = '$(POSTGRES_DIR)'" >> $(POSTGRES_DIR)/postgresql.conf; \
		echo "listen_addresses = 'localhost'" >> $(POSTGRES_DIR)/postgresql.conf; \
		echo "port = $(PG_PORT)" >> $(POSTGRES_DIR)/postgresql.conf; \
	fi
	@if [ ! -f "$(POSTGRES_DIR)/postmaster.pid" ]; then \
		echo "Starting PostgreSQL..."; \
		$(NIX_RUN) bash -c "pg_ctl -D $(POSTGRES_DIR) -l $(POSTGRES_DIR)/log start -w -o '-k $(POSTGRES_DIR) -p $(PG_PORT)'"; \
	fi

postgres.stop:
	@if [ -f "$(POSTGRES_DIR)/postmaster.pid" ]; then \
		$(NIX_RUN) bash -c "pg_ctl -D $(POSTGRES_DIR) stop" || true; \
	fi

docker.build:
	docker compose build

docker.up:
	docker compose up -d

docker.down:
	docker compose down

fmt:
	$(NIX_RUN) cargo fmt --all

check:
	$(NIX_RUN) cargo clippy --workspace -- -D warnings

clean:
	$(NIX_RUN) cargo clean
	rm -rf web/dist web/node_modules/.vite backend/_build backend/deps .mix .hex
