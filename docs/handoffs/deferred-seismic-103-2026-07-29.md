# Deferred INPRES-CIRSOC 103 workflow — specification only; original implementation was lost

**No source code and no Git object from this work survived.** Every commit identifier below names
content that no longer exists anywhere: not on GitHub, not in a bundle, not in a snapshot. A SHA
identifies content; it is not a backup of it.

Every section is classified:

| Tag | Meaning |
|---|---|
| **[FACT]** | measured historical fact, verified against GitHub or a preserved Codex session |
| **[SPEC]** | specification reconstructed from prose reports — describes intent, not code |
| **[PLANNED]** | planned but never implemented |
| **[LOST]** | lost or unavailable; no evidence survives in what was recovered |

Provenance for all of it: `~/stabileo-recovery-2026-07-29/RECOVERY-LEDGER.md` plus four preserved
Codex session transcripts under `evidence/codex-sessions/` (checksummed, byte-identical to the
originals).

---

## 1. Historical branch and purpose — [FACT]

Branch `pr/19-seismic-103`. Purpose: the INPRES-CIRSOC 103 seismic workflow — static seismic load
generation, Parte II detailing restrictions, and the supporting UI/store surface. It was position
19 in the RC chain, stacked on `pr/18-rc-slabs-walls-foundations` @ `874f9f57`.

The branch was never pushed. GitHub has **zero** tags and no `pr/19*` ref; both verified
repeatedly against the live remote.

## 2. Reassignment of stack position 19 — [FACT]

Position 19 now belongs to **RC CAD constructibility review**
(`pr/19-rc-cad-constructibility`). Seismic is deferred with no scheduled successor position.
Recorded in `docs/CODEX_WORKFLOW_STABILEO.md`.

## 3. Lost commit and tag identifiers — [FACT] that they existed, [LOST] as content

| Role | Identifier |
|---|---|
| Implementation baseline | `62b9bfe2` |
| Signed handoff commit | `b9afec5565fad62636e9c70b18409bf98ab7f645` |
| Persisted-configuration checkpoint | `6903d1f1a5c12d85944bb2ee183060e99eaf9c04` |
| Latest official-tables checkpoint | `5b92046e69bfdf655904583855ced440c3dc691d` |
| Annotated tag object | `0873a18431c1da6e011cc8ed794d07432808c7d5` |
| Tag name | `handoff/rc-chain-2026-07-28` (peeled to `b9afec55`) |

All four commits were queried directly against GitHub and returned **404**. Short-SHA resolution
was proven working on the same repository using `a133b062` and `dee2f9e8`, so the 404s are genuine
absences rather than lookup artefacts.

## 4. The four lost commit subjects — [FACT] (recovered from a preserved session)

| SHA | Subject |
|---|---|
| `b0c11bd2` | A real mass source, replacing the 50 m²-per-floor constant |
| `18688d61` | INPRES-CIRSOC 103 static workflow and Parte II detailing |
| `6fa1ca93` | Seismic workflow UI, store and Playwright coverage |
| `62b9bfe2` | The module was emitting prose into structured-message fields |

These are the slice boundaries and are the most useful surviving artefact: they define what was
built, in order. **The diffs themselves are gone.**

## 5. Reachability audit — [LOST]

A reachability/ownership audit was referenced in the surviving reports, and one related figure did
survive: an assembly-ownership check reporting *"every member owned by exactly ONE assembly, 0
skipped. Was: 140 orphaned."* That is a PR17/PR18-era detailing figure, not the seismic audit.

**The seismic reachability audit itself — its row count, its rows, and its verdicts — is not
present in any recovered evidence.** It is not reconstructed here. Any row-by-row table would be
invention. If a copy exists in the user's own Codex history outside the four preserved sessions,
it can be folded in later; nothing in this repository establishes it.

## 6. The `6903d1f1` persisted-configuration checkpoint — [SPEC]

Described in a surviving report as a *"persisted configuration/mass checkpoint"*: seismic
configuration became part of the persisted model rather than transient UI state, alongside the real
mass source from `b0c11bd2` replacing the 50 m²-per-floor constant.

Recorded state at that checkpoint — **[FACT]**, from a preserved session: branch
`pr/19-seismic-103`, HEAD `6903d1f1a5c12d85944bb2ee183060e99eaf9c04`, worktree clean, commit
G-signed with Bauti sole author and committer, 14 stashes, PR15–PR18 unchanged, no remote
`pr/18*`/`pr/19*`, `qa/main-plus-pr19` absent, and **zero** solver/Rust/Cargo/WASM paths in the
commit or across `a133b062~1..HEAD` (82/82 commits G-signed, one author).

