.PHONY: research.wasm paper.pdf help install-nix shell setup setup.run git.setup deps backend.run console routes \
       lint.engine gen.result-sites test.engine.units-types check.engine.acceptance-models test.engine.gates test.engine.metamorphic test.engine.invariance.quick test.engine.mechanism-fuzz.quick test.engine.mechanism-fuzz.long test.engine.mechanism-fuzz.replay test.engine.suite test.engine.differential.quick test.engine.differential.full bench.engine mutants.engine mutants.safety.report mutants.safety.record \
       web.deps typecheck.web test.web.unit test.web.build web.build.tested test.web.build.shared test.web.timing test.web.results snapshots-update check.results-snapshot-gate test.web.determinism e2e.web.setup e2e.web.build e2e.web.smoke e2e.web.slow e2e.web.timing e2e.web.visual e2e.web.flaky \
       perf.lighthouse.deps perf.lighthouse \
       test.ci-scripts test.nightly-scripts test.infra.caddy test.infra.caddy.redirects check.web.translations check.web.route-size \
       test test.engine test.engine.benchmark-protocol test.backend test.backend.file test.web test.ai-backend test.inventory test-changed check.quick \
       lint.backend format format.backend \
       wasm web.setup web.run web.build admin.run admin.build \
       ai-backend.run ai-backend.build \
       db.setup db.reset db.migrate db.rollback db.gen.migration db.psql \
       migrations.check migrations.check.file migrations.check.all \
       release.secrets backend.release.build backend.release.run backend.release.migrate \
       services services.stop postgres.start postgres.stop \
       inst inst.check inst.claim inst.release inst.list ports \
       result-changes.order docker.build docker.up docker.down cloud-init.render \
       check-pins check.changelog release.step check.test-targets test.cadence check.cadence check.containment deps.audit test.engine.reproducers test.reproducers.published check.issue-reproducers worktree worktree-prune hooks \
       fmt check clean

NIX_RUN = nix develop --command
# The e2e shell supplies immutable browser builds; Ubuntu keeps its existing installer.
PLAYWRIGHT_INSTALL = bash scripts/playwright-install.sh

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
PG_PORT = $(or $(PGPORT),5452)
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
	@echo "  make changelog.unreleased - Refresh CHANGELOG.md from fragments, keeping them"
	@echo "  make check.reverts [BASE=origin/main] [HEAD=HEAD] - Merging HEAD into BASE deletes no recent lines HEAD's branch never had"
	@echo "  make lint.engine          - Clippy over the engine"
	@echo "  make test.engine.gates    - The named engine correctness gates"
	@echo "  make test.engine.metamorphic - Metamorphic tests, in release"
	@echo "  make test.engine.invariance.quick - Invariance of the analyses the changes since BASE touch (KINDS=all for every one)"
	@echo "  make test.engine.mechanism-fuzz.quick - Mechanism fuzzing of the certificate: the checked-in seeds"
	@echo "  make test.engine.mechanism-fuzz.long DURATION=30m - Mechanism fuzzing from SEED until DURATION (REPORT_DIR keeps reproducers)"
	@echo "  make test.engine.mechanism-fuzz.replay SEEDS=12,44 FILES=a.json - Fuzz seeds or saved cases: model, outcome, minimised reproducer"
	@echo "  make test.engine.suite [SHARD=1/4] - Every engine test outside the gates"
	@echo "  make test.engine.differential.quick - Cross-method pairs that must agree (per PR)"
	@echo "  make test.engine.differential.full  - Those plus the parametrised families (nightly)"
	@echo "  make bench.engine         - Criterion benchmarks (informational)"
	@echo "  make typecheck.web        - tsc against its baseline + svelte-check gate"
	@echo "  make test.web.unit [SHARD=1/4] [VITEST_WORKERS=N] - Vitest unit pass"
	@echo "  make test.web.timing [VITEST_WORKERS=N] - Project-scale timing budgets"
	@echo "  make test.web.build       - Production build + build-pass tests"
	@echo "  make test.web.determinism - WASM results bit-identical across Node and three browsers"
	@echo "  make e2e.web.build        - The VITE_E2E=1 site the e2e suites run on with E2E_PREBUILT=1"
	@echo "  make e2e.web.smoke [SHARD=1/10] - Playwright smoke suite"
	@echo "  make e2e.web.slow [SHARD=1/10] / e2e.web.visual - The heavier Playwright suites"
	@echo "  make e2e.web.flaky       - The quarantined (@flaky) tests, two retries"
	@echo "  make check.test-targets  - Every engine test file is in exactly one test binary"
	@echo "  make test-changed        - Only the tests your changes most likely affect"
	@echo "  make check.quick         - Before a push: CI's fast checks and the related tests, for what changed"
	@echo "  make hooks               - The versioned pre-push hook (typecheck + related unit tests)"
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

## Use the versioned git hooks (scripts/hooks): pre-push runs the web typecheck and the related
## unit tests. Set in the repository's config, so every worktree of this clone gets it; skip one
## push with `git push --no-verify`; undo with `git config --unset core.hooksPath`.
hooks:
	git config core.hooksPath scripts/hooks
	@echo "hooks: core.hooksPath = scripts/hooks (pre-push: typecheck + related unit tests)"

