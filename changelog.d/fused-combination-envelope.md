### Performance
#### Keep combined results in WASM for their envelope (2026-11-17)

Parallel linear solves without shells and with unique combination IDs compute
combinations and their envelope in one call, avoiding a second transfer of the
combined results into WASM. Existing numerical checks and refusal ordering are
preserved. Shell models and repeated combination IDs retain their existing path.