**The schema, field names and migration behaviour are lost.** No code survives.

## 7. The `5b92046e` official-tables checkpoint — [SPEC]

The last commit ever made on the branch, and the last work before the loss. Subject-level
description from the surviving report: the official INPRES-CIRSOC 103 tables *"read off the printed
page"*.

Explicitly recorded as **partial**: *"Its latest table work was not yet product-wired."* So the
tables existed as data with tests, but no production caller consumed them yet.

**[LOST]:** which tables, their digitised values, their clause anchors, and the wiring plan.

## 8. Recorded test gates — [FACT]

| Checkpoint | Gates |
|---|---|
| PR18 `874f9f57` | 4,542 Vitest passing / 5 skipped · Playwright 123 / 4 · typecheck 490/490 · build green |
| PR19 `5b92046e` | **4,799 Vitest passing / 5 skipped** · typecheck 490/490 · build green |

The delta — roughly 257 additional passing tests — is the only quantitative measure of how much
test coverage the seismic work carried. Those tests are gone.

> Note on the current stack: after the PR15 review correction propagated (2026-07-30), the same
> gates on PR18 `d19588ef3` read 4,546 unit passing / 12 skipped, and the integrated QA branch
> reads 4,560 / 12. The historical 5-skipped figures predate later skip additions and are not
> directly comparable.

## 9. Printed-page verification findings — [SPEC], partially [FACT]

A verification pass confirmed the source PDFs against their printed editions. One concrete result
survives: an entry verified as **`EDICION JULIO 2005`**, recorded in a table of per-document
edition confirmations with a `yes`/`no` verified column (`488c2b35`, `49fe6c5b`, `ab157874`,
`b703b62b`, `c93e7fe0`, `cbfd04b8`, `e30b2301` appear as row keys with `yes` verdicts; one row is
marked `yes (Word)`).

**[LOST]:** which document each row refers to, and the full findings list. The row keys survive
without their subjects.

The design intent that does survive: tables were to be transcribed from the **printed regulation**
rather than inferred, and the edition was to be recorded as provenance — consistent with PR16's
regulation-edition provenance model.

## 10. Na / Nv and wall-system blockers — [LOST]

The prompt that commissioned this handoff names near-fault amplification factors (Na/Nv) and
wall-system blockers as known open issues.

**No evidence for either survives in the recovered material.** Searching all four preserved Codex
sessions for `Na`/`Nv` in a near-fault, fault-distance, blocker, wall or table context returned
nothing. The `INPRES` mentions that did survive concern Parte II detailing restrictions and
seismic-load enablement, not amplification factors.

These are recorded here as **named open questions with no recovered content**. They are not
reconstructed. Treat them as items to re-derive from the regulation, not as prior decisions.

## 11. Remaining implementation order — [PLANNED], partially [LOST]

What the surviving evidence supports, in the order the lost commits imply:

1. A real mass source replacing the 50 m²-per-floor constant — *was implemented* (`b0c11bd2`)
2. Static seismic workflow + Parte II detailing restrictions — *was implemented* (`18688d61`)
3. Seismic workflow UI, store and Playwright coverage — *was implemented* (`6fa1ca93`)
4. Structured-message hygiene fix — *was implemented* (`62b9bfe2`)
5. Persisted seismic configuration — *was implemented* (`6903d1f1`)
6. Official tables read off the printed page — *partially implemented, never product-wired*
   (`5b92046e`)
7. Product wiring of the tables — **[PLANNED], never started**
8. Na/Nv treatment and wall-system resolution — **[LOST]**, see §10
9. A local `qa/main-plus-pr19` integration branch, full regression, WASM rebuild, serve on
   port 4000 — **[PLANNED]**, recorded in the restart prompt; `qa/main-plus-pr19` was confirmed
   absent at `6903d1f1`

Anything beyond step 6 is planning, not recovered design.

## 12. Standing rules that applied to this work — [FACT]

Recovered from the restart prompt and workflow doc, and still binding on any successor:

- **Solver boundary:** do not author solver/Rust/Cargo/WASM changes. Verified held throughout —
  zero such paths across `a133b062~1..HEAD`, 82/82 commits.
- **Regulation roles:** seismic loads stay disabled until a seismic regulation is bound to the
  seismic role, and the UI must say why. Aggregate size is a concrete/material property, not a
  regulation property.