## Only the tests your changes most likely affect (vs origin/main, uncommitted work included);
## prints what it runs and what it skips. BASE=<rev> to compare with something else.
test-changed:
	scripts/test-changed.sh $(if $(BASE),--base $(BASE))

## Before a push: the lint, typecheck and unit checks CI runs first, for what changed (vs origin/main,
## uncommitted work included); BASE=<rev> to compare with something else.
check.quick:
	BASE=$(BASE) scripts/check-quick.sh

console: services
	$(NIX_RUN) bash -c "cd backend && MIX_ENV=dev INST=$(INST) iex -S mix"

# The umbrella has no default router, so phx.routes needs it named.
routes:
	$(NIX_RUN) bash -c "cd backend && mix phx.routes StabileoWeb.Router"

test: test.engine test.backend test.web

.PHONY: audit.810 audit.810.run test.engine.targeted research.newmark.replay

audit.810:
	$(NIX_RUN) python3 docs/audits/810-reproduce.py $(MODES)

audit.810.run:
	$(NIX_RUN) cargo run -p dedaliano-engine --example triage810 -- $(MODE)

test.engine.targeted:
	$(NIX_RUN) cargo test -p dedaliano-engine --test $(TEST) $(FILTER) -- --nocapture

NEWMARK_DIR = $(CURDIR)/research/benchmarks/newmark-1959
research.newmark.replay:
	NEWMARK_REPLAY_OUT=$(NEWMARK_DIR)/results/stabileo_results.json NEWMARK_VALIDATION_OUT=$(NEWMARK_DIR)/VALIDATION.json \
		$(MAKE) test.engine.targeted TEST=integration FILTER=newmark_1959

test.engine.benchmark-protocol:
	$(NIX_RUN) cargo test -p dedaliano-engine --test validation $(or $(FILTER),benchmark_protocol) -- --nocapture --test-threads=2

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
#
# The gate files are modules of the `gates` and `certificates` test binaries
# (engine/tests/<binary>/main.rs, autotests = false): a test's name starts with its file's
# module, so test(/^acceptance::/) is the old acceptance binary. nextest fails a filter that
# matches no test, and make check.test-targets fails on a file in no binary or two.
GATE_SHELL_BENCH = test(/benchmark_shell/) + test(/benchmark_beam_shell/) + test(/benchmark_plate/) + test(/benchmark_navier/) + test(/benchmark_scordelis/) + test(/benchmark_cantilever/) + test(/benchmark_pinched/) + test(/test_quad_thin_plate/)
GATE_SHELL_ACCEPTANCE = test(/acceptance_.*shell/) + test(/acceptance_.*diaphragm/)
GATE_CONSTRAINT_BENCH = test(/benchmark_.*constraint/)
GATE_MODULES = sparse_shell_gates solver_invariants solver_ci_coverage conditioning_adversarial kfull_overbuild_gates acceptance result_sites
# Wall-clock gates run single-threaded, so elapsed time is CPU work, not contention.
GATE_TIMED_MODULES = perf_regression_gates perf_regression_advanced
GATE_TIMED_IGNORED = test(=element::solid_shell::tests::test_centroid_stress_timing_budget) + test(=section::poisson::tests::sparse_path_scales_better_than_cubically) + test(=solver::constraints::tests::validate_constraints_reads_the_nodes_once_not_once_per_constraint) + test(=solver::dynamic_validation::tests::area_mass_validation_is_linear_in_the_number_of_shells) + test(=postprocess_scaling::rc_check_scales_linearly_in_member_count) + test(=fuzz_regressions::a_blocking_child_is_killed_at_its_timeout) + test(=known_issues::distorted_mesh_guard_indexes_the_mesh_once_per_solve)
GATE_CERTIFICATES = test(/^certify::/) + test(/^properties_2d::/) + test(/^properties_3d::/)
# Metamorphic tests run apart, in release: unoptimised they outlast a suite shard.
GATE_RELEASE_BINARIES = metamorphic
SUITE_FILTER = all() - test(harmonic_phase_breakdown) - test(harmonic_modal_vs_direct_timing) - (binary(gates) & (test(/^perf_regression_advanced::/) + test(/^perf_regression_gates::/))) - ($(GATE_SHELL_BENCH)) - ($(GATE_SHELL_ACCEPTANCE)) - $(GATE_CONSTRAINT_BENCH) - (binary(gates) & (test(/^sparse_shell_gates::/) + test(/^solver_invariants::/) + test(/^solver_ci_coverage::/) + test(/^conditioning_adversarial::/) + test(/^kfull_overbuild_gates::/) + test(/^acceptance::/))) - (binary(certificates) & ($(GATE_CERTIFICATES))) - binary(differential) $(foreach b,$(GATE_RELEASE_BINARIES),- binary($(b)) )
NEXTEST = cd engine && $(NIX_RUN) cargo nextest run --profile ci

lint.engine:
	python3 -B -I .github/scripts/check-wall-clock-tests.py
	python3 -B -I scripts/check-fail-closed.py
	python3 -B -I scripts/check-message-matching.py
	python3 -B -I scripts/benchmark-gate.py
	python3 -B -I scripts/invariance-gate.py
	cd engine && $(NIX_RUN) cargo clippy --lib -- -W clippy::all -A clippy::erasing_op

