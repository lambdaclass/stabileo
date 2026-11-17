### Fixed
#### Preserve snow regeneration notices for hand-entered loading (2026-11-16)

- Show both snow combination corrections for every snow model, including hand-entered snow, and keep the regeneration notices after re-solving saved loads and combinations until their load basis is updated.
- Carry snow combination refusals as message keys and parameters through the pure expander, and translate them at the UI action boundary. No numerical engine results change.