- **i18n:** EN/ES parity on every user-visible string; the Playwright suite runs both locales.
- **Honesty:** straight-up bars are allowed only when the model has no seismic loads; with seismic
  design, the actual INPRES-CIRSOC 103 Parte II restrictions apply. Unimplemented regulations are
  refused with a reason rather than silently approximated. Withdrawn editions are explained, not
  hidden.
- **Attribution:** commits G-signed by `Bauti <syngoviano@gmail.com>`, sole author and committer,
  no AI/tool attribution.

## 13. Data-loss and recovery provenance — [FACT]

A Migration Assistant run in the **wrong direction** (MacBook Pro 14" → M1 Air, over AWDL) with
*"replace current user"* selected. The Air held the real data; the Pro was freshly set up. MA
classified `/Users/bauti` as a conflicted home and began deleting it:

```
17:39:24  Freeing up UID 501 due to impending deletion
17:40:01  User Data Migration: 1 conflicted user homes to delete
17:40:01  Cleared deny-delete ACL from "file:///Users/bauti/" prior to deletion
17:41:50  Unable to delete existing home directory: "bauti" couldn't be removed
```

The delete ran **108 seconds** and aborted on an un-removable fileprovider mount. That abort is the
only reason ~35 GB survived.

**Deleted:** `Claude/`, `.claude/`, `Desktop`, `Music`, `Pictures`,
`Library/Application Support`, `.zsh_history`.
**Survived:** `Documents`, `Downloads`, `Movies`, `Public`, rest of `Library`, `.Trash`, `.codex`,
`.cargo`, `.npm`, `.rustup`, `.ssh`, `.cache`.

No APFS snapshots existed. Time Machine was never configured. Apple Silicon SSD with TRIM means
the freed blocks are not carvable. The migration bundle
(`stabileo-new-mac-handoff-2026-07-28.tar.gz`, containing a 157-ref
`stabileo-local-refs-2026-07-28.bundle` and `restore-stashes.sh`) lived **inside** the deleted
`Claude/` and has no trace of ever having been copied off that machine.

Cloud recovery was exhausted: Google Drive holds no repository artefact (its Trash is not queryable
through the available connector); iCloud Drive completed a full sync showing one unrelated folder
and an empty Recently Deleted. Recovery was closed by the user on 2026-07-29.

**Recovered and reusable:** `restore-stashes.sh` (complete, now inert — it needs
`refs/migration/stashes/00`–`13`, which existed only in the lost bundle), all 14 stash *identities*
(subjects only, no content), and the four Codex sessions.

## 14. Surviving source-PDF inventory — [FACT]

`Downloads` survived the abort, so the official regulation PDFs are intact at
`~/Downloads/05 Ingenieria - Normativa y Apuntes/CIRSOC/`:

| Document | Status |
|---|---|
| `INPRES-CIRSOC-103_Parte_I-Reglamento.pdf` | present |
| `INPRES-CIRSOC-103_Parte_II-Reglamento.pdf` | present |
| `INPRES-CIRSOC-103_Parte_III-Reglamento.pdf` | present |
| `INPRES-CIRSOC-103_Parte_IV-Reglamento.pdf` | present |
| `INPRES-CIRSOC-103_Parte_V-Reglamento.pdf` | present |
| `CIRSOC 101-2025.pdf`, `CIRSOC 102-2025.pdf`, `CIRSOC 201 - 2025.pdf`, `301-Reglamento-CIRSOC.pdf` | present |

These are the exact filenames the repository expected at `docs/codes/CIRSOC/` (git-ignored). A
second, older set exists under `Referencia CIRSOC (ex Claude Food)/`, including
`INPRES-CIRSOC-103_Parte_I/II/IV` copies.

**No checksum baseline was ever recorded**, so these are byte-identical-by-filename but not
cryptographically verified against the originals used by the lost work.

Also lost, and tracked separately from this repository: the JAIE 2026 paper's Typst sources
(`paper_body_v5.typ`, `PAPER_V5.typ`, `PAPER_V5_latex.typ`). Only compiled PDFs survive.

---

## What a successor should do

Treat this document as a **requirements brief, not a design**. The commit subjects in §4 are a
sound slice order and the rules in §12 are binding. Everything else — schemas, table values,
Na/Nv, wall systems — must be re-derived from the regulation PDFs in §14. Do not present any of it
as continuing prior work, because no prior work exists to continue.