# The acceptance models are generated (docs/verification/ACCEPTANCE.md); a hand edit fails here.
check.engine.acceptance-models:
	$(NIX_RUN) bash -c 'for g in engine/tests/acceptance/generators/*.py; do python3 -I "$$g"; done'
	git diff --exit-code -- engine/tests/acceptance/models

# The result walkers' keys are generated from the engine's result types; a hand edit fails test.engine.gates.
gen.result-sites:
	cd engine && STABILEO_WRITE_RESULT_SITES=1 $(NIX_RUN) cargo nextest run --profile ci --test gates -E 'test(=result_sites::generated_result_sites_are_current)'
	$(NIX_RUN) bash -c "cd web && node scripts/gen-result-sites.mjs --write"

# nextest does not execute the compile-fail doctests protecting unit boundaries.
test.engine.units-types:
	$(NIX_RUN) cargo test -p dedaliano-engine --doc types::units

test.engine.gates: check.engine.acceptance-models test.engine.units-types
	$(NEXTEST) -E '$(GATE_SHELL_BENCH)'
	$(NEXTEST) -E '$(GATE_SHELL_ACCEPTANCE)'
	$(NEXTEST) -E '$(GATE_CONSTRAINT_BENCH)'
	$(foreach m,$(GATE_MODULES),($(NEXTEST) --test gates -E 'test(/^$(m)::/)') &&) true
	$(foreach m,$(GATE_TIMED_MODULES),($(NEXTEST) --test gates -E 'test(/^$(m)::/)' --test-threads 1) &&) true
	$(NEXTEST) --run-ignored only -E '$(GATE_TIMED_IGNORED)' --test-threads 1
	$(NEXTEST) --test certificates -E '$(GATE_CERTIFICATES)'

test.engine.metamorphic:
	$(NEXTEST) --cargo-profile release $(foreach b,$(GATE_RELEASE_BINARIES),--test $(b))

# The per-PR invariance tier: the analyses the changes since BASE (default origin/main) can
# affect, or KINDS="plastic collapse,harmonic" / KINDS=all.
test.engine.invariance.quick:
	export INVARIANCE_KINDS="$(KINDS)"; \
	if base=$$(git merge-base $(or $(BASE),origin/main) HEAD); then export INVARIANCE_PATHS="$$(git diff --name-only $$base; git ls-files --others --exclude-standard)"; fi; \
	$(NEXTEST) --cargo-profile release --test metamorphic --run-ignored only --no-capture -E 'test(=quick::invariance_quick)'

MECHANISM_FUZZ = $(NEXTEST) --cargo-profile release --test mechanism_fuzz --run-ignored only --no-capture
test.engine.mechanism-fuzz.quick:
	$(MECHANISM_FUZZ) -E 'test(=mechanism_fuzz_quick)'

test.engine.mechanism-fuzz.long:
	export MECHANISM_FUZZ_DURATION=$(or $(DURATION),30m) $(if $(SEED),MECHANISM_FUZZ_SEED=$(SEED)) $(if $(REPORT_DIR),MECHANISM_FUZZ_REPORT_DIR=$(abspath $(REPORT_DIR))) && $(MECHANISM_FUZZ) -E 'test(=mechanism_fuzz_long)'

test.engine.mechanism-fuzz.replay:
	export MECHANISM_FUZZ_SEEDS=$(SEEDS) MECHANISM_FUZZ_FILES=$(FILES) && $(MECHANISM_FUZZ) -E 'test(=mechanism_fuzz_replay)'

test.engine.suite:
	$(NEXTEST) -E '$(SUITE_FILTER)' $(if $(SHARD),--partition count:$(SHARD))

test.engine.differential.quick:
	$(NEXTEST) --test differential

test.engine.differential.full:
	$(NEXTEST) --cargo-profile release --test differential --run-ignored all

mutants.engine:
	$(NIX_RUN) env -u RUSTC_WRAPPER MUTANTS_SCOPE=$(or $(SCOPE),all) CARGO_INCREMENTAL=1 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 scripts/mutants.sh $(ARGS)

mutants.safety.report:
	python3 -I scripts/mutants-safety.py report $(or $(OUT),mutants.out) --json mutants-safety-report.json
	python3 -I scripts/mutants-safety.py ratchet mutants-safety-report.json

mutants.safety.record:
	python3 -I scripts/mutants-safety.py record $(or $(REPORT),mutants-safety-report.json) $(ARGS)

bench.engine:
	cd engine && $(NIX_RUN) cargo bench --no-run
	cd engine && $(NIX_RUN) cargo bench --bench solver_bench --bench assembly_bench --bench workflow_bench -- --sample-size 10 --warm-up-time 1 --measurement-time 3

web.deps:
	$(NIX_RUN) bash -c "cd web && npm ci"

typecheck.web:
	python3 -B -I scripts/check-message-matching.py
	$(NIX_RUN) bash -c "cd web && npm run typecheck && npm run test:units:types && npm run check:gate && node scripts/check-site-header.mjs && node scripts/gen-result-sites.mjs"

test.web.unit:
	$(NIX_RUN) bash -c "cd web && npx vitest run --project unit $${UNIT_AREA:+src/components/$$UNIT_AREA src/lib/$$UNIT_AREA} $(FILE) $(if $(FILTER),-t '$(FILTER)') $(if $(SHARD),--shard=$(SHARD)) $(if $(BAIL),--bail=$(BAIL)) $(if $(VITEST_WORKERS),--maxWorkers=$(VITEST_WORKERS))"

