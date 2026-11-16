### Fixed
#### Isolate registration and advertising preferences from accounts-off landing builds (2026-11-14)

- Omit the registration page import when `VITE_ACCOUNTS=0`, keeping the landing page in its shared chunk (#2099).
- Treat an explicit accounts build switch of `0` as unavailable even when a saved browser override requests accounts; builds without that explicit restriction retain browser overrides.
- Load footer advertising preferences only after mounting with accounts enabled, keeping consent and visit-cookie modules outside the static landing closure.
