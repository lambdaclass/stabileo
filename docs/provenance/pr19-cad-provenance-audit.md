# Provenance audit — the CAD work of PR19

**Scope:** everything reviewed, run or depended on while PR19's RC-CAD constructibility work was
done, and what of it — if anything — ended up inside Stabileo.

**Method:** read-only. No file outside this document and the generated notices was changed by
the audit.

**Audited at:** Stabileo `feat/pro-visual-system` (PR #125 / PR20), base
`pr/19-rc-cad-constructibility`. Stabileo's own licence is **AGPL-3.0** (`LICENSE`, 661 lines).

---

## 1. The finding, stated plainly

**No source code from `text-to-cad`, VibeCAD, FreeCAD, IfcOpenShell, ThatOpen, cadquery-ocp or
pygltflib has been copied into Stabileo.** Not a file, not a function, not a block.

What Stabileo does contain from that work is:

- its **own** handoff schema, validator and fixtures, which it authored and which `text-to-cad`
  consumes;
- **`web-ifc`**, an ordinary npm dependency, declared and bundled;
- **documentation** in `docs/poc/` and `docs/handoffs/` that discusses those projects by name.

The evidence for the negative claim is in §4. It is measured, not asserted.

---

## 2. The eight categories, filled in

| # | Category | What is in it |
|---|---|---|
| 1 | **Code copied into Stabileo** | **Nothing.** See §4. |
| 2 | Code in throwaway scripts outside the repo | `~/Claude/stabileo-branches/vibecad-trial/*.py` — 618 lines, hand-written, importing FreeCAD / TechDraw / Part / Import / ifcopenshell. Not a git repository, not inside any Stabileo worktree, never distributed. |
| 3 | Generated artefacts | `vibecad-trial/*.{ifc,glb,step,igs,png}` — round-trip outputs of those probes. Outside the repo. Inside the repo: `web/src/lib/export/__fixtures__/rc-footing-cad-poc.handoff*.json`, which Stabileo generates (§3). |
| 4 | Installed dependencies | 18 runtime packages, 11 dev. Full inventory in `THIRD_PARTY_NOTICES.md`. |
| 5 | Tools used only for inspection | FreeCAD, TechDraw, IfcOpenShell — driven from the §2 scripts on the developer's machine. Never invoked by Stabileo, never bundled, not in any manifest. |
| 6 | Repositories used as reference | `earthtojake/text-to-cad` (fork `Batuis/text-to-cad`, branch `poc/pr19-stabileo-rc-cad`), checked out as a **separate repository** beside Stabileo's worktrees. Not a submodule, not vendored. |
| 7 | Code Stabileo distributes | Stabileo's own sources + the 18 runtime packages of category 4. |
| 8 | Code Stabileo does not distribute | Everything in categories 2, 3 (outside), 5 and 6, plus the 11 dev dependencies. |

---

## 3. The handoff artefacts — direction of travel

Three files exist byte-identically in both repositories:

| File | In Stabileo | In text-to-cad |
|---|---|---|
| `rc-footing-cad-poc.handoff.json` | `web/src/lib/export/__fixtures__/` | `tests/python/packages/rc_cad_handoff/fixtures/` |
| `rc-footing-cad-poc.handoff.v2.json` | idem | idem |
| `rc-footing-cad-poc.handoff.v2.json.sha256` | idem | idem |

`md5` agrees on all three. **Stabileo is the producer.** The schema
(`rc-cad-handoff.schema.json`), the validator (`json-schema-subset.ts` — hand-written precisely
to avoid putting a general-purpose parser in a browser bundle), the family attribution
(`rc-cad-families.ts`) and the semantic rules (`rc-cad-handoff-semantics.ts`) are all
Stabileo's, and the fixtures are its output. `text-to-cad` holds the same bytes as a **consumer**
test fixture.

So the copying that happened went Stabileo → text-to-cad, under Stabileo's own copyright. No
third-party rights attach to these files.

The only other trace is a string:

```
web/src/components/pro/design/FootingCadHandoffPanel.svelte:66
  const HANDOFF_TOOL_COMMAND = './.venv/bin/python -m rc_cad_handoff.web';
```

That is a command the panel *displays* so a user knows what to run in the other repository. It
is not an import, and Stabileo never executes it.

---

## 4. How the negative was established

Name-matching is not enough — a project can be copied without being mentioned. So the check was
done on content.

**Symbol search.** Distinctive identifiers from `packages/rc_cad_handoff`
(`_approximation_inventory`, `_concrete_reconciliation`, `_authoritative_findings`,
`_check_units_and_frame`, `_classify_faces`) and from the `cadpy` / `cadjs` / `implicitjs`
packages: **zero occurrences** in Stabileo's tracked tree.

**Line-level overlap.** Every substantive line — 45+ characters, not a comment — from
Stabileo's `web/src` (**75 644** lines) intersected with text-to-cad's JavaScript packages
(**25 593** lines). **Five** exact matches, all of them idiom:

| Line | Why it is not evidence of copying |
|---|---|
| `await new Promise((resolve) => setTimeout(resolve, 0));` | the standard microtask yield |
| `const rect = container.getBoundingClientRect();` | DOM idiom |
| `const texture = new THREE.CanvasTexture(canvas);` | a Three.js API call |
| `controls = new OrbitControls(camera, renderer.domElement);` | the line from Three.js's own OrbitControls documentation |
| `return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];` | a dot product |

None is copyrightable expression; each is what any project using the same APIs writes
independently. Five collisions in ~76 000 lines is the noise floor, not a signal.

**Structural checks.** No `.gitmodules`. No `vendor/` or `third_party/` directory. No file in
Stabileo's tracked tree carries a third-party licence header.

**Filename overlap.** Four names appear in both trees: `.env.example` and the three handoff
artefacts of §3.

---

## 5. Licences that bind Stabileo, and what they require

Stabileo distributes a browser bundle to every visitor, so every runtime dependency's
distribution clause applies. Full texts: `THIRD_PARTY_NOTICES.md`, generated by
`web/scripts/third-party-notices.mjs` and checked by `third-party-notices.test.ts`.

| Package | Version | Licence | Distributed | Copied | Imported | Needs attribution | Needs licence text | Needs NOTICE | Must publish modifications |
|---|---|---|---|---|---|---|---|---|---|
| `three` | 0.182.0 | MIT | yes | no | yes | yes | yes | no | no |
| `three-mesh-bvh` | 0.9.9 | MIT | yes | no | yes | yes | yes | no | no |
| `web-ifc` | 0.0.75 | **MPL-2.0** | yes | no | yes | yes | yes | no | **only if its files are modified — they are not** |
| `dxf-parser` | 1.1.2 | MIT | yes | no | yes | yes | yes | no | no |
| `katex` | 0.16.28 | MIT | yes | no | yes | yes | yes | no | no |
| `lz-string` | 1.5.0 | MIT | yes | no | yes | yes | yes | no | no |
| `fflate` | 0.8.2 | MIT | yes | no | yes | yes | yes | no | no |
| `loglevel` | 1.9.2 | MIT | yes | no | transitive | yes | yes | no | no |
| `commander` | 8.3.0 | MIT | yes | no | transitive | yes | yes | no | no |
| `xlsx` + `adler-32`, `cfb`, `crc-32`, `codepage`, `ssf`, `frac`, `wmf`, `word` | see notices | Apache-2.0 | yes | no | yes / transitive | yes (§4) | yes | none ship one | no |
| FreeCAD, TechDraw | — | LGPL-2.1+ | **no** | no | no (external scripts only) | no | no | no | no |
| IfcOpenShell | — | LGPL-3.0 | **no** | no | no (external scripts only) | no | no | no | no |
| `text-to-cad` | `develop` @ `258236e3c` | **MIT** © 2026 earthtojake | **no** | **no** | no | not while nothing is used | no | no | no |
| VibeCAD | — | n/a | **no** | **no** | no | no | no | no | no |

Two notes worth keeping:

- **`web-ifc` is MPL-2.0, not MIT.** MPL is file-level copyleft: modifying its files obliges
  publishing those modifications. Stabileo consumes it unmodified, so the obligation reduces to
  §3.2 — tell recipients where the source is — which the notices do. If anyone ever patches it,
  that changes.
- **LGPL never engages.** FreeCAD and IfcOpenShell were driven from scripts on a developer's
  machine that Stabileo does not ship, does not reference and cannot invoke. Using a tool is not
  linking to it. This would change the day any of it is bundled or called from a server.

---

## 6. The gap this audit closed

Before it, the repository had `LICENSE` (AGPL-3.0) and nothing else. The built bundle contains
**zero `Copyright (c)` strings** — `vite build` minifies them away — while carrying eight MIT,
nine Apache-2.0 and one MPL-2.0 package, each of which attaches a condition to distribution.

That is a real compliance gap, and it predates PR19: it is as old as the first dependency.
`THIRD_PARTY_NOTICES.md` now accompanies the source, `web/public/third-party-notices.txt` ships
with the site, and a test fails if a runtime dependency changes without the notices being
regenerated.

---

## 7. Nothing was attributed generically

No blanket credit was added anywhere. Every entry in the notices names one package, one version,
one licence and one copyright line, taken from that package's own licence file. Where a package
ships no licence file, the generator says so loudly instead of assuming a default — currently
none does.

No attribution was added for `text-to-cad` or VibeCAD, because attributing a project whose code
is not present would be its own kind of false statement.