test.web.build: web.build.tested
	$(MAKE) test.web.build.shared

# The build prerenders the public pages in Chromium, so it needs the browser. The stamp is taken
# before building, so a tree edited mid-build fails the build tests instead of passing them.
web.build.tested:
	$(NIX_RUN) bash -c 'cd web && $(PLAYWRIGHT_INSTALL) chromium && stamp=$$(node scripts/build-stamp.mjs) && rm -f dist.source-stamp .dist-shared.source-stamp && npm run build && npx tsx scripts/translation-gate.ts dist && npx vite build --manifest --outDir .dist-shared --emptyOutDir --logLevel error && node scripts/build-stamp.mjs --seal dist "$$stamp" && node scripts/build-stamp.mjs --seal .dist-shared "$$stamp"'

test.web.build.shared:
	$(NIX_RUN) bash -c 'cd web && STABILEO_BUILD_ENV_STAMP=$$(node scripts/build-stamp.mjs --env) STABILEO_SHARED_BUILD=.dist-shared STABILEO_SHARED_PRERENDERED_BUILD=dist NO_WALL_CLOCK=$(NO_WALL_CLOCK) npx vitest run --project build'

test.web.timing:
	$(NIX_RUN) bash -c "cd web && npx vitest run --project build src/lib/engine/__tests__/scale-budget.test.ts $(if $(VITEST_WORKERS),--maxWorkers=$(VITEST_WORKERS))"

perf.lighthouse.deps:
	$(NIX_RUN) bash -c "cd web/lighthouse && npm ci --no-audit --no-fund"

## Lighthouse median of RUNS against web/perf-lighthouse.json; BASE, RUNS, PRESET and ARGS come from the environment
perf.lighthouse:
	$(NIX_RUN) bash -c 'cd web && node scripts/perf-lighthouse.mjs --base "$${BASE:-https://stabileo.com}" --runs "$${RUNS:-5}" --preset "$${PRESET:-mobile}" $$ARGS'

# Every non-English page of a built site (DIST, default web/dist) must be translated, and the
# sitemap, the hreflang sets and the built files must agree (web/scripts/translation-gate.ts).
check.web.translations:
	$(NIX_RUN) bash -c "cd web && npx tsx scripts/translation-gate.ts $(abspath $(or $(DIST),web/dist))"

# The landing and /app footprints against their absolute ceilings (web/scripts/route-size-ceilings.json);
# the weekly Route size workflow runs the same check on main. Needs make web.deps.
check.web.route-size:
	$(NIX_RUN) bash -c "cd web && node scripts/check-research-route-size.mjs --ceiling scripts/route-size-ceilings.json"

# The results snapshot gate (#716, docs/verification/PROVENANCE.md): the reference corpus solved
# through the app's path and compared with web/results-snapshots/. Needs make wasm and web.deps.
test.web.results:
	$(NIX_RUN) bash -c "cd web && npx vitest run --project results"

## Regenerate web/results-snapshots/ after a DELIBERATE result change, then register it:
## an entry in web/src/lib/provenance/result-changes/ and a "BREAKING (results)" fragment.
snapshots-update:
	$(NIX_RUN) bash -c "cd web && RESULTS_SNAPSHOT_UPDATE=1 npx vitest run --project results"

# A pull request that changes a committed snapshot must register the change. BASE=<rev>, the
# commit the pull request is compared with (CI: the merge's first parent, or the queue's base).
check.results-snapshot-gate:
	$(NIX_RUN) node web/scripts/results-snapshot/gate.mjs --base $(or $(BASE),origin/main)

# The WASM must give bit-identical results in Node, Chromium, Firefox and WebKit
# (docs/verification/TRUSTED_BASE.md). Needs make wasm and make web.deps first.
test.web.determinism:
	$(NIX_RUN) bash -c "cd web && $(PLAYWRIGHT_INSTALL) chromium firefox webkit && node --test determinism/serve.test.mjs determinism/checks.test.mjs determinism/containment.test.mjs && node determinism/node-run.mjs && npx playwright test -c determinism/playwright.config.ts"

e2e.web.setup:
	$(NIX_RUN) bash -c "cd web && $(PLAYWRIGHT_INSTALL) chromium"

# The site the e2e suites test with E2E_PREBUILT=1: VITE_E2E=1 compiles the read-only test hooks in,
# and web/playwright.config.ts refuses a prebuilt dist without the marker. Needs make e2e.web.setup.
e2e.web.build:
	$(NIX_RUN) bash -c 'cd web && VITE_E2E=1 npm run build && echo "VITE_E2E=1 build of $${GITHUB_SHA:-$$(git rev-parse HEAD)}" > dist/e2e-build.txt'

# SHARD=i/n picks whole spec files balanced by measured duration (web/scripts/e2e-shard.mjs).
# `@flaky` tests are quarantined (web/e2e/README.md): left out here, run by e2e.web.flaky.
e2e.web.smoke:
	$(NIX_RUN) bash -c 'cd web && E2E_JSON_REPORT=e2e/.results/smoke.json npx playwright test --grep @smoke --grep-invert @flaky $(FILE) $(if $(SHARD),$$(node scripts/e2e-shard.mjs $(subst /, ,$(SHARD))))'

