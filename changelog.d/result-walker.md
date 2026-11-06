### Changed
#### Refusals are found wherever a result type can hold them, from one generated list (2026-11-05)

Which fields of a result can carry a known-issue warning or refusal is now generated from the
engine's result types and the web app's result types (`make gen.result-sites`), and both the engine
and the web read that list. Every result leaving the engine lists any refusal held deeper inside it
at its top level as well, and combinations and envelopes gather their load cases' known issues the
same way. No number, warning or refusal changes; a result type that gains a field holding
diagnostics is covered without a hand edit, and a stale list fails CI.
