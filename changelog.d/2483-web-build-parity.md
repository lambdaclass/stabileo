### Fixed
#### Web Build completes independently of switch-off production parity (2026-11-22)

Web Build reuses one Vite build for its production site and prerender tests. When switch-off parity is required, both production snapshots build on separate CI runners and their complete output inventories are compared before CI can pass.