e2e.web.slow:
	$(NIX_RUN) bash -c 'cd web && $(if $(SHARD),files=$$(node scripts/e2e-shard.mjs --suite slow $(subst /, ,$(SHARD))) && if [ -z "$$files" ]; then exit 0; fi && )E2E_JSON_REPORT=e2e/.results/slow.json NO_WALL_CLOCK=$(NO_WALL_CLOCK) npx playwright test --grep "@slow" --grep-invert "visual baselines|@flaky" $(if $(SHARD),$$files)'

e2e.web.timing:
	$(NIX_RUN) bash -c 'cd web && npx playwright test --grep "@slow" e2e/rebar-workspace-open.spec.ts e2e/model-fluidity.spec.ts'

# --pass-with-no-tests: an empty quarantine is the goal, not an error.
e2e.web.flaky:
	$(NIX_RUN) bash -c 'cd web && npx playwright test --grep @flaky --retries=2 --pass-with-no-tests'

e2e.web.visual:
	$(NIX_RUN) bash -c 'cd web && npx playwright test --grep "visual baselines" $(if $(UPDATE_SNAPSHOTS),--update-snapshots)'

test.ai-backend:
	$(NIX_RUN) cargo test -p dedaliano-backend

## Measure the engine test inventory published in docs/BENCHMARKS.md.
## Engine-coupled = every target except `reference`, whose tests recompute
## textbook/code formulas inline and never call the engine (see
## engine/tests/reference/main.rs). Single pass: attributes each `test result`
## line to the target announced by the preceding `Running` line. A complete run
## reports every [[test]] binary in engine/Cargo.toml plus the library's unit tests.
test.inventory:
	@cd engine && $(NIX_RUN) cargo test 2>&1 | awk -v sha="$$(git rev-parse --short HEAD)" -v day="$$(date +%Y-%m-%d)" \
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

test.cadence:
	python3 -I scripts/cadence.py run $(TIER) $(if $(RUNNER),--runner $(RUNNER)) $(if $(ID),--id $(ID))

check.cadence:
	python3 -I scripts/cadence.py check

check.containment:
	$(NIX_RUN) python3 -I scripts/check-containment.py

deps.audit:
	$(NIX_RUN) python3 -I scripts/deps-audit.py $(or $(OUT),deps-audit.md)

## One version of each tool everywhere (rust-toolchain.toml, .nvmrc, flake.nix, CI)
check-pins:
	scripts/check-pins.sh

## The roadmap's in-flight table, rewritten from the open pull requests (scripts/roadmap-inflight.py)
.PHONY: roadmap.inflight
roadmap.inflight:
	gh pr list -R lambdaclass/stabileo --state open --limit 1000 --json number,title,isDraft,baseRefName,author,labels \
	  | $(NIX_RUN) python3 -I scripts/roadmap-inflight.py docs/roadmap/PRODUCT_ROADMAP.md 1000

## Unreleased changes are one file each in changelog.d/ (scripts/changelog.py)
.PHONY: changelog.unreleased
changelog.unreleased:
	$(NIX_RUN) python3 -I scripts/changelog.py --unreleased

check.changelog:
	$(NIX_RUN) python3 -I scripts/changelog.py --check

## The release step: fragments into CHANGELOG.md, links rebased, registry and engine locks updated (scripts/release-step.py)
release.step:
	@test -n "$(VERSION)" -a -n "$(DATE)" || { echo 'usage: make release.step VERSION=0.5.0 DATE=2026-11-06'; exit 2; }
	$(NIX_RUN) python3 -I scripts/release-step.py $(VERSION) $(DATE)

## Merging HEAD into BASE deletes no lines written in the last 21 days that reached the branch only by merging BASE
## (the `reverts-ok` label, in $$GITHUB_EVENT_PATH or LABELS=a,b, acknowledges them)
.PHONY: check.reverts
check.reverts:
	python3 -B -I .github/scripts/revert-check.py $(or $(BASE),origin/main) $(or $(HEAD),HEAD)

# The engine's test files are modules of a few listed binaries (autotests = false): a file
# in no binary would never run, one in two would run twice.
check.test-targets:
	python3 -I scripts/check-test-targets.py

test.engine.reproducers:
	$(NIX_RUN) python3 -I scripts/issue-reproducers.py xfail

test.reproducers.published:
	$(NEXTEST) -E 'test(/(^|::)issue_[0-9]+/)' --no-tests warn
	$(NIX_RUN) bash -c 'cd web && npx vitest run --project unit -t "#[0-9]+"'

check.issue-reproducers:
	python3 -I scripts/issue-reproducers.py flip-check --base $(BASE) --head $(HEAD) --body-file $(BODY) $(if $(LABELS),--labels-json $(LABELS))

test.nightly-scripts:
	python3 -B -I scripts/tests/test_nightly.py
	python3 -B -I scripts/tests/test_replay_findings.py
	python3 -B -I scripts/tests/test_mutants_plan.py
	python3 -B -I tools/opensees/test_gen_models.py
	python3 -B -I tools/opensees/test_compare.py
	$(NIX_RUN) node --test scripts/tests/nightly-findings.test.cjs
	$(NIX_RUN) node --test scripts/tests/verification-alert.test.cjs
	$(NIX_RUN) node --test scripts/tests/slow-e2e-alert.test.cjs
	$(NIX_RUN) node --test scripts/tests/timing-budget-alert.test.cjs
	$(NIX_RUN) node --test scripts/tests/runner-pools.test.cjs
	$(NIX_RUN) node --test scripts/tests/cadence-reports.test.cjs

