# Threat model

Stabileo is used to design real structures. A wrong number on screen can cost
as much as a leaked secret, so **result integrity** is treated as a security
property alongside confidentiality and availability.

## Components

| Component | Runs where | Trust |
|---|---|---|
| Engine (`engine/`, Rust → WASM) | User's browser, in a worker | Trusted code, untrusted input (model JSON) |
| Web app (`web/`, Svelte) | User's browser | Trusted code; handles untrusted files, links, storage |
| AI backend (`backend/`, Axum) | Server | Holds the AI provider key; reachable from the internet |
| Feedback function (`functions/api/feedback.ts`) | Cloudflare Pages | Holds a GitHub token; anonymous callers |
| Static hosting | GitHub Pages, or nginx (`nginx.conf`, Docker) | Serves the bundle; sets headers (nginx only) |
| CI / release (`.github/workflows`, `flake.nix`, `Dockerfile`) | GitHub Actions, Docker | Builds what users run |

## Assets

1. **Results integrity.** Displayed forces, displacements, design checks and
   certificates must be computed by the engine from the model the user sees.
2. **Model data.** User models are local to the browser (files, localStorage,
   share links in the URL fragment). They leave the machine only when the user
   sends them to the AI backend or attaches a share link to feedback.
3. **Secrets.** AI provider API keys and `DEDALIANO_API_KEY` (backend), the
   GitHub token and Turnstile secret (feedback function). There are no user
   accounts or passwords.
4. **Provider budget and service availability** of the backend.
5. **The build pipeline**: what ends up in the bundle and container images.

## Actors

- **Malicious model file or share link.** A `.ded`/session file, Excel, IFC or
  DXF import, or a `#data=`/`#embed=` link crafted by someone else and opened
  by the user. Goals: run script in the app origin, crash or hang the tab,
  or make the UI show results or certified states that do not match the model.
- **Malicious web content.** Another site that frames the app, posts messages
  to it, or links into it.
- **Abusive API client.** Anyone who can reach the backend or the feedback
  function: spends the provider budget, floods issues, exhausts connections,
  or injects text into prompts and issues.
- **Prompt injection.** Text in the model (names, labels, notes) or in the
  conversation that tries to steer the LLM into harmful tool calls or output.
- **Compromised dependency or CI action.** A crate, npm package, GitHub Action
  or base image that is replaced or vulnerable.

## Trust boundaries

1. **File / URL → web app.** Everything parsed from files, the URL fragment
   and localStorage is untrusted: validated, size-bounded, never rendered as
   HTML, and never accepted as solver output.
2. **Web app → engine (WASM).** Model JSON crosses into Rust. The engine
   validates references and finiteness and bounds input-controlled sizes; a
   panic aborts the WASM instance.
3. **Browser → backend.** The bearer token is not a strong boundary when the
   web build embeds it (any visitor can read it). Rate and concurrency
   limits, body and field limits, and output validation are what bound abuse.
4. **Backend → LLM provider → backend.** Prompt content is partly untrusted;
   LLM output is untrusted. Tool calls are parsed into a closed set of
   actions with bounded parameters and validated before a snapshot is
   returned. The web app shows AI changes as a preview that the user must
   apply explicitly.
5. **Anonymous caller → feedback function → GitHub.** A verified captcha is
   required; fields are bounded and neutralised before they become a public
   issue.
6. **Upstream → build.** Lockfiles (`Cargo.lock`, `package-lock.json`,
   `flake.lock`), SHA-pinned actions, digest-pinned images, and the
   supply-chain CI job.

## Out of scope

- A compromised user machine or browser extension.
- The AI provider's own handling of prompts.
- Physical/engineering correctness of the solver beyond input validation
  (covered by `docs/VERIFICATION.md` and `docs/verification/`).
