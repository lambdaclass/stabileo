#!/usr/bin/env node
// Explicit TypeScript gate for local validation.
//
// `npm run build` is `vite build`, which transpiles without typechecking, so a
// type defect reaches a signed commit unseen. That is not hypothetical: the
// thirteenth constructibility condition compared `undefined >= undefined`
// because `buildFloorAssembly` was never handed the two piece counts, and only
// `tsc` reported it (TS2345 at floor-design.ts:354).
//
// A bare `tsc` cannot be the gate: the project carries a large set of
// pre-existing errors, overwhelmingly in test fixtures that build partial
// object literals on purpose. So this compares against a recorded baseline and
// fails only on errors that are NEW. Existing errors are tolerated and counted;
// fixing one is reported and lowers the baseline on the next refresh.
//
//   npm run typecheck            check against the baseline
//   npm run typecheck:baseline   re-record the baseline (review the diff)
//
// CI is untouched by this file.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '..')
const BASELINE = join(webRoot, 'scripts', 'typecheck-baseline.json')

const refresh = process.argv.includes('--write')

/** `src/x.ts(12,5): error TS2345: Argument of type ...` */
const ERROR_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/

// Signature deliberately excludes line and column: an unrelated edit that
// shifts a file must not be reported as a new error, and a moved error is the
// same error. Message text is kept, because that is what distinguishes two
// different defects on the same construct in the same file.
const signatureOf = (e) => `${e.file}\u0000${e.code}\u0000${e.message}`

function runTsc() {
	try {
		execFileSync('npx', ['tsc', '-p', 'tsconfig.json', '--noEmit'], {
			cwd: webRoot,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		return ''
	} catch (err) {
		// tsc exits non-zero whenever it reports anything; that is the normal path.
		if (err.stdout === undefined && err.stderr === undefined) throw err
		return `${err.stdout ?? ''}${err.stderr ?? ''}`
	}
}

function parse(output) {
	const errors = []
	for (const raw of output.split(/\r?\n/)) {
		const m = ERROR_LINE.exec(raw)
		if (!m) continue
		errors.push({
			file: m[1].split('\\').join('/'),
			line: Number(m[2]),
			column: Number(m[3]),
			code: m[4],
			message: m[5],
		})
	}
	return errors
}

/** signature -> count, so N identical errors in one file cannot become N+1 unseen. */
function tally(errors) {
	const counts = new Map()
	for (const e of errors) {
		const sig = signatureOf(e)
		counts.set(sig, (counts.get(sig) ?? 0) + 1)
	}
	return counts
}

const output = runTsc()
const errors = parse(output)
const counts = tally(errors)

if (refresh) {
	const entries = [...counts.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([sig, count]) => {
			const [file, code, message] = sig.split('\u0000')
			return { file, code, message, count }
		})
	writeFileSync(
		BASELINE,
		`${JSON.stringify({ total: errors.length, entries }, null, '\t')}\n`,
		'utf8',
	)
	console.log(`typecheck: recorded ${errors.length} pre-existing errors in ${entries.length} signatures`)
	console.log(`typecheck: baseline written to scripts/typecheck-baseline.json — review the diff before committing`)
	process.exit(0)
}

if (!existsSync(BASELINE)) {
	console.error('typecheck: no baseline recorded. Run `npm run typecheck:baseline` first.')
	process.exit(2)
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
const allowed = new Map(
	baseline.entries.map((e) => [`${e.file}\u0000${e.code}\u0000${e.message}`, e.count]),
)

const introduced = []
for (const e of errors) {
	const sig = signatureOf(e)
	const budget = allowed.get(sig) ?? 0
	if (budget > 0) {
		allowed.set(sig, budget - 1)
	} else {
		introduced.push(e)
	}
}

const fixed = [...allowed.entries()].reduce((n, [, remaining]) => n + remaining, 0)

console.log(`typecheck: ${errors.length} errors reported, baseline ${baseline.total}`)
if (fixed > 0) {
	console.log(
		`typecheck: ${fixed} baseline error(s) no longer reported — run \`npm run typecheck:baseline\` to lower the baseline`,
	)
}

if (introduced.length > 0) {
	console.error(`\ntypecheck: ${introduced.length} NEW type error(s):\n`)
	for (const e of introduced) {
		console.error(`  ${e.file}(${e.line},${e.column}): error ${e.code}: ${e.message}`)
	}
	console.error('')
	process.exit(1)
}

console.log('typecheck: no new type errors')