test.ci-scripts: test.nightly-scripts check.cadence test.engine.plastic-budget-watchdog
	python3 -B -I scripts/tests/test_cadence.py
	python3 -B -I scripts/tests/test_playwright_install.py
	python3 -B -I scripts/tests/test_deps_audit.py
	python3 -B -I scripts/tests/test_check_containment.py
	python3 -B -I scripts/tests/test_mutants_safety.py
	python3 -B -I scripts/tests/test_retry_infra.py
	python3 -B -I scripts/tests/test_kani_shards.py
	python3 -B -I scripts/tests/test_build_research_wasm.py
	python3 -B -I scripts/tests/test_release_step.py
	python3 -B -I scripts/tests/test_changelog.py
	python3 -B -I scripts/tests/test_roadmap_inflight.py
	python3 -B -I scripts/tests/test_research_host_cache.py
	python3 -B -I scripts/tests/test_ci_aggregate.py
	python3 -B -I scripts/tests/test_full_history_checkouts.py
	python3 -B -I scripts/tests/test_ci_selection.py
	python3 -B -I scripts/tests/test_check_wall_clock_tests.py
	python3 -B -I scripts/tests/test_check_fail_closed.py
	python3 -B -I scripts/tests/test_check_message_matching.py
	python3 -B -I scripts/check-message-matching.py
	python3 -B -I scripts/tests/test_main_tested.py
	python3 -B -I scripts/tests/test_cancel_superseded.py
	python3 -B -I scripts/tests/test_ci_runners.py
	python3 -B -I scripts/tests/test_heavy_pool.py
	python3 -B -I scripts/tests/test_ci_events.py
	python3 -B -I scripts/tests/test_post_merge_revert.py
	python3 -B -I scripts/tests/test_revert_check.py
	python3 -B -I scripts/tests/test_revert_check_trusted.py
	python3 -B -I scripts/tests/test_red_nightlies.py
	python3 -B -I scripts/tests/test_required_checks.py
	python3 -B -I scripts/tests/test_route_size_from_base.py
	python3 -B -I scripts/tests/test_wall_clock.py
	python3 -B -I scripts/tests/test_check_quick.py
	python3 -B -I scripts/tests/test_infra_retry.py
	python3 -B -I scripts/tests/test_e2e_timings.py
	python3 -B -I scripts/tests/test_issue_reproducers.py
	python3 -B -I scripts/tests/test_verification_metrics.py
	python3 -B -I scripts/tests/test_ci_scripts_target.py
	python3 -B -I scripts/tests/test_benchmark_gate.py
	$(NIX_RUN) node scripts/tests/snapshot-applicability.mjs
	python3 -B -I scripts/tests/test_invariance_gate.py
	python3 -B -I scripts/tests/test_engine_wall_clock_gate.py
	python3 -B -I scripts/tests/test_timing_budgets_gate.py
	python3 -B -I scripts/tests/test_verify_changes.py
	$(NIX_RUN) bash -c 'shellcheck -S warning .github/scripts/*.sh'
	$(NIX_RUN) actionlint .github/workflows/ci.yml .github/workflows/research.yml .github/workflows/merge-queue-supersede.yml .github/workflows/post-merge.yml .github/workflows/infra-retry.yml .github/workflows/stop-failed-run.yml .github/workflows/nightly.yml .github/workflows/route-size.yml .github/workflows/issue-reproducers.yml .github/workflows/verify.yml .github/workflows/red-nightlies.yml .github/workflows/revert-check-label.yml .github/workflows/revert-check-trusted.yml .github/workflows/replay-findings.yml

# DIST=web/dist checks a real build instead of the fixture site.
test.infra.caddy:
	nix shell --inputs-from . nixpkgs#caddy nixpkgs#curl nixpkgs#python3 --command bash infra/caddy/test-routing.sh $(DIST)

test.infra.caddy.redirects:
	nix shell --inputs-from . nixpkgs#caddy nixpkgs#curl nixpkgs#python3 --command bash infra/caddy/test-language-redirects.sh

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

web.run: wasm research.wasm
	$(NIX_RUN) bash -c "cd web && npm install && VITE_API_URL=http://localhost:$(BACKEND_PORT) npm run dev -- --port $(WEB_PORT)"

# The Stabileo Research page's own WASM (web/public/research-wasm/), fetched only on /research pages.
research.wasm: web.deps
	$(NIX_RUN) research/fracture/shauer-2025/wasm/build.sh
	$(NIX_RUN) research/optimization/andreassen-2011/wasm/build.sh
	$(NIX_RUN) research/mechanics/biggins-2026/build.sh
	$(NIX_RUN) research/mechanics/gay-neto-2014/build.sh
	$(NIX_RUN) research/stability/feher-sipos-varkonyi-2026/build.sh
	$(NIX_RUN) research/metamaterials/grossman-2026/wasm/build.sh
	$(NIX_RUN) research/form-finding/pastrana-2026/wasm/build.sh
	$(NIX_RUN) research/optimisation/fairclough-2026/wasm/build.sh

