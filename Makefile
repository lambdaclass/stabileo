.PHONY: wasm test test-inventory clean fmt check

## Build the engine to WebAssembly (JS bindings for the browser) into engine/pkg
wasm:
	cd engine && wasm-pack build --target web --out-dir pkg --no-opt

# ── Test ─────────────────────────────────────────────────────

test:
	cargo test -p dedaliano-engine

## Measure the engine test inventory published in docs/BENCHMARKS.md.
## Engine-coupled = every target except `reference`, whose tests recompute
## textbook/code formulas inline and never call the engine (see
## engine/tests/reference/main.rs). Single pass: attributes each `test result`
## line to the target announced by the preceding `Running` line.
test-inventory:
	@cd engine && cargo test 2>&1 | awk -v sha="$$(git rev-parse --short HEAD)" -v day="$$(date +%Y-%m-%d)" ' \
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

# ── Utilities ────────────────────────────────────────────────

fmt:
	cargo fmt --all

check:
	cargo clippy --workspace -- -D warnings

clean:
	cargo clean
	rm -rf engine/pkg