# Typesets the paper page's text (web/src/lib/paper) into its PDF with Tectonic.
paper.pdf: web.deps
	$(NIX_RUN) nix shell --inputs-from . nixpkgs#tectonic nixpkgs#libwebp --command bash -c "cd web && npx tsx scripts/paper-pdf.ts"

# Builds from the installed dependencies (make web.deps), so CI never resolves away from the lockfile.
web.build: wasm research.wasm
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

cloud-init.render:
	$(NIX_RUN) python3 -I infra/cloud-init/render.py

# The order results changes reached main, for a build without the git history (Docker).
result-changes.order:
	node web/scripts/result-changes/registry.mjs --write-order

docker.build: result-changes.order
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

.PHONY: test.research.biggins evidence.research.biggins wasm.research.biggins
test.research.biggins:
	$(NIX_RUN) cargo test --locked --manifest-path research/mechanics/biggins-2026/Cargo.toml
	$(NIX_RUN) cargo run --locked --manifest-path research/mechanics/biggins-2026/Cargo.toml --bin validate
	$(NIX_RUN) cargo test --locked -p dedaliano-engine --test validation research_benchmarks::arches::

evidence.research.biggins:
	$(NIX_RUN) cargo run --locked --manifest-path research/mechanics/biggins-2026/Cargo.toml --bin replay > research/mechanics/biggins-2026/reference-results/replay.json
	$(NIX_RUN) cargo run --locked --manifest-path research/mechanics/biggins-2026/Cargo.toml --bin validate -- --write
	$(NIX_RUN) python3 -c 'import hashlib,json,pathlib; p=pathlib.Path("research/mechanics/biggins-2026/reference-results/MANIFEST.json"); d=json.loads(p.read_text()); d["files_sha256"]={n: hashlib.sha256(p.with_name(n).read_bytes()).hexdigest() for n in d["files_sha256"]}; p.write_text(json.dumps(d,indent=2)+"\n")'

wasm.research.biggins:
	$(NIX_RUN) research/mechanics/biggins-2026/build.sh

.PHONY: build.engine.plastic-budget test.engine.plastic-budget replay.engine.plastic-budget test.engine.plastic-budget-watchdog

build.engine.plastic-budget:
	$(NIX_RUN) cargo build --locked --release --manifest-path engine/fuzz/Cargo.toml --example plastic_replay --target-dir engine/fuzz/target -j 2

test.engine.plastic-budget:
	$(NIX_RUN) cargo test --locked --release --manifest-path engine/fuzz/Cargo.toml --lib plastic::tests -- --test-threads=1 $(if $(IGNORED),--ignored)

replay.engine.plastic-budget: build.engine.plastic-budget
	$(NIX_RUN) python3 -I scripts/replay-plastic-budget.py $(FILE) --mode $(or $(MODE),gate) $(if $(SECONDS),--seconds $(SECONDS)) $(if $(REPEATS),--repeats $(REPEATS))

test.engine.plastic-budget-watchdog:
	$(NIX_RUN) python3 -B -I scripts/tests/test_plastic_budget_replay.py

.PHONY: test.engine.plastic-replay
test.engine.plastic-replay: build.engine.plastic-budget
	$(NIX_RUN) python3 -B -I scripts/plastic-budget-engine-tests.py

.PHONY: build.engine.plastic-budget-asan
build.engine.plastic-budget-asan:
	$(NIX_RUN) env RUSTC_BOOTSTRAP=1 RUSTFLAGS=-Zsanitizer=address cargo build --locked --release --manifest-path engine/fuzz/Cargo.toml --example plastic_replay --target x86_64-unknown-linux-gnu --target-dir engine/fuzz/target/asan -j 2

.PHONY: test.engine.plastic-resource replay.engine.plastic-budget-asan
test.engine.plastic-resource: build.engine.plastic-budget
	$(NIX_RUN) cargo test --locked --release --manifest-path engine/fuzz/Cargo.toml --test plastic_resource -j 2 -- $(if $(IGNORED),--ignored)

replay.engine.plastic-budget-asan: build.engine.plastic-budget-asan
	$(NIX_RUN) python3 -I scripts/replay-plastic-budget.py $(FILE) --binary engine/fuzz/target/asan/x86_64-unknown-linux-gnu/release/examples/plastic_replay --asan --memory-mib 2048 --mode $(or $(MODE),gate) $(if $(SECONDS),--seconds $(SECONDS)) $(if $(REPEATS),--repeats $(REPEATS))

.PHONY: test.engine.plastic-budget-corpus check.engine.plastic-fuzz
test.engine.plastic-budget-corpus: build.engine.plastic-budget
	$(NIX_RUN) python3 -B -I scripts/plastic-budget-corpus.py

check.engine.plastic-fuzz:
	$(NIX_RUN) cargo check --locked --release --manifest-path engine/fuzz/Cargo.toml --bin json_plastic -j 2

.PHONY: test.engine.plastic-wasm
test.engine.plastic-wasm: wasm
	$(NIX_RUN) timeout 30s node scripts/tests/plastic-budget-wasm.mjs engine/fuzz/corpus-regressions/plastic-lp-budget/over-budget-grid.bin 'dense storage bytes'
	$(NIX_RUN) timeout 30s node scripts/tests/plastic-budget-wasm.mjs engine/fuzz/corpus-regressions/plastic-lp-budget/issue-1760.bin certified-lower
	$(NIX_RUN) timeout 30s node scripts/tests/plastic-budget-wasm.mjs engine/fuzz/corpus-regressions/plastic-lp-budget/unconservative-cantilever.bin certified-lower-above

.PHONY: check.engine.plastic-workflow
check.engine.plastic-workflow:
	$(NIX_RUN) actionlint .github/workflows/nightly.yml
	$(NIX_RUN) python3 -B -I scripts/tests/test_nightly.py Workflow.test_raw_artifact_upload_and_immutable_action

.PHONY: test.engine.plastic-samples
test.engine.plastic-samples:
	$(NIX_RUN) cargo test --locked -p dedaliano-engine --lib lp_work_matches_initial_samples
FEHER_DIR = research/stability/feher-sipos-varkonyi-2026
.PHONY: test.research.feher evidence.research.feher
test.research.feher:
	$(NIX_RUN) cargo run --locked --release --manifest-path $(FEHER_DIR)/Cargo.toml --bin validate
	$(NIX_RUN) cargo test --locked -p dedaliano-engine --test validation corotational_prescribed

evidence.research.feher:
	$(NIX_RUN) cargo run --locked --release --manifest-path $(FEHER_DIR)/Cargo.toml --bin replay -- $(FEHER_DIR)/reference-results/replay.json
	$(NIX_RUN) cargo run --locked --release --manifest-path $(FEHER_DIR)/Cargo.toml --bin validate -- --write
	$(NIX_RUN) python3 -c 'import hashlib,json,pathlib; p=pathlib.Path("$(FEHER_DIR)/reference-results/MANIFEST.json"); d=json.loads(p.read_text()); d["files_sha256"]={n: hashlib.sha256(p.with_name(n).read_bytes()).hexdigest() for n in d["files_sha256"]}; p.write_text(json.dumps(d,indent=2)+"\n")'

.PHONY: test.engine.nonlinear-convergence-wasm
test.engine.nonlinear-convergence-wasm: wasm
	NONLINEAR_CONVERGENCE_CASES=$(CURDIR)/.761-wasm-cases.json $(MAKE) test.engine.targeted TEST=metamorphic FILTER=nonlinear_convergence::issue_761_native_and_wasm_cases
	$(NIX_RUN) node scripts/tests/nonlinear-convergence-wasm.mjs $(CURDIR)/.761-wasm-cases.json
	rm -f $(CURDIR)/.761-wasm-cases.json

.PHONY: test.engine.plastic-nightly-wasm
test.engine.plastic-nightly-wasm: wasm
	$(NIX_RUN) timeout 30s node scripts/tests/plastic-nightly-wasm.mjs

.PHONY: test.engine.buckling-818-wasm

test.engine.buckling-818-wasm: wasm
	$(NIX_RUN) node scripts/tests/buckling-818-wasm.mjs

.PHONY: test.engine.frozen-shell-refusals
test.engine.frozen-shell-refusals: wasm
	$(NIX_RUN) cargo test -p dedaliano-engine --lib frozen_shell_refusals -- --nocapture
	$(NIX_RUN) node scripts/tests/frozen-shell-refusals-wasm.mjs

.PHONY: test.engine.truss-balance-1969-wasm

test.engine.truss-balance-1969-wasm: wasm
	$(NIX_RUN) node scripts/tests/truss-balance-1969-wasm.mjs

.PHONY: test.engine.candidate-1901-wasm

test.engine.candidate-1901-wasm: wasm
	CANDIDATE_1901_AUDIT=$(CURDIR)/.1901-audit.json $(NIX_RUN) node scripts/tests/candidate-1901-wasm.mjs
	$(NIX_RUN) python3 docs/verification/candidate-1901-audit.py $(CURDIR)/.1901-audit.json
	rm -f $(CURDIR)/.1901-audit.json

.PHONY: test.engine.convergence-regressions-wasm
test.engine.convergence-regressions-wasm: wasm
	FLIP_WASM_CASES=$(CURDIR)/.flip-reference-cases.json FLIP_SUPPORTED_CASES=$(CURDIR)/.flip-supported-cases.json FLIP_RIGID_CASES=$(CURDIR)/.flip-rigid-cases.json FLIP_ROLL_CASES=$(CURDIR)/.flip-roll-cases.json $(MAKE) test.engine.targeted TEST=metamorphic FILTER=flip_regressions::
	$(NIX_RUN) node scripts/tests/convergence-regressions-wasm.mjs $(CURDIR)/.flip-reference-cases.json $(CURDIR)/.flip-supported-cases.json $(CURDIR)/.flip-rigid-cases.json $(CURDIR)/.flip-roll-cases.json
	rm -f $(CURDIR)/.flip-reference-cases.json $(CURDIR)/.flip-supported-cases.json $(CURDIR)/.flip-rigid-cases.json $(CURDIR)/.flip-roll-cases.json

.PHONY: test.engine.pdelta-rotation-wasm
test.engine.pdelta-rotation-wasm: wasm
	PLATE_CONVERGENCE_CASES=$(CURDIR)/.1940-plate-cases.json $(MAKE) test.engine.targeted TEST=metamorphic FILTER=plate_convergence::native_exports_and_wasm_cases_keep_answers_and_iteration_limits
	$(NIX_RUN) node scripts/tests/pdelta-rotation-wasm.mjs $(CURDIR)/.1940-plate-cases.json
	rm -f $(CURDIR)/.1940-plate-cases.json
